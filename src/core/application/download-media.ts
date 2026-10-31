import type { EnvironmentVariables } from "../domain/config.ts";
import { createError } from "../domain/errors.ts";
import { err, ok } from "../domain/result.ts";
import { isSiteSource, type SiteKind } from "../domain/source.ts";
import { classifyInput } from "../domain/source-policy.ts";
import { resolveSourceSettings } from "../domain/source-settings.ts";
import type { ConfigStore } from "../ports/config-store.ts";
import type { MediaFetcher } from "../ports/media-fetcher.ts";
import { ensureNotAborted, type UseCase } from "./operation.ts";

/** Input of `downloadMedia`. A missing `outputDir` means the default downloads directory, never the cwd. */
export interface DownloadMediaInput {
  readonly input: string;
  readonly media: "audio" | "video";
  readonly outputDir?: string;
}

/** Output of `downloadMedia`. */
export interface DownloadMediaOutput {
  readonly path: string;
  readonly uri: string;
  readonly sourceKind: SiteKind;
  readonly media: "audio" | "video";
}

/** Dependencies of `downloadMedia`. */
export interface DownloadMediaDeps {
  readonly configStore: ConfigStore;
  readonly env: EnvironmentVariables;
  readonly media: MediaFetcher;
  readonly defaultOutputDir: string;
}

const NOT_A_PAGE =
  "`download` takes a page URL that yt-dlp supports; direct media URLs and local files are already files.";

/** Downloads the video of a page yt-dlp supports, or its audio as mp3, after resolving the page. */
export const createDownloadMedia =
  (deps: DownloadMediaDeps): UseCase<DownloadMediaInput, DownloadMediaOutput> =>
  async (input, options) => {
    const ready = ensureNotAborted(options?.signal);
    if (!ready.success) return ready;
    const kind = classifyInput(input.input.trim());
    if (kind === "direct_url" || kind === "local_file") return err(createError("DOWNLOAD_FAILED", NOT_A_PAGE));
    const config = await deps.configStore.read();
    if (!config.success) return config;
    const settings = resolveSourceSettings(config.data, deps.env);
    if (!settings.success) return settings;

    options?.onProgress?.({ label: "Resolving source..." });
    const source = await deps.media.resolve(input.input, settings.data, options);
    if (!source.success) return source;
    if (!isSiteSource(source.data)) return err(createError("DOWNLOAD_FAILED", NOT_A_PAGE));

    options?.onProgress?.({ label: "Downloading media...", detail: `(${input.media})` });
    const downloaded = await deps.media.download(
      source.data,
      { media: input.media, outputDir: input.outputDir ?? deps.defaultOutputDir },
      settings.data,
      options,
    );
    if (!downloaded.success) return downloaded;
    return ok({
      path: downloaded.data.path,
      uri: downloaded.data.uri,
      sourceKind: source.data.kind,
      media: input.media,
    });
  };
