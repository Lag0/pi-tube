import { McpServer } from "@modelcontextprotocol/server";
import type { App } from "../../bootstrap.ts";
import { SERVER_INSTRUCTIONS } from "./instructions.ts";
import type { McpLogger } from "./log.ts";
import { registerTranscriptResource } from "./resources.ts";
import { registerDoctorTool } from "./tools/doctor.ts";
import { registerLibraryTools } from "./tools/library.ts";
import { registerMediaTools } from "./tools/media.ts";
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
  /** Registers a tool call, so shutdown can wait for its cleanup (temp files, the audit record). */
  readonly track: <T>(call: Promise<T>) => Promise<T>;
  /** Resolves when every tracked call has settled. */
  readonly settled: () => Promise<void>;
}

/** The handlers' dependencies for one process, with the one-time v2 import. */
export const createMcpDeps = (input: {
  readonly app: App;
  readonly log: McpLogger;
  readonly version: string;
  readonly shutdown: AbortSignal;
}): McpDeps => {
  let imported: Promise<void> | undefined;
  const inFlight = new Set<Promise<unknown>>();
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
    track: (call) => {
      inFlight.add(call);
      void call.finally(() => inFlight.delete(call)).catch(() => undefined);
      return call;
    },
    settled: async () => {
      await Promise.allSettled([...inFlight]);
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
    registerMediaTools(server, deps);
    registerTranscriptResource(server, deps);
    return server;
  };
