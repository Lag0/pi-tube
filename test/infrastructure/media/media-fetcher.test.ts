import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { SiteSource } from "../../../src/core/domain/source.ts";
import type { SourceSettings } from "../../../src/core/domain/source-settings.ts";
import { createMediaFetcher } from "../../../src/infrastructure/media/media-fetcher.ts";
import type { ProcessRequest, ProcessResult } from "../../../src/infrastructure/process/run-process.ts";

const YOUTUBE = "https://www.youtube.com/watch?v=abc";
const INSTAGRAM = "https://www.instagram.com/reel/abc/";
const VIMEO = "https://vimeo.com/1";
const YOUTUBE_SOURCE: SiteSource = {
  kind: "youtube",
  originalInput: YOUTUBE,
  normalizedUrl: YOUTUBE,
  metadata: { platform: "Youtube" },
};

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

const SETTINGS: SourceSettings = { allowPrivateHosts: false, maxLocalFileBytes: 1_073_741_824 };

/** No test resolves real DNS: every host resolves to a public address unless a test says otherwise. */
const PUBLIC_LOOKUP = async () => [{ address: "93.184.216.34", family: 4 }];

const fetcherWith = (run: (request: ProcessRequest) => Promise<ProcessResult>, env: Record<string, string> = {}) =>
  createMediaFetcher({ env: { PATH: "/bin", ...env }, cwd: root, tmpDir, run, lookup: PUBLIC_LOOKUP });

