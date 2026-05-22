import { describe, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { downloadInternalsForTests, downloadMedia } from "../../src/download/service.ts";

function tempDir(): string {
  return mkdtempSync(path.join(os.tmpdir(), "pi-tube-download-test-"));
}

describe("download service", () => {
  test("downloads video with audio by default", async () => {
    const cwd = tempDir();
    const calls: string[][] = [];
    try {
      const result = await downloadMedia("https://www.youtube.com/watch?v=abc123", {
        cwd,
        executor: async (args) => {
          calls.push(args);
          return { exitCode: 0, stdout: path.join(cwd, "downloads", "video.mp4") + "\n", stderr: "" };
        },
      });

      expect(result.sourceKind).toBe("youtube");
      expect(result.media).toBe("video");
      expect(result.outputPath).toBe(path.join(cwd, "downloads", "video.mp4"));
      expect(result.outputUri).toBe(`file://${path.join(cwd, "downloads", "video.mp4")}`);
      expect(calls[0]).toContain("bestvideo*+bestaudio/best");
      expect(calls[0]).toContain("--merge-output-format");
      expect(calls[0]).toContain(path.join(cwd, "downloads"));
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("supports audio-only downloads", async () => {
    const cwd = tempDir();
    try {
      const result = await downloadMedia("https://www.youtube.com/watch?v=abc123", {
        cwd,
        media: "audio",
        executor: async (args) => {
          expect(args).toContain("bestaudio/best");
          expect(args).toContain("-x");
          expect(args).toContain("--audio-format");
          expect(args).toContain("mp3");
          return { exitCode: 0, stdout: "song.mp3\n", stderr: "" };
        },
      });

      expect(result.media).toBe("audio");
      expect(result.outputPath).toBe(path.join(cwd, "song.mp3"));
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("supports custom output directories", async () => {
    const cwd = tempDir();
    try {
      await downloadMedia("https://www.instagram.com/reel/abc123", {
        cwd,
        outputDir: "custom-media",
        executor: async (args) => {
          expect(args).toContain(path.join(cwd, "custom-media"));
          return { exitCode: 0, stdout: path.join(cwd, "custom-media", "reel.mp4") + "\n", stderr: "" };
        },
      });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("fails when yt-dlp does not report a downloaded path", async () => {
    await expect(downloadMedia("https://www.youtube.com/watch?v=abc123", {
      executor: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
    })).rejects.toMatchObject({ code: "DOWNLOAD_FAILED" });
  });

  test("maps Instagram auth failures", async () => {
    await expect(downloadMedia("https://www.instagram.com/reel/private123", {
      executor: async () => ({ exitCode: 1, stdout: "", stderr: "login required" }),
    })).rejects.toMatchObject({ code: "INSTAGRAM_AUTH_REQUIRED" });
  });

  test("builds deterministic yt-dlp arguments", () => {
    expect(downloadInternalsForTests.parseDownloadedPath("one\ntwo.mp4\n")).toBe("two.mp4");
    expect(downloadInternalsForTests.buildYtDlpArgs("https://example.com", "video", "/tmp/out")).toEqual([
      "--no-warnings",
      "--no-playlist",
      "-P",
      "/tmp/out",
      "-o",
      "%(title).200B [%(id)s].%(ext)s",
      "--print",
      "after_move:filepath",
      "-f",
      "bestvideo*+bestaudio/best",
      "--merge-output-format",
      "mp4",
      "https://example.com",
    ]);
  });
});
