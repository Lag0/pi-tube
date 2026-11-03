import path from "node:path";
import type { EnvironmentVariables } from "../core/domain/config.ts";

export interface PiTubePaths {
  readonly home: string;
  readonly configFile: string;
  readonly libraryDir: string;
  readonly tmpDir: string;
  readonly downloadsDir: string;
  readonly auditDir: string;
  /** Where pi-tube v2 saved transcripts, read once by the v2 import: `home`, and `PI_TUBE_OUTPUT_DIR` if set. */
  readonly legacyDirs: readonly string[];
}

export interface PiTubePathsInput {
  readonly env: EnvironmentVariables;
  readonly cwd: string;
  readonly homedir: () => string;
}

const resolveOverride = (value: string | undefined, cwd: string): string | undefined => {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return path.isAbsolute(trimmed) ? trimmed : path.resolve(cwd, trimmed);
};

/** Single source of every pi-tube path. Without `HOME` (the Windows default) it uses `homedir()`, never the cwd. */
export const resolvePiTubePaths = ({ env, cwd, homedir }: PiTubePathsInput): PiTubePaths => {
  const home = path.join(env.HOME?.trim() || homedir(), ".pi-tube");
  return {
    home,
    configFile: resolveOverride(env.PI_TUBE_CONFIG_PATH, cwd) ?? path.join(home, "config.json"),
    libraryDir: resolveOverride(env.PI_TUBE_LIBRARY_DIR, cwd) ?? path.join(home, "library"),
    tmpDir: path.join(home, "tmp"),
    downloadsDir: path.join(home, "downloads"),
    auditDir: path.join(home, "audit"),
    // v3 never writes to PI_TUBE_OUTPUT_DIR; the import only reads what v2 left there.
    legacyDirs: [...new Set([home, resolveOverride(env.PI_TUBE_OUTPUT_DIR, cwd) ?? home])],
  };
};
