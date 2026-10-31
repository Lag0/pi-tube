import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createDownloadMedia } from "../../../src/core/application/download-media.ts";
import { createTranscribe, type TranscribeDeps } from "../../../src/core/application/transcribe.ts";
import type { PiTubeConfig } from "../../../src/core/domain/config.ts";
import { createError } from "../../../src/core/domain/errors.ts";
import { renderMarkdown } from "../../../src/core/domain/transcript/render-markdown.ts";
import { createFileTranscriptStore } from "../../../src/infrastructure/output/file-transcript-store.ts";
import { PROVIDER_DESCRIPTORS } from "../../../src/infrastructure/stt/registry.ts";
import { createFakeMediaFetcher } from "../../helpers/fake-media.ts";
import { createFakeSttProvider } from "../../helpers/fake-stt.ts";
import { createInMemoryConfigStore } from "../../helpers/in-memory-config-store.ts";

const INPUT = "https://cdn.example.com/audio/demo.wav";
const NOW = new Date(2026, 9, 30, 12, 0, 0);

let outputDir: string;

beforeEach(() => {
  outputDir = mkdtempSync(path.join(os.tmpdir(), "pi-tube-transcribe-"));
});

afterEach(() => {
  rmSync(outputDir, { recursive: true, force: true });
});

const config = (overrides: Partial<PiTubeConfig> = {}): PiTubeConfig => ({
  version: 1,
  defaults: {},
  providers: {},
  ...overrides,
});

const setup = (options: { env?: Record<string, string>; config?: PiTubeConfig } = {}) => {
  const stt = {
    deepgram: createFakeSttProvider("deepgram"),
    groq: createFakeSttProvider("groq"),
    elevenlabs: createFakeSttProvider("elevenlabs"),
  };
  const media = createFakeMediaFetcher();
  const deps: TranscribeDeps = {
    configStore: createInMemoryConfigStore(options.config ?? config()),
    env: options.env ?? {},
    providers: PROVIDER_DESCRIPTORS,
    stt,
    media: media.fetcher,
    store: createFileTranscriptStore(outputDir),
    now: () => NOW,
  };
  return { stt, media, deps, transcribe: createTranscribe(deps) };
};

const run = (
  transcribe: ReturnType<typeof createTranscribe>,
  overrides: { provider?: string; language?: string } = {},
) => transcribe({ input: INPUT, timestamps: false, format: "markdown", ...overrides });

describe("provider selection", () => {
  test("an explicit provider wins over the config default", async () => {
    const { stt, transcribe } = setup({
      env: { GROQ_API_KEY: "gq", DEEPGRAM_API_KEY: "dg" },
      config: config({ defaults: { provider: "deepgram" } }),
    });

    const result = await run(transcribe, { provider: "groq" });

    expect(result.success).toBe(true);
    expect(stt.groq.requests).toHaveLength(1);
    expect(stt.deepgram.requests).toHaveLength(0);
  });

  test("PI_TUBE_TRANSCRIPTION_PROVIDER wins over the config default", async () => {
    const { stt, transcribe } = setup({
      env: { PI_TUBE_TRANSCRIPTION_PROVIDER: "elevenlabs", ELEVENLABS_API_KEY: "el", GROQ_API_KEY: "gq" },
      config: config({ defaults: { provider: "groq" } }),
    });

    await run(transcribe);

    expect(stt.elevenlabs.requests).toHaveLength(1);
    expect(stt.groq.requests).toHaveLength(0);
  });

  test("with no choice, the first configured provider in registry order is used", async () => {
    const { stt, transcribe } = setup({ env: { GROQ_API_KEY: "gq" } });

    await run(transcribe);

    expect(stt.groq.requests).toHaveLength(1);
  });

  test("nothing configured is PROVIDER_NOT_CONFIGURED with an auth login hint", async () => {
    const { transcribe } = setup();

    const result = await run(transcribe);

    expect(result.success ? undefined : result.error.code).toBe("PROVIDER_NOT_CONFIGURED");
    expect(result.success ? "" : result.error.hint).toContain("auth login");
  });

  test("a chosen provider without a key is PROVIDER_NOT_CONFIGURED and no other provider runs", async () => {
    const { stt, transcribe } = setup({ env: { GROQ_API_KEY: "gq" } });

    const result = await run(transcribe, { provider: "deepgram" });

    expect(result.success ? undefined : result.error.code).toBe("PROVIDER_NOT_CONFIGURED");
    expect(result.success ? "" : result.error.hint).toContain("DEEPGRAM_API_KEY");
    expect(stt.groq.requests).toHaveLength(0);
  });

  test("an unknown provider in PI_TUBE_TRANSCRIPTION_PROVIDER is PROVIDER_INVALID naming the variable", async () => {
    const { transcribe } = setup({ env: { PI_TUBE_TRANSCRIPTION_PROVIDER: "openai", GROQ_API_KEY: "gq" } });

    const result = await run(transcribe);

    expect(result.success ? undefined : result.error.code).toBe("PROVIDER_INVALID");
    expect(result.success ? "" : result.error.message).toContain("PI_TUBE_TRANSCRIPTION_PROVIDER");
  });
});

