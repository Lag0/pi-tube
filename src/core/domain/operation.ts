import { createError } from "./errors.ts";
import { err, ok, type Result } from "./result.ts";

/** A progress step reported by a long operation. */
export interface ProgressEvent {
  readonly label: string;
  readonly detail?: string;
}

/** Options every use case and port call accepts: cancellation and progress reporting. */
export interface OperationOptions {
  readonly signal?: AbortSignal;
  readonly onProgress?: (event: ProgressEvent) => void;
}

/** Fails with `CANCELLED` once `signal` is aborted. */
export const ensureNotAborted = (signal?: AbortSignal): Result<void> =>
  signal?.aborted ? err(createError("CANCELLED", "Operation cancelled.")) : ok(undefined);
