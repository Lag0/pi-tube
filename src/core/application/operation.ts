import { createError } from "../domain/errors.ts";
import type { OperationOptions } from "../domain/operation.ts";
import { err, ok, type Result } from "../domain/result.ts";

export type { OperationOptions, ProgressEvent } from "../domain/operation.ts";

/** A core operation: business failures come back as a failed `Result`, never as exceptions. */
export type UseCase<I, O> = (input: I, options?: OperationOptions) => Promise<Result<O>>;

/** Fails with `CANCELLED` once `signal` is aborted. */
export const ensureNotAborted = (signal?: AbortSignal): Result<void> =>
  signal?.aborted ? err(createError("CANCELLED", "Operation cancelled.")) : ok(undefined);
