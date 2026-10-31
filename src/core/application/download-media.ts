import type { EnvironmentVariables } from "../domain/config.ts";
import { createError } from "../domain/errors.ts";
import { err, ok } from "../domain/result.ts";
import { classifyInput, tryParseHttpUrl } from "../domain/source-policy.ts";
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
  readonly sourceKind: "youtube" | "instagram";
  readonly media: "audio" | "video";
}

/** Dependencies of `downloadMedia`. */
export interface DownloadMediaDeps {
  readonly configStore: ConfigStore;
  readonly env: EnvironmentVariables;
  readonly media: MediaFetcher;
  readonly defaultOutputDir: string;
}

/** Downloads a YouTube or Instagram video, or its audio as mp3. */
export const createDownloadMedia =
  (deps: DownloadMediaDeps): UseCase<DownloadMediaInput, DownloadMediaOutput> =>
  async (input, options) => {
    const ready = ensureNotAborted(options?.signal);
    if (!ready.success) return ready;
    const raw = input.input.trim();
    const kind = classifyInput(raw);
    const url = tryParseHttpUrl(raw);
    if ((kind !== "youtube" && kind !== "instagram") || !url) {
      return err(createError("DOWNLOAD_FAILED", "`download` supports YouTube and Instagram URLs only."));
    }
    const config = await deps.configStore.read();
    if (!config.success) return config;
    const settings = resolveSourceSettings(config.data, deps.env);
    if (!settings.success) return settings;

    options?.onProgress?.({ label: "Downloading media...", detail: `(${input.media})` });
    const downloaded = await deps.media.download(
      { url: url.toString(), kind },
      { media: input.media, outputDir: input.outputDir ?? deps.defaultOutputDir },
      settings.data,
      options,
    );
    if (!downloaded.success) return downloaded;
    return ok({ path: downloaded.data.path, uri: downloaded.data.uri, sourceKind: kind, media: input.media });
  };
