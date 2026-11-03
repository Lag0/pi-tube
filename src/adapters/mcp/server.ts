import { McpServer } from "@modelcontextprotocol/server";
import type { z } from "zod";
import type { App } from "../../bootstrap.ts";
import { SERVER_INSTRUCTIONS } from "./instructions.ts";
import type { McpLogger } from "./log.ts";
import { registerTranscriptResource } from "./resources.ts";
import { DoctorOutput, registerDoctorTool } from "./tools/doctor.ts";
import {
  GetTranscriptOutput,
  ListTranscriptsOutput,
  registerLibraryTools,
  SearchTranscriptsOutput,
} from "./tools/library.ts";
import { DownloadMediaOutput, GetMediaInfoOutput, registerMediaTools, TranscribeOutput } from "./tools/media.ts";
import { ListProvidersOutput, registerListProvidersTool } from "./tools/providers.ts";
import { GetUsageOutput, registerGetUsageTool } from "./tools/usage.ts";

/**
 * Each tool's strict output schema (not given to the SDK: results are one JSON text block). The tests parse every
 * result with it, so a missing field, a wrong type or an unnamed key, external content included, fails.
 */
export const OUTPUT_SCHEMAS: Readonly<Record<string, z.ZodType>> = {
  transcribe: TranscribeOutput,
  get_transcript: GetTranscriptOutput,
  list_transcripts: ListTranscriptsOutput,
  search_transcripts: SearchTranscriptsOutput,
  get_media_info: GetMediaInfoOutput,
  download_media: DownloadMediaOutput,
  list_providers: ListProvidersOutput,
  doctor: DoctorOutput,
  get_usage: GetUsageOutput,
};

/** What every tool handler gets. */
export interface McpDeps {
  readonly app: App;
  readonly log: McpLogger;
  readonly version: string;
  /** Aborts every call in flight when the server stops. */
  readonly shutdown: AbortSignal;
  /** Runs the v2 import once per process (again after a failure); concurrent calls share a run. Never rejects. */
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
  /** True when the import ran; a failure is logged and retried by the next call. */
  const runImport = async (): Promise<boolean> => {
    try {
      const summary = await input.app.importV2Transcripts({});
      if (!summary.success) {
        input.log.warn("v2 import failed", { code: summary.error.code, message: summary.error.message });
        return false;
      }
      if (summary.data.found > 0 && !summary.data.ranBefore) {
        const { found, imported: added, already, skipped } = summary.data;
        input.log.info(`v2 import: found=${found} imported=${added} already=${already} skipped=${skipped.length}`);
      }
      return true;
    } catch (caught) {
      input.log.warn("v2 import failed", { message: caught instanceof Error ? caught.message : String(caught) });
      return false;
    }
  };
  return {
    ...input,
    ensureImported: () => {
      // Concurrent calls share the run in flight; only a success is kept.
      imported ??= runImport().then((done) => {
        if (!done) imported = undefined;
      });
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
