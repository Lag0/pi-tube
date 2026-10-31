import { describe, expect, test } from "vitest";
import type { ProcessRequest, ProcessResult } from "../../src/infrastructure/process/run-process.ts";
import { runCliInProcess } from "../helpers/cli-harness.ts";

const YOUTUBE = "https://www.youtube.com/watch?v=abc";
const LONG = `First line\n${"x".repeat(300)}`;

const METADATA = {
  id: "abc",
  extractor_key: "Youtube",
  webpage_url: YOUTUBE,
  title: "Demo",
  upload_date: "20260102",
  duration: 125,
  live_status: "was_live",
  description: LONG,
  chapters: [
    { start_time: 0, end_time: 65, title: "Intro" },
    { start_time: 65, end_time: 125, title: "Main" },
  ],
};

const fakeYtDlp = (metadata: Record<string, unknown> = METADATA) => {
  const requests: ProcessRequest[] = [];
  const run = async (request: ProcessRequest): Promise<ProcessResult> => {
    requests.push(request);
    return { outcome: "exited", exitCode: 0, stdout: JSON.stringify(metadata), stderr: "" };
  };
  return { requests, run };
};

const info = (args: string[], ytDlp = fakeYtDlp()) =>
  runCliInProcess(["info", ...args], { fakes: { runProcess: ytDlp.run } });

describe("info command", () => {
  test("--json prints the media info object", async () => {
    const result = await info([YOUTUBE, "--json"]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      source_kind: "youtube",
      tier: "tested",
      url: YOUTUBE,
      path: null,
      size_bytes: null,
      extension: null,
      platform: "Youtube",
      media_id: "abc",
      canonical_url: YOUTUBE,
      title: "Demo",
      published_at: "2026-01-02",
      duration_seconds: 125,
      live_status: "was_live",
      chapters: [
        { title: "Intro", start_ms: 0, end_ms: 65_000 },
        { title: "Main", start_ms: 65_000, end_ms: 125_000 },
      ],
      description: LONG,
      description_links: [],
    });
  });

  test("prints one line per field and cuts the description at 280 characters", async () => {
    const result = await info([YOUTUBE]);
    const description = `${`First line ${"x".repeat(300)}`.slice(0, 280)}...`;

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(
      [
        "[MEDIA_INFO] kind=youtube tier=tested platform=Youtube",
        "title: Demo",
        "published_at: 2026-01-02",
        "duration_seconds: 125",
        "live_status: was_live",
        `url: ${YOUTUBE}`,
        "chapters: 2",
        "  [00:00:00] Intro",
        "  [00:01:05] Main",
        `description: ${description}`,
        "",
      ].join("\n"),
    );
  });

  test("control characters from the page never reach the terminal", async () => {
    const result = await info(
      [YOUTUBE],
      fakeYtDlp({
        extractor_key: "Youtube",
        title: "Evil\u001b]52;c;aGk=\u0007 title\nsecond line",
        description: "desc \u009b31m red\r\nnext",
        chapters: [{ start_time: 0, end_time: 1, title: "\u001b[2Jcleared" }],
      }),
    );

    expect(result.exitCode).toBe(0);
    // biome-ignore lint/suspicious/noControlCharactersInRegex: asserts that no control character is printed
    expect(result.stdout.replace(/\n/g, "")).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/);
    expect(result.stdout).toContain("title: Evil ]52;c;aGk= title second line");
    expect(result.stdout).toContain("  [00:00:00] [2Jcleared");
    expect(result.stdout).toContain("description: desc 31m red next");
  });

  test("without an input it is INPUT_INVALID with the info usage", async () => {
    const result = await info([]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("[INPUT_INVALID]");
    expect(result.stderr).toContain("pi-tube info <input>");
  });

  test("a loopback host is SOURCE_HOST_BLOCKED and yt-dlp never runs", async () => {
    const ytDlp = fakeYtDlp();
    const result = await info(["http://127.0.0.1/x"], ytDlp);

    expect(result.exitCode).toBe(5);
    expect(result.stderr).toContain("[SOURCE_HOST_BLOCKED]");
    expect(ytDlp.requests).toHaveLength(0);
  });

  test("Ctrl-C cancels a running info and stops yt-dlp, so its temp cookies copy is removed", async () => {
    const controller = new AbortController();
    const seen: Array<AbortSignal | undefined> = [];
    const run = async (request: ProcessRequest): Promise<ProcessResult> => {
      seen.push(request.signal);
      const { signal } = request;
      if (!signal) return { outcome: "exited", exitCode: 0, stdout: JSON.stringify(METADATA), stderr: "" };
      await new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true }));
      return { outcome: "aborted", exitCode: null, stdout: "", stderr: "" };
    };

    const pending = runCliInProcess(["info", YOUTUBE], { signal: controller.signal, fakes: { runProcess: run } });
    await new Promise((resolve) => setTimeout(resolve, 20));
    controller.abort();
    const result = await pending;

    expect(seen[0]).toBeInstanceOf(AbortSignal);
    expect(result.exitCode).toBe(130);
    expect(result.stderr).toContain("[CANCELLED]");
  });

  test("help lists the command", async () => {
    const topic = await runCliInProcess(["help", "info"]);
    const root = await runCliInProcess(["--help", "--no-color"]);

    expect(topic.exitCode).toBe(0);
    expect(topic.stdout).toContain("pi-tube info <input> [--json]");
    expect(root.stdout).toContain("pi-tube info <input> [--json]");
  });
});
