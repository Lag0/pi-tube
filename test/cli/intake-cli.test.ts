import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

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
    env: { ...process.env, ...defaultEnv, ...env },
  });
}

describe("CLI intake integration", () => {
  test("resolves YouTube URL through baseline intake path", () => {
    const result = runCli(["https://www.youtube.com/watch?v=abc123"], {
      PI_TUBE_TEST_YTDLP_JSON: JSON.stringify({
        url: "https://cdn.example.com/youtube/video.mp4",
        title: "YouTube Mock",
      }),
    });

    const stdout = result.stdout.toString();

    expect(result.exitCode).toBe(0);
    expect(stdout).toContain("[INTAKE_RESOLVED] kind=youtube");
    expect(stdout).toContain("media_url=https://cdn.example.com/youtube/video.mp4");
  });

  test("resolves direct media URL through baseline intake path", () => {
    const result = runCli(["https://cdn.example.com/audio/demo.wav"]);
    const stdout = result.stdout.toString();

    expect(result.exitCode).toBe(0);
    expect(stdout).toContain("[INTAKE_RESOLVED] kind=direct_url");
    expect(stdout).toContain("extension=wav");
  });

  test("resolves Instagram public URL through baseline intake path", () => {
    const result = runCli(["https://www.instagram.com/reel/abc123"], {
      PI_TUBE_TEST_INSTAGRAM_YTDLP_JSON: JSON.stringify({
        url: "https://cdn.example.com/instagram/reel.mp4",
        title: "Instagram Mock",
      }),
    });
    const stdout = result.stdout.toString();

    expect(result.exitCode).toBe(0);
    expect(stdout).toContain("[INTAKE_RESOLVED] kind=instagram");
    expect(stdout).toContain("media_url=https://cdn.example.com/instagram/reel.mp4");
  });

  test("fails unsupported non-direct URL with deterministic code", () => {
    const result = runCli(["https://example.com/blog-post"]);
    const stderr = result.stderr.toString();

    expect(result.exitCode).toBe(2);
    expect(stderr).toContain("[UNSUPPORTED_URL_NOT_DIRECT_MEDIA]");
  });

  test("fails auth-required Instagram URL with deterministic code and guidance", () => {
    const result = runCli(["https://www.instagram.com/reel/private123"], {
      PI_TUBE_TEST_INSTAGRAM_YTDLP_ERROR: "auth_required",
    });
    const stderr = result.stderr.toString();

    expect(result.exitCode).toBe(2);
    expect(stderr).toContain("[INSTAGRAM_AUTH_REQUIRED]");
    expect(stderr).toContain("supports Instagram public URLs only");
  });

  test("resolves local file path through baseline intake path", () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "pi-tube-cli-intake-"));
    const filePath = path.join(tempDir, "clip.m4a");

    try {
      writeFileSync(filePath, "audio-data");
      const result = runCli([filePath]);
      const stdout = result.stdout.toString();

      expect(result.exitCode).toBe(0);
      expect(stdout).toContain("[INTAKE_RESOLVED] kind=local_file");
      expect(stdout).toContain(`absolute_path=${filePath}`);
      expect(stdout).toContain("extension=m4a");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
