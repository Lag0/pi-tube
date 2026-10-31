import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import type { ProcessResult } from "../../src/infrastructure/process/run-process.ts";
import { runCliInProcess } from "../helpers/cli-harness.ts";
import { fakeProviders, fakeYtDlp, PROVIDER_KEYS } from "../helpers/transcribe-fakes.ts";
import { readOutputFileFromStdout } from "./output-file.ts";

const outputDir = mkdtempSync(path.join(os.tmpdir(), "pi-tube-cli-intake-output-"));

afterAll(() => {
  rmSync(outputDir, { recursive: true, force: true });
});

// The real media fetcher runs; only the yt-dlp process is faked.
const run = (
  input: string,
  ytDlp: { metadata?: Record<string, unknown>; metadataFailure?: Partial<ProcessResult> } = {},
) =>
  runCliInProcess(["transcribe", input], {
    env: { PI_TUBE_OUTPUT_DIR: outputDir, ...PROVIDER_KEYS },
    fakes: { stt: fakeProviders(), runProcess: fakeYtDlp(ytDlp) },
  });

describe("CLI intake integration", () => {
  test("resolves a YouTube URL and saves the page URL, not the media URL", async () => {
    const result = await run("https://www.youtube.com/watch?v=abc123", {
      metadata: { url: "https://cdn.example.com/youtube/video.mp4", title: "YouTube Mock" },
    });
    const output = readOutputFileFromStdout(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(output).toContain('source_kind: "youtube"');
    expect(output).toContain('source_reference: "https://www.youtube.com/watch?v=abc123"');
    expect(output).not.toContain("cdn.example.com");
  });

  test("maps a missing yt-dlp to YTDLP_NOT_FOUND", async () => {
    const result = await run("https://www.youtube.com/watch?v=abc123", {
      metadataFailure: { outcome: "not_found", exitCode: null },
    });

    expect(result.exitCode).toBe(3);
    expect(result.stderr).toContain("[YTDLP_NOT_FOUND]");
  });

  test("maps YouTube extraction failures to YOUTUBE_EXTRACT_FAILED", async () => {
    const result = await run("https://www.youtube.com/watch?v=abc123", {
      metadataFailure: { stderr: "ERROR: Video unavailable" },
    });

    expect(result.exitCode).toBe(5);
    expect(result.stderr).toContain("[YOUTUBE_EXTRACT_FAILED]");
  });

  test("resolves a direct media URL", async () => {
    const result = await run("https://cdn.example.com/audio/demo.wav");
    const output = readOutputFileFromStdout(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(output).toContain('source_kind: "direct_url"');
    expect(output).toContain('source_reference: "https://cdn.example.com/audio/demo.wav"');
  });

  test("resolves a public Instagram URL and saves the page URL", async () => {
    const result = await run("https://www.instagram.com/reel/abc123", {
      metadata: { url: "https://cdn.example.com/instagram/reel.mp4", title: "Instagram Mock" },
    });
    const output = readOutputFileFromStdout(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(output).toContain('source_kind: "instagram"');
    expect(output).toContain('source_reference: "https://www.instagram.com/reel/abc123"');
    expect(output).not.toContain("cdn.example.com");
  });

  test("a page yt-dlp cannot read is SOURCE_UNSUPPORTED", async () => {
    const result = await run("https://example.com/blog-post", {
      metadataFailure: { stderr: "ERROR: Unsupported URL: https://example.com/blog-post" },
    });

    expect(result.exitCode).toBe(5);
    expect(result.stderr).toContain("[SOURCE_UNSUPPORTED]");
  });

  test("a live stream in progress exits 5 with a retry-later hint", async () => {
    const result = await run("https://www.youtube.com/watch?v=live1", {
      metadata: { id: "live1", extractor_key: "Youtube", title: "Live", live_status: "is_live" },
    });

    expect(result.exitCode).toBe(5);
    expect(result.stderr).toContain("[SOURCE_LIVE_NOT_ENDED]");
    expect(result.stderr).toContain("Retry once the stream has ended");
  });

  test("transcribes a best-effort site through yt-dlp", async () => {
    const result = await run("https://vimeo.com/1", {
      metadata: { id: "1", extractor_key: "Vimeo", title: "Vimeo Mock" },
    });
    const output = readOutputFileFromStdout(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(output).toContain('source_kind: "site"');
    expect(output).toContain("- Title: Vimeo Mock");
  });

  test("fails an auth-required Instagram URL with guidance", async () => {
    const result = await run("https://www.instagram.com/reel/private123", {
      metadataFailure: { stderr: "ERROR: login required" },
    });

    expect(result.exitCode).toBe(5);
    expect(result.stderr).toContain("[INSTAGRAM_AUTH_REQUIRED]");
    expect(result.stderr).toContain("supports public Instagram URLs only");
  });

  test("maps Instagram extraction failures to INSTAGRAM_EXTRACT_FAILED", async () => {
    const result = await run("https://www.instagram.com/reel/abc123", {
      metadataFailure: { stderr: "ERROR: something broke" },
    });

    expect(result.exitCode).toBe(5);
    expect(result.stderr).toContain("[INSTAGRAM_EXTRACT_FAILED]");
  });

  test("resolves a local file path", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "pi-tube-cli-intake-"));
    const filePath = path.join(tempDir, "clip.m4a");

    try {
      writeFileSync(filePath, "audio-data");
      const result = await run(filePath);
      const output = readOutputFileFromStdout(result.stdout);

      expect(result.exitCode).toBe(0);
      expect(output).toContain('source_kind: "local_file"');
      expect(output).toContain(`source_reference: ${JSON.stringify(filePath)}`);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
