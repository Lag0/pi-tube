import { lstat, mkdir, rmdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createError, transcriptionWaitError } from "../../core/domain/errors.ts";
import type { OperationOptions } from "../../core/domain/operation.ts";
import { err, type Result } from "../../core/domain/result.ts";
import { errnoOf } from "../errno.ts";

/** A contender that observed an owner can only read its result, never take over its paid work. */
export async function withTranscriptionClaim<T>(
  marker: string,
  options: OperationOptions | undefined,
  admitted: (producer: boolean) => Promise<Result<T>>,
): Promise<Result<T>> {
  const deadline = performance.now() + 5 * 60_000;
  const completed = path.join(marker, "completed");
  let producer = true;
  while (true) {
    if (options?.signal?.aborted) return err(createError("CANCELLED", "Operation cancelled."));
    try {
      await mkdir(marker, { mode: 0o700 });
      break;
    } catch (error) {
      if (errnoOf(error) !== "EEXIST")
        return err(createError("STORAGE_IO_FAILED", `Cannot coordinate transcription (${errnoOf(error)}).`));
    }
    if (producer) options?.onProgress?.({ label: "Waiting for transcription..." });
    producer = false;
    if (performance.now() >= deadline) {
      if (
        await lstat(completed).then(
          () => true,
          () => false,
        )
      )
        return admitted(false);
      return err(transcriptionWaitError());
    }
    await delay(250);
  }
  let success = false;
  try {
    if (options?.signal?.aborted) return err(createError("CANCELLED", "Operation cancelled."));
    const result = await admitted(producer);
    success = result.success;
    return result;
  } finally {
    try {
      await rmdir(marker);
    } catch (error) {
      if (success) await writeFile(completed, "", { flag: "wx", mode: 0o600 }).catch(() => undefined);
      process.emitWarning(
        `Could not release transcription claim ${marker} (${errnoOf(error)}). Stop all callers and check the library and provider usage before removing an abandoned claim.`,
      );
    }
  }
}
