import { describe, expect, test } from "bun:test";
import { Buffer } from "node:buffer";
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createDeepgramProvider } from "../../src/transcription/providers/deepgram.ts";
import type { TranscriptionRequest } from "../../src/transcription/types.ts";

const request: TranscriptionRequest = {
  source: {
    kind: "direct_url",
    originalInput: "https://cdn.example.com/audio/demo.wav",
    normalizedUrl: "https://cdn.example.com/audio/demo.wav",
    mediaUrl: "https://cdn.example.com/audio/demo.wav",
    extension: "wav",
  },
  requestedLanguage: "pt",
};

describe("deepgram provider", () => {
  test("maps successful response to canonical result and forwards requested language", async () => {
    let capturedLanguage: unknown = null;
    const provider = createDeepgramProvider({
      client: {
        async transcribeUrl(_source, options) {
          capturedLanguage = options?.language;
          return {
            result: {
              results: {
                channels: [
                  {
                    detected_language: "en",
                    alternatives: [{ transcript: "hello from deepgram" }],
                  },
                ],
              },
            },
            error: null,
          };
        },
        async transcribeFile() {
          throw new Error("transcribeFile should not be called for direct_url");
        },
      },
    });

    const result = await provider.transcribe(request);

    expect(capturedLanguage).toBe("pt");
    expect(result.provider).toBe("deepgram");
    expect(result.transcript).toBe("hello from deepgram");
    expect(result.requestedLanguage).toBe("pt");
    expect(result.detectedLanguage).toBe("en");
  });

  test("normalizes optional word timestamps into segment list", async () => {
    const provider = createDeepgramProvider({
      client: {
        async transcribeUrl() {
          return {
            result: {
              results: {
                channels: [
                  {
                    alternatives: [
                      {
                        transcript: "hello from deepgram",
                        words: [
                          { word: "hello", start: 0.1, end: 0.6 },
                          { word: "from", start: 0.61, end: 0.9 },
                        ],
                      },
                    ],
                  },
                ],
              },
            },
            error: null,
          };
        },
        async transcribeFile() {
          throw new Error("transcribeFile should not be called for direct_url");
        },
      },
    });

    const result = await provider.transcribe(request);

    expect(result.segments).toEqual([
      { startMs: 100, endMs: 600, text: "hello" },
      { startMs: 610, endMs: 900, text: "from" },
    ]);
  });

  test("enables detect_language when no language is explicitly requested", async () => {
    let capturedDetectLanguage: unknown = null;
    let capturedLanguage: unknown = null;
    const provider = createDeepgramProvider({
      client: {
        async transcribeUrl(_source, options) {
          capturedDetectLanguage = options?.detect_language;
          capturedLanguage = options?.language;
          return {
            result: {
              results: {
                channels: [
                  {
                    detected_language: "pt",
                    alternatives: [{ transcript: "ola mundo" }],
                  },
                ],
              },
            },
            error: null,
          };
        },
        async transcribeFile() {
          throw new Error("transcribeFile should not be called for direct_url");
        },
      },
    });

    const result = await provider.transcribe({
      ...request,
      requestedLanguage: undefined,
    });

    expect(capturedLanguage).toBeUndefined();
    expect(capturedDetectLanguage).toBe(true);
    expect(result.transcript).toBe("ola mundo");
    expect(result.detectedLanguage).toBe("pt");
  });

  test("maps auth failures to TRANSCRIPTION_PROVIDER_AUTH", async () => {
    const provider = createDeepgramProvider({
      client: {
        async transcribeUrl() {
          return {
            result: null,
            error: { status: 401, message: "invalid api key" },
          };
        },
        async transcribeFile() {
          throw new Error("transcribeFile should not be called for direct_url");
        },
      },
    });

    await expect(provider.transcribe(request)).rejects.toMatchObject({
      code: "TRANSCRIPTION_PROVIDER_AUTH",
    });
  });

  test("maps rate limiting to TRANSCRIPTION_PROVIDER_RATE_LIMIT", async () => {
    const provider = createDeepgramProvider({
      client: {
        async transcribeUrl() {
          return {
            result: null,
            error: { status: 429, message: "too many requests" },
          };
        },
        async transcribeFile() {
          throw new Error("transcribeFile should not be called for direct_url");
        },
      },
    });

    await expect(provider.transcribe(request)).rejects.toMatchObject({
      code: "TRANSCRIPTION_PROVIDER_RATE_LIMIT",
    });
  });

  test("maps malformed provider payload to TRANSCRIPTION_PROVIDER_INVALID_RESPONSE", async () => {
    const provider = createDeepgramProvider({
      client: {
        async transcribeUrl() {
          return {
            result: { results: {} },
            error: null,
          };
        },
        async transcribeFile() {
          throw new Error("transcribeFile should not be called for direct_url");
        },
      },
    });

    await expect(provider.transcribe(request)).rejects.toMatchObject({
      code: "TRANSCRIPTION_PROVIDER_INVALID_RESPONSE",
    });
  });

  test("downloads YouTube source and uploads as file payload", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "pi-tube-deepgram-provider-"));
    const mockedDownloadPath = path.join(tempDir, "video.m4a");
    writeFileSync(mockedDownloadPath, "audio");

    const youtubeRequest: TranscriptionRequest = {
      source: {
        kind: "youtube",
        originalInput: "https://www.youtube.com/watch?v=abc123",
        normalizedUrl: "https://www.youtube.com/watch?v=abc123",
        mediaUrl: "https://rr1.example.com/videoplayback?itag=140",
      },
    };

    const originalMockPath = process.env.PI_TUBE_TEST_YTDLP_DOWNLOAD_PATH;
    process.env.PI_TUBE_TEST_YTDLP_DOWNLOAD_PATH = mockedDownloadPath;

    try {
      let fileBuffer: Buffer | null = null;
      const provider = createDeepgramProvider({
        client: {
          async transcribeUrl() {
            throw new Error("transcribeUrl should not be called for youtube sources");
          },
          async transcribeFile(source) {
            fileBuffer = source;
            return {
              result: {
                results: {
                  channels: [{ alternatives: [{ transcript: "hello from deepgram" }] }],
                },
              },
              error: null,
            };
          },
        },
      });

      const result = await provider.transcribe(youtubeRequest);

      expect(fileBuffer).toBeInstanceOf(Buffer);
      expect((fileBuffer as Buffer).length).toBeGreaterThan(0);
      expect(result.transcript).toBe("hello from deepgram");
      expect(existsSync(mockedDownloadPath)).toBe(false);
    } finally {
      if (originalMockPath === undefined) {
        delete process.env.PI_TUBE_TEST_YTDLP_DOWNLOAD_PATH;
      } else {
        process.env.PI_TUBE_TEST_YTDLP_DOWNLOAD_PATH = originalMockPath;
      }
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("cleans downloaded media file when transcription fails", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "pi-tube-deepgram-provider-"));
    const mockedDownloadPath = path.join(tempDir, "video.m4a");
    writeFileSync(mockedDownloadPath, "audio");

    const youtubeRequest: TranscriptionRequest = {
      source: {
        kind: "youtube",
        originalInput: "https://www.youtube.com/watch?v=abc123",
        normalizedUrl: "https://www.youtube.com/watch?v=abc123",
        mediaUrl: "https://rr1.example.com/videoplayback?itag=140",
      },
    };

    const originalMockPath = process.env.PI_TUBE_TEST_YTDLP_DOWNLOAD_PATH;
    process.env.PI_TUBE_TEST_YTDLP_DOWNLOAD_PATH = mockedDownloadPath;

    try {
      const provider = createDeepgramProvider({
        client: {
          async transcribeUrl() {
            throw new Error("transcribeUrl should not be called for youtube sources");
          },
          async transcribeFile() {
            return {
              result: {
                results: {
                  channels: [{ alternatives: [{ transcript: "" }] }],
                },
              },
              error: null,
            };
          },
        },
      });

      await expect(provider.transcribe(youtubeRequest)).rejects.toMatchObject({
        code: "TRANSCRIPTION_PROVIDER_INVALID_RESPONSE",
      });
      expect(existsSync(mockedDownloadPath)).toBe(false);
    } finally {
      if (originalMockPath === undefined) {
        delete process.env.PI_TUBE_TEST_YTDLP_DOWNLOAD_PATH;
      } else {
        process.env.PI_TUBE_TEST_YTDLP_DOWNLOAD_PATH = originalMockPath;
      }
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("fails fast when yt-dlp download stalls for youtube sources", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "pi-tube-deepgram-provider-timeout-"));
    const mockYtDlpPath = path.join(tempDir, "yt-dlp");
    writeFileSync(mockYtDlpPath, "#!/usr/bin/env bash\nsleep 60\n");
    chmodSync(mockYtDlpPath, 0o755);

    const originalPath = process.env.PATH;
    const originalTimeout = process.env.PI_TUBE_YTDLP_TIMEOUT_MS;
    const originalMockPath = process.env.PI_TUBE_TEST_YTDLP_DOWNLOAD_PATH;
    const originalMockFailure = process.env.PI_TUBE_TEST_YTDLP_DOWNLOAD_ERROR;
    process.env.PATH = `${tempDir}:${originalPath ?? ""}`;
    process.env.PI_TUBE_YTDLP_TIMEOUT_MS = "20";
    delete process.env.PI_TUBE_TEST_YTDLP_DOWNLOAD_PATH;
    delete process.env.PI_TUBE_TEST_YTDLP_DOWNLOAD_ERROR;

    const youtubeRequest: TranscriptionRequest = {
      source: {
        kind: "youtube",
        originalInput: "https://www.youtube.com/watch?v=abc123",
        normalizedUrl: "https://www.youtube.com/watch?v=abc123",
        mediaUrl: "https://rr1.example.com/videoplayback?itag=140",
      },
    };

    try {
      const provider = createDeepgramProvider({
        client: {
          async transcribeUrl() {
            throw new Error("transcribeUrl should not be called for youtube sources");
          },
          async transcribeFile() {
            throw new Error("transcribeFile should not be called when yt-dlp download times out");
          },
        },
      });

      await expect(provider.transcribe(youtubeRequest)).rejects.toMatchObject({
        code: "TRANSCRIPTION_PROVIDER_FAILED",
      });
    } finally {
      if (originalPath === undefined) {
        delete process.env.PATH;
      } else {
        process.env.PATH = originalPath;
      }

      if (originalTimeout === undefined) {
        delete process.env.PI_TUBE_YTDLP_TIMEOUT_MS;
      } else {
        process.env.PI_TUBE_YTDLP_TIMEOUT_MS = originalTimeout;
      }

      if (originalMockPath === undefined) {
        delete process.env.PI_TUBE_TEST_YTDLP_DOWNLOAD_PATH;
      } else {
        process.env.PI_TUBE_TEST_YTDLP_DOWNLOAD_PATH = originalMockPath;
      }

      if (originalMockFailure === undefined) {
        delete process.env.PI_TUBE_TEST_YTDLP_DOWNLOAD_ERROR;
      } else {
        process.env.PI_TUBE_TEST_YTDLP_DOWNLOAD_ERROR = originalMockFailure;
      }

      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
