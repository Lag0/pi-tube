import type { PiTubeError } from "../domain/errors.ts";
import type { OperationOptions } from "../domain/operation.ts";
import type { Result } from "../domain/result.ts";
import type { AudioInput, ResolvedSource, SiteSource } from "../domain/source.ts";
import type { SourceSettings } from "../domain/source-settings.ts";

/** Audio ready for a provider; `release` deletes any temporary file and is safe to call once. */
export interface FetchedAudio {
  readonly audio: AudioInput;
  readonly release: () => Promise<void>;
}

export interface DownloadRequest {
  readonly media: "audio" | "video";
  readonly outputDir: string;
}

export interface DownloadedMedia {
  readonly path: string;
  readonly uri: string;
}

/** Whether a tool is on PATH, and the version it reports. */
export interface ToolVersion {
  readonly found: boolean;
  readonly version?: string;
  /** Set when the tool is on PATH but cannot start, with the error code (EACCES, EPERM). */
  readonly cannotRun?: string;
}

/** What `inspect` finds: the media tools and whether the cookies file can be used. */
export interface MediaToolsReport {
  readonly ytDlp: ToolVersion;
  readonly ffmpeg: ToolVersion;
  /** "none": no cookies file set; "ok": set and readable; otherwise the reason it cannot be used. */
  readonly cookies: "none" | "ok" | PiTubeError;
}

/** Resolves inputs into sources, fetches their audio and downloads media, under the caller's source settings. */
export interface MediaFetcher {
  resolve(input: string, settings: SourceSettings, options?: OperationOptions): Promise<Result<ResolvedSource>>;
  fetchAudio(
    source: ResolvedSource,
    settings: SourceSettings,
    options?: OperationOptions,
  ): Promise<Result<FetchedAudio>>;
  download(
    source: SiteSource,
    request: DownloadRequest,
    settings: SourceSettings,
    options?: OperationOptions,
  ): Promise<Result<DownloadedMedia>>;
  /** yt-dlp and ffmpeg on PATH (with versions) and whether the cookies file can be used; never returns the path. */
  inspect(settings: SourceSettings, options?: OperationOptions): Promise<Result<MediaToolsReport>>;
}
