import type { Transport } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import type { App } from "../../bootstrap.ts";
import type { EnvironmentVariables } from "../../core/index.ts";
import { createMcpLogger } from "./log.ts";
import { createMcpDeps, createMcpServerFactory } from "./server.ts";

/** What `pi-tube mcp` runs on: the app, the process facts it needs, and how it is told to stop. */
export interface McpServeDeps {
  readonly app: App;
  readonly env: EnvironmentVariables;
  readonly version: string;
  readonly writeErr: (line: string) => void;
  /** Ends the server: SIGINT/SIGTERM/SIGHUP from main. */
  readonly signal: AbortSignal;
  /** Ends the server when it ends or closes. */
  readonly stdin: NodeJS.ReadableStream;
  /** Tests only: an in-memory transport instead of stdio. */
  readonly transport?: Transport;
}

/** How long shutdown waits for aborted calls to clean up before closing anyway. */
const SHUTDOWN_GRACE_MS = 10_000;

/** Serves MCP on stdio until stdin closes or `signal` aborts; aborts calls in flight, closes and resolves 0. */
export const runMcpServer = async (deps: McpServeDeps): Promise<number> => {
  const log = createMcpLogger({ env: deps.env, writeErr: deps.writeErr });
  const shutdown = new AbortController();
  const mcp = createMcpDeps({ app: deps.app, log, version: deps.version, shutdown: shutdown.signal });
  const handle = serveStdio(createMcpServerFactory(mcp), {
    onerror: (error) => log.error("MCP transport error", { error: error.message }),
    ...(deps.transport ? { transport: deps.transport } : {}),
  });
  log.info(`pi-tube ${deps.version} MCP server on stdio`);

  await new Promise<void>((resolve) => {
    deps.stdin.once("end", () => resolve());
    deps.stdin.once("close", () => resolve());
    if (deps.signal.aborted) resolve();
    else deps.signal.addEventListener("abort", () => resolve(), { once: true });
  });
  // Calls in flight see the abort (yt-dlp and the provider stop) and clean up before the transport closes.
  shutdown.abort();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const grace = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, SHUTDOWN_GRACE_MS);
  });
  await Promise.race([mcp.settled(), grace]);
  clearTimeout(timer);
  await handle.close();
  log.info("MCP server stopped");
  return 0;
};
