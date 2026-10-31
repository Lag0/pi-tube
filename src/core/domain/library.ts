import type { ProviderId } from "./providers.ts";
import { tryParseHttpUrl } from "./source-policy.ts";

/** A stable key per source: `<extractor>:<id>` for pages, `url:<sha256>` and `file:<sha256>` otherwise. */
export type SourceKey = string;

/** What identifies one transcript: the same key is a cache hit. */
export interface TranscriptKey {
  readonly sourceKey: SourceKey;
  readonly provider: ProviderId;
  readonly model: string;
  /** The requested language; absent means automatic detection. */
  readonly language?: string;
}

/** The key of a page yt-dlp identified: its `extractor_key` in lowercase and its id. */
export const siteSourceKey = (platform: string, mediaId: string): SourceKey => `${platform.toLowerCase()}:${mediaId}`;

const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"]);
const INSTAGRAM_HOSTS = new Set(["instagram.com", "www.instagram.com", "m.instagram.com"]);
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const INSTAGRAM_CODE = /^[A-Za-z0-9_-]+$/;

const youtubeIdOf = (url: URL, host: string): string | undefined => {
  if (host === "youtu.be" || host === "www.youtu.be") return url.pathname.split("/")[1];
  if (!YOUTUBE_HOSTS.has(host)) return undefined;
  const [, section, id] = url.pathname.split("/");
  if (section === "watch") return url.searchParams.get("v") ?? undefined;
  return section === "shorts" || section === "live" || section === "embed" ? id : undefined;
};

/**
 * The key of a YouTube or Instagram URL, read from the URL alone, so a cache lookup needs no yt-dlp run. It is
 * the key `siteSourceKey` gives for the same video after the resolve. Any other input has none.
 */
export const sourceKeyFromInput = (input: string): SourceKey | undefined => {
  const url = tryParseHttpUrl(input.trim());
  if (!url) return undefined;
  const host = url.hostname.toLowerCase();
  const youtubeId = youtubeIdOf(url, host);
  if (youtubeId !== undefined) return YOUTUBE_ID.test(youtubeId) ? siteSourceKey("Youtube", youtubeId) : undefined;
  if (!INSTAGRAM_HOSTS.has(host)) return undefined;
  const [, section, code] = url.pathname.split("/");
  const isPost = section === "p" || section === "reel" || section === "tv";
  return isPost && code !== undefined && INSTAGRAM_CODE.test(code) ? siteSourceKey("Instagram", code) : undefined;
};

/** The text a library hashes into a `TranscriptId`. */
export const transcriptKeyText = (key: TranscriptKey): string =>
  [key.sourceKey, key.provider, key.model, key.language ?? "auto"].join("\n");

/** The text a name search compares: lowercase, without accents. */
const foldForSearch = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .toLowerCase();

/** The name fields of a library entry, as `matchesName` sees them. */
export interface NamedEntry {
  readonly title?: string;
  readonly sourceName?: string;
  readonly platform?: string;
  readonly sourceKey: SourceKey;
}

/**
 * A search by name, not by content: every term of `query` must appear in the title, the file name or URL, the
 * platform or the source key, ignoring case and accents.
 */
export const matchesName = (entry: NamedEntry, query: string): boolean => {
  const haystack = foldForSearch([entry.title, entry.sourceName, entry.platform, entry.sourceKey].join(" "));
  const terms = foldForSearch(query).split(/\s+/).filter(Boolean);
  return terms.length > 0 && terms.every((term) => haystack.includes(term));
};
