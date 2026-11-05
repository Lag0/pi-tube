import type { AuditVersions } from "../domain/audit.ts";
import { DEFAULT_CONFIG, type EnvironmentVariables, type PiTubeConfig } from "../domain/config.ts";
import { createError, type PiTubeError } from "../domain/errors.ts";
import { resolveLibrarySettings } from "../domain/library.ts";
import { type ProviderDescriptor, resolveCredential } from "../domain/providers.ts";
import { ok } from "../domain/result.ts";
import { COOKIES_FILE_ENV, resolveSourceSettings, type SourceSettings } from "../domain/source-settings.ts";
import type { ConfigStore } from "../ports/config-store.ts";
import type { LibraryStore } from "../ports/library-store.ts";
import type { MediaFetcher, ToolVersion } from "../ports/media-fetcher.ts";
import { ensureNotAborted, type UseCase } from "./operation.ts";

/** How a check came out; any `error` makes the report not ok. */
export type DoctorStatus = "ok" | "warn" | "error";

/** One line of the report; `fix` says what to do when the status is not ok. */
export interface DoctorCheck {
  readonly id: string;
  readonly status: DoctorStatus;
  readonly summary: string;
  readonly fix?: string;
}

/** What `doctor` found; `ok` is false when any check is an error. */
export interface DoctorReport {
  readonly ok: boolean;
  readonly checks: readonly DoctorCheck[];
}

/** Dependencies of `doctor`. */
export interface DoctorDeps {
  readonly configStore: ConfigStore;
  readonly env: EnvironmentVariables;
  readonly providers: readonly ProviderDescriptor[];
  readonly media: MediaFetcher;
  readonly library: LibraryStore;
  readonly versions: AuditVersions;
}

const pass = (id: string, summary: string): DoctorCheck => ({ id, status: "ok", summary });
const warn = (id: string, summary: string, fix: string): DoctorCheck => ({ id, status: "warn", summary, fix });
const failed = (id: string, error: PiTubeError): DoctorCheck => ({
  id,
  status: "error",
  summary: error.message,
  fix: error.hint,
});

const providerChecks = (deps: DoctorDeps, config: PiTubeConfig): readonly DoctorCheck[] => {
  const credentials = deps.providers.map((descriptor) => ({
    descriptor,
    credential: resolveCredential(descriptor, config, deps.env),
  }));
  const checks = credentials.map(({ descriptor, credential }): DoctorCheck => {
    const id = `provider:${descriptor.id}`;
    if (credential.source === "none") {
      const envName = config.providers[descriptor.id]?.api_key_env ?? descriptor.credentialEnvNames[0];
      return warn(id, "No key.", `Run \`pi-tube auth login ${descriptor.id}\` or set \`${envName}\`.`);
    }
    if (credential.source === "config") return pass(id, "Key from config.json.");
    if (credential.overridesConfigKey) {
      return warn(
        id,
        `\`${credential.envName}\` in env overrides the key in config.json.`,
        `Unset \`${credential.envName}\` to use the key in config.json, or run \`pi-tube auth logout ${descriptor.id}\`.`,
      );
    }
    return pass(id, `Key from \`${credential.envName}\`.`);
  });
  const withKey = credentials.filter(({ credential }) => credential.source !== "none").length;
  const total: DoctorCheck =
    withKey === 0
      ? {
          id: "providers",
          status: "error",
          summary: "No provider has a key, so nothing can be transcribed.",
          fix: `Run \`pi-tube auth login <${deps.providers.map((descriptor) => descriptor.id).join("|")}>\`.`,
        }
      : pass("providers", `${withKey} of ${deps.providers.length} providers have a key.`);
  return [...checks, total];
};

const ytDlpCheck = (tool: ToolVersion): DoctorCheck => {
  const fix = createError("YTDLP_NOT_FOUND", "yt-dlp is not on PATH.").hint;
  if (!tool.found) return { id: "yt-dlp", status: "error", summary: "yt-dlp is not on PATH.", fix };
  if (tool.cannotRun !== undefined) {
    return {
      id: "yt-dlp",
      status: "error",
      summary: `yt-dlp is on PATH but cannot be run (${tool.cannotRun}).`,
      fix: "Make yt-dlp executable (`chmod +x` on its file) or reinstall it (`brew install yt-dlp` or `pipx install yt-dlp`).",
    };
  }
  if (tool.version === undefined) return warn("yt-dlp", "yt-dlp is on PATH but did not report its version.", fix);
  return pass("yt-dlp", `yt-dlp ${tool.version}.`);
};