describe("resolve", () => {
  test("YouTube metadata comes from yt-dlp with `--` before the URL", async () => {
    const { requests, run } = fakeRun(() =>
      exited(
        JSON.stringify({
          id: "abc",
          extractor_key: "Youtube",
          webpage_url: YOUTUBE,
          title: "Demo",
          upload_date: "20260102",
          description: "See https://example.com/x.",
        }),
      ),
    );

    const result = await fetcherWith(run).resolve(YOUTUBE, SETTINGS);

    expect(result).toEqual({
      success: true,
      data: {
        kind: "youtube",
        originalInput: YOUTUBE,
        normalizedUrl: YOUTUBE,
        metadata: {
          platform: "Youtube",
          mediaId: "abc",
          canonicalUrl: YOUTUBE,
          title: "Demo",
          publishedAt: "2026-01-02",
          description: "See https://example.com/x.",
          descriptionLinks: ["https://example.com/x"],
        },
      },
    });
    expect(requests[0]?.args).not.toContain("-f");
    expect(requests[0]?.args).toContain("--ignore-no-formats-error");
    expect(requests[0]?.command).toBe("yt-dlp");
    expect(requests[0]?.args.slice(-2)).toEqual(["--", YOUTUBE]);
    expect(requests[0]?.timeoutMs).toBe(120_000);
  });

  test("a URL that contains a dash still follows `--`", async () => {
    const url = "https://www.youtube.com/watch?v=-xyz";
    const { requests, run } = fakeRun(() => exited(JSON.stringify({ url: "https://m.example.com/a" })));

    await fetcherWith(run).resolve(url, SETTINGS);

    expect(requests[0]?.args.slice(-2)).toEqual(["--", url]);
  });

  test.each(["-o/tmp/x", "--exec=calc"])("%s is a missing local file and never reaches yt-dlp", async (input) => {
    const { requests, run } = fakeRun(() => exited(""));

    const result = await fetcherWith(run).resolve(input, SETTINGS);

    expect(result.success ? undefined : result.error.code).toBe("LOCAL_FILE_NOT_FOUND");
    expect(requests).toHaveLength(0);
  });

  test("a missing yt-dlp is YTDLP_NOT_FOUND", async () => {
    const { run } = fakeRun(() => ({ outcome: "not_found", exitCode: null, stdout: "", stderr: "" }));

    const result = await fetcherWith(run).resolve(YOUTUBE, SETTINGS);

    expect(result.success ? undefined : result.error.code).toBe("YTDLP_NOT_FOUND");
  });

  test("an Instagram timeout is INSTAGRAM_EXTRACT_FAILED, not a YouTube code", async () => {
    const { run } = fakeRun(() => ({ outcome: "timed_out", exitCode: null, stdout: "", stderr: "" }));

    const result = await fetcherWith(run).resolve(INSTAGRAM, SETTINGS);

    expect(result.success ? undefined : result.error.code).toBe("INSTAGRAM_EXTRACT_FAILED");
  });

  test("an Instagram login wall is SOURCE_AUTH_REQUIRED", async () => {
    const { run } = fakeRun(() => exited("", 1, "ERROR: login required"));

    const result = await fetcherWith(run).resolve(INSTAGRAM, SETTINGS);

    expect(result.success ? undefined : result.error.code).toBe("SOURCE_AUTH_REQUIRED");
  });

  test("an aborted run is CANCELLED", async () => {
    const { run } = fakeRun(() => ({ outcome: "aborted", exitCode: null, stdout: "", stderr: "" }));

    const result = await fetcherWith(run).resolve(YOUTUBE, SETTINGS);

    expect(result.success ? undefined : result.error.code).toBe("CANCELLED");
  });

  test("malformed JSON is YTDLP_OUTPUT_INVALID", async () => {
    const { run } = fakeRun(() => exited("{not json"));

    const result = await fetcherWith(run).resolve(YOUTUBE, SETTINGS);

    expect(result.success ? undefined : result.error.code).toBe("YTDLP_OUTPUT_INVALID");
  });

  test("PI_TUBE_YTDLP_TIMEOUT_MS from the injected env overrides the timeout", async () => {
    const { requests, run } = fakeRun(() => exited(JSON.stringify({ url: "https://m.example.com/a" })));

    await fetcherWith(run, { PI_TUBE_YTDLP_TIMEOUT_MS: "5000" }).resolve(YOUTUBE, SETTINGS);

    expect(requests[0]?.timeoutMs).toBe(5000);
  });

  test.each([
    ["30s", 120_000],
    ["1e3", 120_000],
    ["0", 120_000],
    ["-5", 120_000],
    ["3000000000", 2_147_483_647],
  ])("PI_TUBE_YTDLP_TIMEOUT_MS=%s gives a %i ms timeout", async (value, expected) => {
    const { requests, run } = fakeRun(() => exited(JSON.stringify({ url: "https://m.example.com/a" })));

    await fetcherWith(run, { PI_TUBE_YTDLP_TIMEOUT_MS: value }).resolve(YOUTUBE, SETTINGS);

    expect(requests[0]?.timeoutMs).toBe(expected);
  });

  test("any other page goes to yt-dlp as a best-effort site", async () => {
    const { requests, run } = fakeRun(() => exited(JSON.stringify({ id: "1", extractor_key: "Vimeo", title: "V" })));

    const result = await fetcherWith(run).resolve(VIMEO, SETTINGS);

    expect(result.success ? result.data : undefined).toEqual({
      kind: "site",
      originalInput: VIMEO,
      normalizedUrl: VIMEO,
      metadata: { platform: "Vimeo", mediaId: "1", title: "V" },
    });
    expect(requests[0]?.args).toEqual([
      "--ignore-config",
      "--no-warnings",
      "--no-playlist",
      "--dump-single-json",
      "--ignore-no-formats-error",
      "--flat-playlist",
      "--",
      VIMEO,
    ]);
  });

  test.each([
    "ERROR: Unsupported URL: https://example.com/page",
    "ERROR: No suitable extractor found for URL https://example.com/page",
  ])("%s is SOURCE_UNSUPPORTED", async (stderr) => {
    const { run } = fakeRun(() => exited("", 1, stderr));

    const result = await fetcherWith(run).resolve("https://example.com/page", SETTINGS);

    expect(result.success ? undefined : result.error.code).toBe("SOURCE_UNSUPPORTED");
  });

  test("a failed site resolve is SOURCE_EXTRACT_FAILED", async () => {
    const { run } = fakeRun(() => exited("", 1, "ERROR: [vimeo] 1: boom"));

    const result = await fetcherWith(run).resolve(VIMEO, SETTINGS);

    expect(result.success ? undefined : result.error).toMatchObject({
      code: "SOURCE_EXTRACT_FAILED",
      message: "Failed to resolve media via yt-dlp (ERROR: [vimeo] 1: boom).",
    });
  });

  test("a playlist is SOURCE_UNSUPPORTED with a single-video hint", async () => {
    const url = "https://www.youtube.com/playlist?list=PL1";
    const { run } = fakeRun(() => exited(JSON.stringify({ _type: "playlist", id: "PL1", entries: [] })));

    const result = await fetcherWith(run).resolve(url, SETTINGS);

    expect(result.success ? undefined : result.error).toEqual({
      code: "SOURCE_UNSUPPORTED",
      message: `\`${url}\` is a playlist or channel; pi-tube takes one video at a time.`,
      hint: "Pass the URL of a single video.",
    });
  });

  test.each(["is_live", "is_upcoming"])(
    "a %s page resolves with its live status instead of failing",
    async (status) => {
      const { run } = fakeRun(() =>
        exited(JSON.stringify({ id: "abc", extractor_key: "Youtube", live_status: status })),
      );

      const result = await fetcherWith(run).resolve(YOUTUBE, SETTINGS);

      expect(result.success ? result.data.kind === "youtube" && result.data.metadata.liveStatus : undefined).toBe(
        status,
      );
    },
  );

  test("a local file over local_files.max_bytes is LOCAL_FILE_TOO_LARGE", async () => {
    writeFileSync(path.join(root, "a.mp3"), "0123456789");
    const { requests, run } = fakeRun(() => exited(""));

    const result = await fetcherWith(run).resolve("a.mp3", { ...SETTINGS, maxLocalFileBytes: 9 });

    expect(result.success ? undefined : result.error).toMatchObject({
      code: "LOCAL_FILE_TOO_LARGE",
      message: `Local file \`${path.join(root, "a.mp3")}\` is 10 bytes; the limit is 9 bytes.`,
    });
    expect(requests).toHaveLength(0);
  });

  test("a local file at the limit resolves with its size", async () => {
    writeFileSync(path.join(root, "a.mp3"), "0123456789");
    const { run } = fakeRun(() => exited(""));

    const result = await fetcherWith(run).resolve("a.mp3", { ...SETTINGS, maxLocalFileBytes: 10 });

    expect(result.success ? result.data : undefined).toMatchObject({ kind: "local_file", sizeBytes: 10 });
  });

  test("a directory named like media is not a regular file", async () => {
    mkdirSync(path.join(root, "x.mp4"));
    const { run } = fakeRun(() => exited(""));

    const result = await fetcherWith(run).resolve("x.mp4", SETTINGS);

    expect(result.success ? undefined : result.error).toMatchObject({
      code: "LOCAL_FILE_NOT_FOUND",
      message: `\`${path.join(root, "x.mp4")}\` is not a regular file.`,
    });
  });

  test.skipIf(process.platform === "win32")("the size limit applies to the target of a symlink", async () => {
    writeFileSync(path.join(root, "big.mp3"), "0123456789");
    symlinkSync(path.join(root, "big.mp3"), path.join(root, "link.mp3"));
    const { run } = fakeRun(() => exited(""));

    const result = await fetcherWith(run).resolve("link.mp3", { ...SETTINGS, maxLocalFileBytes: 9 });

    expect(result.success ? undefined : result.error.code).toBe("LOCAL_FILE_TOO_LARGE");
  });

  test("a multi-part video is refused: only one of its parts would be transcribed", async () => {
    const { run } = fakeRun(() => exited(JSON.stringify({ _type: "multi_video", id: "m1", entries: [] })));

    const result = await fetcherWith(run).resolve(VIMEO, SETTINGS);

    expect(result.success ? undefined : result.error).toEqual({
      code: "SOURCE_UNSUPPORTED",
      message: `\`${VIMEO}\` holds several videos (_type=multi_video); pi-tube takes one video at a time.`,
      hint: "Pass the URL of a single video.",
    });
  });

  test("a local file resolves without yt-dlp", async () => {
    writeFileSync(path.join(root, "clip.mp3"), "x");
    const { requests, run } = fakeRun(() => exited(""));

    const result = await fetcherWith(run).resolve("clip.mp3", SETTINGS);

    expect(result.success ? result.data : undefined).toMatchObject({
      kind: "local_file",
      absolutePath: path.join(root, "clip.mp3"),
    });
    expect(requests).toHaveLength(0);
  });
});

