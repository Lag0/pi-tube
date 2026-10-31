import { createError } from "./errors.ts";
import { err, ok, type Result } from "./result.ts";
import { isSiteSource, type LiveStatus, type ResolvedSource, type SourceKind, type SourceTier } from "./source.ts";

// Pure source rules: no I/O and no node:path, so the domain stays portable.

export const SUPPORTED_MEDIA_EXTENSIONS = new Set([
  "mp4",
  "mov",
  "m4v",
  "m4a",
  "mp3",
  "wav",
  "webm",
  "ogg",
  "oga",
  "opus",
  "flac",
  "aac",
]);

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "www.youtu.be",
]);

const INSTAGRAM_HOSTS = new Set(["instagram.com", "www.instagram.com", "m.instagram.com"]);

export function tryParseHttpUrl(input: string): URL | null {
  try {
    const url = new URL(input);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

export function isHttpUrl(input: string): boolean {
  return tryParseHttpUrl(input) !== null;
}

export function isYouTubeUrl(input: string): boolean {
  const url = tryParseHttpUrl(input);
  if (!url) {
    return false;
  }

  if (!YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) {
    return false;
  }

  return url.pathname.length > 1 || url.searchParams.has("v");
}

export function isInstagramPublicUrl(input: string | URL): boolean {
  const url = typeof input === "string" ? tryParseHttpUrl(input) : input;
  if (!url) {
    return false;
  }

  if (!INSTAGRAM_HOSTS.has(url.hostname.toLowerCase())) {
    return false;
  }

  const path = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
  return path.startsWith("/p/") || path.startsWith("/reel/") || path.startsWith("/tv/");
}

export function getMediaExtensionFromPathname(pathname: string): string | null {
  const parsedPath = pathname.split("?")[0]?.split("#")[0] ?? "";
  const base = parsedPath.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) {
    return null;
  }

  return base.slice(dot + 1).toLowerCase();
}

export function isSupportedMediaExtension(extension: string): boolean {
  return SUPPORTED_MEDIA_EXTENSIONS.has(extension.toLowerCase());
}

export function isDirectMediaUrl(input: string | URL): boolean {
  const url = typeof input === "string" ? tryParseHttpUrl(input) : input;
  if (!url) {
    return false;
  }

  const extension = getMediaExtensionFromPathname(url.pathname);
  if (!extension) {
    return false;
  }

  return isSupportedMediaExtension(extension);
}

export function normalizeDirectMediaUrl(input: URL): string {
  const url = new URL(input.toString());
  url.hash = "";
  return url.toString();
}

export function getLocalFileExtension(filePath: string): string | null {
  const extension = getMediaExtensionFromPathname(filePath);
  if (!extension) {
    return null;
  }

  return isSupportedMediaExtension(extension) ? extension : null;
}

/** Any http(s) URL that is not YouTube, Instagram or a direct media URL is a `site` for yt-dlp to try. */
export function classifyInput(input: string): SourceKind {
  if (isYouTubeUrl(input)) {
    return "youtube";
  }

  if (isInstagramPublicUrl(input)) {
    return "instagram";
  }

  if (isHttpUrl(input)) {
    return isDirectMediaUrl(input) ? "direct_url" : "site";
  }

  return "local_file";
}

/** Live statuses whose media is not complete yet; `post_live` formats hold only the last ~2 hours. */
export const LIVE_NOT_ENDED_STATUSES: readonly LiveStatus[] = ["is_live", "is_upcoming", "post_live"];

/** Refuses a live stream that has not ended (or whose recording is still processing), before any download or paid call. */
export const ensureFinishedMedia = (source: ResolvedSource): Result<void> => {
  if (!isSiteSource(source)) return ok(undefined);
  const status = source.metadata.liveStatus;
  if (status === undefined || !LIVE_NOT_ENDED_STATUSES.includes(status)) return ok(undefined);
  const name = source.metadata.title ?? source.normalizedUrl;
  const message =
    status === "post_live"
      ? `\`${name}\` is a live stream whose recording is still being processed (live_status=post_live).`
      : `\`${name}\` is a live stream that has not ended (live_status=${status}).`;
  return err(createError("SOURCE_LIVE_NOT_ENDED", message));
};

/** Only `site` is best-effort; the other kinds have contract tests. */
export const tierOf = (kind: SourceKind): SourceTier => (kind === "site" ? "best_effort" : "tested");
