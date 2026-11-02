import { normalizeLanguageTag } from "../domain/language.ts";
import type { TranscriptKey } from "../domain/library.ts";
import { ok, type Result } from "../domain/result.ts";
import { buildOutputArtifact } from "../domain/transcript/build-artifact.ts";
import { type ImportSummary, parseV2Transcript, V2_MODELS, v2SourceOf } from "../domain/transcript/parse-v2.ts";
import type { LegacyTranscriptFile, LegacyTranscripts } from "../ports/legacy-transcripts.ts";
import type { LibraryStore } from "../ports/library-store.ts";
import { ensureNotAborted, type UseCase } from "./operation.ts";

/** Input of `importV2Transcripts`. */
export interface ImportV2Input {
  /** Runs even when the import ran before; the import is idempotent. */
  readonly force?: boolean;
}

/** Dependencies of `importV2Transcripts`. */
export interface ImportV2Deps {
  readonly legacy: LegacyTranscripts;
  readonly library: LibraryStore;
}

type Outcome = "imported" | "already" | { readonly reason: string };

const importOne = async (library: LibraryStore, file: LegacyTranscriptFile): Promise<Outcome> => {
  const transcript = parseV2Transcript(file.name, file.text);
  if (!transcript.success) return { reason: transcript.error.message };
  const { source, keyFromSource } = v2SourceOf(transcript.data);
  // A source that cannot be identified (a v2 page Markdown, a local file that is gone) is keyed by the v2 file:
  // never a cache hit, and never merged with another transcript.
  const fallback = `v2:${file.sha256}`;
  const identified = keyFromSource ? await library.sourceKeyOf(source) : undefined;
  const sourceKey = identified?.success ? identified.data : fallback;
  const { provider, requestedLanguage, detectedLanguage } = transcript.data;
  const model = V2_MODELS[provider] ?? "";
  const language = normalizeLanguageTag(requestedLanguage);
  const key: TranscriptKey = { sourceKey, provider, model, ...(language ? { language } : {}) };
  const found = await library.find(key);
  if (!found.success) return { reason: found.error.message };
  if (found.data) return "already";
  const artifact = buildOutputArtifact(
    {
      source,
      provider,
      model,
      transcript: transcript.data.fullText,
      requestedLanguage: language,
      detectedLanguage: normalizeLanguageTag(detectedLanguage),
      segments: [...transcript.data.segments],
    },
    // The v2 date: the imported transcript is named and sorted by when it was made.
    { generatedAt: transcript.data.generatedAt, includeTimestamps: true },
  );
  const saved = await library.save({ key, source, artifact });
  return saved.success ? "imported" : { reason: saved.error.message };
};

/**
 * Imports the transcripts pi-tube v2 saved into the library, once unless `force`. The v2 files are only read;
 * one that is not a v2 transcript is skipped with its reason.
 */
export const createImportV2Transcripts =
  (deps: ImportV2Deps): UseCase<ImportV2Input, ImportSummary> =>
  async (input, options) => {
    const ready = ensureNotAborted(options?.signal);
    if (!ready.success) return ready;
    if (!input.force && (await deps.legacy.isImported())) {
      return ok({ ranBefore: true, found: 0, imported: 0, already: 0, skipped: [] });
    }
    const files = await deps.legacy.files();
    if (!files.success) return files;
    // Nothing to import writes nothing: no library dir and no marker, so the check stays one directory read.
    if (files.data.length === 0) return ok({ ranBefore: false, found: 0, imported: 0, already: 0, skipped: [] });
    const writable = await deps.library.prepare();
    if (!writable.success) return writable;
    let imported = 0;
    let already = 0;
    const skipped: Array<{ readonly file: string; readonly reason: string }> = [];
    for (const file of files.data) {
      const outcome = await importOne(deps.library, file);
      if (outcome === "imported") imported += 1;
      else if (outcome === "already") already += 1;
      else skipped.push({ file: file.path, reason: outcome.reason });
    }
    const summary: ImportSummary = { ranBefore: false, found: files.data.length, imported, already, skipped };
    const marked: Result<void> = await deps.legacy.markImported(summary);
    return marked.success ? ok(summary) : marked;
  };
