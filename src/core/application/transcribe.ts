import type { EnvironmentVariables } from "../domain/config.ts";
import { createError, type PiTubeError } from "../domain/errors.ts";
import { normalizeLanguageTag } from "../domain/language.ts";
import { resolveLibrarySettings, sourceKeyFromInput, type TranscriptKey } from "../domain/library.ts";
import { type ProviderDescriptor, resolveCredential, selectProvider } from "../domain/providers.ts";
import { err, ok } from "../domain/result.ts";
import { isSiteSource, type ResolvedSource } from "../domain/source.ts";
import { ensureFinishedMedia } from "../domain/source-policy.ts";
import { resolveSourceSettings } from "../domain/source-settings.ts";
import { toSafeLine } from "../domain/text.ts";
import { buildOutputArtifact } from "../domain/transcript/build-artifact.ts";
import type { OutputArtifact } from "../domain/transcript/contract.ts";
import type { ConfigStore } from "../ports/config-store.ts";
import type { LibraryStore, StoredTranscript } from "../ports/library-store.ts";
import type { FetchedAudio, MediaFetcher } from "../ports/media-fetcher.ts";
import type { SttProvider } from "../ports/stt-provider.ts";
import { ensureNotAborted, type UseCase } from "./operation.ts";

/** Env var naming the default provider; wins over the config default. */
export const TRANSCRIPTION_PROVIDER_ENV = "PI_TUBE_TRANSCRIPTION_PROVIDER";
/** Env var naming the default language; wins over the config default. */
export const TRANSCRIPTION_LANGUAGE_ENV = "PI_TUBE_TRANSCRIPTION_LANGUAGE";

const ALTERNATIVE_HINT_CODES: ReadonlySet<PiTubeError["code"]> = new Set([
  "PROVIDER_RATE_LIMIT",
  "PROVIDER_UNAVAILABLE",
]);

/** Input of `transcribe`. */
export interface TranscribeInput {
  readonly input: string;
  readonly provider?: string;
  readonly language?: string;
  /** Transcribes again even when the library has this transcript; the new one is saved as `<id>-<n>`. */
  readonly force?: boolean;
  /** Which saved file the adapter reports; the library always writes both. */
  readonly format: "markdown" | "json";
}

/** Output of `transcribe`: where the transcript was saved and what it contains. */
export interface TranscribeOutput {
  readonly transcriptId: string;
  /** True when the transcript came from the library, without a provider call. */
  readonly cacheHit: boolean;
  readonly paths: StoredTranscript["paths"];
  readonly format: "markdown" | "json";
  readonly artifact: OutputArtifact;
}

/** Dependencies of `transcribe`. */
export interface TranscribeDeps {
  readonly configStore: ConfigStore;
  readonly env: EnvironmentVariables;
  readonly providers: readonly ProviderDescriptor[];
  readonly stt: Readonly<Record<string, SttProvider>>;
  readonly media: MediaFetcher;
  readonly library: LibraryStore;
  readonly now: () => Date;
}

const firstNonEmpty = (...values: ReadonlyArray<string | undefined>): string | undefined =>
  values.map((value) => value?.trim()).find((value) => value !== undefined && value.length > 0);

const sourceDetail = (source: ResolvedSource): string => {
  // The title comes from the page: the progress line is printed to the terminal.
  if (isSiteSource(source)) return toSafeLine(source.metadata.title ?? source.metadata.platform);
  return source.kind === "local_file" ? source.kind : "direct url";
};

/** On a rate limit or outage, points to the other configured providers instead of switching silently. */
const withAlternatives = (
  error: PiTubeError,
  chosen: string,
  deps: TranscribeDeps,
  config: Parameters<typeof resolveCredential>[1],
): PiTubeError => {
  if (!ALTERNATIVE_HINT_CODES.has(error.code)) return error;
  const alternatives = deps.providers
    .filter(
      (descriptor) => descriptor.id !== chosen && resolveCredential(descriptor, config, deps.env).source !== "none",
    )
    .map((descriptor) => descriptor.id);
  if (alternatives.length === 0) return error;
  return createError(error.code, error.message, {
    hint: `Retry later, or choose another configured provider: ${alternatives.join(", ")}.`,
  });
};

/**
 * Transcribes a URL or local file with one provider, never falling back to another, and saves it in the
 * library. The same source, provider, model and language is a cache hit: the saved transcript comes back
 * without downloading or paying again, unless `force`. Fetched audio is always released, also on failure and
 * cancellation.
 */