describe("fetchAudio", () => {
  const youtubeSource = YOUTUBE_SOURCE;

  test("downloads YouTube audio into its own temp dir and release removes it", async () => {
    const { requests, run } = fakeRun((request) => {
      const outputTemplate = request.args[request.args.indexOf("-o") + 1] ?? "";
      const file = outputTemplate.replace("%(id)s.%(ext)s", "abc.m4a");
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, "audio");
      return exited(`${file}\n`);
    });

    const result = await fetcherWith(run).fetchAudio(youtubeSource, SETTINGS);

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

    const result = await fetcherWith(run).fetchAudio(youtubeSource, SETTINGS);

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

    const result = await fetcherWith(run).fetchAudio(source, SETTINGS);

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

    const result = await fetcherWith(run).download(YOUTUBE_SOURCE, { media: "audio", outputDir }, SETTINGS);

    expect(result.success ? result.data.path : undefined).toBe(file);
    expect(result.success ? result.data.uri.startsWith("file://") : undefined).toBe(true);
    expect(requests[0]?.args).toEqual(
      expect.arrayContaining(["-x", "--audio-format", "mp3", "-P", `home:${outputDir}`]),
    );
    expect(requests[0]?.args.slice(-2)).toEqual(["--", YOUTUBE]);
  });

  test("a best-effort site downloads from its normalized URL", async () => {
    const file = path.join(root, "V [1].mp4");
    const { requests, run } = fakeRun(() => exited(`${file}\n`));
    const source: SiteSource = {
      kind: "site",
      originalInput: VIMEO,
      normalizedUrl: VIMEO,
      metadata: { platform: "Vimeo" },
    };

    const result = await fetcherWith(run).download(source, { media: "video", outputDir: root }, SETTINGS);

    expect(result.success ? result.data.path : undefined).toBe(file);
    expect(requests[0]?.args.slice(-2)).toEqual(["--", VIMEO]);
  });

  test("passes the injected env to the runner, which filters it", async () => {
    const { requests, run } = fakeRun(() => exited(`${path.join(root, "a.mp4")}\n`));

    await fetcherWith(run, { GROQ_API_KEY: "k" }).download(
      YOUTUBE_SOURCE,
      { media: "video", outputDir: root },
      SETTINGS,
    );

    expect(requests[0]?.env).toMatchObject({ PATH: "/bin", GROQ_API_KEY: "k" });
  });

  test("an output dir that cannot be created is STORAGE_IO_FAILED", async () => {
    const blocker = path.join(root, "file");
    writeFileSync(blocker, "x");
    const { run } = fakeRun(() => exited(""));

    const result = await fetcherWith(run).download(
      YOUTUBE_SOURCE,
      { media: "video", outputDir: path.join(blocker, "out") },
      SETTINGS,
    );

    expect(result.success ? undefined : result.error.code).toBe("STORAGE_IO_FAILED");
  });
});

