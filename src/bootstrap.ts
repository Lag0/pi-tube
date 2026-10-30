import {
  handleBaselineInput,
  handleDownloadCommand,
  type ProgressStep,
  persistBaselineIntakeResult,
} from "./cli/handlers.ts";
import {
  type ConfigValue,
  type ConfigValueSet,
  type ConfigValues,
  createGetConfigValue,
  createListConfigValues,
  createListProviders,
  createLoginProvider,
  createLogoutProvider,
  createSetConfigValue,
  type EnvironmentVariables,
  type LoginInput,
  type LoginOutput,
  type LogoutInput,
  type LogoutOutput,
  type ProviderListing,
  type UseCase,
} from "./core/index.ts";
import { CliError } from "./errors/cli-errors.ts";
import { createFileConfigStore } from "./infrastructure/config/file-config-store.ts";
import { resolvePiTubePaths } from "./infrastructure/paths.ts";
import { PROVIDER_DESCRIPTORS } from "./infrastructure/stt/registry.ts";

/** The process facts the app is built from; tests pass a hermetic copy. */
export interface AppEnvironment {
  readonly env: EnvironmentVariables;
  readonly cwd: string;
  readonly homedir: () => string;
}

/** Where a legacy command wrote its file. */
export interface LegacyOutput {
  readonly outputPath: string;
  readonly outputUri: string;
}

export interface LegacyTranscribeRequest {
  readonly input: string;
  readonly extraPositionals: string[];
  readonly provider?: string;
  readonly language?: string;
  readonly json: boolean;
  readonly timestamps: boolean;
  readonly onProgress?: (step: ProgressStep) => void;
}

export interface LegacyDownloadRequest {
  readonly input?: string;
  readonly extraPositionals: string[];
  readonly audio: boolean;
  readonly outputDir?: string;
  readonly onProgress?: (step: ProgressStep) => void;
}

/** Transcribe and download on the pre-v3 pipeline; phase 1b replaces both with core use cases. Failures throw. */
export interface LegacyPipeline {
  transcribe(request: LegacyTranscribeRequest): Promise<LegacyOutput>;
  download(request: LegacyDownloadRequest): Promise<LegacyOutput>;
}

/** The composition root's product: everything an adapter may call. */
export interface App {
  readonly listProviders: UseCase<Record<string, never>, ProviderListing>;
  readonly loginProvider: UseCase<LoginInput, LoginOutput>;
  readonly logoutProvider: UseCase<LogoutInput, LogoutOutput>;
  readonly getConfigValue: UseCase<{ readonly key: string }, ConfigValue>;
  readonly setConfigValue: UseCase<{ readonly key: string; readonly value: string }, ConfigValueSet>;
  readonly listConfigValues: UseCase<Record<string, never>, ConfigValues>;
  readonly legacy: LegacyPipeline;
}

/** Wires the core, the infrastructure and the legacy pipeline for one environment. */
export const createApp = (environment: AppEnvironment): App => {
  const { env, cwd } = environment;
  const configStore = createFileConfigStore(resolvePiTubePaths(environment).configFile);
  const accountDeps = { configStore, env, providers: PROVIDER_DESCRIPTORS };
  const configDeps = { configStore, providers: PROVIDER_DESCRIPTORS };

  const legacy: LegacyPipeline = {
    transcribe: async ({ onProgress, ...request }) => {
      const config = await configStore.read();
      if (!config.success) {
        throw new CliError(config.error.message, { code: config.error.code, guidance: [config.error.hint] });
      }
      const result = await handleBaselineInput({ ...request, config: config.data, env, onProgress });
      onProgress?.({ label: "Saving output..." });
      return persistBaselineIntakeResult(result, { env, cwd });
    },
    download: async (request) => {
      const { outputPath, outputUri } = await handleDownloadCommand({ ...request, env, cwd });
      return { outputPath, outputUri };
    },
  };

  return {
    listProviders: createListProviders(accountDeps),
    loginProvider: createLoginProvider(accountDeps),
    logoutProvider: createLogoutProvider(accountDeps),
    getConfigValue: createGetConfigValue(configDeps),
    setConfigValue: createSetConfigValue(configDeps),
    listConfigValues: createListConfigValues(configDeps),
    legacy,
  };
};