describe("credentials and fallback", () => {
  test("the env key wins over the stored key and is passed to the provider", async () => {
    const { stt, transcribe } = setup({
      env: { GROQ_API_KEY: "env-key" },
      config: config({ providers: { groq: { api_key: "config-key" } } }),
    });

    const result = await run(transcribe);

    expect(stt.groq.requests[0]?.apiKey).toBe("env-key");
    expect(JSON.stringify(result)).not.toMatch(/env-key|config-key/);
  });

  test("a rate-limited provider fails without trying another one, and the hint names the alternatives", async () => {
    const { stt, deps } = setup({ env: { GROQ_API_KEY: "gq", DEEPGRAM_API_KEY: "dg" } });
    const limited = createFakeSttProvider("groq", createError("PROVIDER_RATE_LIMIT", "Too many requests."));
    const transcribe = createTranscribe({ ...deps, stt: { ...stt, groq: limited } });

    const result = await run(transcribe, { provider: "groq" });

    expect(result.success ? undefined : result.error.code).toBe("PROVIDER_RATE_LIMIT");
    // Only other configured providers: not the chosen groq, not the unconfigured elevenlabs.
    expect(result.success ? "" : result.error.hint).toBe(
      "Retry later, or choose another configured provider: deepgram.",
    );
    expect(stt.deepgram.requests).toHaveLength(0);
  });
});

describe("language", () => {
  test("--language wins, then PI_TUBE_TRANSCRIPTION_LANGUAGE, then the config default", async () => {
    const env = { GROQ_API_KEY: "gq", PI_TUBE_TRANSCRIPTION_LANGUAGE: "es" };
    const { stt, transcribe } = setup({ env, config: config({ defaults: { language: "pt" } }) });

    await run(transcribe, { language: "EN" });
    await run(transcribe);

    expect(stt.groq.requests.map((request) => request.language)).toEqual(["en", "es"]);
  });
});

describe("audio and output", () => {
  test("releases the fetched audio on success and on provider failure", async () => {
    const { media, stt, deps } = setup({ env: { GROQ_API_KEY: "gq" } });
    const failing = createFakeSttProvider("groq", createError("PROVIDER_FAILED", "boom"));

    await createTranscribe(deps)({ input: INPUT, timestamps: false, format: "markdown" });
    await createTranscribe({ ...deps, stt: { ...stt, groq: failing } })({
      input: INPUT,
      timestamps: false,
      format: "markdown",
    });

    expect(media.released()).toBe(2);
  });

  test("releases the fetched audio when cancelled during transcription", async () => {
    const { media, stt, deps } = setup({ env: { GROQ_API_KEY: "gq" } });
    const waiting = createFakeSttProvider("groq", undefined, { waitForAbort: true });
    const controller = new AbortController();

    const pending = createTranscribe({ ...deps, stt: { ...stt, groq: waiting } })(
      { input: INPUT, timestamps: false, format: "markdown" },
      { signal: controller.signal },
    );
    setTimeout(() => controller.abort(), 20);
    const result = await pending;

    expect(result.success ? undefined : result.error.code).toBe("CANCELLED");
    expect(media.released()).toBe(1);
    expect(readdirSync(outputDir)).toEqual([]);
  });

  test("saves the rendered markdown with mode 600", async () => {
    const { transcribe } = setup({ env: { GROQ_API_KEY: "gq" } });

    const result = await run(transcribe);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(path.basename(result.data.saved.path)).toBe("2026-10-30-demo.md");
    expect(readFileSync(result.data.saved.path, "utf8")).toBe(renderMarkdown(result.data.artifact));
    if (process.platform !== "win32") expect(statSync(result.data.saved.path).mode & 0o777).toBe(0o600);
  });

  test("an output dir that is a file is STORAGE_IO_FAILED", async () => {
    const blocker = path.join(outputDir, "blocker");
    writeFileSync(blocker, "x");
    const { deps, stt } = setup({ env: { GROQ_API_KEY: "gq" } });

    const result = await createTranscribe({ ...deps, store: createFileTranscriptStore(blocker) })({
      input: INPUT,
      timestamps: false,
      format: "markdown",
    });

    expect(result.success ? undefined : result.error.code).toBe("STORAGE_IO_FAILED");
    expect(result.success ? "" : result.error.hint).toContain("PI_TUBE_OUTPUT_DIR");
    // Checked before the paid call, so a bad output dir never costs a transcription.
    expect(stt.groq.requests).toHaveLength(0);
  });

  test("a Ctrl-C that lands after the provider answered still saves the paid transcript", async () => {
    const { deps, stt } = setup({ env: { GROQ_API_KEY: "gq" } });
    const controller = new AbortController();
    const answersThenCancel = {
      ...createFakeSttProvider("groq"),
      transcribe: async () => {
        controller.abort();
        return { success: true as const, data: { text: "paid text", segments: [] } };
      },
    };

    const result = await createTranscribe({ ...deps, stt: { ...stt, groq: answersThenCancel } })(
      { input: INPUT, timestamps: false, format: "markdown" },
      { signal: controller.signal },
    );

    expect(result.success).toBe(true);
    expect(readdirSync(outputDir)).toHaveLength(1);
  });
});

