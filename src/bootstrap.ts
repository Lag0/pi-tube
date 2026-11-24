import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  type AuditAdapter,
  type AuditListInput,
  type AuditPage,
  type AuditStatsInput,
  type AuditStatsOutput,
  type AuditTrailDeps,
  type ConfigValue,
  type ConfigValueSet,
  type ConfigValues,
  createAuditStats,
  createDownloadMedia,
  createGetConfigValue,
  createGetMediaInfo,
  createGetTranscript,
  createImportV2Transcripts,
  createListConfigValues,
  createListProviders,
  createListTranscripts,
  createLoginProvider,
  createLogoutProvider,
  createPruneLibrary,
  createQueryAudit,
  createReadTranscript,
  createRunDoctor,
  createSearchTranscripts,
  createSetConfigValue,
  createTranscribe,
  type DoctorReport,
  type DownloadMediaInput,
  type DownloadMediaOutput,
  type EnvironmentVariables,
  type ImportSummary,
  type ImportV2Input,
  type LibraryPage,
  type ListTranscriptsInput,
  type LoginInput,
  type LoginOutput,
  type LogoutInput,
  type LogoutOutput,
  type MediaFetcher,
  type MediaInfo,
  type ProviderDescriptor,
  type ProviderListing,
  type PruneInput,
  type PruneReport,
  type ReadTranscriptInput,
  type SearchTranscriptsInput,
  type StoredTranscript,
  type SttProvider,
  type TranscribeInput,
  type TranscribeOutput,
  type TranscriptPage,
  type UseCase,
} from "./core/index.ts";
import { createFileAuditLog } from "./infrastructure/audit/file-audit-log.ts";
import { createFileConfigStore } from "./infrastructure/config/file-config-store.ts";
import { createFileLibraryStore } from "./infrastructure/library/file-library-store.ts";
import { withLibraryActivity } from "./infrastructure/library/library-activity.ts";
import { createV2Transcripts } from "./infrastructure/library/v2-transcripts.ts";
import type { LookupHost } from "./infrastructure/media/host-guard.ts";
import { createMediaFetcher } from "./infrastructure/media/media-fetcher.ts";
import { resolvePiTubePaths } from "./infrastructure/paths.ts";
import { type ProcessRequest, type ProcessResult, runProcess } from "./infrastructure/process/run-process.ts";
import { createSttProviders, PROVIDER_DESCRIPTORS } from "./infrastructure/stt/registry.ts";

/** The process facts the app is built from; tests pass a hermetic copy. */
export interface AppEnvironment {
  readonly env: EnvironmentVariables;
  readonly cwd: string;
  readonly homedir: () => string;
  /** The adapter the app serves; every audit record names it. */
  readonly adapter: AuditAdapter;
}

/** Test seams: fake providers, a fake media fetcher, or a fake process runner and DNS under the real fetcher. */
export interface AppOverrides {
  readonly stt?: Readonly<Record<string, SttProvider>>;
  readonly media?: MediaFetcher;
  readonly runProcess?: (request: ProcessRequest) => Promise<ProcessResult>;
  readonly lookup?: LookupHost;
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
  readonly getMediaInfo: UseCase<{ readonly input: string }, MediaInfo>;
  readonly listTranscripts: UseCase<ListTranscriptsInput, LibraryPage>;
  readonly searchTranscripts: UseCase<SearchTranscriptsInput, LibraryPage>;
  readonly getTranscript: UseCase<{ readonly transcriptId: string }, StoredTranscript>;
  readonly readTranscript: UseCase<ReadTranscriptInput, TranscriptPage & { readonly transcriptId: string }>;
  readonly pruneLibrary: UseCase<PruneInput, PruneReport>;
  readonly queryAudit: UseCase<AuditListInput, AuditPage>;
  readonly auditStats: UseCase<AuditStatsInput, AuditStatsOutput>;
  readonly importV2Transcripts: UseCase<ImportV2Input, ImportSummary>;
  readonly runDoctor: UseCase<Record<string, never>, DoctorReport>;
}

