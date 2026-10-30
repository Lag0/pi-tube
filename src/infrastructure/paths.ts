import path from "node:path";
import type { EnvironmentVariables } from "../core/domain/config.ts";

export interface PiTubePaths {
  readonly home: string;
  readonly configFile: string;
  readonly outputDir: string;
  readonly tmpDir: string;
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
    outputDir: resolveOverride(env.PI_TUBE_OUTPUT_DIR, cwd) ?? home,
    tmpDir: path.join(home, "tmp"),
  };
};
