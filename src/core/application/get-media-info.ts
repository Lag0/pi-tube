import type { EnvironmentVariables } from "../domain/config.ts";
import { describeSource, type MediaInfo } from "../domain/media-info.ts";
import { ok } from "../domain/result.ts";
import { resolveSourceSettings } from "../domain/source-settings.ts";
import type { ConfigStore } from "../ports/config-store.ts";
import type { MediaFetcher } from "../ports/media-fetcher.ts";
import { ensureNotAborted, type UseCase } from "./operation.ts";

/** Dependencies of `getMediaInfo`. */
export interface GetMediaInfoDeps {
  readonly configStore: ConfigStore;
  readonly env: EnvironmentVariables;
  readonly media: MediaFetcher;
}

/** Resolves an input and describes it, without downloading or transcribing; a live stream is not refused. */
export const createGetMediaInfo =
  (deps: GetMediaInfoDeps): UseCase<{ readonly input: string }, MediaInfo> =>
  async (input, options) => {
    const ready = ensureNotAborted(options?.signal);
    if (!ready.success) return ready;
    const config = await deps.configStore.read();
    if (!config.success) return config;
    const settings = resolveSourceSettings(config.data, deps.env);
    if (!settings.success) return settings;

    options?.onProgress?.({ label: "Resolving source..." });
    const source = await deps.media.resolve(input.input, settings.data, options);
    if (!source.success) return source;
    return ok(describeSource(source.data));
  };