const FFMPEG_FIX = "Install ffmpeg (`brew install ffmpeg`, `winget install ffmpeg` or your package manager).";

const ffmpegCheck = (tool: ToolVersion): DoctorCheck => {
  if (!tool.found) {
    return warn(
      "ffmpeg",
      "ffmpeg is not on PATH; `download` needs it to save audio as mp3 and to merge video.",
      FFMPEG_FIX,
    );
  }
  if (tool.cannotRun !== undefined) {
    return warn(
      "ffmpeg",
      `ffmpeg is on PATH but cannot be run (${tool.cannotRun}); \`download\` needs it to save audio as mp3 and to merge video.`,
      "Make ffmpeg executable (`chmod +x` on its file) or reinstall it (`brew install ffmpeg`, `winget install ffmpeg` or your package manager).",
    );
  }
  if (tool.version === undefined)
    return warn("ffmpeg", "ffmpeg is on PATH but did not report its version.", FFMPEG_FIX);
  return pass("ffmpeg", `ffmpeg ${tool.version}.`);
};

const cookiesCheck = (settings: SourceSettings, cookies: "none" | "ok" | PiTubeError): DoctorCheck => {
  if (cookies === "none") return pass("cookies", "No cookies file set (only needed for content behind a login).");
  if (cookies === "ok") {
    const origin = settings.cookies?.origin === "env" ? COOKIES_FILE_ENV : "cookies.file";
    return pass("cookies", `Cookies file set by \`${origin}\` and readable.`);
  }
  return failed("cookies", cookies);
};

const libraryCheck = async (deps: DoctorDeps, config: PiTubeConfig): Promise<DoctorCheck> => {
  const entries = await deps.library.entries();
  if (!entries.success) return failed("library", entries.error);
  // A dry run without `maxAudioBytes` or an age measures all the kept audio.
  const audio = await deps.library.prune({ dryRun: true, includeTranscripts: false });
  if (!audio.success) return failed("library", audio.error);
  const { maxAudioBytes } = resolveLibrarySettings(config);
  const limit = maxAudioBytes === undefined ? "no limit" : `limit ${maxAudioBytes}`;
  return pass(
    "library",
    `${entries.data.length} transcripts; ${audio.data.audioFiles} kept audio files, ${audio.data.bytes} bytes (${limit}).`,
  );
};

const withoutCookies = (config: PiTubeConfig): SourceSettings => {
  const { cookies: _refused, ...rest } = config;
  const settings = resolveSourceSettings(rest, {});
  if (!settings.success) throw new Error("Source settings without cookies cannot fail");
  return settings.data;
};

/**
 * Checks the installation without network or provider calls: version, config, each provider's key (and an env var
 * overriding a stored key), yt-dlp, ffmpeg, the cookies file (never its path) and the library. Not audited.
 */
export const createRunDoctor =
  (deps: DoctorDeps): UseCase<Record<string, never>, DoctorReport> =>
  async (_input, options) => {
    const ready = ensureNotAborted(options?.signal);
    if (!ready.success) return ready;
    const read = await deps.configStore.read();
    const config = read.success ? read.data : DEFAULT_CONFIG;
    const configCheck = read.success
      ? pass("config", `Config at \`${deps.configStore.location}\`.`)
      : failed("config", read.error);
    const settings = resolveSourceSettings(config, deps.env);
    // A cookies path the settings refuse is reported as the cookies check; the tools are inspected without it.
    const tools = await deps.media.inspect(settings.success ? settings.data : withoutCookies(config), options);
    if (!tools.success) return tools;

    const checks: readonly DoctorCheck[] = [
      pass("pi-tube", `pi-tube ${deps.versions.piTube} on ${deps.versions.runtime}.`),
      configCheck,
      ...providerChecks(deps, config),
      ytDlpCheck(tools.data.ytDlp),
      ffmpegCheck(tools.data.ffmpeg),
      settings.success ? cookiesCheck(settings.data, tools.data.cookies) : failed("cookies", settings.error),
      await libraryCheck(deps, config),
    ];
    return ok({ ok: checks.every((check) => check.status !== "error"), checks });
  };
