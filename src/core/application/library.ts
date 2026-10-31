import { createError } from "../domain/errors.ts";
import { matchesName } from "../domain/library.ts";
import { err, ok, type Result } from "../domain/result.ts";
import type { LibraryEntry, LibraryStore, StoredTranscript } from "../ports/library-store.ts";
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
