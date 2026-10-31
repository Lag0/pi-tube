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
