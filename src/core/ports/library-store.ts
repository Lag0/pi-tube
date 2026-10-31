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

/** A source the library already knows, with the audio it kept for it, if any. */
export interface StoredSource {
  readonly source: ResolvedSource;
  readonly audioPath?: string;
}

/** What `prune` removed, or would remove when `dryRun`. */
export interface PruneReport {
  readonly audioFiles: number;
  readonly sourceDirs: number;
  readonly bytes: number;
  readonly dryRun: boolean;
}

/** What `prune` removes: audio (all of it, or older than `olderThanDays`, or past `maxAudioBytes`), or whole sources. */
export interface PruneRequest {
  readonly olderThanDays?: number;
  /** Removes whole source directories, transcripts included, older than `olderThanDays` (required then). */
  readonly includeTranscripts: boolean;
  readonly dryRun: boolean;
  readonly maxAudioBytes?: number;
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
  /** The page source saved for `sourceKey`, and its kept audio; undefined for an unknown key or a non-page source. */
  storedSource(sourceKey: SourceKey): Promise<Result<StoredSource | undefined>>;
  /**
   * Moves downloaded audio into the source's directory as `audio.<ext>` (mode 600, stamped now) and returns its
   * new path. Past `maxAudioBytes`, the oldest audio of other sources is removed; transcripts never are.
   */
  keepAudio(sourceKey: SourceKey, filePath: string, maxAudioBytes?: number): Promise<Result<string>>;
  prune(request: PruneRequest): Promise<Result<PruneReport>>;
}
