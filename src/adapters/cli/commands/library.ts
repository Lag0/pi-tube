import {
  createError,
  type LibraryEntry,
  type LibraryPage,
  type StoredTranscript,
  toJsonOutputArtifact,
  toSafeLine,
} from "../../../core/index.ts";
import { CliFailure, unwrapOrFail } from "../error-output.ts";
import type { CliDeps } from "../io.ts";
import { hintForCommand } from "../usage-hints.ts";

export interface LibraryCommand {
  readonly action?: string;
  readonly args: readonly string[];
  readonly limit?: string;
  readonly offset?: string;
  readonly olderThan?: string;
  readonly includeTranscripts: boolean;
  readonly yes: boolean;
  readonly json: boolean;
}

const DEFAULT_LIMIT = 20;

const usageError = (message: string): CliFailure =>
  new CliFailure(createError("INPUT_INVALID", message, { hint: hintForCommand("library") }));

/** A whole number from the flag, or NaN, which the use case refuses with the flag's name. */
const wholeNumber = (value: string | undefined, fallback: number): number =>
  value === undefined ? fallback : /^\d+$/.test(value.trim()) ? Number(value.trim()) : Number.NaN;

const entryJson = (entry: LibraryEntry) => ({
  transcript_id: entry.transcriptId,
  source_key: entry.sourceKey,
  kind: entry.kind,
  title: entry.title ?? null,
  provider: entry.provider,
  model: entry.model ?? null,
  requested_language: entry.requestedLanguage ?? null,
  detected_language: entry.detectedLanguage ?? null,
  generated_at: entry.generatedAt,
  characters: entry.characters,
});

const pageJson = (page: LibraryPage) => {
  const next = page.offset + page.entries.length;
  return {
    total: page.total,
    offset: page.offset,
    limit: page.limit,
    next_offset: next < page.total ? next : null,
    entries: page.entries.map(entryJson),
  };
};

/** One line per entry; the title comes from the page, so it goes through `toSafeLine`. */
const entryLine = (entry: LibraryEntry): string =>
  `${entry.transcriptId} ${entry.generatedAt} ${entry.provider} ${entry.kind} ${toSafeLine(entry.title ?? entry.sourceKey)}`;

const writePage = (deps: CliDeps, header: string, page: LibraryPage): void => {
  deps.io.writeOut(
    [`${header} total=${page.total} offset=${page.offset} limit=${page.limit}`, ...page.entries.map(entryLine)].join(
      "\n",
    ),
  );
};

const writeTranscript = (deps: CliDeps, stored: StoredTranscript, json: boolean): void => {
  if (json) {
    deps.io.writeOut(
      JSON.stringify(
        {
          transcript_id: stored.transcriptId,
          markdown_path: stored.paths.markdown,
          json_path: stored.paths.json,
          transcript: toJsonOutputArtifact(stored.artifact),
        },
        null,
        2,
      ),
    );
    return;
  }
  const { source, transcription, transcript } = stored.artifact;
  const language = transcription.detected_language ?? transcription.requested_language ?? "auto";
  deps.io.writeOut(
    [
      `[TRANSCRIPT] ${stored.transcriptId}`,
      ...(source.title ? [`title: ${toSafeLine(source.title)}`] : []),
      `provider: ${transcription.provider}`,
      ...(transcription.model ? [`model: ${transcription.model}`] : []),
      `language: ${language}`,
      `generated_at: ${stored.artifact.generated_at}`,
      `characters: ${transcript.full_text.length}`,
      `markdown_path: ${stored.paths.markdown}`,
      `json_path: ${stored.paths.json}`,
    ].join("\n"),
  );
};

/** `pi-tube library <list|show|search|prune>`: the local transcript library. */
export const runLibrary = async (deps: CliDeps, command: LibraryCommand): Promise<number> => {
  const page = { limit: wholeNumber(command.limit, DEFAULT_LIMIT), offset: wholeNumber(command.offset, 0) };
  switch (command.action) {
    case "list": {
      if (command.args.length > 0) throw usageError("`library list` takes no arguments.");
      const listed = unwrapOrFail(await deps.app.listTranscripts(page));
      if (command.json) deps.io.writeOut(JSON.stringify(pageJson(listed), null, 2));
      else writePage(deps, "[LIBRARY]", listed);
      return 0;
    }
    case "search": {
      const query = command.args.join(" ");
      const found = unwrapOrFail(await deps.app.searchTranscripts({ query, ...page }));
      if (command.json) deps.io.writeOut(JSON.stringify({ query, ...pageJson(found) }, null, 2));
      else writePage(deps, `[LIBRARY_SEARCH] query=${toSafeLine(query)}`, found);
      return 0;
    }
    case "prune": {
      if (command.args.length > 0) throw usageError("`library prune` takes no arguments.");
      const report = unwrapOrFail(
        await deps.app.pruneLibrary({
          ...(command.olderThan === undefined ? {} : { olderThanDays: wholeNumber(command.olderThan, 0) }),
          includeTranscripts: command.includeTranscripts,
          dryRun: !command.yes,
        }),
      );
      if (command.json) {
        deps.io.writeOut(
          JSON.stringify(
            {
              dry_run: report.dryRun,
              audio_files: report.audioFiles,
              source_dirs: report.sourceDirs,
              bytes: report.bytes,
            },
            null,
            2,
          ),
        );
        return 0;
      }
      const summary = `[LIBRARY_PRUNE] dry_run=${report.dryRun} audio_files=${report.audioFiles} source_dirs=${report.sourceDirs} bytes=${report.bytes}`;
      deps.io.writeOut(report.dryRun ? `${summary}\nRun again with --yes to delete.` : summary);
      return 0;
    }
    case "show": {
      const [transcriptId, ...rest] = command.args;
      if (!transcriptId || rest.length > 0) throw usageError("`library show` takes exactly one transcript id.");
      writeTranscript(deps, unwrapOrFail(await deps.app.getTranscript({ transcriptId })), command.json);
      return 0;
    }
    default:
      throw usageError(command.action ? `Unknown library action \`${command.action}\`.` : "Missing library action.");
  }
};
