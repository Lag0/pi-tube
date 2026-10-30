import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createMediaFetcher } from "../../../src/infrastructure/media/media-fetcher.ts";
import type { ProcessRequest, ProcessResult } from "../../../src/infrastructure/process/run-process.ts";

const YOUTUBE = "https://www.youtube.com/watch?v=abc";
const INSTAGRAM = "https://www.instagram.com/reel/abc/";

let root: string;
let tmpDir: string;

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), "pi-tube-media-"));
  tmpDir = path.join(root, "tmp");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const exited = (stdout: string, exitCode = 0, stderr = ""): ProcessResult => ({
  outcome: "exited",
  exitCode,
  stdout,
  stderr,
});

const fakeRun = (answer: (request: ProcessRequest) => ProcessResult | Promise<ProcessResult>) => {
  const requests: ProcessRequest[] = [];
  const run = async (request: ProcessRequest) => {
    requests.push(request);
    return answer(request);
  };
  return { requests, run };
};

const fetcherWith = (run: (request: ProcessRequest) => Promise<ProcessResult>, env: Record<string, string> = {}) =>
  createMediaFetcher({ env: { PATH: "/bin", ...env }, cwd: root, tmpDir, run });

describe("resolve", () => {
  test("YouTube metadata comes from yt-dlp with `--` before the URL", async () => {
    const { requests, run } = fakeRun(() =>
      exited(
        JSON.stringify({
          url: "https://media.example.com/a.m4a",
          title: "Demo",
          upload_date: "20260102",
          description: "See https://example.com/x.",
        }),
      ),
    );

    const result = await fetcherWith(run).resolve(YOUTUBE);

    expect(result).toEqual({
      success: true,
      data: {
        kind: "youtube",
        originalInput: YOUTUBE,
        normalizedUrl: YOUTUBE,
        mediaUrl: "https://media.example.com/a.m4a",
        title: "Demo",
        publishedAt: "2026-01-02",
        description: "See https://example.com/x.",
        descriptionLinks: ["https://example.com/x"],
      },
    });
    expect(requests[0]?.command).toBe("yt-dlp");
    expect(requests[0]?.args.slice(-2)).toEqual(["--", YOUTUBE]);
    expect(requests[0]?.timeoutMs).toBe(120_000);
  });

  test("a URL that contains a dash still follows `--`", async () => {
    const url = "https://www.youtube.com/watch?v=-xyz";
    const { requests, run } = fakeRun(() => exited(JSON.stringify({ url: "https://m.example.com/a" })));

    await fetcherWith(run).resolve(url);

    expect(requests[0]?.args.slice(-2)).toEqual(["--", url]);
  });

  test.each(["-o/tmp/x", "--exec=calc"])("%s is a missing local file and never reaches yt-dlp", async (input) => {
    const { requests, run } = fakeRun(() => exited(""));

    const result = await fetcherWith(run).resolve(input);

    expect(result.success ? undefined : result.error.code).toBe("LOCAL_FILE_NOT_FOUND");
    expect(requests).toHaveLength(0);
  });

  test("a missing yt-dlp is YTDLP_NOT_FOUND", async () => {
    const { run } = fakeRun(() => ({ outcome: "not_found", exitCode: null, stdout: "", stderr: "" }));

    const result = await fetcherWith(run).resolve(YOUTUBE);

    expect(result.success ? undefined : result.error.code).toBe("YTDLP_NOT_FOUND");
  });

  test("an Instagram timeout is INSTAGRAM_EXTRACT_FAILED, not a YouTube code", async () => {
    const { run } = fakeRun(() => ({ outcome: "timed_out", exitCode: null, stdout: "", stderr: "" }));

    const result = await fetcherWith(run).resolve(INSTAGRAM);

    expect(result.success ? undefined : result.error.code).toBe("INSTAGRAM_EXTRACT_FAILED");
  });

  test("an Instagram login wall is INSTAGRAM_AUTH_REQUIRED", async () => {
    const { run } = fakeRun(() => exited("", 1, "ERROR: login required"));

    const result = await fetcherWith(run).resolve(INSTAGRAM);

    expect(result.success ? undefined : result.error.code).toBe("INSTAGRAM_AUTH_REQUIRED");
  });

  test("an aborted run is CANCELLED", async () => {
    const { run } = fakeRun(() => ({ outcome: "aborted", exitCode: null, stdout: "", stderr: "" }));

    const result = await fetcherWith(run).resolve(YOUTUBE);

    expect(result.success ? undefined : result.error.code).toBe("CANCELLED");
  });

  test("malformed JSON is YTDLP_OUTPUT_INVALID", async () => {
    const { run } = fakeRun(() => exited("{not json"));

    const result = await fetcherWith(run).resolve(YOUTUBE);

    expect(result.success ? undefined : result.error.code).toBe("YTDLP_OUTPUT_INVALID");
  });

  test("PI_TUBE_YTDLP_TIMEOUT_MS from the injected env overrides the timeout", async () => {
    const { requests, run } = fakeRun(() => exited(JSON.stringify({ url: "https://m.example.com/a" })));

    await fetcherWith(run, { PI_TUBE_YTDLP_TIMEOUT_MS: "5000" }).resolve(YOUTUBE);

    expect(requests[0]?.timeoutMs).toBe(5000);
  });

  test("a local file resolves without yt-dlp", async () => {
    writeFileSync(path.join(root, "clip.mp3"), "x");
    const { requests, run } = fakeRun(() => exited(""));

    const result = await fetcherWith(run).resolve("clip.mp3");

    expect(result.success ? result.data : undefined).toMatchObject({
      kind: "local_file",
      absolutePath: path.join(root, "clip.mp3"),
    });
    expect(requests).toHaveLength(0);
  });
});

