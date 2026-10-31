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
  type DownloadMediaDeps,
  type DownloadMediaInput,
  type DownloadMediaOutput,
} from "./application/download-media.ts";
export { createGetMediaInfo, type GetMediaInfoDeps } from "./application/get-media-info.ts";
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
  type ConfigScalar,
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
export { type SourceKey, siteSourceKey, sourceKeyFromInput, type TranscriptKey } from "./domain/library.ts";
export { describeSource, type MediaInfo } from "./domain/media-info.ts";
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
export {
  type AudioInput,
  type Chapter,
  type DirectUrlSource,
  isSiteSource,
  type LiveStatus,
  type LocalFileSource,
  type MediaMetadata,
  type ResolvedSource,
  type SiteKind,
  type SiteSource,
  type SourceKind,
  type SourceTier,
} from "./domain/source.ts";
export { tierOf } from "./domain/source-policy.ts";
export {
  COOKIES_FILE_ENV,
  DEFAULT_MAX_LOCAL_FILE_BYTES,
  MAX_LOCAL_FILE_BYTES_LIMIT,
  resolveSourceSettings,
  type SourceSettings,
} from "./domain/source-settings.ts";
export { toSafeLine } from "./domain/text.ts";
export type { OutputArtifact } from "./domain/transcript/contract.ts";
export { sourceReferenceOf } from "./domain/transcript/render-markdown.ts";
export type { ConfigStore } from "./ports/config-store.ts";
export type { LibraryEntry, LibraryStore, StoredTranscript } from "./ports/library-store.ts";
export type {
  DownloadedMedia,
  DownloadRequest,
  FetchedAudio,
  MediaFetcher,
} from "./ports/media-fetcher.ts";
export type { SttCapabilities, SttProvider, SttRequest, SttTranscript } from "./ports/stt-provider.ts";
export type { SavedTranscript, TranscriptStore } from "./ports/transcript-store.ts";
