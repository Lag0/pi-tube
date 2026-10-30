/**
 * Public surface of the pi-tube core. Adapters (CLI, MCP) import from here only; see each
 * definition for its documentation.
 */

export {
  createLoginProvider,
  createLogoutProvider,
  type LoginInput,
  type LoginOutput,
  type LogoutInput,
  type LogoutOutput,
} from "./application/auth.ts";
export {
  type ConfigDeps,
  type ConfigValue,
  type ConfigValueSet,
  type ConfigValues,
  createGetConfigValue,
  createListConfigValues,
  createSetConfigValue,
} from "./application/config.ts";
export {
  createDownloadMedia,
  type DownloadMediaInput,
  type DownloadMediaOutput,
} from "./application/download-media.ts";
export { ensureNotAborted, type OperationOptions, type ProgressEvent, type UseCase } from "./application/operation.ts";
export {
  type AccountDeps,
  createListProviders,
  type ProviderListing,
  type ProviderStatus,
} from "./application/providers.ts";
export {
  createTranscribe,
  TRANSCRIPTION_LANGUAGE_ENV,
  TRANSCRIPTION_PROVIDER_ENV,
  type TranscribeDeps,
  type TranscribeInput,
  type TranscribeOutput,
} from "./application/transcribe.ts";
export {
  CONFIG_VERSION,
  configKeysFor,
  DEFAULT_CONFIG,
  type EnvironmentVariables,
  type PiTubeConfig,
  type ProviderConfig,
} from "./domain/config.ts";
export {
  createError,
  type ErrorCategory,
  type ErrorCode,
  getErrorCategory,
  isErrorCode,
  type PiTubeError,
  toPiTubeError,
} from "./domain/errors.ts";
export {
  findProvider,
  type KeySource,
  type ProviderDescriptor,
  type ProviderId,
  type ProviderPositioning,
  type ResolvedCredential,
  resolveCredential,
} from "./domain/providers.ts";
export { err, type Failure, ok, type Result, type Success } from "./domain/result.ts";
export type { AudioInput, ResolvedSource } from "./domain/source.ts";
export type { OutputArtifact } from "./domain/transcript/contract.ts";
export type { ConfigStore } from "./ports/config-store.ts";
export type {
  DownloadedMedia,
  DownloadRequest,
  DownloadTarget,
  FetchedAudio,
  MediaFetcher,
} from "./ports/media-fetcher.ts";
export type { SttCapabilities, SttProvider, SttRequest, SttTranscript } from "./ports/stt-provider.ts";
export type { SavedTranscript, TranscriptStore } from "./ports/transcript-store.ts";
