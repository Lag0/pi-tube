import { DEFAULT_CONFIG, type PiTubeConfig } from "../../src/core/domain/config.ts";
import type { PiTubeError } from "../../src/core/domain/errors.ts";
import { err, ok } from "../../src/core/domain/result.ts";
import type { ConfigStore } from "../../src/core/ports/config-store.ts";

export const IN_MEMORY_CONFIG_LOCATION = "/memory/.pi-tube/config.json";

const isError = (value: PiTubeConfig | PiTubeError): value is PiTubeError => "code" in value;

/** Config store kept in memory. Passing a `PiTubeError` makes every read and write fail with it. */
export const createInMemoryConfigStore = (
  initial: PiTubeConfig | PiTubeError = DEFAULT_CONFIG,
): ConfigStore & { readonly writes: readonly PiTubeConfig[] } => {
  let current = initial;
  const writes: PiTubeConfig[] = [];
  return {
    location: IN_MEMORY_CONFIG_LOCATION,
    writes,
    read: async () => (isError(current) ? err(current) : ok(current)),
    write: async (config) => {
      if (isError(current)) return err(current);
      writes.push(config);
      current = config;
      return ok(undefined);
    },
  };
};
