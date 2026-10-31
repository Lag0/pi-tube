import { createError, type MediaInfo, toSafeLine } from "../../../core/index.ts";
import { CliFailure, unwrapOrFail } from "../error-output.ts";
import type { CliDeps } from "../io.ts";
import { createProgressReporter } from "../progress.ts";
import { hintForCommand } from "../usage-hints.ts";

export interface InfoCommand {
  readonly input?: string;
  readonly extraPositionals: readonly string[];
  readonly json: boolean;
  readonly color: boolean;
}

/** Longest description in the human output; `--json` prints it whole. */
const DESCRIPTION_PREVIEW_CHARS = 280;

/** The `--json` stdout object: every field, `null` when absent. */
export const toMediaInfoJson = (info: MediaInfo) => {
  const metadata = info.metadata;
  return {
    source_kind: info.kind,
    tier: info.tier,
    url: info.url ?? null,
    path: info.path ?? null,
    size_bytes: info.sizeBytes ?? null,
    extension: info.extension ?? null,
    platform: metadata?.platform ?? null,
    media_id: metadata?.mediaId ?? null,
    canonical_url: metadata?.canonicalUrl ?? null,
    title: metadata?.title ?? null,
    published_at: metadata?.publishedAt ?? null,
    duration_seconds: metadata?.durationSeconds ?? null,
    live_status: metadata?.liveStatus ?? null,
    chapters: (metadata?.chapters ?? []).map((chapter) => ({
      title: chapter.title,
      start_ms: chapter.startMs,
      end_ms: chapter.endMs,
    })),
    description: metadata?.description ?? null,
    description_links: [...(metadata?.descriptionLinks ?? [])],
  };
};

const clock = (milliseconds: number): string => {
  const totalSeconds = Math.floor(Math.max(0, milliseconds) / 1000);
  const parts = [Math.floor(totalSeconds / 3600), Math.floor((totalSeconds % 3600) / 60), totalSeconds % 60];
  return parts.map((part) => String(part).padStart(2, "0")).join(":");
};

const preview = (description: string): string => {
  const flat = toSafeLine(description);
  return flat.length > DESCRIPTION_PREVIEW_CHARS ? `${flat.slice(0, DESCRIPTION_PREVIEW_CHARS)}...` : flat;
};

/** One line per field that is present, in a fixed order; text from the page goes through `toSafeLine`. */
const toMediaInfoLines = (info: MediaInfo): string[] => {
  const metadata = info.metadata;
  const platform = metadata ? ` platform=${toSafeLine(metadata.platform)}` : "";
  const lines = [`[MEDIA_INFO] kind=${info.kind} tier=${info.tier}${platform}`];
  if (metadata?.title) lines.push(`title: ${toSafeLine(metadata.title)}`);
  if (metadata?.publishedAt) lines.push(`published_at: ${metadata.publishedAt}`);
  if (metadata?.durationSeconds !== undefined) lines.push(`duration_seconds: ${metadata.durationSeconds}`);
  if (metadata?.liveStatus) lines.push(`live_status: ${metadata.liveStatus}`);
  if (info.url) lines.push(`url: ${info.url}`);
  if (info.path) lines.push(`path: ${info.path}`);
  if (info.sizeBytes !== undefined) lines.push(`size_bytes: ${info.sizeBytes}`);
  const chapters = metadata?.chapters ?? [];
  if (chapters.length > 0) {
    lines.push(
      `chapters: ${chapters.length}`,
      ...chapters.map((chapter) => `  [${clock(chapter.startMs)}] ${toSafeLine(chapter.title)}`),
    );
  }
  if (metadata?.description) lines.push(`description: ${preview(metadata.description)}`);
  return lines;
};

const usageError = (message: string): CliFailure =>
  new CliFailure(createError("INPUT_INVALID", message, { hint: hintForCommand("info") }));

/** `pi-tube info <input>`: media metadata without downloading or transcribing. */
export const runInfo = async (deps: CliDeps, command: InfoCommand): Promise<number> => {
  if (!command.input?.trim()) throw usageError("Missing input.");
  if (command.extraPositionals.length > 0) throw usageError("`info` accepts exactly one input.");

  const progress = createProgressReporter({ color: command.color, stream: deps.io.progressStream });
  const startTime = Date.now();
  const result = await deps.app
    .getMediaInfo(
      { input: command.input },
      // Armed like transcribe and download: on Ctrl-C yt-dlp is stopped and its temp cookies copy is removed.
      { onProgress: (step) => progress.update(step), signal: deps.listenForCancel?.() },
    )
    .catch((error: unknown) => {
      progress.fail("Failed");
      throw error;
    });
  if (!result.success) progress.fail("Failed");
  const media = unwrapOrFail(result);
  progress.succeed(media.kind, Date.now() - startTime);

  if (command.json) {
    deps.io.writeOut(JSON.stringify(toMediaInfoJson(media), null, 2));
    return 0;
  }
  deps.io.writeOut(toMediaInfoLines(media).join("\n"));
  return 0;
};
