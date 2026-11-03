import { McpServer } from "@modelcontextprotocol/server";
import type { App } from "../../bootstrap.ts";
import { SERVER_INSTRUCTIONS } from "./instructions.ts";
import type { McpLogger } from "./log.ts";
import { registerTranscriptResource } from "./resources.ts";
import { registerDoctorTool } from "./tools/doctor.ts";
import { registerLibraryTools } from "./tools/library.ts";
import { registerListProvidersTool } from "./tools/providers.ts";
import { registerGetUsageTool } from "./tools/usage.ts";

/** What every tool handler gets. */
export interface McpDeps {
  readonly app: App;
  readonly log: McpLogger;
  readonly version: string;
  /** Aborts every call in flight when the server stops. */
  readonly shutdown: AbortSignal;
  /** Runs the v2 import once per process; later calls await the same run. Never rejects. */
  readonly ensureImported: () => Promise<void>;
}

/** The handlers' dependencies for one process, with the one-time v2 import. */
export const createMcpDeps = (input: {
  readonly app: App;
  readonly log: McpLogger;
  readonly version: string;
  readonly shutdown: AbortSignal;
}): McpDeps => {
  let imported: Promise<void> | undefined;
  const runImport = async (): Promise<void> => {
    try {
      const summary = await input.app.importV2Transcripts({});
      if (!summary.success) {
        input.log.warn("v2 import failed", { code: summary.error.code, message: summary.error.message });
      } else if (summary.data.found > 0 && !summary.data.ranBefore) {
        const { found, imported: added, already, skipped } = summary.data;
        input.log.info(`v2 import: found=${found} imported=${added} already=${already} skipped=${skipped.length}`);
      }
    } catch (caught) {
      input.log.warn("v2 import failed", { message: caught instanceof Error ? caught.message : String(caught) });
    }
  };
  return {
    ...input,
    ensureImported: () => {
      imported ??= runImport();
      return imported;
    },
  };
};

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
    registerLibraryTools(server, deps);
    registerTranscriptResource(server, deps);
    return server;
  };
