import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { buildChildEnv, KILL_GRACE_MS, runProcess } from "../../../src/infrastructure/process/run-process.ts";

const SCRIPTS = path.resolve("test", "fixtures-process");
const NODE = process.execPath;
const isWindows = process.platform === "win32";
const baseEnv = { PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT };

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(path.join(os.tmpdir(), "pi-tube-run-process-"));
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

const script = (name: string): string => path.join(SCRIPTS, name);

const isAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const waitFor = async (check: () => boolean, timeoutMs = 3000): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("condition not met in time");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};

const readPids = (file: string): { child: number; grandchild: number } => JSON.parse(readFileSync(file, "utf8"));

describe("runProcess", () => {
  test("reports the exit code and both streams", async () => {
    const result = await runProcess({
      command: NODE,
      args: [script("exit-code.mjs"), "3"],
      env: baseEnv,
      timeoutMs: 10_000,
    });

    expect(result).toEqual({ outcome: "exited", exitCode: 3, stdout: "out", stderr: "err" });
  });

  test("a missing command is not_found", async () => {
    const result = await runProcess({ command: "pi-tube-no-such-binary", args: [], env: baseEnv, timeoutMs: 10_000 });

    expect(result.outcome).toBe("not_found");
  });

  test("the child sees only allowlisted env vars", async () => {
    const result = await runProcess({
      command: NODE,
      args: [script("print-env.mjs")],
      env: { ...baseEnv, HOME: "/home/user", HTTPS_PROXY: "http://proxy", GROQ_API_KEY: "k", PI_TUBE_X: "y" },
      timeoutMs: 10_000,
    });
    const names: string[] = JSON.parse(result.stdout);

    expect(names).toEqual(expect.arrayContaining(["HOME", "HTTPS_PROXY"]));
    expect(names.some((name) => name.toUpperCase() === "PATH")).toBe(true);
    expect(names).not.toContain("GROQ_API_KEY");
    expect(names).not.toContain("PI_TUBE_X");
  });

  test("reads a large output while the child runs", async () => {
    const result = await runProcess({
      command: NODE,
      args: [script("big-output.mjs")],
      env: baseEnv,
      timeoutMs: 20_000,
    });

    expect(result.outcome).toBe("exited");
    expect(result.stdout.length).toBe(5 * 1024 * 1024);
  });

  test("output over the limit is output_too_large", async () => {
    const result = await runProcess({
      command: NODE,
      args: [script("big-output.mjs")],
      env: baseEnv,
      timeoutMs: 20_000,
      maxOutputBytes: 1024,
    });

    expect(result.outcome).toBe("output_too_large");
  });

  test("a timeout kills the child and its children", async () => {
    const pidFile = path.join(workDir, "pids.json");
    const startedAt = Date.now();

    const result = await runProcess({
      command: NODE,
      args: [script("sleep-with-child.mjs"), pidFile],
      env: baseEnv,
      timeoutMs: 1500,
    });

    expect(result.outcome).toBe("timed_out");
    expect(Date.now() - startedAt).toBeLessThan(3000 + 1500);
    if (!isWindows) {
      const pids = readPids(pidFile);
      await waitFor(() => !isAlive(pids.child) && !isAlive(pids.grandchild));
    }
  });

  test("aborting kills the child and its children", async () => {
    const pidFile = path.join(workDir, "pids.json");
    const controller = new AbortController();

    const pending = runProcess({
      command: NODE,
      args: [script("sleep-with-child.mjs"), pidFile],
      env: baseEnv,
      timeoutMs: 30_000,
      signal: controller.signal,
    });
    await waitFor(() => existsSync(pidFile));
    controller.abort();
    const result = await pending;

    expect(result.outcome).toBe("aborted");
    if (!isWindows) {
      const pids = readPids(pidFile);
      await waitFor(() => !isAlive(pids.child) && !isAlive(pids.grandchild));
    }
  });

  test("an already aborted signal never spawns", async () => {
    const pidFile = path.join(workDir, "pids.json");
    const controller = new AbortController();
    controller.abort();

    const result = await runProcess({
      command: NODE,
      args: [script("sleep-with-child.mjs"), pidFile],
      env: baseEnv,
      timeoutMs: 30_000,
      signal: controller.signal,
    });

    expect(result.outcome).toBe("aborted");
    expect(existsSync(pidFile)).toBe(false);
  });

  test.skipIf(isWindows)(
    "a cancel after the child exited, while its pipes drain, keeps the exited outcome",
    async () => {
      const pidFile = path.join(workDir, "grandchild.pid");
      const controller = new AbortController();

      const pending = runProcess({
        command: NODE,
        args: [script("exit-leaving-pipe-open.mjs"), pidFile],
        env: baseEnv,
        timeoutMs: 30_000,
        signal: controller.signal,
      });
      await waitFor(() => existsSync(pidFile));
      // The child is gone by now; only the grandchild still holds the pipes.
      await new Promise((resolve) => setTimeout(resolve, 700));
      controller.abort();
      const result = await pending;

      expect(result).toMatchObject({ outcome: "exited", exitCode: 0, stdout: "done" });
    },
  );

  test.skipIf(isWindows)("no signal reaches the old process group once the run has settled", async () => {
    const pidFile = path.join(workDir, "pids.json");
    const kill = vi.spyOn(process, "kill");

    const result = await runProcess({
      command: NODE,
      args: [script("sleep-with-child.mjs"), pidFile],
      env: baseEnv,
      timeoutMs: 500,
    });
    const callsAtSettle = kill.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, KILL_GRACE_MS + 300));
    const callsLater = kill.mock.calls.length;
    kill.mockRestore();

    expect(result.outcome).toBe("timed_out");
    expect(callsLater).toBe(callsAtSettle);
  });
});

describe("buildChildEnv", () => {
  test("matches names case-insensitively on Windows only", () => {
    expect(buildChildEnv({ Path: "C:\\bin", groq_api_key: "k" }, "win32")).toEqual({ Path: "C:\\bin" });
    expect(buildChildEnv({ Path: "/bin", PATH: "/usr/bin" }, "linux")).toEqual({ PATH: "/usr/bin" });
  });
});
