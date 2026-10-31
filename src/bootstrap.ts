import {
  type ConfigValue,
  type ConfigValueSet,
  type ConfigValues,
  createDownloadMedia,
  createGetConfigValue,
  createListConfigValues,
  createListProviders,
  createLoginProvider,
  createLogoutProvider,
  createSetConfigValue,
  createTranscribe,
  type DownloadMediaInput,
  type DownloadMediaOutput,
  type EnvironmentVariables,
  type LoginInput,
  type LoginOutput,
  type LogoutInput,
  type LogoutOutput,
  type MediaFetcher,
  type ProviderDescriptor,
  type ProviderListing,
  type SttProvider,
  type TranscribeInput,
  type TranscribeOutput,
  type UseCase,
} from "./core/index.ts";
import { createFileConfigStore } from "./infrastructure/config/file-config-store.ts";
import { createMediaFetcher } from "./infrastructure/media/media-fetcher.ts";
import { createFileTranscriptStore } from "./infrastructure/output/file-transcript-store.ts";
import { resolvePiTubePaths } from "./infrastructure/paths.ts";
import { type ProcessRequest, type ProcessResult, runProcess } from "./infrastructure/process/run-process.ts";
import { createSttProviders, PROVIDER_DESCRIPTORS } from "./infrastructure/stt/registry.ts";

/** The process facts the app is built from; tests pass a hermetic copy. */
export interface AppEnvironment {
  readonly env: EnvironmentVariables;
  readonly cwd: string;
  readonly homedir: () => string;
}

/** Test seams: fake providers, a fake media fetcher, or a fake process runner under the real fetcher. */
export interface AppOverrides {
  readonly stt?: Readonly<Record<string, SttProvider>>;
  readonly media?: MediaFetcher;
  readonly runProcess?: (request: ProcessRequest) => Promise<ProcessResult>;
}

/** The composition root's product: everything an adapter may call. */
export interface App {
  readonly providers: readonly ProviderDescriptor[];
  readonly listProviders: UseCase<Record<string, never>, ProviderListing>;
  readonly loginProvider: UseCase<LoginInput, LoginOutput>;
  readonly logoutProvider: UseCase<LogoutInput, LogoutOutput>;
  readonly getConfigValue: UseCase<{ readonly key: string }, ConfigValue>;
  readonly setConfigValue: UseCase<{ readonly key: string; readonly value: string }, ConfigValueSet>;
  readonly listConfigValues: UseCase<Record<string, never>, ConfigValues>;
  readonly transcribe: UseCase<TranscribeInput, TranscribeOutput>;
  readonly downloadMedia: UseCase<DownloadMediaInput, DownloadMediaOutput>;
}

/** Wires the core and the infrastructure for one environment. */
export const createApp = (environment: AppEnvironment, overrides: AppOverrides = {}): App => {
  const { env, cwd } = environment;
  const paths = resolvePiTubePaths(environment);
  const configStore = createFileConfigStore(paths.configFile);
  const media =
    overrides.media ?? createMediaFetcher({ env, cwd, tmpDir: paths.tmpDir, run: overrides.runProcess ?? runProcess });
  const accountDeps = { configStore, env, providers: PROVIDER_DESCRIPTORS };
  const configDeps = { configStore, providers: PROVIDER_DESCRIPTORS };

  return {
    providers: PROVIDER_DESCRIPTORS,
    listProviders: createListProviders(accountDeps),
    loginProvider: createLoginProvider(accountDeps),
    logoutProvider: createLogoutProvider(accountDeps),
    getConfigValue: createGetConfigValue(configDeps),
    setConfigValue: createSetConfigValue(configDeps),
    listConfigValues: createListConfigValues(configDeps),
    transcribe: createTranscribe({
      configStore,
      env,
      providers: PROVIDER_DESCRIPTORS,
      stt: overrides.stt ?? createSttProviders(),
      media,
      store: createFileTranscriptStore(paths.outputDir),
      now: () => new Date(),
    }),
    downloadMedia: createDownloadMedia({ media, defaultOutputDir: paths.downloadsDir }),
  };
};