const PACKAGE_JSON = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  version?: string;
};
/** The installed pi-tube version, from package.json. */
export const PI_TUBE_VERSION = typeof PACKAGE_JSON.version === "string" ? PACKAGE_JSON.version : "0.0.0";
/** The runtime pi-tube runs on, as `bun <version>` or `node <version>`. */
export const RUNTIME_VERSION = process.versions.bun ? `bun ${process.versions.bun}` : `node ${process.versions.node}`;

/** Wires the core and the infrastructure for one environment. */
export const createApp = (environment: AppEnvironment, overrides: AppOverrides = {}): App => {
  const { env, cwd } = environment;
  const paths = resolvePiTubePaths(environment);
  const configStore = createFileConfigStore(paths.configFile);
  const media =
    overrides.media ??
    createMediaFetcher({
      env,
      cwd,
      tmpDir: paths.tmpDir,
      run: overrides.runProcess ?? runProcess,
      ...(overrides.lookup ? { lookup: overrides.lookup } : {}),
    });
  const library = createFileLibraryStore({ libraryDir: paths.libraryDir });
  const auditLog = createFileAuditLog({ auditDir: paths.auditDir, configStore });
  const versions = { piTube: PI_TUBE_VERSION, runtime: RUNTIME_VERSION };
  const audit: AuditTrailDeps = {
    audit: auditLog,
    now: () => new Date(),
    newId: randomUUID,
    adapter: environment.adapter,
    versions,
  };
  const accountDeps = { configStore, env, providers: PROVIDER_DESCRIPTORS };
  const configDeps = { configStore, providers: PROVIDER_DESCRIPTORS };

  const usingLibrary =
    <I, O>(useCase: UseCase<I, O>): UseCase<I, O> =>
    (input, options) =>
      withLibraryActivity(paths.libraryDir, () => useCase(input, options));
  const prune = createPruneLibrary({
    library: {
      ...library,
      prune: (input) =>
        !input.includeTranscripts && !input.dryRun
          ? withLibraryActivity(paths.libraryDir, () => library.prune(input))
          : library.prune(input),
    },
    configStore,
    audit,
  });
  return {
    providers: PROVIDER_DESCRIPTORS,
    listProviders: createListProviders(accountDeps),
    loginProvider: createLoginProvider(accountDeps),
    logoutProvider: createLogoutProvider(accountDeps),
    getConfigValue: createGetConfigValue(configDeps),
    setConfigValue: createSetConfigValue(configDeps),
    listConfigValues: createListConfigValues(configDeps),
    transcribe: createTranscribe({
      withActivity: (work) => withLibraryActivity(paths.libraryDir, work, true),
      configStore,
      env,
      providers: PROVIDER_DESCRIPTORS,
      stt: overrides.stt ?? createSttProviders(),
      media,
      library,
      now: () => new Date(),
      audit,
    }),
    downloadMedia: createDownloadMedia({ configStore, env, media, defaultOutputDir: paths.downloadsDir, audit }),
    getMediaInfo: createGetMediaInfo({ configStore, env, media, audit }),
    listTranscripts: usingLibrary(createListTranscripts({ library })),
    searchTranscripts: usingLibrary(createSearchTranscripts({ library })),
    getTranscript: usingLibrary(createGetTranscript({ library })),
    readTranscript: usingLibrary(createReadTranscript({ library, configStore })),
    pruneLibrary: prune,
    queryAudit: createQueryAudit({ audit: auditLog }),
    auditStats: createAuditStats({ audit: auditLog }),
    importV2Transcripts: createImportV2Transcripts({
      withActivity: (work) => withLibraryActivity(paths.libraryDir, work, true),
      legacy: createV2Transcripts({ dirs: paths.legacyDirs, libraryDir: paths.libraryDir }),
      library,
    }),
    runDoctor: createRunDoctor({
      ...accountDeps,
      media,
      library: { ...library, entries: () => withLibraryActivity(paths.libraryDir, () => library.entries()) },
      versions,
    }),
  };
};
