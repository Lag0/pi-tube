import type { SourceClassification } from "./source.ts";

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

export function classifyInput(input: string): SourceClassification {
  if (isYouTubeUrl(input)) {
    return "youtube";
  }

  if (isInstagramPublicUrl(input)) {
    return "instagram";
  }

  if (isHttpUrl(input)) {
    return isDirectMediaUrl(input) ? "direct_url" : "unsupported_url";
  }

  return "local_file";
}
