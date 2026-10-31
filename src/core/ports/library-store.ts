import type { SourceKey, TranscriptKey } from "../domain/library.ts";
import type { ProviderId } from "../domain/providers.ts";
import type { Result } from "../domain/result.ts";
import type { ResolvedSource, SourceKind } from "../domain/source.ts";
import type { OutputArtifact } from "../domain/transcript/contract.ts";

/** A transcript in the library: its id, where its files are, and its content. */
export interface StoredTranscript {
  readonly transcriptId: string;
  readonly sourceKey: SourceKey;
  readonly paths: { readonly json: string; readonly markdown: string };
  readonly artifact: OutputArtifact;
}

/** What `library list` and `library search` show for one transcript. */
export interface LibraryEntry {
  readonly transcriptId: string;
  readonly sourceKey: SourceKey;
  readonly kind: SourceKind;
  readonly title?: string;
  readonly platform?: string;
  /** Local file: its file name; page or direct URL: the URL as saved (no credentials; a direct URL keeps no query). */
  readonly sourceName?: string;
  readonly provider: ProviderId;
  readonly model?: string;
  readonly requestedLanguage?: string;
  readonly detectedLanguage?: string;
  readonly generatedAt: string;
  readonly characters: number;
}

/** The local transcript library. Its files are the source of truth; nothing is kept elsewhere. */
export interface LibraryStore {
  /** Checks that the library can be written, before any paid work starts. */
  prepare(): Promise<Result<void>>;
  /** The source's key; a local file is hashed by content. */
  sourceKeyOf(source: ResolvedSource): Promise<Result<SourceKey>>;
  /** Cache lookup: the exact key, or, for a requested language, an `auto` transcript that detected it. */
  find(key: TranscriptKey): Promise<Result<StoredTranscript | undefined>>;
  /**
   * Stamps the transcript id and source key on `artifact`, then writes source.json (merged), `<id>.json` and
   * `<id>.md`. An existing transcript is returned as is; with `fresh`, the next free `<id>-<n>` is written.
   */
  save(input: {
    readonly key: TranscriptKey;
    readonly source: ResolvedSource;
    readonly artifact: OutputArtifact;
    readonly fresh?: boolean;
  }): Promise<Result<StoredTranscript>>;
  get(transcriptId: string): Promise<Result<StoredTranscript | undefined>>;
  /** Every transcript, newest first; list and search paginate it in the core. */
  entries(): Promise<Result<readonly LibraryEntry[]>>;
}
