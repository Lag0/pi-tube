/**
 * Public surface of the pi-tube core. Adapters (CLI, MCP) import from here only; see each
 * definition for its documentation.
 */

export {
  type AuditListInput,
  type AuditPage,
  type AuditStatsInput,
  type AuditStatsOutput,
  createAuditStats,
  createQueryAudit,
} from "./application/audit.ts";
export { type AuditNote, type AuditTrail, type AuditTrailDeps, beginAudit } from "./application/audit-trail.ts";
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
  createRunDoctor,
  type DoctorCheck,
  type DoctorDeps,
  type DoctorReport,
  type DoctorStatus,
} from "./application/doctor.ts";
export {
  createDownloadMedia,
  type DownloadMediaDeps,
  type DownloadMediaInput,
  type DownloadMediaOutput,
} from "./application/download-media.ts";
export { createGetMediaInfo, type GetMediaInfoDeps } from "./application/get-media-info.ts";
export { createImportV2Transcripts, type ImportV2Deps, type ImportV2Input } from "./application/import-v2.ts";
export {
  checkLibraryFilter,
  createGetTranscript,
  createListTranscripts,
  createPruneLibrary,
  createReadTranscript,
  createSearchTranscripts,
  type LibraryDeps,
  type LibraryPage,
  type ListTranscriptsInput,
  MAX_PAGE_LIMIT,
  type PruneInput,
  type ReadTranscriptInput,
  type SearchTranscriptsInput,
} from "./application/library.ts";
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
  AUDIT_OPERATIONS,
  type AuditAdapter,
  type AuditCost,
  type AuditGroup,
  type AuditOperation,
  type AuditQuery,
  type AuditRecord,
  type AuditStats,
  type AuditVersions,
  auditRecordToLine,
  DEFAULT_AUDIT_RETENTION_MONTHS,
  PRICE_TABLE_DATE,
} from "./domain/audit.ts";
export {
  CONFIG_VERSION,
  type ConfigScalar,
  configKeysFor,
  DEFAULT_CONFIG,
  DEFAULT_MCP_MAX_FULL_CHARS,
  type EnvironmentVariables,
  type PiTubeConfig,
  type ProviderConfig,
  resolveMcpSettings,
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
export { normalizeLanguageTag, sameLanguage } from "./domain/language.ts";
export {
  type LibraryFilter,
  type LibrarySettings,
  matchesLibraryFilter,
  matchesName,
  type NamedEntry,
  resolveLibrarySettings,
  type SourceKey,
  siteSourceKey,
  sourceKeyFromInput,
  type TranscriptKey,
} from "./domain/library.ts";
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
  SOURCE_KINDS,
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
export { estimateTokens, toSafeLine } from "./domain/text.ts";
export type { OutputArtifact } from "./domain/transcript/contract.ts";
export {
  type ImportSummary,
  parseV2Transcript,
  V2_FILE_NAME,
  V2_MODELS,
  type V2Source,
  type V2SourceKind,
  type V2Transcript,
  v2SourceOf,
} from "./domain/transcript/parse-v2.ts";
export {
  MAX_SEGMENT_PAGE,
  MAX_TEXT_PAGE_CHARS,
  pageTranscript,
  type TranscriptPage,
  type TranscriptReadRequest,
} from "./domain/transcript/read.ts";
export { type JsonOutputArtifact, toJsonOutputArtifact } from "./domain/transcript/render-json.ts";
export { sourceReferenceOf } from "./domain/transcript/render-markdown.ts";
export type { AuditLog, AuditReadout } from "./ports/audit-log.ts";
export type { ConfigStore } from "./ports/config-store.ts";
export type { LegacyTranscriptFile, LegacyTranscriptScan, LegacyTranscripts } from "./ports/legacy-transcripts.ts";
export type {
  LibraryEntry,
  LibraryStore,
  PruneReport,
  PruneRequest,
  StoredSource,
  StoredTranscript,
} from "./ports/library-store.ts";
export type {
  DownloadedMedia,
  DownloadRequest,
  FetchedAudio,
  MediaFetcher,
  MediaToolsReport,
  ToolVersion,
} from "./ports/media-fetcher.ts";
export type { SttCapabilities, SttProvider, SttRequest, SttTranscript } from "./ports/stt-provider.ts";
