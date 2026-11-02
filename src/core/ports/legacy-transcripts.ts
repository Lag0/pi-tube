import type { Result } from "../domain/result.ts";
import type { ImportSummary } from "../domain/transcript/parse-v2.ts";

/** One file pi-tube v2 saved, read whole. */
export interface LegacyTranscriptFile {
  readonly path: string;
  readonly name: string;
  readonly text: string;
  /** SHA-256 of the file's bytes, in hex: the key of a transcript whose source cannot be identified. */
  readonly sha256: string;
}

/** The transcripts pi-tube v2 left in its folders, read only, and whether they were imported already. */
export interface LegacyTranscripts {
  readonly isImported: () => Promise<boolean>;
  /** v2-named files at the top of each folder, never below it. */
  readonly files: () => Promise<Result<readonly LegacyTranscriptFile[]>>;
  readonly markImported: (summary: ImportSummary) => Promise<Result<void>>;
}