describe("source settings", () => {
  test("resolve and fetchAudio receive the settings resolved from config and env", async () => {
    const { media, transcribe } = setup({
      env: { GROQ_API_KEY: "gq", PI_TUBE_COOKIES_FILE: "/a/cookies.txt" },
      config: config({ network: { allow_private_hosts: true }, local_files: { max_bytes: 10 } }),
    });

    const result = await run(transcribe);

    expect(result.success).toBe(true);
    const expected = {
      allowPrivateHosts: true,
      maxLocalFileBytes: 10,
      cookies: { file: "/a/cookies.txt", origin: "env" },
    };
    expect(media.calls.settings).toEqual([expected, expected]);
  });

  test("a relative PI_TUBE_COOKIES_FILE fails before the source is resolved", async () => {
    const { media, transcribe } = setup({ env: { GROQ_API_KEY: "gq", PI_TUBE_COOKIES_FILE: "cookies.txt" } });

    const result = await run(transcribe);

    expect(result.success ? undefined : result.error.code).toBe("COOKIES_FILE_INVALID");
    expect(media.calls.resolve).toHaveLength(0);
  });
});

describe("site sources", () => {
  test("the progress detail of an untitled site is its platform", async () => {
    const vimeo = "https://vimeo.com/1";
    const media = createFakeMediaFetcher({
      source: { kind: "site", originalInput: vimeo, normalizedUrl: vimeo, metadata: { platform: "Vimeo" } },
      audio: { kind: "url", url: "https://cdn.example.com/v.mp3" },
    });
    const { deps } = setup({ env: { GROQ_API_KEY: "gq" } });
    const transcribe = createTranscribe({ ...deps, media: media.fetcher });
    const details: Array<string | undefined> = [];

    const result = await transcribe(
      { input: vimeo, timestamps: false, format: "markdown" },
      { onProgress: (event) => details.push(event.detail) },
    );

    expect(result.success).toBe(true);
    expect(details).toContain("(Vimeo)");
  });
});

describe("downloadMedia", () => {
  test("a best-effort site is resolved, then downloaded from the resolved source", async () => {
    const vimeo = "https://vimeo.com/1";
    const source = {
      kind: "site" as const,
      originalInput: vimeo,
      normalizedUrl: vimeo,
      metadata: { platform: "Vimeo" },
    };
    const media = createFakeMediaFetcher({ source });
    const download = createDownloadMedia({
      configStore: createInMemoryConfigStore(config()),
      env: {},
      media: media.fetcher,
      defaultOutputDir: outputDir,
    });

    const result = await download({ input: vimeo, media: "video" });

    expect(result.success ? result.data.sourceKind : undefined).toBe("site");
    expect(media.calls.resolve).toEqual([vimeo]);
    expect(media.calls.download[0]?.source).toEqual(source);
  });

  test("a direct media URL is DOWNLOAD_FAILED and nothing is downloaded", async () => {
    const media = createFakeMediaFetcher();
    const download = createDownloadMedia({
      configStore: createInMemoryConfigStore(config()),
      env: {},
      media: media.fetcher,
      defaultOutputDir: outputDir,
    });

    const result = await download({ input: INPUT, media: "audio" });

    expect(result.success ? undefined : result.error).toMatchObject({
      code: "DOWNLOAD_FAILED",
      message: "`download` takes a page URL that yt-dlp supports; direct media URLs and local files are already files.",
    });
    expect(media.calls.resolve).toHaveLength(0);
    expect(media.calls.download).toHaveLength(0);
  });

  test("without outputDir it downloads into the default directory", async () => {
    const media = createFakeMediaFetcher();
    const download = createDownloadMedia({
      configStore: createInMemoryConfigStore(config()),
      env: {},
      media: media.fetcher,
      defaultOutputDir: outputDir,
    });

    const result = await download({ input: "https://www.youtube.com/watch?v=abc", media: "video" });

    expect(result.success ? result.data : undefined).toMatchObject({ sourceKind: "youtube", media: "video" });
    expect(media.calls.download[0]?.request.outputDir).toBe(outputDir);
  });

  test("passes the resolved source settings to the fetcher", async () => {
    const media = createFakeMediaFetcher();
    const download = createDownloadMedia({
      configStore: createInMemoryConfigStore(config({ network: { allow_private_hosts: true } })),
      env: {},
      media: media.fetcher,
      defaultOutputDir: outputDir,
    });

    const result = await download({ input: "https://www.youtube.com/watch?v=abc", media: "audio" });

    expect(result.success).toBe(true);
    const expected = { allowPrivateHosts: true, maxLocalFileBytes: 1073741824 };
    expect(media.calls.settings).toEqual([expected, expected]);
  });
});
