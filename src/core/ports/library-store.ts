import type { SourceKey, TranscriptKey } from "../domain/library.ts";
import type { OperationOptions } from "../domain/operation.ts";
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

/** A source the library already knows, with the audio it kept for it, if any. */
export interface StoredSource {
  readonly source: ResolvedSource;
  readonly audioPath?: string;
}

/** What `prune` removed, or would remove when `dryRun`. */
export interface PruneReport {
  readonly audioFiles: number;
  readonly transcriptFiles?: number;
  readonly preserved?: number;
  readonly busy?: boolean;
  readonly unsupported?: boolean;
  readonly reason?: "unverified_audio_ownership";
  readonly unverifiedAudioCap?: number;
  readonly failed?: number;
  readonly sourceDirs: number;
  readonly bytes: number;
  readonly dryRun: boolean;
}

/** Manual audio policy or verified transcript cleanup. An unsupported policy selects nothing. */
export interface PruneRequest {
  readonly olderThanDays?: number;
  /** Includes verified transcript artifacts older than `olderThanDays` (required then). */
  readonly includeTranscripts: boolean;
  readonly dryRun: boolean;
  readonly maxAudioBytes?: number;
}

export interface LibraryLookupOptions extends OperationOptions {
  /** Called after a matching canonical transcript is read, before attempting Markdown repair. */
  readonly onCacheHit?: () => void;
}

export interface ScanDiagnostics {
  readonly skipped_candidates: number;
  readonly unlisted_children: number;
}

export interface KeptAudio {
  readonly originalPreserved?: true;
  readonly audioPath: string;
  readonly audioCap?: "unenforced";
}

/** The local transcript library. Its files are the source of truth; nothing is kept elsewhere. */
export interface LibraryStore {
  /** Checks that the library can be written, before any paid work starts. */
  prepare(): Promise<Result<void>>;
  /** The source's key; a local file is hashed by content. */
  sourceKeyOf(source: ResolvedSource): Promise<Result<SourceKey>>;
  /** On contention the callback can only reuse a saved result, never dispatch another paid call. */
  withTranscriptionClaim<T>(
    key: TranscriptKey,
    options: OperationOptions | undefined,
    admitted: (producer: boolean) => Promise<Result<T>>,
  ): Promise<Result<T>>;
  /** Speculative URL lookup before resolve; waits for an observed producer without taking over. */
  findBeforeClaim(key: TranscriptKey, options?: LibraryLookupOptions): Promise<Result<StoredTranscript | undefined>>;
  /** Cache lookup: the exact key, or, for a requested language, an `auto` transcript that detected it. */
  find(key: TranscriptKey, options?: LibraryLookupOptions): Promise<Result<StoredTranscript | undefined>>;
  /**
   * Stamps the transcript id and source key on `artifact`, then writes source.json (merged), `<id>.json` and
   * `<date>-<title>-<id8>.md`. An existing transcript is returned as is; with `fresh`, the next free `<id>-<n>` is
   * written.
   */
  save(input: {
    readonly key: TranscriptKey;
    readonly source: ResolvedSource;
    readonly artifact: OutputArtifact;
    readonly fresh?: boolean;
  }): Promise<Result<StoredTranscript>>;
  get(transcriptId: string): Promise<Result<StoredTranscript | undefined>>;
  /** Valid transcripts, newest first, and omissions observed in the same scan. */
  entries(): Promise<Result<{ readonly entries: readonly LibraryEntry[]; readonly scanDiagnostics: ScanDiagnostics }>>;
  /** The page source saved for `sourceKey`, and its kept audio; undefined for an unknown key or a non-page source. */
  storedSource(sourceKey: SourceKey): Promise<Result<StoredSource | undefined>>;
  /**
   * Keeps downloaded audio as `audio.<ext>`. Windows keeps a separate copy; only the original is for upload. A configured cap is reported as unenforced; no files are selected for eviction.
   */
  keepAudio(sourceKey: SourceKey, filePath: string, maxAudioBytes?: number): Promise<Result<KeptAudio>>;
  prune(request: PruneRequest): Promise<Result<PruneReport>>;
}
