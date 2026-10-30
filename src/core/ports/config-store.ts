import type { PiTubeConfig } from "../domain/config.ts";
import type { Result } from "../domain/result.ts";

/** Reads and writes the user config. `write` never replaces a config it cannot read or parse. */
export interface ConfigStore {
  readonly location: string;
  read(): Promise<Result<PiTubeConfig>>;
  write(config: PiTubeConfig): Promise<Result<void>>;
}
