import { createError, type PiTubeError } from "../../core/domain/errors.ts";
import { err, ok, type Result } from "../../core/domain/result.ts";
import type { Chapter, LiveStatus, MediaMetadata } from "../../core/domain/source.ts";
import type { ProcessResult } from "../process/run-process.ts";

/** What a yt-dlp run was for; decides which source error a failure maps to. */
export type YtDlpPurpose = "youtube_metadata" | "instagram_metadata" | "site_metadata" | "download";

export const METADATA_TIMEOUT_MS = 120_000;
export const MEDIA_TIMEOUT_MS = 1_800_000;
export const YTDLP_TIMEOUT_ENV = "PI_TUBE_YTDLP_TIMEOUT_MS";
export const AUDIO_FORMAT_SELECTOR = "bestaudio[ext=m4a]/bestaudio/best";
export const DOWNLOAD_TEMPLATE = "%(title).200B [%(id)s].%(ext)s";
// `--ignore-config`: a yt-dlp.conf in the cwd or output dir must never inject options such as `--exec`.
const BASE_ARGS = ["--ignore-config", "--no-warnings", "--no-playlist"] as const;

const malformedOutput = (): PiTubeError => createError("YTDLP_OUTPUT_INVALID", "yt-dlp returned malformed output.");

/** The longest delay `setTimeout` honours (about 24.8 days); a longer one fires at once. */
const MAX_TIMER_MS = 2_147_483_647;

/**
 * `PI_TUBE_YTDLP_TIMEOUT_MS`, when set to a positive whole number of milliseconds, replaces both default
 * timeouts, capped at `MAX_TIMER_MS`. Anything else (`30s`, `1e3`, `0`) keeps the default.
 */
export const resolveYtDlpTimeoutMs = (env: Readonly<Record<string, string | undefined>>, fallback: number): number => {
  const raw = env[YTDLP_TIMEOUT_ENV]?.trim() ?? "";
  if (!/^\d+$/.test(raw)) return fallback;
  const parsed = Number(raw);
  return parsed > 0 ? Math.min(parsed, MAX_TIMER_MS) : fallback;
};

/** Every argv ends in `--` and the URL, so an input that starts with `-` is never read as an option. */
export const withUrl = (args: readonly string[], url: string): readonly string[] => [...BASE_ARGS, ...args, "--", url];

/** Last non-empty stdout line: the path `--print after_move:filepath` prints. */
export const parseDownloadedPath = (stdout: string): string | undefined =>
  stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1);

/** The error a failed run maps to when nothing more specific matched: one code per purpose. */
export const extractionError = (purpose: YtDlpPurpose, detail: string): PiTubeError => {
  if (purpose === "site_metadata") {
    return createError("SOURCE_EXTRACT_FAILED", `Failed to resolve media via yt-dlp (${detail}).`);
  }
  if (purpose === "youtube_metadata") {
    return createError("YOUTUBE_EXTRACT_FAILED", `Failed to resolve YouTube media via yt-dlp (${detail}).`);
  }
  if (purpose === "instagram_metadata") {
    return createError("INSTAGRAM_EXTRACT_FAILED", `Failed to resolve Instagram media via yt-dlp (${detail}).`);
  }
  return createError("DOWNLOAD_FAILED", `Failed to download media via yt-dlp (${detail}).`);
};

/** Maps a finished yt-dlp run to `ok(stdout)` or the error for its purpose. */
export const interpretYtDlpRun = (
  result: ProcessResult,
  purpose: YtDlpPurpose,
  input: { readonly url: string; readonly timeoutMs: number; readonly isInstagram: boolean },
): Result<string> => {
  switch (result.outcome) {
    case "not_found":
      return err(
        createError("YTDLP_NOT_FOUND", "`yt-dlp` is required to process YouTube/Instagram URLs but was not found.", {
          hint: "Install yt-dlp (`brew install yt-dlp` or `pipx install yt-dlp`) and make sure it is on PATH, or run `pi-tube setup yt-dlp`.",
        }),
      );
    case "aborted":
      return err(createError("CANCELLED", "Operation cancelled."));
    case "output_too_large":
      return err(malformedOutput());
    case "timed_out":
      return err(extractionError(purpose, `yt-dlp timed out after ${Math.round(input.timeoutMs / 1000)}s`));
    case "exited": {
      if (result.exitCode === 0) return ok(result.stdout);
      const detail =
        [result.stderr.trim(), result.stdout.trim()].filter(Boolean).join(" ").trim() || `exit code ${result.exitCode}`;
      if (/Unsupported URL|No suitable extractor found/.test(detail)) {
        return err(createError("SOURCE_UNSUPPORTED", `yt-dlp cannot read \`${input.url}\` (${detail}).`));
      }
      if (input.isInstagram && isInstagramAuthRequiredFailure(detail)) {
        return err(
          createError("INSTAGRAM_AUTH_REQUIRED", `Instagram URL requires authentication for \`${input.url}\`.`),
        );
      }
      return err(extractionError(purpose, detail));
    }
  }
};

// Date and link parsing below is ported unchanged from the pre-v3 intake (src/intake/tools/yt-dlp.ts).

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeTimestamp(value: unknown): string | undefined {
  if (typeof value !== "number" || value <= 0) {
    return undefined;
  }

  const date = new Date(value * 1000);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return date.toISOString().slice(0, 10);
}

