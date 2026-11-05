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
  // yt-dlp prints file paths in Python's output encoding; on Windows these keep a user's UTF-8 setting.
  "PYTHONUTF8",
  "PYTHONIOENCODING",
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

/** `spawn_failed`: the command exists but could not start (EACCES, EPERM, or an argument spawn refuses). */
export type ProcessOutcome = "exited" | "timed_out" | "aborted" | "not_found" | "spawn_failed" | "output_too_large";

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

/** Options of the Windows `taskkill` call: like any child, it sees only the allowlisted env. */
export const windowsKillOptions = (env: EnvironmentVariables) => ({
  stdio: "ignore" as const,
  windowsHide: true,
  env: buildChildEnv(env, "win32"),
});

const signalGroup = (pid: number, signal: NodeJS.Signals): void => {
  try {
    process.kill(-pid, signal);
  } catch {
    // ESRCH (every process in the group has exited) or EPERM (the id is no longer our group): nothing to stop.
  }
};

/**
 * Stops the child and everything it started: the process group on POSIX, `taskkill /T` on Windows. Returns
 * the pending SIGKILL timer, which the caller clears once the child has exited.
 */
const killTree = (child: ChildProcess): ReturnType<typeof setTimeout> | undefined => {
  const { pid } = child;
  if (pid === undefined) return undefined;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], windowsKillOptions(process.env));
    return undefined;
  }
  signalGroup(pid, "SIGTERM");
  return setTimeout(() => signalGroup(pid, "SIGKILL"), KILL_GRACE_MS).unref();
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
    // Only the error code: spawn's own messages quote the argument they refused.
    const spawnFailed = (error: unknown): ProcessResult => ({
      outcome: "spawn_failed",
      exitCode: null,
      stdout: "",
      stderr:
        typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
          ? error.code
          : "spawn failed",
    });
    let child: ChildProcess;
    try {
      child = spawn(request.command, [...request.args], {
        stdio: ["ignore", "pipe", "pipe"],
        env: buildChildEnv(request.env),
        detached: process.platform !== "win32",
        windowsHide: true,
      });
    } catch (error) {
      resolve(spawnFailed(error));
      return;
    }
    const chunks = { stdout: [] as Buffer[], stderr: [] as Buffer[] };
    const sizes = { stdout: 0, stderr: 0 };
    let stoppedWith: ProcessOutcome | undefined;
    let spawnFailure: NodeJS.ErrnoException | undefined;
    let graceTimer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    // Once the child has exited, a late timeout or cancel must not turn a finished run into timed_out or
    // aborted, and a late SIGKILL must not reach a process group id the system may have reused.
    const disarm = (): void => {
      clearTimeout(timer);
      clearTimeout(graceTimer);
      request.signal?.removeEventListener("abort", onAbort);
    };
    const settle = (result: ProcessResult): void => {
      if (settled) return;
      settled = true;
      disarm();
      resolve(result);
    };

    const stop = (outcome: ProcessOutcome): void => {
      if (stoppedWith !== undefined) return;
      stoppedWith = outcome;
      graceTimer = killTree(child);
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
      else if (error.code === "EACCES" || error.code === "EPERM") settle(spawnFailed(error));
    });
    child.on("exit", () => {
      disarm();
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