export const createTranscribe =
  (deps: TranscribeDeps): UseCase<TranscribeInput, TranscribeOutput> =>
  async (input, options) => {
    const ready = ensureNotAborted(options?.signal);
    if (!ready.success) return ready;
    const config = await deps.configStore.read();
    if (!config.success) return config;
    const settings = resolveSourceSettings(config.data, deps.env);
    if (!settings.success) return settings;

    const selected = selectProvider({
      explicit: input.provider,
      envDefault: deps.env[TRANSCRIPTION_PROVIDER_ENV],
      configDefault: config.data.defaults.provider,
      descriptors: deps.providers,
      config: config.data,
      env: deps.env,
    });
    if (!selected.success) return selected;
    const providerId = selected.data.descriptor.id;
    const provider = deps.stt[providerId];
    if (!provider) throw new Error(`No SttProvider registered for \`${providerId}\``);
    const language = firstNonEmpty(
      input.language,
      deps.env[TRANSCRIPTION_LANGUAGE_ENV],
      config.data.defaults.language,
    )?.toLowerCase();

    // A library that cannot be written fails here, before the paid provider call.
    const writable = await deps.library.prepare();
    if (!writable.success) return writable;

    const keyFor = (sourceKey: string): TranscriptKey => ({
      sourceKey,
      provider: providerId,
      model: provider.model,
      ...(language ? { language } : {}),
    });
    const hit = (stored: StoredTranscript): TranscribeOutput => {
      options?.onProgress?.({ label: "Found in library" });
      return {
        transcriptId: stored.transcriptId,
        cacheHit: true,
        paths: stored.paths,
        format: input.format,
        artifact: stored.artifact,
      };
    };

    /** Moves a page's downloaded audio into the library; if that fails, the transcription goes on without keeping it. */
    const keepFetchedAudio = async (
      fetched: FetchedAudio,
      fetchedSource: ResolvedSource,
      sourceKey: string,
    ): Promise<FetchedAudio> => {
      const { keepAudio, maxAudioBytes } = resolveLibrarySettings(config.data);
      if (!keepAudio || !isSiteSource(fetchedSource) || fetched.audio.kind !== "file") return fetched;
      const kept = await deps.library.keepAudio(sourceKey, fetched.audio.path, maxAudioBytes);
      return kept.success ? { ...fetched, audio: { kind: "file", path: kept.data } } : fetched;
    };
    // YouTube and Instagram keys come from the URL, so a cache hit, or a reuse of kept audio, runs no yt-dlp.
    const inputKey = sourceKeyFromInput(input.input);
    if (inputKey !== undefined && !input.force) {
      const early = await deps.library.find(keyFor(inputKey));
      if (!early.success) return early;
      if (early.data) return ok(hit(early.data));
    }
    const storedEarly = inputKey === undefined ? undefined : await deps.library.storedSource(inputKey);
    if (storedEarly && !storedEarly.success) return storedEarly;
    const reusedEarly = storedEarly?.data?.audioPath === undefined ? undefined : storedEarly.data;

    let source: ResolvedSource;
    if (reusedEarly) {
      source = reusedEarly.source;
    } else {
      options?.onProgress?.({ label: "Resolving source..." });
      const resolved = await deps.media.resolve(input.input, settings.data, options);
      if (!resolved.success) return resolved;
      source = resolved.data;
    }
    const finished = ensureFinishedMedia(source);
    if (!finished.success) return finished;
    const sourceKey = await deps.library.sourceKeyOf(source);
    if (!sourceKey.success) return sourceKey;
    const key = keyFor(sourceKey.data);
    if (!input.force) {
      const cached = await deps.library.find(key);
      if (!cached.success) return cached;
      if (cached.data) return ok(hit(cached.data));
    }
    // A best-effort page has no key before the resolve, but its kept audio is reused after it.
    const storedLate =
      reusedEarly || !isSiteSource(source) ? undefined : await deps.library.storedSource(sourceKey.data);
    if (storedLate && !storedLate.success) return storedLate;
    const keptAudio = reusedEarly?.audioPath ?? storedLate?.data?.audioPath;

    options?.onProgress?.({ label: "Transcribing audio...", detail: `(${sourceDetail(source)})` });
    let audio: FetchedAudio;
    if (keptAudio !== undefined) {
      audio = { audio: { kind: "file", path: keptAudio }, release: async () => {} };
    } else {
      const fetched = await deps.media.fetchAudio(source, settings.data, options);
      if (!fetched.success) return fetched;
      audio = await keepFetchedAudio(fetched.data, source, sourceKey.data);
    }

    let transcript: Awaited<ReturnType<SttProvider["transcribe"]>>;
    try {
      transcript = await provider.transcribe(
        { audio: audio.audio, apiKey: selected.data.apiKey, ...(language ? { language } : {}) },
        options,
      );
    } finally {
      await audio.release();
    }
    if (!transcript.success) return err(withAlternatives(transcript.error, providerId, deps, config.data));

    const artifact = buildOutputArtifact(
      {
        source,
        provider: providerId,
        model: provider.model,
        transcript: transcript.data.text,
        requestedLanguage: language,
        // Each provider reports the detected language in its own form; the library stores ISO 639-1.
        detectedLanguage: normalizeLanguageTag(transcript.data.detectedLanguage),
        segments: [...transcript.data.segments],
      },
      // The library keeps one canonical transcript per key, always with its timed segments.
      { generatedAt: deps.now().toISOString(), includeTimestamps: true },
    );
    options?.onProgress?.({ label: "Saving output..." });
    const saved = await deps.library.save({ key, source, artifact, fresh: input.force === true });
    if (!saved.success) return saved;
    return ok({
      transcriptId: saved.data.transcriptId,
      cacheHit: false,
      paths: saved.data.paths,
      format: input.format,
      artifact: saved.data.artifact,
    });
  };
