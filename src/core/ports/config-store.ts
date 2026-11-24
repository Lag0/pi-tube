import type { PiTubeConfig } from "../domain/config.ts";
import type { Result } from "../domain/result.ts";

/** Serializes each mutation against the latest readable config and returns the published value. */
export interface ConfigStore {
  readonly location: string;
  read(): Promise<Result<PiTubeConfig>>;
  update(change: (current: PiTubeConfig) => Result<PiTubeConfig>, signal?: AbortSignal): Promise<Result<PiTubeConfig>>;
}