describe("fetchAudio", () => {
  const youtubeSource = {
    kind: "youtube" as const,
    originalInput: YOUTUBE,
    normalizedUrl: YOUTUBE,
    mediaUrl: "https://media.example.com/a.m4a",
  };

  test("downloads YouTube audio into its own temp dir and release removes it", async () => {
    const { requests, run } = fakeRun((request) => {
      const outputTemplate = request.args[request.args.indexOf("-o") + 1] ?? "";
      const file = outputTemplate.replace("%(id)s.%(ext)s", "abc.m4a");
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, "audio");
      return exited(`${file}\n`);
    });

    const result = await fetcherWith(run).fetchAudio(youtubeSource);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.audio.kind).toBe("file");
    expect(requests[0]?.args.slice(-2)).toEqual(["--", YOUTUBE]);
    expect(requests[0]?.timeoutMs).toBe(1_800_000);
    await result.data.release();
    expect(readdirSync(tmpDir)).toEqual([]);
  });

  test("a failed audio download is DOWNLOAD_FAILED and leaves the temp dir empty", async () => {
    const { run } = fakeRun((request) => {
      const outputTemplate = request.args[request.args.indexOf("-o") + 1] ?? "";
      mkdirSync(path.dirname(outputTemplate), { recursive: true });
      writeFileSync(path.join(path.dirname(outputTemplate), "partial.part"), "x");
      return exited("", 1, "ERROR: boom");
    });

    const result = await fetcherWith(run).fetchAudio(youtubeSource);

    expect(result.success ? undefined : result.error.code).toBe("DOWNLOAD_FAILED");
    expect(existsSync(tmpDir) ? readdirSync(tmpDir) : []).toEqual([]);
  });

  test("a direct URL is handed to the provider as a URL", async () => {
    const { run } = fakeRun(() => exited(""));
    const source = {
      kind: "direct_url" as const,
      originalInput: "https://cdn.example.com/a.mp3",
      normalizedUrl: "https://cdn.example.com/a.mp3",
      mediaUrl: "https://cdn.example.com/a.mp3",
      extension: "mp3",
    };

    const result = await fetcherWith(run).fetchAudio(source);

    expect(result.success ? result.data.audio : undefined).toEqual({
      kind: "url",
      url: "https://cdn.example.com/a.mp3",
    });
  });
});

