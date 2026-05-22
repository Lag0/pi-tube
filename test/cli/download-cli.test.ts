import { describe, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

function runCli(args: string[], env: Record<string, string> = {}) {
  return Bun.spawnSync({
    cmd: ["bun", "run", "--bun", "bin/pi-tube.ts", ...args],
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      ...env,
    },
  });
}

describe("download command", () => {
  test("downloads video by default", () => {
    const output = path.join(os.tmpdir(), "pi-tube-video.mp4");
    const result = runCli(["download", "https://www.youtube.com/watch?v=abc123"], {
      PI_TUBE_TEST_DOWNLOAD_FILE: output,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain(`[DOWNLOAD_FILE] ${output}`);
    expect(result.stdout.toString()).toContain(`[DOWNLOAD_FILE_URI] file://${output}`);
  });

  test("supports audio-only downloads", () => {
    const output = path.join(os.tmpdir(), "pi-tube-audio.mp3");
    const result = runCli(["download", "https://www.youtube.com/watch?v=abc123", "--audio"], {
      PI_TUBE_TEST_DOWNLOAD_FILE: output,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain(`[DOWNLOAD_FILE] ${output}`);
  });

  test("supports custom output directory", () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), "pi-tube-download-cli-"));
    const output = path.join(cwd, "custom", "reel.mp4");
    try {
      const result = runCli(["download", "https://www.instagram.com/reel/abc123", "--output", path.join(cwd, "custom")], {
        PI_TUBE_TEST_DOWNLOAD_FILE: output,
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout.toString()).toContain(`[DOWNLOAD_FILE] ${output}`);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("validates required URL", () => {
    const result = runCli(["download"]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr.toString()).toContain("[CLI_CONTRACT_VIOLATION]");
    expect(result.stderr.toString()).toContain("pi-tube download <url>");
  });

  test("rejects transcription-only flags", () => {
    const result = runCli(["download", "https://www.youtube.com/watch?v=abc123", "--provider", "groq"]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr.toString()).toContain("[CLI_CONTRACT_VIOLATION]");
    expect(result.stderr.toString()).toContain("download` does not support");
  });

  test("maps missing yt-dlp with setup guidance", () => {
    const result = runCli(["download", "https://www.youtube.com/watch?v=abc123"], {
      PI_TUBE_TEST_DOWNLOAD_ERROR: "not_found",
    });
    const stderr = result.stderr.toString();

    expect(result.exitCode).toBe(2);
    expect(stderr).toContain("[YTDLP_NOT_FOUND]");
    expect(stderr).toContain("pi-tube setup yt-dlp");
  });

  test("maps download failures", () => {
    const result = runCli(["download", "https://www.youtube.com/watch?v=abc123"], {
      PI_TUBE_TEST_DOWNLOAD_ERROR: "failed",
    });

    expect(result.exitCode).toBe(2);
    expect(result.stderr.toString()).toContain("[DOWNLOAD_FAILED]");
  });
});
