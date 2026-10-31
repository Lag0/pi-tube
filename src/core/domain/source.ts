/** What an input is: a page yt-dlp reads (`youtube`, `instagram`, any other `site`), a direct media URL or a local file. */
export type SourceKind = "youtube" | "instagram" | "site" | "direct_url" | "local_file";

/** The kinds that are pages yt-dlp reads. */
export type SiteKind = "youtube" | "instagram" | "site";

/** `tested` kinds have contract tests and rich metadata; `best_effort` is any other site yt-dlp supports. */
export type SourceTier = "tested" | "best_effort";

/** yt-dlp's `live_status`: `post_live` is a stream that ended but whose recording is still being processed. */
export type LiveStatus = "not_live" | "is_live" | "is_upcoming" | "was_live" | "post_live";

/** A chapter of a video, in milliseconds. */
export interface Chapter {
  readonly title: string;
  readonly startMs: number;
  readonly endMs: number;
}

/** What yt-dlp reports about a page; every field but `platform` is optional. Titles and descriptions are untrusted. */
export interface MediaMetadata {
  /** yt-dlp `extractor_key`, such as `Youtube`, `Vimeo` or `Generic`. */
  readonly platform: string;
  readonly mediaId?: string;
  /** yt-dlp `webpage_url`. */
  readonly canonicalUrl?: string;
  readonly title?: string;
  /** `YYYY-MM-DD`. */
  readonly publishedAt?: string;
  readonly description?: string;
  readonly descriptionLinks?: readonly string[];
  readonly durationSeconds?: number;
  readonly liveStatus?: LiveStatus;
  readonly chapters?: readonly Chapter[];
}

/** A page yt-dlp reads; `normalizedUrl` is the input URL, which is what yt-dlp is given later. */
export interface SiteSource {
  readonly kind: SiteKind;
  readonly originalInput: string;
  readonly normalizedUrl: string;
  readonly metadata: MediaMetadata;
}

/** A URL that points straight at a media file; the provider fetches it. */
export interface DirectUrlSource {
  readonly kind: "direct_url";
  readonly originalInput: string;
  readonly normalizedUrl: string;
  readonly mediaUrl: string;
  readonly extension: string;
}

/** A media file on this machine. */
export interface LocalFileSource {
  readonly kind: "local_file";
  readonly originalInput: string;
  readonly absolutePath: string;
  readonly extension: string;
}

/** An input after `MediaFetcher.resolve`. */
export type ResolvedSource = SiteSource | DirectUrlSource | LocalFileSource;

/** Tells whether `source` is a page yt-dlp reads. */
export const isSiteSource = (source: ResolvedSource): source is SiteSource =>
  source.kind === "youtube" || source.kind === "instagram" || source.kind === "site";

/** Audio handed to a speech-to-text provider: a local file or a URL the provider fetches itself. */
export type AudioInput =
  | { readonly kind: "file"; readonly path: string }
  | { readonly kind: "url"; readonly url: string };
