import { resolveMcpSettings } from "../domain/config.ts";
import { createError } from "../domain/errors.ts";
import { type LibraryFilter, matchesLibraryFilter, matchesName, resolveLibrarySettings } from "../domain/library.ts";
import { err, ok, type Result } from "../domain/result.ts";
import { SOURCE_KINDS } from "../domain/source.ts";
import { pageTranscript, type TranscriptPage, type TranscriptReadRequest } from "../domain/transcript/read.ts";
import type { ConfigStore } from "../ports/config-store.ts";
import type { LibraryEntry, LibraryStore, PruneReport, StoredTranscript } from "../ports/library-store.ts";
import { checkDayRange } from "./audit.ts";
import { type AuditTrailDeps, audited } from "./audit-trail.ts";
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

/** Checks `--limit` (1 to `MAX_PAGE_LIMIT`) and `--offset` (0 or more). */
export const checkPage = ({ limit, offset }: PageRequest): Result<void> => {
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

/** What `library list` asks for: a page, filtered; `kind` arrives as text from the adapters. */
export interface ListTranscriptsInput extends Omit<LibraryFilter, "kind"> {
  readonly kind?: string;
  readonly limit: number;
  readonly offset: number;
}

/** What `library search` asks for: a list plus the name query. */
export interface SearchTranscriptsInput extends ListTranscriptsInput {
  readonly query: string;
}

/** Checks a filter's dates and kind, and returns it with the kind typed. */
export const checkLibraryFilter = (input: {
  readonly provider?: string;
  readonly kind?: string;
  readonly since?: string;
  readonly until?: string;
}): Result<LibraryFilter> => {
  const dates = checkDayRange(input);
  if (!dates.success) return dates;
  const kind = input.kind === undefined ? undefined : SOURCE_KINDS.find((candidate) => candidate === input.kind);
  if (input.kind !== undefined && kind === undefined) {
    return err(
      createError("INPUT_INVALID", `Unknown source kind \`${input.kind}\`.`, {
        hint: `Use one of: ${SOURCE_KINDS.join(", ")}.`,
      }),
    );
  }
  return ok({
    ...(input.provider === undefined ? {} : { provider: input.provider }),
    ...(kind === undefined ? {} : { kind }),
    ...(input.since === undefined ? {} : { since: input.since }),
    ...(input.until === undefined ? {} : { until: input.until }),
  });
};

/** Checks the page and the filter, then returns the entries `keep` and the filter both accept. */
const listFiltered = async (
  deps: LibraryDeps,
  input: ListTranscriptsInput,
  keep: (entry: LibraryEntry) => boolean,
): Promise<Result<LibraryPage>> => {
  const page = checkPage(input);
  if (!page.success) return page;
  const filter = checkLibraryFilter(input);
  if (!filter.success) return filter;
  const entries = await deps.library.entries();
  if (!entries.success) return entries;
  return ok(
    pageOf(
      entries.data.filter((entry) => keep(entry) && matchesLibraryFilter(entry, filter.data)),
      input,
    ),
  );
};

/** Lists the library, newest first, optionally by provider, source kind and day range. */
export const createListTranscripts =
  (deps: LibraryDeps): UseCase<ListTranscriptsInput, LibraryPage> =>
  async (input, options) => {
    const ready = ensureNotAborted(options?.signal);
    if (!ready.success) return ready;
    return listFiltered(deps, input, () => true);
  };

/** Searches the library by name (title, file name or URL, platform, source key), not by content; then filters. */
export const createSearchTranscripts =
  (deps: LibraryDeps): UseCase<SearchTranscriptsInput, LibraryPage> =>
  async (input, options) => {
    const ready = ensureNotAborted(options?.signal);
    if (!ready.success) return ready;
    if (input.query.trim().length === 0) return err(createError("INPUT_INVALID", "The search query is empty."));
    return listFiltered(deps, input, (entry) => matchesName(entry, input.query));
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

/** What `readTranscript` asks for: which transcript, and which page of it. */
export interface ReadTranscriptInput extends TranscriptReadRequest {
  readonly transcriptId: string;
}

/**
 * Reads one page of a transcript (see `pageTranscript`); `full` stops at `mcp.max_full_chars`. An unknown id is
 * `TRANSCRIPT_NOT_FOUND`.
 */
export const createReadTranscript = (
  deps: LibraryDeps & { readonly configStore: ConfigStore },
): UseCase<ReadTranscriptInput, TranscriptPage & { readonly transcriptId: string }> => {
  const getTranscript = createGetTranscript(deps);
  return async (input, options) => {
    const config = await deps.configStore.read();
    if (!config.success) return config;
    const stored = await getTranscript(input, options);
    if (!stored.success) return stored;
    const page = pageTranscript(stored.data.artifact, input, resolveMcpSettings(config.data).maxFullChars);
    if (!page.success) return page;
    return ok({ transcriptId: stored.data.transcriptId, ...page.data });
  };
};

/** What `library prune` asks for; without `dryRun: false` nothing is deleted. */
export interface PruneInput {
  readonly olderThanDays?: number;
  readonly includeTranscripts: boolean;
  readonly dryRun: boolean;
}

const runPrune =
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

/**
 * Removes kept audio (all of it, or older than `olderThanDays`, plus what `library.max_audio_bytes` does not fit)
 * or, with `includeTranscripts`, whole sources older than `olderThanDays`, which is then required. Audited, dry runs
 * included.
 */
export const createPruneLibrary =
  (
    deps: LibraryDeps & { readonly configStore: ConfigStore; readonly audit: AuditTrailDeps },
  ): UseCase<PruneInput, PruneReport> =>
  async (input, options) => {
    const auditInput = [
      `older_than_days=${input.olderThanDays ?? "none"}`,
      `include_transcripts=${input.includeTranscripts}`,
      `dry_run=${input.dryRun}`,
    ].join(" ");
    return audited(deps.audit, "library_prune", auditInput, options, () => runPrune(deps)(input, options));
  };
