import { afterAll, describe, expect, test } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { readOutputFileFromStdout } from "./output-file.ts";

const outputDir = mkdtempSync(path.join(os.tmpdir(), "pi-tube-cli-intake-output-"));

afterAll(() => {
  rmSync(outputDir, { recursive: true, force: true });
});

function runCli(args: string[], env: Record<string, string> = {}) {
  const defaultEnv = {
    PI_TUBE_TEST_DEEPGRAM_RESPONSE: JSON.stringify({
      results: {
        channels: [{ detected_language: "en", alternatives: [{ transcript: "test transcript" }] }],
      },
    }),
  };

  return Bun.spawnSync({
    cmd: ["bun", "run", "--bun", "bin/pi-tube.ts", ...args],
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...defaultEnv, PI_TUBE_OUTPUT_DIR: outputDir, ...env },
  });
}

describe("CLI intake integration", () => {
  test("resolves YouTube URL through baseline intake path", () => {
    const result = runCli(["transcribe", "https://www.youtube.com/watch?v=abc123"], {
      PI_TUBE_TEST_YTDLP_JSON: JSON.stringify({
        url: "https://cdn.example.com/youtube/video.mp4",
        title: "YouTube Mock",
      }),
    });

    const stdout = readOutputFileFromStdout(result.stdout.toString());

    expect(result.exitCode).toBe(0);
    expect(stdout).toContain('source_kind: "youtube"');
    expect(stdout).toContain('source_reference: "https://cdn.example.com/youtube/video.mp4"');
  });

  test("maps missing yt-dlp dependency to deterministic code", () => {
    const result = runCli(["transcribe", "https://www.youtube.com/watch?v=abc123"], {
      PI_TUBE_TEST_YTDLP_ERROR: "not_found",
    });
    const stderr = result.stderr.toString();

    expect(result.exitCode).toBe(2);
    expect(stderr).toContain("[YTDLP_NOT_FOUND]");
  });

  test("maps YouTube extraction failures to deterministic code", () => {
    const result = runCli(["transcribe", "https://www.youtube.com/watch?v=abc123"], {
      PI_TUBE_TEST_YTDLP_ERROR: "extract_failed",
    });
    const stderr = result.stderr.toString();

    expect(result.exitCode).toBe(2);
    expect(stderr).toContain("[YOUTUBE_EXTRACT_FAILED]");
  });

  test("resolves direct media URL through baseline intake path", () => {
    const result = runCli(["transcribe", "https://cdn.example.com/audio/demo.wav"]);
    const stdout = readOutputFileFromStdout(result.stdout.toString());

    expect(result.exitCode).toBe(0);
    expect(stdout).toContain('source_kind: "direct_url"');
    expect(stdout).toContain('source_reference: "https://cdn.example.com/audio/demo.wav"');
  });

  test("resolves Instagram public URL through baseline intake path", () => {
    const result = runCli(["transcribe", "https://www.instagram.com/reel/abc123"], {
      PI_TUBE_TEST_INSTAGRAM_YTDLP_JSON: JSON.stringify({
        url: "https://cdn.example.com/instagram/reel.mp4",
        title: "Instagram Mock",
      }),
    });
    const stdout = readOutputFileFromStdout(result.stdout.toString());

    expect(result.exitCode).toBe(0);
    expect(stdout).toContain('source_kind: "instagram"');
    expect(stdout).toContain('source_reference: "https://cdn.example.com/instagram/reel.mp4"');
  });

  test("fails unsupported non-direct URL with deterministic code", () => {
    const result = runCli(["transcribe", "https://example.com/blog-post"]);
    const stderr = result.stderr.toString();

    expect(result.exitCode).toBe(2);
    expect(stderr).toContain("[UNSUPPORTED_URL_NOT_DIRECT_MEDIA]");
  });

  test("fails auth-required Instagram URL with deterministic code and guidance", () => {
    const result = runCli(["transcribe", "https://www.instagram.com/reel/private123"], {
      PI_TUBE_TEST_INSTAGRAM_YTDLP_ERROR: "auth_required",
    });
    const stderr = result.stderr.toString();

    expect(result.exitCode).toBe(2);
    expect(stderr).toContain("[INSTAGRAM_AUTH_REQUIRED]");
    expect(stderr).toContain("supports Instagram public URLs only");
  });

  test("maps Instagram extraction failures to deterministic code", () => {
    const result = runCli(["transcribe", "https://www.instagram.com/reel/abc123"], {
      PI_TUBE_TEST_INSTAGRAM_YTDLP_ERROR: "extract_failed",
    });
    const stderr = result.stderr.toString();

    expect(result.exitCode).toBe(2);
    expect(stderr).toContain("[INSTAGRAM_EXTRACT_FAILED]");
  });

  test("resolves local file path through baseline intake path", () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "pi-tube-cli-intake-"));
    const filePath = path.join(tempDir, "clip.m4a");

    try {
      writeFileSync(filePath, "audio-data");
      const result = runCli(["transcribe", filePath]);
      const stdout = readOutputFileFromStdout(result.stdout.toString());

      expect(result.exitCode).toBe(0);
      expect(stdout).toContain('source_kind: "local_file"');
      expect(stdout).toContain(`source_reference: "${filePath}"`);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
