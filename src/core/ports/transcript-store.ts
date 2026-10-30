import type { Result } from "../domain/result.ts";

/** Where a transcript was written. */
export interface SavedTranscript {
  readonly path: string;
  readonly uri: string;
}

/** Writes rendered transcripts; never overwrites an existing file. */
export interface TranscriptStore {
  /** Checks that transcripts can be written, before any paid work starts. */
  prepare(): Promise<Result<void>>;
  save(input: { readonly fileName: string; readonly content: string }): Promise<Result<SavedTranscript>>;
}
