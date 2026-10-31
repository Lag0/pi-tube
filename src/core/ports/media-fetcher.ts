import type { OperationOptions } from "../domain/operation.ts";
import type { Result } from "../domain/result.ts";
import type { AudioInput, ResolvedSource } from "../domain/source.ts";

/** Audio ready for a provider; `release` deletes any temporary file and is safe to call once. */
export interface FetchedAudio {
  readonly audio: AudioInput;
  readonly release: () => Promise<void>;
}

/** A page URL that yt-dlp can download. */
export interface DownloadTarget {
  readonly url: string;
  readonly kind: "youtube" | "instagram";
}

export interface DownloadRequest {
  readonly media: "audio" | "video";
  readonly outputDir: string;
}

export interface DownloadedMedia {
  readonly path: string;
  readonly uri: string;
}

/** Resolves inputs into sources, fetches their audio and downloads media. */
export interface MediaFetcher {
  resolve(input: string, options?: OperationOptions): Promise<Result<ResolvedSource>>;
  fetchAudio(source: ResolvedSource, options?: OperationOptions): Promise<Result<FetchedAudio>>;
  download(
    target: DownloadTarget,
    request: DownloadRequest,
    options?: OperationOptions,
  ): Promise<Result<DownloadedMedia>>;
}