function normalizeUploadDate(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^\d{8}$/.test(value)) {
    return undefined;
  }

  const year = Number.parseInt(value.slice(0, 4), 10);
  const month = Number.parseInt(value.slice(4, 6), 10);
  const day = Number.parseInt(value.slice(6, 8), 10);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return undefined;
  }

  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function trimLinkCandidate(value: string): string {
  let link = value.replace(/[.,;:!?]+$/g, "");

  // Strip a trailing ")" only when it is unbalanced, so URLs that legitimately
  // end in a parenthesis (e.g. "..._(planet)") are preserved.
  while (link.endsWith(")") && (link.match(/\)/g) ?? []).length > (link.match(/\(/g) ?? []).length) {
    link = link.slice(0, -1).replace(/[.,;:!?]+$/g, "");
  }

  return link;
}

function extractDescriptionLinks(description: string | undefined): string[] | undefined {
  if (!description) {
    return undefined;
  }

  const matches = description.match(/https?:\/\/[^\s<>"']+/g) ?? [];
  const seen = new Set<string>();
  const links: string[] = [];

  for (const match of matches) {
    const link = trimLinkCandidate(match);
    if (!link || seen.has(link)) {
      continue;
    }

    seen.add(link);
    links.push(link);
  }

  return links.length > 0 ? links : undefined;
}

const LIVE_STATUSES: ReadonlySet<string> = new Set(["not_live", "is_live", "is_upcoming", "was_live", "post_live"]);

const isLiveStatus = (value: unknown): value is LiveStatus => typeof value === "string" && LIVE_STATUSES.has(value);

const parseLiveStatus = (info: Record<string, unknown>): LiveStatus | undefined => {
  if (info.live_status !== undefined && info.live_status !== null) {
    return isLiveStatus(info.live_status) ? info.live_status : undefined;
  }
  if (info.is_live === true) return "is_live";
  if (info.was_live === true) return "was_live";
  return undefined;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/**
 * Sorted chapters with every end filled: a missing end takes the next chapter's start, then the duration,
 * then the chapter's own start. Entries without a numeric start, or that end before they start, are dropped.
 */
const parseChapters = (value: unknown, durationSeconds: number | undefined): Chapter[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const entries = value
    .filter(isRecord)
    .filter((entry) => isFiniteNumber(entry.start_time) && entry.start_time >= 0)
    .map((entry) => ({
      startMs: Math.round((entry.start_time as number) * 1000),
      endMs: isFiniteNumber(entry.end_time) ? Math.round(entry.end_time * 1000) : undefined,
      title: isString(entry.title) ? entry.title.trim() : undefined,
    }))
    .filter((entry) => entry.endMs === undefined || entry.endMs >= entry.startMs)
    .sort((left, right) => left.startMs - right.startMs);
  if (entries.length === 0) return undefined;
  return entries.map((entry, index) => ({
    title: entry.title ?? `Chapter ${index + 1}`,
    startMs: entry.startMs,
    endMs:
      entry.endMs ??
      entries[index + 1]?.startMs ??
      (durationSeconds === undefined ? entry.startMs : durationSeconds * 1000),
  }));
};

const isHttpUrlString = (value: unknown): value is string => {
  if (!isString(value)) return false;
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
};

/**
 * Reads the metadata pi-tube keeps from `yt-dlp --dump-single-json`. No format or media URL is needed, so a page
 * without downloadable formats still resolves. A playlist or channel is `SOURCE_UNSUPPORTED`, named by `url`.
 */
export const parseYtDlpInfo = (stdout: string, url: string): Result<MediaMetadata> => {
  let info: unknown;
  try {
    info = JSON.parse(stdout);
  } catch {
    return err(malformedOutput());
  }
  if (!isRecord(info)) return err(malformedOutput());
  if (info._type === "playlist") {
    return err(
      createError("SOURCE_UNSUPPORTED", `\`${url}\` is a playlist or channel; pi-tube takes one video at a time.`, {
        hint: "Pass the URL of a single video.",
      }),
    );
  }

  const description = isString(info.description) ? info.description : undefined;
  const durationSeconds = isFiniteNumber(info.duration) && info.duration > 0 ? Math.round(info.duration) : undefined;
  return ok({
    platform: isString(info.extractor_key) ? info.extractor_key : isString(info.extractor) ? info.extractor : "unknown",
    mediaId: isString(info.id) ? info.id : undefined,
    canonicalUrl: isHttpUrlString(info.webpage_url) ? info.webpage_url : undefined,
    title: isString(info.title) ? info.title : undefined,
    publishedAt:
      normalizeTimestamp(info.timestamp) ??
      normalizeTimestamp(info.release_timestamp) ??
      normalizeUploadDate(info.upload_date) ??
      normalizeUploadDate(info.release_date),
    description,
    descriptionLinks: extractDescriptionLinks(description),
    durationSeconds,
    liveStatus: parseLiveStatus(info),
    chapters: parseChapters(info.chapters, durationSeconds),
  });
};

export function isInstagramAuthRequiredFailure(detail: string): boolean {
  return /(login required|requires login|you need to log in|challenge_required|checkpoint_required|private content|not available due to login)/i.test(
    detail,
  );
}
