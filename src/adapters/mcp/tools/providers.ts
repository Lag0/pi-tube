import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { type NextAction, NextActionOutput, runTool } from "../results.ts";
import type { McpDeps } from "../server.ts";
import { LOCAL_READ_ONLY } from "./annotations.ts";

const NO_KEY_HINT =
  "No provider has a key. Ask the user to run `pi-tube auth login <provider>` in a terminal, or to set its key variable (for example `GROQ_API_KEY`) in this app's MCP server config.";

/** Output schema of `list_providers`. */
export const ListProvidersOutput = z.strictObject({
  config_path: z.string(),
  providers: z.array(
    z.strictObject({
      id: z.string(),
      positioning: z.string(),
      configured: z.boolean(),
      key_source: z.enum(["env", "config", "none"]),
      env_name: z.string().nullable(),
      overrides_config_key: z.boolean(),
    }),
  ),
  hint: z.string().optional(),
  next_actions: z.array(NextActionOutput),
});

const TRANSCRIBE_NEXT: NextAction = {
  tool: "transcribe",
  arguments: {},
  reason: "A provider has a key: transcribe a URL or a local file with input.",
};

/** `list_providers`: which providers have a key and where it comes from; never the key. */
export const registerListProvidersTool = (server: McpServer, deps: McpDeps): void => {
  server.registerTool(
    "list_providers",
    {
      title: "List providers",
      description:
        "Lists the speech-to-text providers (deepgram, groq, elevenlabs), whether each has a key and where it comes from (env or config). Never returns a key. Use it before transcribe when you do not know which provider is set up.",
      inputSchema: z.object({}),
      annotations: LOCAL_READ_ONLY,
    },
    (_args, ctx) =>
      runTool(
        ctx,
        deps,
        (options) => deps.app.listProviders({}, options),
        (listing): z.infer<typeof ListProvidersOutput> => {
          const configured = listing.providers.some((status) => status.configured);
          return {
            config_path: listing.configLocation,
            providers: listing.providers.map((status) => ({
              id: status.id,
              positioning: status.positioning,
              configured: status.configured,
              key_source: status.keySource,
              env_name: status.envName ?? null,
              overrides_config_key: status.overridesConfigKey,
            })),
            ...(configured ? {} : { hint: NO_KEY_HINT }),
            next_actions: configured ? [TRANSCRIBE_NEXT] : [],
          };
        },
      ),
  );
};