describe("cookies", () => {
  const HEADER = "# Netscape HTTP Cookie File\n.example.com\tTRUE\t/\tTRUE\t0\tsid\tabc\n";
  let userFile: string;
  let cookieSettings: SourceSettings;

  beforeEach(() => {
    userFile = path.join(root, "my-cookies.txt");
    writeFileSync(userFile, HEADER);
    cookieSettings = { ...SETTINGS, cookies: { file: userFile, origin: "config" } };
  });

  /** A yt-dlp stand-in that rewrites the `--cookies` file it gets, as yt-dlp does on exit, then answers `result`. */
  const rewritingRun = (result: (request: ProcessRequest) => ProcessResult) =>
    fakeRun((request) => {
      const file = request.args[request.args.indexOf("--cookies") + 1] ?? "";
      if (existsSync(file)) writeFileSync(file, "# Netscape HTTP Cookie File\nrewritten\n");
      return result(request);
    });

  const cookieDirs = (): string[] =>
    existsSync(tmpDir) ? readdirSync(tmpDir).filter((name) => name.startsWith("cookies-")) : [];

  test("yt-dlp gets a temp copy, the user's file stays byte for byte the same and the copy is removed", async () => {
    const { requests, run } = rewritingRun(() => exited(JSON.stringify({ id: "abc" })));

    const result = await fetcherWith(run).resolve(YOUTUBE, cookieSettings);

    expect(result.success).toBe(true);
    const args = requests[0]?.args ?? [];
    expect(args).toContain("--cookies");
    expect(args).not.toContain(userFile);
    expect(args[args.indexOf("--cookies") + 1]?.startsWith(tmpDir)).toBe(true);
    expect(readFileSync(userFile, "utf8")).toBe(HEADER);
    expect(cookieDirs()).toEqual([]);
  });

  test.each([
    ["a failed run", exited("", 1, "ERROR: boom")],
    ["a cancelled run", { outcome: "aborted", exitCode: null, stdout: "", stderr: "" } as ProcessResult],
  ])("the copy is removed after %s", async (_name, outcome) => {
    const { run } = rewritingRun(() => outcome);

    await fetcherWith(run).resolve(YOUTUBE, cookieSettings);

    expect(cookieDirs()).toEqual([]);
    expect(readFileSync(userFile, "utf8")).toBe(HEADER);
  });

  test("fetchAudio and download pass the cookies too", async () => {
    const { requests, run } = rewritingRun((request) => {
      const template = request.args[request.args.indexOf("-o") + 1] ?? "";
      if (template.includes("%(id)s.%(ext)s")) {
        const file = template.replace("%(id)s.%(ext)s", "abc.m4a");
        mkdirSync(path.dirname(file), { recursive: true });
        writeFileSync(file, "audio");
        return exited(`${file}\n`);
      }
      return exited(`${path.join(root, "a.mp4")}\n`);
    });
    const fetcher = fetcherWith(run);

    const fetched = await fetcher.fetchAudio(YOUTUBE_SOURCE, cookieSettings);
    await fetcher.download(YOUTUBE_SOURCE, { media: "video", outputDir: root }, cookieSettings);

    expect(requests.map((request) => request.args.includes("--cookies"))).toEqual([true, true]);
    if (fetched.success) await fetched.data.release();
    expect(cookieDirs()).toEqual([]);
  });

  test("a sign-in wall with cookies configured says the cookies did not grant access", async () => {
    const { run } = rewritingRun(() =>
      exited(
        "",
        1,
        "ERROR: [youtube] abc: Sign in to confirm you're not a bot. Use --cookies-from-browser or --cookies for the authentication.",
      ),
    );

    const result = await fetcherWith(run).resolve(YOUTUBE, cookieSettings);

    expect(result.success ? undefined : result.error).toMatchObject({
      code: "SOURCE_AUTH_REQUIRED",
      hint: "The configured cookies did not grant access: export fresh cookies from a browser where you are logged in and replace the file.",
    });
  });
});

