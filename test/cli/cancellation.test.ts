import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { runCliInProcess } from "../helpers/cli-harness.ts";
import { createFakeMediaFetcher } from "../helpers/fake-media.ts";
import { createFakeSttProvider } from "../helpers/fake-stt.ts";
import { fakeProviders, PROVIDER_KEYS } from "../helpers/transcribe-fakes.ts";

const BIN = path.resolve("bin", "pi-tube.ts");
const FAKE_YTDLP_DIR = path.join(os.tmpdir(), `pi-tube-fake-yt-dlp-${process.pid}`);

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(path.join(os.tmpdir(), "pi-tube-cancel-"));
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

const isAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const waitFor = async (check: () => boolean, timeoutMs: number): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("condition not met in time");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
};

describe("cancellation", () => {
  test("an abort during transcription exits 130, releases the audio and saves nothing", async () => {
    const media = createFakeMediaFetcher();
    const controller = new AbortController();
    const outputDir = path.join(workDir, "out");

    const pending = runCliInProcess(["transcribe", "https://cdn.example.com/a.mp3"], {
      env: { PI_TUBE_OUTPUT_DIR: outputDir, ...PROVIDER_KEYS },
      fakes: {
        stt: fakeProviders({ deepgram: createFakeSttProvider("deepgram", undefined, { waitForAbort: true }) }),
        media: media.fetcher,
      },
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 50);
    const result = await pending;

    expect(result.exitCode).toBe(130);
    expect(result.stderr).toContain("[CANCELLED]");
    expect(media.released()).toBe(1);
    expect(existsSync(outputDir) ? readdirSync(outputDir) : []).toEqual([]);
  });

  test.skipIf(process.platform === "win32").each(["SIGINT", "SIGHUP"] as const)(
    "%s on the real bin kills yt-dlp and its children, leaves no partial file and exits 130",
    async (signal) => {
      const { copyFileSync, chmodSync, mkdirSync } = await import("node:fs");
      mkdirSync(FAKE_YTDLP_DIR, { recursive: true });
      copyFileSync(path.resolve("test", "fixtures-process", "fake-yt-dlp.sh"), path.join(FAKE_YTDLP_DIR, "yt-dlp"));
      chmodSync(path.join(FAKE_YTDLP_DIR, "yt-dlp"), 0o755);
      const outputDir = path.join(workDir, "media");
      const startedAt = Date.now();

      const child = spawn(
        "bun",
        [
          "run",
          "--bun",
          "--no-env-file",
          BIN,
          "download",
          "https://www.youtube.com/watch?v=abc",
          "--output",
          outputDir,
        ],
        {
          env: {
            ...process.env,
            HOME: workDir,
            PI_TUBE_CONFIG_PATH: path.join(workDir, "config.json"),
            PATH: `${FAKE_YTDLP_DIR}${path.delimiter}${process.env.PATH ?? ""}`,
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let stderr = "";
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      const exited = new Promise<number | null>((resolve) => child.on("exit", (code) => resolve(code)));

      const pidFile = path.join(outputDir, "pids");
      await waitFor(() => existsSync(pidFile), 15_000);
      const [ytDlpPid, sleepPid] = readFileSync(pidFile, "utf8").trim().split(" ").map(Number);
      child.kill(signal);
      const code = await exited;

      expect(code).toBe(130);
      expect(stderr).toContain("[CANCELLED]");
      expect(Date.now() - startedAt).toBeLessThan(20_000);
      await waitFor(() => !isAlive(ytDlpPid ?? 0) && !isAlive(sleepPid ?? 0), 5000);
      expect(readdirSync(outputDir)).toEqual(["pids"]);
      rmSync(FAKE_YTDLP_DIR, { recursive: true, force: true });
    },
    30_000,
  );

  test.skipIf(process.platform === "win32")(
    "SIGTERM still stops a command that cannot be cancelled (auth login --stdin waiting on stdin)",
    async () => {
      const child = spawn("bun", ["run", "--bun", "--no-env-file", BIN, "auth", "login", "groq", "--stdin"], {
        env: { ...process.env, HOME: workDir, PI_TUBE_CONFIG_PATH: path.join(workDir, "config.json") },
        stdio: ["pipe", "ignore", "ignore"],
      });
      const exited = new Promise<NodeJS.Signals | null>((resolve) =>
        child.on("exit", (_code, signal) => resolve(signal)),
      );
      // Stdin stays open, so pi-tube is still waiting on it when the signal arrives.
      await new Promise((resolve) => setTimeout(resolve, 1500));
      child.kill("SIGTERM");
      const stopped = await Promise.race([
        exited,
        new Promise<string>((resolve) => setTimeout(() => resolve("still running"), 5000)),
      ]);
      child.kill("SIGKILL");

      expect(stopped).toBe("SIGTERM");
      expect(existsSync(path.join(workDir, "config.json"))).toBe(false);
    },
    15_000,
  );
});

describe("main", () => {
  test("a failure while building the app prints UNEXPECTED without a stack and returns 1", async () => {
    vi.resetModules();
    vi.doMock("../../src/bootstrap.ts", () => ({
      createApp: () => {
        throw new Error("boom");
      },
    }));
    const printed = vi.spyOn(console, "error").mockImplementation(() => {});
    const { main } = await import("../../src/main.ts");

    const code = await main(["--version"]);

    expect(code).toBe(1);
    expect(printed.mock.calls.flat().join("\n")).toMatch(/^\[UNEXPECTED\] boom\nhint: /);
    expect(printed.mock.calls.flat().join("\n")).not.toMatch(/\n\s+at /);
    vi.doUnmock("../../src/bootstrap.ts");
  });
});