describe("download", () => {
  test("audio download asks yt-dlp for mp3 and returns path and uri", async () => {
    const outputDir = path.join(root, "out");
    const file = path.join(outputDir, "Demo [abc].mp3");
    const { requests, run } = fakeRun(() => exited(`${file}\n`));

    const result = await fetcherWith(run).download({ url: YOUTUBE, kind: "youtube" }, { media: "audio", outputDir });

    expect(result.success ? result.data.path : undefined).toBe(file);
    expect(result.success ? result.data.uri.startsWith("file://") : undefined).toBe(true);
    expect(requests[0]?.args).toEqual(
      expect.arrayContaining(["-x", "--audio-format", "mp3", "-P", `home:${outputDir}`]),
    );
    expect(requests[0]?.args.slice(-2)).toEqual(["--", YOUTUBE]);
  });

  test("passes the injected env to the runner, which filters it", async () => {
    const { requests, run } = fakeRun(() => exited(`${path.join(root, "a.mp4")}\n`));

    await fetcherWith(run, { GROQ_API_KEY: "k" }).download(
      { url: YOUTUBE, kind: "youtube" },
      { media: "video", outputDir: root },
    );

    expect(requests[0]?.env).toMatchObject({ PATH: "/bin", GROQ_API_KEY: "k" });
  });

  test("an output dir that cannot be created is STORAGE_IO_FAILED", async () => {
    const blocker = path.join(root, "file");
    writeFileSync(blocker, "x");
    const { run } = fakeRun(() => exited(""));

    const result = await fetcherWith(run).download(
      { url: YOUTUBE, kind: "youtube" },
      { media: "video", outputDir: path.join(blocker, "out") },
    );

    expect(result.success ? undefined : result.error.code).toBe("STORAGE_IO_FAILED");
  });
});

describe("hardening", () => {
  test("every yt-dlp run ignores yt-dlp config files, so a ./yt-dlp.conf cannot inject options", async () => {
    const { requests, run } = fakeRun((request) => {
      if (request.args.includes("--dump-single-json"))
        return exited(JSON.stringify({ url: "https://m.example.com/a" }));
      return exited(`${path.join(root, "a.mp4")}\n`);
    });
    const fetcher = fetcherWith(run);

    await fetcher.resolve(YOUTUBE);
    await fetcher.download({ url: YOUTUBE, kind: "youtube" }, { media: "video", outputDir: root });

    for (const request of requests) expect(request.args).toContain("--ignore-config");
  });

  test("a failed or cancelled download leaves no partial file in the output dir", async () => {
    const outputDir = path.join(root, "out");
    const { requests, run } = fakeRun((request) => {
      const temp = request.args.find((arg) => arg.startsWith("temp:"))?.slice("temp:".length) ?? outputDir;
      mkdirSync(temp, { recursive: true });
      writeFileSync(path.join(temp, "Demo [abc].f401.mp4.part"), "partial");
      return { outcome: "aborted", exitCode: null, stdout: "", stderr: "" };
    });

    const result = await fetcherWith(run).download({ url: YOUTUBE, kind: "youtube" }, { media: "video", outputDir });

    expect(result.success ? undefined : result.error.code).toBe("CANCELLED");
    expect(requests[0]?.args).toEqual(expect.arrayContaining(["-P", `home:${outputDir}`]));
    expect(existsSync(outputDir) ? readdirSync(outputDir) : []).toEqual([]);
    expect(existsSync(tmpDir) ? readdirSync(tmpDir) : []).toEqual([]);
  });

  test.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "release never rejects, even when the temp dir cannot be removed",
    async () => {
      const { run } = fakeRun((request) => {
        const template = request.args[request.args.indexOf("-o") + 1] ?? "";
        const file = template.replace("%(id)s.%(ext)s", "abc.m4a");
        mkdirSync(path.dirname(file), { recursive: true });
        writeFileSync(file, "audio");
        return exited(`${file}\n`);
      });
      const fetched = await fetcherWith(run).fetchAudio({
        kind: "youtube",
        originalInput: YOUTUBE,
        normalizedUrl: YOUTUBE,
        mediaUrl: "https://media.example.com/a.m4a",
      });
      if (!fetched.success) throw new Error("fetchAudio failed");
      chmodSync(tmpDir, 0o500);

      try {
        await expect(fetched.data.release()).resolves.toBeUndefined();
      } finally {
        chmodSync(tmpDir, 0o700);
      }
    },
  );
});
