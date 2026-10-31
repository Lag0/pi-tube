import type { EnvironmentVariables, PiTubeConfig } from "./config.ts";
import { createError } from "./errors.ts";
import { err, ok, type Result } from "./result.ts";

/** Env var naming the cookies file; wins over `cookies.file` in the config. */
export const COOKIES_FILE_ENV = "PI_TUBE_COOKIES_FILE";
/** Default `local_files.max_bytes`: 1 GiB. */
export const DEFAULT_MAX_LOCAL_FILE_BYTES = 1_073_741_824;
/** Largest `local_files.max_bytes`: the largest file Node's `readFile` reads (`ERR_FS_FILE_TOO_LARGE` above it). */
export const MAX_LOCAL_FILE_BYTES_LIMIT = 2_147_483_647;

/** Source rules from config and env, resolved by the core and applied by the media fetcher on every call. */
export interface SourceSettings {
  readonly allowPrivateHosts: boolean;
  readonly maxLocalFileBytes: number;
  /** The user's cookies file; `origin` names where it was set, so messages never need the path. */
  readonly cookies?: { readonly file: string; readonly origin: "env" | "config" };
}

/** POSIX `/…`, Windows `X:\…` or `X:/…`, or UNC `\\…`; pure, so the domain needs no `node:path`. */
export const isAbsolutePath = (value: string): boolean =>
  value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value) || value.startsWith("\\\\");

/** Resolves the source settings: `PI_TUBE_COOKIES_FILE` wins over `cookies.file`, and both must be absolute. */
export const resolveSourceSettings = (config: PiTubeConfig, env: EnvironmentVariables): Result<SourceSettings> => {
  const envFile = env[COOKIES_FILE_ENV]?.trim();
  const cookies =
    envFile !== undefined && envFile.length > 0
      ? { file: envFile, origin: "env" as const }
      : config.cookies?.file !== undefined
        ? { file: config.cookies.file, origin: "config" as const }
        : undefined;
  if (cookies && !isAbsolutePath(cookies.file)) {
    const name = cookies.origin === "env" ? COOKIES_FILE_ENV : "cookies.file";
    return err(createError("COOKIES_FILE_INVALID", `\`${name}\` must be an absolute path.`));
  }
  return ok({
    allowPrivateHosts: config.network?.allow_private_hosts ?? false,
    maxLocalFileBytes: config.local_files?.max_bytes ?? DEFAULT_MAX_LOCAL_FILE_BYTES,
    ...(cookies ? { cookies } : {}),
  });
};
