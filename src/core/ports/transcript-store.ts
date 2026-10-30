import type { Result } from "../domain/result.ts";

/** Where a transcript was written. */
export interface SavedTranscript {
  readonly path: string;
  readonly uri: string;
}

/** Writes rendered transcripts; never overwrites an existing file. */
export interface TranscriptStore {
  save(input: { readonly fileName: string; readonly content: string }): Promise<Result<SavedTranscript>>;
}
