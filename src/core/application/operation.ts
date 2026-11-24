import type { OperationOptions } from "../domain/operation.ts";
import type { Result } from "../domain/result.ts";

export type { OperationOptions, ProgressEvent } from "../domain/operation.ts";
export { ensureNotAborted } from "../domain/operation.ts";

/** A core operation: business failures come back as a failed `Result`, never as exceptions. */
export type UseCase<I, O> = (input: I, options?: OperationOptions) => Promise<Result<O>>;
