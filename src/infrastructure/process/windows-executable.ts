import { stat } from "node:fs/promises";
import { win32 as path } from "node:path";

const isFile = async (candidate: string) => {
  try {
    return (await stat(candidate)).isFile();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return false;
    throw error;
  }
};

type Lookup = { exe: string } | { outcome: "aborted" | "timed_out" | "not_found" };

export async function resolveWindowsExecutable(
  command: string,
  cwd: string,
  searchPath: string | undefined,
  deadline: number,
  signal?: AbortSignal,
  probe = isFile,
): Promise<Lookup> {
  const stop = () => (signal?.aborted ? "aborted" : performance.now() >= deadline ? "timed_out" : undefined);
  const search = async (): Promise<Lookup> => {
    const dirs = /[\\/:]/.test(command) ? [cwd] : (searchPath ?? "").split(";");
    const name = path.extname(command) ? command : `${command}.exe`;
    for (const entry of dirs) {
      const stopped = stop();
      if (stopped) return { outcome: stopped };
      const dir = entry.replace(/^"(.*)"$/, "$1");
      if (!dir.trim()) continue;
      const exe = path.resolve(cwd, dir, name);
      if (await probe(exe)) return { exe };
    }
    return { outcome: "not_found" };
  };
  // A pending stat cannot be cancelled. Only the winning result can reach native setup.
  let abort!: () => void;
  let timer!: ReturnType<typeof setTimeout>;
  const interrupted = new Promise<Lookup>((resolve) => {
    abort = () => resolve({ outcome: "aborted" });
    signal?.addEventListener("abort", abort, { once: true });
    const waitForDeadline = () => {
      const remaining = Math.ceil(deadline - performance.now());
      if (remaining <= 0) resolve({ outcome: "timed_out" });
      else if (Number.isFinite(remaining)) timer = setTimeout(waitForDeadline, Math.min(remaining, 2 ** 31 - 1));
    };
    waitForDeadline();
  });
  try {
    const result = await Promise.race([search(), interrupted]);
    const stopped = stop();
    return stopped ? { outcome: stopped } : result;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
