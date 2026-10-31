import { createError } from "../domain/errors.ts";
import { matchesName, resolveLibrarySettings } from "../domain/library.ts";
import { err, ok, type Result } from "../domain/result.ts";
import type { ConfigStore } from "../ports/config-store.ts";
import type { LibraryEntry, LibraryStore, PruneReport, StoredTranscript } from "../ports/library-store.ts";
import { ensureNotAborted, type UseCase } from "./operation.ts";

/** Most entries one page may hold. */
export const MAX_PAGE_LIMIT = 500;

/** One page of library entries. */
export interface LibraryPage {
  readonly total: number;
  readonly offset: number;
  readonly limit: number;
  readonly entries: readonly LibraryEntry[];
}

/** Dependencies of the library use cases. */
export interface LibraryDeps {
  readonly library: LibraryStore;
}

interface PageRequest {
  readonly limit: number;
  readonly offset: number;
}

const checkPage = ({ limit, offset }: PageRequest): Result<void> => {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_LIMIT) {
    return err(createError("INPUT_INVALID", `\`--limit\` must be a whole number from 1 to ${MAX_PAGE_LIMIT}.`));
  }
  if (!Number.isInteger(offset) || offset < 0) {
    return err(createError("INPUT_INVALID", "`--offset` must be a whole number of 0 or more."));
  }
  return ok(undefined);
};

const pageOf = (entries: readonly LibraryEntry[], { limit, offset }: PageRequest): LibraryPage => ({
  total: entries.length,
  offset,
  limit,
  entries: entries.slice(offset, offset + limit),
});

/** Lists the library, newest first. */
export const createListTranscripts =
  (deps: LibraryDeps): UseCase<PageRequest, LibraryPage> =>
  async (input, options) => {
    const ready = ensureNotAborted(options?.signal);
    if (!ready.success) return ready;
    const page = checkPage(input);
    if (!page.success) return page;
    const entries = await deps.library.entries();
    if (!entries.success) return entries;
    return ok(pageOf(entries.data, input));
  };

/** Searches the library by name (title, file name or URL, platform, source key), not by content. */
export const createSearchTranscripts =
  (deps: LibraryDeps): UseCase<PageRequest & { readonly query: string }, LibraryPage> =>
  async (input, options) => {
    const ready = ensureNotAborted(options?.signal);
    if (!ready.success) return ready;
    if (input.query.trim().length === 0) return err(createError("INPUT_INVALID", "The search query is empty."));
    const page = checkPage(input);
    if (!page.success) return page;
    const entries = await deps.library.entries();
    if (!entries.success) return entries;
    return ok(
      pageOf(
        entries.data.filter((entry) => matchesName(entry, input.query)),
        input,
      ),
    );
  };

/** Reads one transcript by id. */
export const createGetTranscript =
  (deps: LibraryDeps): UseCase<{ readonly transcriptId: string }, StoredTranscript> =>
  async (input, options) => {
    const ready = ensureNotAborted(options?.signal);
    if (!ready.success) return ready;
    const stored = await deps.library.get(input.transcriptId.trim());
    if (!stored.success) return stored;
    if (!stored.data) {
      return err(createError("TRANSCRIPT_NOT_FOUND", `No transcript \`${input.transcriptId.trim()}\` in the library.`));
    }
    return ok(stored.data);
  };

/** What `library prune` asks for; without `dryRun: false` nothing is deleted. */
export interface PruneInput {
  readonly olderThanDays?: number;
  readonly includeTranscripts: boolean;
  readonly dryRun: boolean;
}

/**
 * Removes kept audio (all of it, or older than `olderThanDays`, plus what `library.max_audio_bytes` does not fit)
 * or, with `includeTranscripts`, whole sources older than `olderThanDays`, which is then required.
 */
export const createPruneLibrary =
  (deps: LibraryDeps & { readonly configStore: ConfigStore }): UseCase<PruneInput, PruneReport> =>
  async (input, options) => {
    const ready = ensureNotAborted(options?.signal);
    if (!ready.success) return ready;
    if (input.olderThanDays !== undefined && (!Number.isInteger(input.olderThanDays) || input.olderThanDays < 1)) {
      return err(createError("INPUT_INVALID", "`--older-than` must be a whole number of days of 1 or more."));
    }
    if (input.includeTranscripts && input.olderThanDays === undefined) {
      return err(
        createError("INPUT_INVALID", "`--include-transcripts` needs `--older-than <days>`.", {
          hint: "Transcripts are only deleted by age, so one command never deletes the whole library.",
        }),
      );
    }
    const config = await deps.configStore.read();
    if (!config.success) return config;
    const { maxAudioBytes } = resolveLibrarySettings(config.data);
    return deps.library.prune({ ...input, ...(maxAudioBytes === undefined ? {} : { maxAudioBytes }) });
  };
