import {
  createError,
  type ImportSummary,
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
  readonly provider?: string;
  readonly source?: string;
  readonly since?: string;
  readonly until?: string;
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

const importLine = (summary: ImportSummary): string =>
  `[LIBRARY_IMPORT] found=${summary.found} imported=${summary.imported} already=${summary.already} skipped=${summary.skipped.length} (pi-tube v2 transcripts; originals kept)`;

/**
 * The one-time import of pi-tube v2 transcripts, run before `transcribe` and `library`. It reports on stderr, so
 * `--json` output stays clean, and a failure only warns: the command goes on.
 */
export const importV2Once = async (deps: CliDeps): Promise<void> => {
  const summary = await deps.app.importV2Transcripts({});
  if (!summary.success) deps.io.writeErr(`warning: v2 import failed: ${summary.error.message}`);
  else if (!summary.data.ranBefore && summary.data.found > 0) deps.io.writeErr(importLine(summary.data));
};

/** `pi-tube library <list|show|search|prune|import>`: the local transcript library. */
export const runLibrary = async (deps: CliDeps, command: LibraryCommand): Promise<number> => {
  const filter = {
    ...(command.provider === undefined ? {} : { provider: command.provider }),
    ...(command.source === undefined ? {} : { kind: command.source }),
    ...(command.since === undefined ? {} : { since: command.since }),
    ...(command.until === undefined ? {} : { until: command.until }),
  };
  if (Object.keys(filter).length > 0 && command.action !== "list" && command.action !== "search") {
    throw usageError(
      "`--provider`, `--source`, `--since` and `--until` work only with `library list` and `library search`.",
    );
  }
  const page = {
    limit: wholeNumber(command.limit, DEFAULT_LIMIT),
    offset: wholeNumber(command.offset, 0),
    ...filter,
  };
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
    case "import": {
      if (command.args.length > 0) throw usageError("`library import` takes no arguments.");
      const summary = unwrapOrFail(await deps.app.importV2Transcripts({ force: true }));
      if (command.json) {
        const { found, imported, already, skipped } = summary;
        deps.io.writeOut(JSON.stringify({ found, imported, already, skipped }, null, 2));
        return 0;
      }
      const skipped = summary.skipped.map(({ file, reason }) => `skipped: ${toSafeLine(file)}: ${toSafeLine(reason)}`);
      deps.io.writeOut([importLine(summary), ...skipped].join("\n"));
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
