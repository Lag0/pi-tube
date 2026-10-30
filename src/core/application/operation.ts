import { createError } from "../domain/errors.ts";
import { err, ok, type Result } from "../domain/result.ts";

/** A progress step reported by a long operation. */
export interface ProgressEvent {
  readonly label: string;
  readonly detail?: string;
}

/** Options every use case accepts: cancellation and progress reporting. */
export interface OperationOptions {
  readonly signal?: AbortSignal;
  readonly onProgress?: (event: ProgressEvent) => void;
}

/** A core operation: business failures come back as a failed `Result`, never as exceptions. */
export type UseCase<I, O> = (input: I, options?: OperationOptions) => Promise<Result<O>>;

/** Fails with `CANCELLED` once `signal` is aborted. */
export const ensureNotAborted = (signal?: AbortSignal): Result<void> =>
  signal?.aborted ? err(createError("CANCELLED", "Operation cancelled.")) : ok(undefined);
