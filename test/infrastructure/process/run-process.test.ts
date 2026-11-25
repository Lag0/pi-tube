import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  buildChildEnv,
  KILL_GRACE_MS,
  runProcess,
  windowsKillOptions,
} from "../../../src/infrastructure/process/run-process.ts";

import * as windowsExecutable from "../../../src/infrastructure/process/windows-executable.ts";

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

  test.skipIf(process.platform === "win32")(
    "a command that cannot be executed is spawn_failed with its code",
    async () => {
      const file = path.join(workDir, "not-executable");
      writeFileSync(file, "#!/bin/sh\necho hi\n", { mode: 0o644 });

      const result = await runProcess({ command: file, args: [], env: baseEnv, timeoutMs: 10_000 });

      expect(result).toEqual({ outcome: "spawn_failed", exitCode: null, stdout: "", stderr: "EACCES" });
    },
  );

  test("an argument spawn refuses (a NUL byte) resolves spawn_failed instead of rejecting, without the value", async () => {
    const result = await runProcess({ command: NODE, args: ["a\u0000SECRET"], env: baseEnv, timeoutMs: 10_000 });

    expect(result).toMatchObject({ outcome: "spawn_failed", exitCode: null, stdout: "" });
    expect(result.stderr).not.toContain("SECRET");
  });

  test("taskkill runs with the allowlisted env only", () => {
    const options = windowsKillOptions({ PATH: "C:\\Windows", SYSTEMROOT: "C:\\Windows", GROQ_API_KEY: "gq-SECRET" });

    expect(options).toMatchObject({ stdio: "ignore", windowsHide: true });
    expect(options.env).toEqual({ PATH: "C:\\Windows", SYSTEMROOT: "C:\\Windows" });
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

  test.each([false, true])("aborting kills the child and its children (binary: %s)", async (binary) => {
    const pidFile = path.join(workDir, "pids.json");
    const controller = new AbortController();

    const pending = runProcess({
      command: NODE,
      args: [script("sleep-with-child.mjs"), pidFile],
      env: baseEnv,
      timeoutMs: 30_000,
      signal: controller.signal,
      ...(binary && { writeStdout: () => {} }),
    });
    await waitFor(() => existsSync(pidFile));
    controller.abort();
    const result = await pending;

    expect(result.outcome).toBe("aborted");
    const pids = readPids(pidFile);
    await waitFor(() => !isAlive(pids.child) && !isAlive(pids.grandchild));
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

  test("keeps the Python encoding vars, so a user's UTF-8 setting still reaches yt-dlp", () => {
    expect(buildChildEnv({ PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" }, "win32")).toEqual({
      PYTHONUTF8: "1",
      PYTHONIOENCODING: "utf-8",
    });
  });
});

test("binary stdout is delivered intact and separately from stderr", async () => {
  const blocks: Buffer[] = [];
  const result = await runProcess({
    command: NODE,
    args: ["-e", "process.stdout.write(Buffer.from([0,255,128]));process.stderr.write('side')"],
    env: baseEnv,
    timeoutMs: 10000,
    writeStdout: (b) => {
      blocks.push(b);
    },
  });
  expect(result).toMatchObject({ outcome: "exited", exitCode: 0, stdout: "", stderr: "Child reported diagnostics" });
  expect(Buffer.concat(blocks)).toEqual(Buffer.from([0, 255, 128]));
});

test("a rejected binary sink reports storage failure without diagnostics", async () => {
  const result = await runProcess({
    command: NODE,
    args: ["-e", "process.stderr.write('benign-marker');process.stdout.write('x')"],
    env: baseEnv,
    timeoutMs: 10000,
    writeStdout: () => {
      throw new Error("benign-marker");
    },
  });
  expect(result.outcome).toBe("sink_failed");
  expect(JSON.stringify(result)).not.toContain("benign-marker");
});

test.skipIf(!isWindows).each(["aborted", "timed_out"] as const)(
  "%s owns helper after launcher exit",
  async (outcome) => {
    const pidFile = path.join(workDir, "helper.pid");
    const controller = new AbortController();
    const pending = runProcess({
      command: NODE,
      args: [script("exit-leaving-pipe-open.mjs"), pidFile, "15000", `${pidFile}.launcher`],
      env: baseEnv,
      signal: controller.signal,
      timeoutMs: outcome === "aborted" ? 10000 : 1500,
      writeStdout: () => {},
    });
    await waitFor(() => existsSync(pidFile));
    const launcher = Number(readFileSync(`${pidFile}.launcher`, "utf8"));
    await waitFor(() => !isAlive(launcher));
    const pid = Number(readFileSync(pidFile, "utf8"));
    expect(isAlive(pid)).toBe(true);
    if (outcome === "aborted") controller.abort();
    expect((await pending).outcome).toBe(outcome);
    await waitFor(() => !isAlive(pid), 1000);
  },
);

test.skipIf(!isWindows)(
  "binary executable lookup, argv, environment and file stdin survive native launch",
  async () => {
    const file = path.join(workDir, "benign input.bin");
    const bytes = Buffer.from([0, 0xff, 0x80, 0x10]);
    writeFileSync(file, bytes);
    const args = ["", 'a"b', `sp ace${path.sep}`, `a${path.sep}"b`, "&|^%😀"];
    const chunks: Buffer[] = [];
    const r = await runProcess({
      command: path.basename(NODE),
      args: [
        "-e",
        `process.stdout.write(require('node:fs').readFileSync(0));process.stdout.write(JSON.stringify([process.argv.slice(1),process.cwd(),process.env.GROQ_API_KEY??null]))`,
        "--",
        ...args,
      ],
      env: { Path: path.dirname(NODE), SYSTEMROOT: process.env.SYSTEMROOT, GROQ_API_KEY: "not-a-key" },
      windowsBinaryStdinPath: file,
      timeoutMs: 5000,
      writeStdout: (b) => chunks.push(b),
    });
    expect(r).toMatchObject({ outcome: "exited", exitCode: 0 });
    expect(Buffer.concat(chunks)).toEqual(
      Buffer.concat([bytes, Buffer.from(JSON.stringify([args, process.cwd(), null]))]),
    );
  },
);

test.skipIf(!isWindows)(
  "native launch captures relative stdin and drive-relative candidates before yielding",
  async () => {
    const native = await import("../../../src/infrastructure/process/windows-binary-process.ts");
    const launch = vi
      .spyOn(native, "runWindowsBinary")
      .mockResolvedValue({ outcome: "not_found", exitCode: null, stdout: "", stderr: "" });
    const cwd = process.cwd();
    const resolve = path.win32.resolve;
    const paths = vi
      .spyOn(path.win32, "resolve")
      .mockImplementation((...parts) => resolve(...parts.map((part) => part.replace(/^Z:(?![\\/])/, "Z:/original/"))));
    const request = {
      command: "sample",
      args: [],
      env: { Path: "first;Z:tools" },
      windowsBinaryStdinPath: "inputs/file.bin",
      timeoutMs: 5000,
      writeStdout: () => {},
    };
    const pending = [runProcess(request), runProcess({ ...request, command: "Z:sample" })];
    expect(paths).toHaveBeenCalledWith(cwd, request.windowsBinaryStdinPath);
    paths.mockRestore();
    await Promise.all(pending);
    const expected = { cwd, stdinPath: resolve(cwd, "inputs/file.bin") };
    expect(launch.mock.calls.map((call) => call[4])).toEqual([
      { ...expected, candidates: [resolve(cwd, "first/sample.exe"), "Z:\\original\\tools\\sample.exe"] },
      { ...expected, candidates: ["Z:\\original\\sample.exe"] },
    ]);
  },
);

test.skipIf(!isWindows)("an aborted discovery cannot launch late or block another binary job", async () => {
  const lookup = windowsExecutable.resolveWindowsExecutable;
  const controller = new AbortController();
  let resume!: (found: boolean) => void;
  let entered!: () => void;
  const probing = new Promise<void>((resolve) => {
    entered = resolve;
  });
  vi.spyOn(windowsExecutable, "resolveWindowsExecutable").mockImplementationOnce((candidates, deadline, signal) =>
    lookup(
      candidates,
      deadline,
      signal,
      () =>
        new Promise<boolean>((resolve) => {
          resume = resolve;
          entered();
        }),
    ),
  );
  const marker = path.join(workDir, "late-launch");
  const request = {
    command: NODE,
    args: ["-e", `require('fs').writeFileSync(${JSON.stringify(marker)}, 'started')`],
    env: baseEnv,
    timeoutMs: 5000,
    writeStdout: () => {},
  };
  const pending = runProcess({ ...request, signal: controller.signal });
  await probing;
  try {
    expect(await runProcess({ ...request, args: ["-e", ""] })).toMatchObject({ outcome: "exited", exitCode: 0 });
    controller.abort();
    expect((await pending).outcome).toBe("aborted");
  } finally {
    resume(true);
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
  expect(existsSync(marker)).toBe(false);
});

test.skipIf(!isWindows)("binary stderr overflow and failed setup do not accumulate native handles", async () => {
  const { default: koffi } = await import("koffi");
  const count = koffi.load("kernel32.dll").func("int __stdcall GetProcessHandleCount(intptr_t, void *)");
  const handles = () => {
    const n = Buffer.alloc(4);
    expect(count(-1, n)).toBe(1);
    return n.readUInt32LE();
  };
  const request = {
    command: NODE,
    args: ["-e", "process.stderr.write(Buffer.alloc(300000));"],
    env: baseEnv,
    timeoutMs: 5000,
    maxOutputBytes: 1024,
    writeStdout: () => {},
  };
  expect((await runProcess(request)).outcome).toBe("output_too_large");
  const notExecutable = path.join(workDir, "not-an-image.exe");
  writeFileSync(notExecutable, "benign fixture");
  // The first bad image initializes Windows loader state. Measure repeated calls after warm-up.
  expect((await runProcess({ ...request, command: notExecutable })).outcome).toBe("spawn_failed");
  const before = handles();
  for (let i = 0; i < 8; i++) {
    expect((await runProcess({ ...request, command: notExecutable })).outcome).toBe("spawn_failed");
    expect((await runProcess({ ...request, windowsBinaryStdinPath: path.join(workDir, "absent") })).outcome).toBe(
      "spawn_failed",
    );
    expect((await runProcess(request)).outcome).toBe("output_too_large");
  }
  expect(handles()).toBeLessThanOrEqual(before);
});
