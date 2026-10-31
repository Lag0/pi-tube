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
}
