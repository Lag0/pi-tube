import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import type { EnvironmentVariables } from "../../core/domain/config.ts";

/** Env vars a child process may see. Everything else (provider keys, `PI_TUBE_*`) stays in pi-tube. */
export const CHILD_ENV_ALLOWLIST: readonly string[] = [
  "PATH",
  "PATHEXT",
  "HOME",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "SYSTEMROOT",
  "WINDIR",
  "COMSPEC",
  "TEMP",
  "TMP",
  "TMPDIR",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TZ",
  "XDG_CACHE_HOME",
  "XDG_CONFIG_HOME",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "ALL_PROXY",
  "http_proxy",
  "https_proxy",
  "no_proxy",
  "all_proxy",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
  "REQUESTS_CA_BUNDLE",
];

/** Time between SIGTERM and SIGKILL when a process tree is stopped. */
export const KILL_GRACE_MS = 2000;

const DEFAULT_MAX_OUTPUT_BYTES = 32 * 1024 * 1024;

export interface ProcessRequest {
  readonly command: string;
  readonly args: readonly string[];
  readonly env: EnvironmentVariables;
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
  /** Per stream; going over it kills the process. */
  readonly maxOutputBytes?: number;
}

export type ProcessOutcome = "exited" | "timed_out" | "aborted" | "not_found" | "output_too_large";

export interface ProcessResult {
  readonly outcome: ProcessOutcome;
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** Keeps only allowlisted env vars; names compare case-insensitively on Windows, where env is case-insensitive. */
export const buildChildEnv = (
  env: EnvironmentVariables,
  platform: NodeJS.Platform = process.platform,
): Record<string, string> => {
  const caseInsensitive = platform === "win32";
  const normalize = (name: string): string => (caseInsensitive ? name.toUpperCase() : name);
  const allowed = new Set(CHILD_ENV_ALLOWLIST.map(normalize));
  const childEnv: Record<string, string> = {};
  for (const [name, value] of Object.entries(env)) {
    if (value !== undefined && allowed.has(normalize(name))) childEnv[name] = value;
  }
  return childEnv;
};

const signalGroup = (pid: number, signal: NodeJS.Signals): void => {
  try {
    process.kill(-pid, signal);
  } catch {
    // ESRCH: every process in the group has already exited.
  }
};

/** Stops the child and everything it started: the process group on POSIX, `taskkill /T` on Windows. */
const killTree = (child: ChildProcess): void => {
  const { pid } = child;
  if (pid === undefined) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    return;
  }
  signalGroup(pid, "SIGTERM");
  setTimeout(() => signalGroup(pid, "SIGKILL"), KILL_GRACE_MS).unref();
};

/**
 * Runs a command with stdin ignored, an allowlisted env, a timeout and cancellation. Both output streams
 * are read while the process runs. Never rejects: every way a run can end is a `ProcessOutcome`.
 */
export const runProcess = (request: ProcessRequest): Promise<ProcessResult> =>
  new Promise((resolve) => {
    if (request.signal?.aborted) {
      resolve({ outcome: "aborted", exitCode: null, stdout: "", stderr: "" });
      return;
    }

    const limit = request.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
    const child = spawn(request.command, [...request.args], {
      stdio: ["ignore", "pipe", "pipe"],
      env: buildChildEnv(request.env),
      detached: process.platform !== "win32",
      windowsHide: true,
    });
    const chunks = { stdout: [] as Buffer[], stderr: [] as Buffer[] };
    const sizes = { stdout: 0, stderr: 0 };
    let stoppedWith: ProcessOutcome | undefined;
    let spawnFailure: NodeJS.ErrnoException | undefined;
    let settled = false;
    const settle = (result: ProcessResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      request.signal?.removeEventListener("abort", onAbort);
      resolve(result);
    };

    const stop = (outcome: ProcessOutcome): void => {
      if (stoppedWith !== undefined) return;
      stoppedWith = outcome;
      killTree(child);
    };
    const collect = (stream: "stdout" | "stderr") => (chunk: Buffer) => {
      sizes[stream] += chunk.length;
      if (sizes[stream] > limit) {
        stop("output_too_large");
        return;
      }
      chunks[stream].push(chunk);
    };
    const onAbort = (): void => stop("aborted");

    child.stdout?.on("data", collect("stdout"));
    child.stderr?.on("data", collect("stderr"));
    request.signal?.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => stop("timed_out"), request.timeoutMs);

    child.on("error", (error: NodeJS.ErrnoException) => {
      spawnFailure = error;
      // A failed spawn may never emit "close".
      if (error.code === "ENOENT") settle({ outcome: "not_found", exitCode: null, stdout: "", stderr: "" });
    });
    child.on("exit", () => {
      // Grandchildren that outlive the child would keep the pipes open; the group goes with the child.
      if (child.pid !== undefined && process.platform !== "win32") signalGroup(child.pid, "SIGKILL");
    });
    child.on("close", (exitCode) => {
      const stdout = Buffer.concat(chunks.stdout).toString("utf8");
      const stderr = Buffer.concat(chunks.stderr).toString("utf8");
      settle({
        outcome: stoppedWith ?? "exited",
        exitCode,
        stdout,
        stderr: spawnFailure ? spawnFailure.message : stderr,
      });
    });
  });
