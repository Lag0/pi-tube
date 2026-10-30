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
export { ensureNotAborted, type OperationOptions, type ProgressEvent, type UseCase } from "./application/operation.ts";
export {
  type AccountDeps,
  createListProviders,
  type ProviderListing,
  type ProviderStatus,
} from "./application/providers.ts";
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
export type { ConfigStore } from "./ports/config-store.ts";
