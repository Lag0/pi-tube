import { createError } from "../../../core/index.ts";
import { CliFailure, unwrapOrFail } from "../error-output.ts";
import type { CliDeps } from "../io.ts";
import { hintForCommand } from "../usage-hints.ts";

const UNSET = "(unset)";

const writeJson = (deps: CliDeps, payload: unknown): void => deps.io.writeOut(JSON.stringify(payload, null, 2));

const usageError = (command: "config" | "defaults", message: string): CliFailure =>
  new CliFailure(createError("INPUT_INVALID", message, { hint: hintForCommand(command) }));

/** `pi-tube config list|get|set`. API keys are not config keys; `auth login` stores them. */
export const runConfig = async (deps: CliDeps, args: readonly string[], json: boolean): Promise<number> => {
  const [action, key, value, ...extra] = args;

  if (action === "list" && key === undefined) {
    const listing = unwrapOrFail(await deps.app.listConfigValues({}));
    const entries = Object.entries(listing.values);
    if (json) {
      writeJson(deps, {
        config_path: listing.configLocation,
        values: Object.fromEntries(entries.map(([name, current]) => [name, current ?? null])),
      });
      return 0;
    }
    deps.io.writeOut(
      [
        "[CONFIG_LIST]",
        `config_path=${listing.configLocation}`,
        ...entries.map(([name, current]) => `${name}=${current ?? UNSET}`),
      ].join("\n"),
    );
    return 0;
  }

  if (action === "get" && key !== undefined && value === undefined) {
    const read = unwrapOrFail(await deps.app.getConfigValue({ key }));
    if (json) {
      writeJson(deps, { key: read.key, value: read.value ?? null, config_path: read.configLocation });
      return 0;
    }
    deps.io.writeOut(`[CONFIG_GET] key=${read.key} value=${read.value ?? UNSET} config_path=${read.configLocation}`);
    return 0;
  }

  if (action === "set" && key !== undefined && value !== undefined && extra.length === 0) {
    const written = unwrapOrFail(await deps.app.setConfigValue({ key, value }));
    if (json) {
      writeJson(deps, { key: written.key, value: written.value, config_path: written.configLocation });
      return 0;
    }
    deps.io.writeOut(`[CONFIG_SET] key=${written.key} value=${written.value} config_path=${written.configLocation}`);
    return 0;
  }

  throw usageError("config", "Missing or unsupported config action.");
};

/** `pi-tube defaults provider|language|show`, a shortcut over the `defaults.*` config keys. */
export const runDefaults = async (
  deps: CliDeps,
  action: string | undefined,
  value: string | undefined,
): Promise<number> => {
  switch (action) {
    case "provider":
    case "language": {
      if (!value?.trim()) throw usageError("defaults", `Missing default ${action}.`);
      const written = unwrapOrFail(await deps.app.setConfigValue({ key: `defaults.${action}`, value }));
      deps.io.writeOut(`[DEFAULTS_SET] ${action}=${written.value} config_path=${written.configLocation}`);
      return 0;
    }
    case "show": {
      const listing = unwrapOrFail(await deps.app.listConfigValues({}));
      deps.io.writeOut(
        [
          "[DEFAULTS_SHOW]",
          `config_path=${listing.configLocation}`,
          `provider=${listing.values["defaults.provider"] ?? UNSET}`,
          `language=${listing.values["defaults.language"] ?? UNSET}`,
        ].join("\n"),
      );
      return 0;
    }
    default:
      throw usageError("defaults", "Missing or unsupported defaults action.");
  }
};
