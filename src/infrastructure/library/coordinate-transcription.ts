import { lstat, mkdir, rmdir } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createError } from "../../core/domain/errors.ts";
import type { OperationOptions } from "../../core/domain/operation.ts";
import { err, type Result } from "../../core/domain/result.ts";
import { errnoOf } from "../errno.ts";

/** A contender that observed an owner can only read its result, never take over its paid work. */
export async function withTranscriptionClaim<T>(
  root: string,
  transcriptId: string,
  options: OperationOptions | undefined,
  admitted: (producer: boolean) => Promise<Result<T>>,
): Promise<Result<T>> {
  const marker = path.join(root, `.transcribing-${transcriptId}`);
  const failure = (cause: unknown) =>
    err(createError("STORAGE_IO_FAILED", `Cannot coordinate transcription (${errnoOf(cause)}).`));
  try {
    await mkdir(marker, { mode: 0o700 });
  } catch (error) {
    if (errnoOf(error) !== "EEXIST") return failure(error);
    options?.onProgress?.({ label: "Waiting for transcription..." });
    while (!options?.signal?.aborted) {
      try {
        await lstat(marker);
      } catch (error) {
        return errnoOf(error) === "ENOENT" ? admitted(false) : failure(error);
      }
      await delay(50);
    }
    return err(createError("CANCELLED", "Operation cancelled."));
  }
  try {
    return await admitted(true);
  } finally {
    await rmdir(marker);
  }
}
