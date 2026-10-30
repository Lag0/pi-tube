import * as legacyHandlers from "./cli/handlers.ts";
import type { EnvironmentVariables } from "./core/index.ts";

/** The process facts the app is built from; tests pass a hermetic copy. */
export interface AppEnvironment {
  readonly env: EnvironmentVariables;
  readonly cwd: string;
  readonly homedir: () => string;
}

/** Pre-v3 command handlers, reachable only through the app until phase 1b replaces them. */
export type LegacyHandlers = typeof legacyHandlers;

/** The composition root's product: everything an adapter may call. */
export interface App {
  readonly environment: AppEnvironment;
  readonly legacy: LegacyHandlers;
}

/** Wires the core, the infrastructure and the legacy pipeline for one environment. */
export const createApp = (environment: AppEnvironment): App => ({ environment, legacy: legacyHandlers });
