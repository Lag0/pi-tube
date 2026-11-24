import { lstat, mkdir, open } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { createError } from "../../core/domain/errors.ts";
import { err, type Result } from "../../core/domain/result.ts";
import { errnoOf } from "../errno.ts";

/** A shared directory handle needs only read access and is released by the OS on process exit. */
export async function withLibraryActivity<T>(
  root: string,
  work: () => Promise<Result<T>>,
  create = false,
): Promise<Result<T>> {
  if (process.platform !== "win32") return work(); // No identity-bound deletion backend is enabled there.
  let handle: { close: () => void };
  try {
    if (create) await mkdir(root, { recursive: true, mode: 0o700 });
    handle = (await import("./windows-handle.ts")).pin(root, "activity");
  } catch (error) {
    if (!create && errnoOf(error) === "ENOENT") return work();
    return err(createError("STORAGE_IO_FAILED", `Cannot register library use (${errnoOf(error)}).`));
  }
  try {
    return await work();
  } finally {
    handle.close();
  }
}

/** Serialize source.json read/merge/rename across stores and processes without adding a file to the library. */
export async function withSourceWriter<T>(dir: string, work: () => Promise<T>): Promise<T> {
  if (process.platform === "win32") {
    const { claimWriter } = await import("./windows-handle.ts");
    const { dev, ino } = await lstat(dir, { bigint: true });
    const until = Date.now() + 5000;
    for (;;) {
      const release = claimWriter(`${dev}-${ino}`);
      if (release) {
        try {
          return await work();
        } finally {
          release();
        }
      }
      if (Date.now() >= until) throw new Error("Cannot lock source metadata");
      await delay(10);
    }
  }
  const koffi = (await import("koffi")).default;
  const flock = koffi.load(null).func("int flock(int fd, int operation)");
  const handle = await open(dir, "r");
  try {
    // Run the blocking flock on a worker; the lock is released by closing this file description.
    await new Promise<void>((resolve, reject) =>
      flock.async(handle.fd, 2, (e: unknown, rc: number) =>
        e || rc !== 0 ? reject(e ?? new Error("Cannot lock source directory")) : resolve(),
      ),
    );
    return await work();
  } finally {
    await handle.close();
  }
}
