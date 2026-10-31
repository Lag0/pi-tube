import path from "node:path";
import { pathToFileURL } from "node:url";
import { createError, type PiTubeError } from "../../src/core/domain/errors.ts";
import { err, ok } from "../../src/core/domain/result.ts";
import type { AudioInput, ResolvedSource } from "../../src/core/domain/source.ts";
import type { DownloadRequest, DownloadTarget, MediaFetcher } from "../../src/core/ports/media-fetcher.ts";
import { waitForAbort } from "./fake-stt.ts";

export interface FakeMediaOptions {
  readonly source?: ResolvedSource;
  readonly resolveError?: PiTubeError;
  readonly audio?: AudioInput;
  readonly audioError?: PiTubeError;
  readonly downloadPath?: string;
  readonly downloadError?: PiTubeError;
  readonly waitForAbort?: "fetchAudio" | "download";
}

export interface FakeMedia {
  readonly fetcher: MediaFetcher;
  readonly calls: {
    readonly resolve: string[];
    readonly fetchAudio: ResolvedSource[];
    readonly download: Array<{ target: DownloadTarget; request: DownloadRequest }>;
  };
  /** How many times a fetched audio was released. */
  readonly released: () => number;
}

const directSource = (input: string): ResolvedSource => ({
  kind: "direct_url",
  originalInput: input,
  normalizedUrl: input,
  mediaUrl: input,
  extension: path.extname(new URL(input).pathname).slice(1) || "mp3",
});

const cancelled = (): PiTubeError => createError("CANCELLED", "Operation cancelled.");

/** A `MediaFetcher` that answers from `options` and records its calls; never runs yt-dlp. */
export const createFakeMediaFetcher = (options: FakeMediaOptions = {}): FakeMedia => {
  const calls: FakeMedia["calls"] = { resolve: [], fetchAudio: [], download: [] };
  let released = 0;
  const fetcher: MediaFetcher = {
    resolve: async (input) => {
      calls.resolve.push(input);
      if (options.resolveError) return err(options.resolveError);
      return ok(options.source ?? directSource(input));
    },
    fetchAudio: async (source, operation) => {
      calls.fetchAudio.push(source);
      if (options.waitForAbort === "fetchAudio") {
        await waitForAbort(operation?.signal);
        return err(cancelled());
      }
      if (options.audioError) return err(options.audioError);
      const audio: AudioInput =
        options.audio ??
        (source.kind === "local_file"
          ? { kind: "file", path: source.absolutePath }
          : { kind: "url", url: source.mediaUrl });
      return ok({
        audio,
        release: async () => {
          released += 1;
        },
      });
    },
    download: async (target, request, operation) => {
      calls.download.push({ target, request });
      if (options.waitForAbort === "download") {
        await waitForAbort(operation?.signal);
        return err(cancelled());
      }
      if (options.downloadError) return err(options.downloadError);
      const file = options.downloadPath ?? path.join(request.outputDir, "media.mp4");
      return ok({ path: file, uri: pathToFileURL(file).href });
    },
  };
  return { fetcher, calls, released: () => released };
};
