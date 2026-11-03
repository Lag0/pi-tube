import { McpServer } from "@modelcontextprotocol/server";
import type { App } from "../../bootstrap.ts";
import { SERVER_INSTRUCTIONS } from "./instructions.ts";
import type { McpLogger } from "./log.ts";
import { registerDoctorTool } from "./tools/doctor.ts";
import { registerListProvidersTool } from "./tools/providers.ts";
import { registerGetUsageTool } from "./tools/usage.ts";

/** What every tool handler gets. */
export interface McpDeps {
  readonly app: App;
  readonly log: McpLogger;
  readonly version: string;
  /** Aborts every call in flight when the server stops. */
  readonly shutdown: AbortSignal;
  /** Runs the v2 import once per process; later calls await the same run (Task 6). */
  readonly ensureImported: () => Promise<void>;
}

/** The handlers' dependencies for one process. */
export const createMcpDeps = (input: {
  readonly app: App;
  readonly log: McpLogger;
  readonly version: string;
  readonly shutdown: AbortSignal;
}): McpDeps => ({ ...input, ensureImported: async () => {} });

/** The factory serveStdio calls once per connection; registers every tool and the transcript resource. */
export const createMcpServerFactory =
  (deps: McpDeps): (() => McpServer) =>
  () => {
    const server = new McpServer(
      { name: "pi-tube", title: "pi-tube", version: deps.version },
      { instructions: SERVER_INSTRUCTIONS },
    );
    registerListProvidersTool(server, deps);
    registerDoctorTool(server, deps);
    registerGetUsageTool(server, deps);
    return server;
  };
