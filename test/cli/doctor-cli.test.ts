import { describe, expect, test } from "vitest";
import { runCliInProcess } from "../helpers/cli-harness.ts";
import { createFakeMediaFetcher } from "../helpers/fake-media.ts";

const media = (ytDlpFound = true) =>
  createFakeMediaFetcher({
    inspect: {
      ytDlp: ytDlpFound ? { found: true, version: "2026.10.26" } : { found: false },
      ffmpeg: { found: true, version: "7.1" },
      cookies: "none",
    },
  }).fetcher;

const doctor = (args: string[], options: { env?: Record<string, string>; ytDlpFound?: boolean } = {}) =>
  runCliInProcess(["doctor", ...args], {
    env: options.env ?? { GROQ_API_KEY: "gq-test-key" },
    fakes: { media: media(options.ytDlpFound) },
  });

describe("pi-tube doctor", () => {
  test("prints a header, then one line per check with its fix", async () => {
    const result = await doctor([]);
    const lines = result.stdout.trimEnd().split("\n");

    expect(result.exitCode).toBe(0);
    expect(lines[0]).toBe("[DOCTOR] ok=true errors=0 warnings=2");
    expect(lines).toContain("ok provider:groq Key from `GROQ_API_KEY`.");
    expect(lines).toContain("warn provider:deepgram No key.");
    expect(lines).toContain("  fix: Run `pi-tube auth login deepgram` or set `DEEPGRAM_API_KEY`.");
    expect(lines).toContain("ok yt-dlp yt-dlp 2026.10.26.");
    expect(result.stdout).not.toContain("gq-test-key");
  });

  test("--json prints the report, with fix null when there is none", async () => {
    const result = await doctor(["--json"]);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(report.ok).toBe(true);
    expect(report.checks[0]).toEqual({ id: "pi-tube", status: "ok", summary: expect.any(String), fix: null });
    expect(report.checks.find((check: { id: string }) => check.id === "provider:deepgram")).toEqual({
      id: "provider:deepgram",
      status: "warn",
      summary: "No key.",
      fix: "Run `pi-tube auth login deepgram` or set `DEEPGRAM_API_KEY`.",
    });
  });

  test("exits 0 even when a check is an error", async () => {
    const result = await doctor(["--json"], { ytDlpFound: false });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).ok).toBe(false);
  });

  test("an argument exits 2", async () => {
    const result = await doctor(["extra"]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("[INPUT_INVALID] `doctor` takes no arguments.");
  });

  test("help doctor shows the command", async () => {
    const result = await runCliInProcess(["help", "doctor", "--no-color"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("pi-tube doctor [--json]");
  });
});
