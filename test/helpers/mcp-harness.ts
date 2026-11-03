import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createMcpLogger } from "../../src/adapters/mcp/log.ts";
import { createMcpDeps, createMcpServerFactory } from "../../src/adapters/mcp/server.ts";
import { type App, type AppOverrides, createApp } from "../../src/bootstrap.ts";

const PUBLIC_LOOKUP = async () => [{ address: "93.184.216.34", family: 4 }];

export interface McpHarnessOptions {
  /** Merged over a hermetic env (temp HOME and config path); `process.env` is never inherited. */
  readonly env?: Record<string, string | undefined>;
  readonly fakes?: AppOverrides;
  /** "modern" negotiates 2026-07-28 (client mode "auto"); "legacy" 2025-11-25 (client mode "legacy"). */
  readonly era?: "modern" | "legacy";
  /** Written as the config file before the app starts. */
  readonly config?: Record<string, unknown>;
  /** Applied to the app before the server factory, so a test can wrap a use case (e.g. count calls). */
  readonly wrapApp?: (app: App) => App;
}

export interface McpCallOptions {
  readonly signal?: AbortSignal;
  readonly onprogress?: (progress: { progress: number; message?: string }) => void;
}

export interface McpHarness {
  readonly client: Client;
  readonly app: App;
  readonly home: string;
  readonly logs: readonly string[];
  /** Calls a tool and parses its one text block as JSON. */
  readonly call: (
    name: string,
    args?: Record<string, unknown>,
    options?: McpCallOptions,
  ) => Promise<{ readonly isError: boolean; readonly json: unknown }>;
  /** Aborts the server's shutdown signal, as SIGTERM or a closed stdin does. */
  readonly shutdown: () => void;
  readonly close: () => Promise<void>;
}

const textOf = (content: unknown): string => {
  const [block] = Array.isArray(content) ? content : [];
  if (typeof block !== "object" || block === null || !("text" in block) || typeof block.text !== "string") {
    throw new Error(`Expected one text block, got ${JSON.stringify(content)}`);
  }
  return block.text;
};

/** Serves the MCP adapter over an in-memory transport with a hermetic app; `close` removes the temp HOME. */
export const connectMcp = async (options: McpHarnessOptions = {}): Promise<McpHarness> => {
  const home = mkdtempSync(path.join(os.tmpdir(), "pi-tube-mcp-"));
  const configPath = path.join(home, "config.json");
  if (options.config) {
    writeFileSync(configPath, JSON.stringify({ version: 1, defaults: {}, providers: {}, ...options.config }));
  }
  const env = { HOME: home, PI_TUBE_CONFIG_PATH: configPath, ...options.env };
  // No test resolves real DNS: hosts resolve to a public address unless a test passes its own lookup.
  const app = createApp(
    { env, cwd: process.cwd(), homedir: () => home, adapter: "mcp" },
    { lookup: PUBLIC_LOOKUP, ...options.fakes },
  );
  const logs: string[] = [];
  const log = createMcpLogger({ env, writeErr: (line) => logs.push(line) });
  const shutdown = new AbortController();
  const served = options.wrapApp ? options.wrapApp(app) : app;
  const deps = createMcpDeps({ app: served, log, version: "0.0.0-test", shutdown: shutdown.signal });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const handle = serveStdio(createMcpServerFactory(deps), { transport: serverTransport });
  const client = new Client(
    { name: "pi-tube-test", version: "0" },
    { capabilities: {}, versionNegotiation: { mode: options.era === "legacy" ? "legacy" : "auto" } },
  );
  await client.connect(clientTransport);

  return {
    client,
    app,
    home,
    logs,
    call: async (name, args = {}, callOptions = {}) => {
      const result = await client.callTool(
        { name, arguments: args },
        {
          ...(callOptions.signal ? { signal: callOptions.signal } : {}),
          ...(callOptions.onprogress ? { onprogress: callOptions.onprogress } : {}),
        },
      );
      return { isError: result.isError === true, json: JSON.parse(textOf(result.content)) };
    },
    shutdown: () => shutdown.abort(),
    close: async () => {
      await client.close();
      await handle.close();
      rmSync(home, { recursive: true, force: true });
    },
  };
};