describe("host guard", () => {
  test("resolve, fetchAudio and download refuse a private host and never run yt-dlp", async () => {
    const { requests, run } = fakeRun(() => exited("{}"));
    const fetcher = createMediaFetcher({
      env: { PATH: "/bin" },
      cwd: root,
      tmpDir,
      run,
      lookup: async () => [{ address: "10.0.0.5", family: 4 }],
    });
    const internal = "https://intranet.example/video";
    const source: SiteSource = {
      kind: "site",
      originalInput: internal,
      normalizedUrl: internal,
      metadata: { platform: "Generic" },
    };

    const results = [
      await fetcher.resolve(internal, SETTINGS),
      await fetcher.fetchAudio(source, SETTINGS),
      await fetcher.download(source, { media: "video", outputDir: path.join(root, "out") }, SETTINGS),
    ];

    expect(results.map((result) => (result.success ? undefined : result.error.code))).toEqual([
      "SOURCE_HOST_BLOCKED",
      "SOURCE_HOST_BLOCKED",
      "SOURCE_HOST_BLOCKED",
    ]);
    expect(requests).toHaveLength(0);
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

    await fetcher.resolve(YOUTUBE, SETTINGS);
    await fetcher.download(YOUTUBE_SOURCE, { media: "video", outputDir: root }, SETTINGS);

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

    const result = await fetcherWith(run).download(YOUTUBE_SOURCE, { media: "video", outputDir }, SETTINGS);

    expect(result.success ? undefined : result.error.code).toBe("CANCELLED");
    expect(requests[0]?.args).toEqual(expect.arrayContaining(["-P", `home:${outputDir}`]));
    expect(existsSync(outputDir) ? readdirSync(outputDir) : []).toEqual([]);
  });

  test("a temp audio dir that cannot be created is STORAGE_IO_FAILED with a hint that fits transcribe", async () => {
    const blocker = path.join(root, "file");
    writeFileSync(blocker, "x");
    const { requests, run } = fakeRun(() => exited(""));
    const fetcher = createMediaFetcher({
      env: { PATH: "/bin" },
      cwd: root,
      tmpDir: path.join(blocker, "tmp"),
      run,
      lookup: PUBLIC_LOOKUP,
    });

    const result = await fetcher.fetchAudio(YOUTUBE_SOURCE, SETTINGS);

    expect(result.success ? undefined : result.error.code).toBe("STORAGE_IO_FAILED");
    expect(result.success ? undefined : result.error.hint).not.toContain("--output");
    expect(requests).toHaveLength(0);
  });

  test("download stages its temp files inside the output dir, so the final move never crosses filesystems", async () => {
    const outputDir = path.join(root, "out");
    const tempOf = (args: readonly string[]): string =>
      args.find((arg) => arg.startsWith("temp:"))?.slice("temp:".length) ?? "";
    const { requests, run } = fakeRun((request) => {
      writeFileSync(path.join(tempOf(request.args), "Demo [abc].f401.mp4.part"), "partial");
      const file = path.join(outputDir, "Demo [abc].mp4");
      writeFileSync(file, "video");
      return exited(`${file}\n`);
    });

    const result = await fetcherWith(run).download(YOUTUBE_SOURCE, { media: "video", outputDir }, SETTINGS);

    expect(result.success).toBe(true);
    expect(path.dirname(tempOf(requests[0]?.args ?? []))).toBe(outputDir);
    expect(readdirSync(outputDir)).toEqual(["Demo [abc].mp4"]);
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
      const fetched = await fetcherWith(run).fetchAudio(YOUTUBE_SOURCE, SETTINGS);
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
