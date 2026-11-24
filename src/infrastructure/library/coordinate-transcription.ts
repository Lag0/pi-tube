import { lstat, mkdir, rmdir } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { createError } from "../../core/domain/errors.ts";
import type { OperationOptions } from "../../core/domain/operation.ts";
import { err, type Result } from "../../core/domain/result.ts";
import { errnoOf } from "../errno.ts";

/** A contender that observed an owner can only read its result, never take over its paid work. */
export async function withTranscriptionClaim<T>(
  marker: string,
  canonicalJson: string,
  options: OperationOptions | undefined,
  admitted: (producer: boolean) => Promise<Result<T>>,
): Promise<Result<T>> {
  const failure = (cause: unknown) =>
    err(createError("STORAGE_IO_FAILED", `Cannot coordinate transcription (${errnoOf(cause)}).`));
  try {
    await mkdir(marker, { mode: 0o700 });
  } catch (error) {
    if (errnoOf(error) !== "EEXIST") return failure(error);
    const deadline = performance.now() + 5 * 60_000;
    options?.onProgress?.({ label: "Waiting for transcription..." });
    while (!options?.signal?.aborted) {
      try {
        if (performance.now() >= deadline) return admitted(false);
        await lstat(marker);
      } catch (error) {
        return errnoOf(error) === "ENOENT" ? admitted(false) : failure(error);
      }
      try {
        await lstat(canonicalJson);
        return admitted(false);
      } catch (error) {
        if (errnoOf(error) !== "ENOENT") return failure(error);
      }
      await delay(250);
    }
    return err(createError("CANCELLED", "Operation cancelled."));
  }
  try {
    return await admitted(true);
  } finally {
    try {
      await rmdir(marker);
    } catch (error) {
      process.emitWarning(
        `Could not release transcription claim ${marker} (${errnoOf(error)}). Stop all callers and check the library and provider usage before removing an abandoned claim.`,
      );
    }
  }
}
