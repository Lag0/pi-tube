import type { EnvironmentVariables } from "../domain/config.ts";
import { createError, type PiTubeError } from "../domain/errors.ts";
import { type ProviderDescriptor, resolveCredential, selectProvider } from "../domain/providers.ts";
import { err, ok } from "../domain/result.ts";
import type { ResolvedSource } from "../domain/source.ts";
import { resolveSourceSettings } from "../domain/source-settings.ts";
import { buildOutputArtifact } from "../domain/transcript/build-artifact.ts";
import type { OutputArtifact } from "../domain/transcript/contract.ts";
import { transcriptFileName } from "../domain/transcript/file-name.ts";
import { renderJson } from "../domain/transcript/render-json.ts";
import { renderMarkdown } from "../domain/transcript/render-markdown.ts";
import type { ConfigStore } from "../ports/config-store.ts";
import type { MediaFetcher } from "../ports/media-fetcher.ts";
import type { SttProvider } from "../ports/stt-provider.ts";
import type { SavedTranscript, TranscriptStore } from "../ports/transcript-store.ts";
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
  readonly timestamps: boolean;
  readonly format: "markdown" | "json";
}

/** Output of `transcribe`: where the transcript was saved and what it contains. */
export interface TranscribeOutput {
  readonly saved: SavedTranscript;
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
  readonly store: TranscriptStore;
  readonly now: () => Date;
}

const firstNonEmpty = (...values: ReadonlyArray<string | undefined>): string | undefined =>
  values.map((value) => value?.trim()).find((value) => value !== undefined && value.length > 0);

const sourceDetail = (source: ResolvedSource): string => {
  if (source.kind === "youtube" || source.kind === "instagram") return source.title ?? source.kind;
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
 * Transcribes a URL or local file with one provider, never falling back to another, and saves the
 * rendered transcript. Fetched audio is always released, also on failure and cancellation.
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

    // A bad output dir fails here, before the paid provider call.
    const writable = await deps.store.prepare();
    if (!writable.success) return writable;

    options?.onProgress?.({ label: "Resolving source..." });
    const source = await deps.media.resolve(input.input, settings.data, options);
    if (!source.success) return source;
    options?.onProgress?.({ label: "Transcribing audio...", detail: `(${sourceDetail(source.data)})` });
    const audio = await deps.media.fetchAudio(source.data, settings.data, options);
    if (!audio.success) return audio;

    let transcript: Awaited<ReturnType<SttProvider["transcribe"]>>;
    try {
      transcript = await provider.transcribe(
        { audio: audio.data.audio, apiKey: selected.data.apiKey, ...(language ? { language } : {}) },
        options,
      );
    } finally {
      await audio.data.release();
    }
    if (!transcript.success) return err(withAlternatives(transcript.error, providerId, deps, config.data));

    const artifact = buildOutputArtifact(
      {
        source: source.data,
        provider: providerId,
        transcript: transcript.data.text,
        requestedLanguage: language,
        detectedLanguage: transcript.data.detectedLanguage,
        segments: [...transcript.data.segments],
      },
      { generatedAt: deps.now().toISOString(), includeTimestamps: input.timestamps },
    );
    options?.onProgress?.({ label: "Saving output..." });
    const saved = await deps.store.save({
      fileName: transcriptFileName({ artifact, now: deps.now(), format: input.format }),
      content: input.format === "json" ? renderJson(artifact) : renderMarkdown(artifact),
    });
    if (!saved.success) return saved;
    return ok({ saved: saved.data, format: input.format, artifact });
  };
