import { createError } from "../../../core/index.ts";
import { CliFailure, unwrapOrFail } from "../error-output.ts";
import type { CliDeps } from "../io.ts";
import { hintForCommand } from "../usage-hints.ts";

export interface AuthCommand {
  readonly action?: string;
  readonly provider?: string;
  readonly key?: string;
  readonly json: boolean;
}

const writeJson = (deps: CliDeps, payload: unknown): void => deps.io.writeOut(JSON.stringify(payload, null, 2));

const requireProvider = (provider: string | undefined): string => {
  if (provider) return provider;
  throw new CliFailure(createError("INPUT_INVALID", "Missing provider.", { hint: hintForCommand("auth") }));
};

const promptForApiKey = (provider: string): string | undefined => {
  if (typeof prompt !== "function") return undefined;
  return prompt(`Paste ${provider} API key:`) ?? undefined;
};

/** `pi-tube providers`: which providers have a key and where it comes from. Never prints a key. */
export const runProviders = async (deps: CliDeps, options: { readonly json: boolean }): Promise<number> => {
  const listing = unwrapOrFail(await deps.app.listProviders({}));
  if (options.json) {
    writeJson(deps, {
      config_path: listing.configLocation,
      providers: listing.providers.map((status) => ({
        id: status.id,
        positioning: status.positioning,
        configured: status.configured,
        key_source: status.keySource,
        env_name: status.envName ?? null,
      })),
    });
    return 0;
  }

  deps.io.writeOut(
    [
      "[PROVIDERS]",
      `config_path=${listing.configLocation}`,
      ...listing.providers.map(
        (status) =>
          `${status.id} configured=${status.configured} key_source=${status.keySource}${
            status.envName === undefined ? "" : ` env_name=${status.envName}`
          }`,
      ),
    ].join("\n"),
  );
  return 0;
};

const runLogin = async (deps: CliDeps, command: AuthCommand): Promise<number> => {
  const provider = requireProvider(command.provider);
  const apiKey = command.key ?? promptForApiKey(provider);
  if (apiKey === undefined) {
    throw new CliFailure(createError("INPUT_INVALID", "Missing API key.", { hint: hintForCommand("auth") }));
  }

  const login = unwrapOrFail(await deps.app.loginProvider({ provider, apiKey }));
  if (command.json) {
    writeJson(deps, {
      provider: login.provider,
      status: "configured",
      config_path: login.configLocation,
      overridden_by_env: login.overriddenByEnv ?? null,
    });
    return 0;
  }

  deps.io.writeOut(`[AUTH_LOGIN] provider=${login.provider} status=configured config_path=${login.configLocation}`);
  if (login.overriddenByEnv !== undefined) {
    deps.io.writeErr(`warning: ${login.overriddenByEnv} in env overrides the key in config.json.`);
  }
  return 0;
};

const runLogout = async (deps: CliDeps, command: AuthCommand): Promise<number> => {
  const logout = unwrapOrFail(await deps.app.logoutProvider({ provider: requireProvider(command.provider) }));
  if (command.json) {
    writeJson(deps, {
      provider: logout.provider,
      status: "removed",
      config_path: logout.configLocation,
      still_set_in_env: logout.stillSetInEnv ?? null,
    });
    return 0;
  }

  deps.io.writeOut(`[AUTH_LOGOUT] provider=${logout.provider} status=removed config_path=${logout.configLocation}`);
  if (logout.stillSetInEnv !== undefined) {
    deps.io.writeErr(`warning: ${logout.stillSetInEnv} is still set in env, so ${logout.provider} stays configured.`);
  }
  return 0;
};

/** `pi-tube auth login|status|logout`; `status` is an alias of `providers`. */
export const runAuth = (deps: CliDeps, command: AuthCommand): Promise<number> => {
  switch (command.action) {
    case "login":
      return runLogin(deps, command);
    case "status":
      return runProviders(deps, command);
    case "logout":
      return runLogout(deps, command);
    default:
      throw new CliFailure(
        createError("INPUT_INVALID", "Missing or unsupported auth action.", { hint: hintForCommand("auth") }),
      );
  }
};
