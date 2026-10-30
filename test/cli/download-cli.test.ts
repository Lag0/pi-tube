import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { ProcessRequest, ProcessResult } from "../../src/infrastructure/process/run-process.ts";
import { runCliInProcess } from "../helpers/cli-harness.ts";

const YOUTUBE = "https://www.youtube.com/watch?v=abc123";

let home: string;

beforeEach(() => {
  home = mkdtempSync(path.join(os.tmpdir(), "pi-tube-download-cli-"));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

/** A yt-dlp stand-in: answers `outcome`, or prints a file inside the `-P` directory. */
const fakeDownloader = (outcome?: Partial<ProcessResult>) => {
  const requests: ProcessRequest[] = [];
  const run = async (request: ProcessRequest): Promise<ProcessResult> => {
    requests.push(request);
    if (outcome) return { outcome: "exited", exitCode: 1, stdout: "", stderr: "", ...outcome };
    const dir = request.args[request.args.indexOf("-P") + 1] ?? "";
    return { outcome: "exited", exitCode: 0, stdout: `${path.join(dir, "Demo [abc123].mp4")}\n`, stderr: "" };
  };
  const outputDirOf = (index = 0): string | undefined => {
    const args = requests[index]?.args ?? [];
    return args[args.indexOf("-P") + 1];
  };
  return { requests, run, outputDirOf };
};

const download = (args: string[], downloader = fakeDownloader()) =>
  runCliInProcess(["download", ...args], { env: { HOME: home }, fakes: { runProcess: downloader.run } });

describe("download command", () => {
  test("downloads video into ~/.pi-tube/downloads by default, never the cwd", async () => {
    const downloader = fakeDownloader();
    const result = await download([YOUTUBE], downloader);
    const file = path.join(home, ".pi-tube", "downloads", "Demo [abc123].mp4");

    expect(result.exitCode).toBe(0);
    expect(downloader.outputDirOf()).toBe(path.join(home, ".pi-tube", "downloads"));
    expect(result.stdout).toContain(`[DOWNLOAD_FILE] ${file}`);
    expect(result.stdout).toContain(`[DOWNLOAD_FILE_URI] ${pathToFileURL(file).href}`);
  });

  test("supports audio-only downloads", async () => {
    const downloader = fakeDownloader();
    const result = await download([YOUTUBE, "--audio"], downloader);

    expect(result.exitCode).toBe(0);
    expect(downloader.requests[0]?.args).toEqual(expect.arrayContaining(["-x", "--audio-format", "mp3"]));
  });

  test("an absolute --output is used as is", async () => {
    const downloader = fakeDownloader();
    const target = path.join(home, "custom");

    const result = await download(["https://www.instagram.com/reel/abc123", "--output", target], downloader);

    expect(result.exitCode).toBe(0);
    expect(downloader.outputDirOf()).toBe(target);
  });

  test("a relative --output resolves against the cwd", async () => {
    const downloader = fakeDownloader();
    const relative = `.pi-tube-download-test-${process.pid}`;

    try {
      await download([YOUTUBE, "--output", relative], downloader);

      expect(downloader.outputDirOf()).toBe(path.resolve(process.cwd(), relative));
    } finally {
      rmSync(path.resolve(process.cwd(), relative), { recursive: true, force: true });
    }
  });

  test("--json prints the result object", async () => {
    const result = await download([YOUTUBE, "--audio", "--json"]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      output_path: path.join(home, ".pi-tube", "downloads", "Demo [abc123].mp4"),
      output_uri: pathToFileURL(path.join(home, ".pi-tube", "downloads", "Demo [abc123].mp4")).href,
      source_kind: "youtube",
      media: "audio",
    });
  });

  test("validates the required URL", async () => {
    const result = await download([]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("[INPUT_INVALID]");
    expect(result.stderr).toContain("pi-tube download <url>");
  });

  test("rejects transcription-only flags", async () => {
    const result = await download([YOUTUBE, "--provider", "groq"]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("[INPUT_INVALID]");
    expect(result.stderr).toContain("unknown option '--provider'");
  });

  test("a direct media URL is DOWNLOAD_FAILED", async () => {
    const downloader = fakeDownloader();
    const result = await download(["https://cdn.example.com/a.mp3"], downloader);

    expect(result.exitCode).toBe(5);
    expect(result.stderr).toContain("[DOWNLOAD_FAILED]");
    expect(downloader.requests).toHaveLength(0);
  });

  test("maps a missing yt-dlp with setup guidance", async () => {
    const result = await download([YOUTUBE], fakeDownloader({ outcome: "not_found", exitCode: null }));

    expect(result.exitCode).toBe(3);
    expect(result.stderr).toContain("[YTDLP_NOT_FOUND]");
    expect(result.stderr).toContain("pi-tube setup yt-dlp");
  });

  test("maps download failures", async () => {
    const result = await download([YOUTUBE], fakeDownloader({ stderr: "ERROR: Video unavailable" }));

    expect(result.exitCode).toBe(5);
    expect(result.stderr).toContain("[DOWNLOAD_FAILED]");
  });
});
