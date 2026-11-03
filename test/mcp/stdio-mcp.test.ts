import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { spawnMcp } from "../helpers/spawn-cli.ts";

const TOOLS = [
  "doctor",
  "download_media",
  "get_media_info",
  "get_transcript",
  "get_usage",
  "list_providers",
  "list_transcripts",
  "search_transcripts",
  "transcribe",
];

const initialize = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "stdio-test", version: "0" } },
};
const initialized = { jsonrpc: "2.0", method: "notifications/initialized" };
const call = (id: number, name: string, args: Record<string, unknown> = {}) => ({
  jsonrpc: "2.0",
  id,
  method: "tools/call",
  params: { name, arguments: args },
});

interface Message {
  readonly jsonrpc?: string;
  readonly id?: number;
  readonly result?: { tools?: Array<{ name: string }>; isError?: boolean; resourceTemplates?: unknown[] };
}

const parseAll = (lines: readonly string[]): Message[] => lines.map((line) => JSON.parse(line) as Message);

let home: string;

beforeEach(() => {
  home = mkdtempSync(path.join(os.tmpdir(), "pi-tube-stdio-"));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

describe("pi-tube mcp on stdio", () => {
  test("answers every request with JSON-RPC only on stdout, and exits 0 when stdin ends", async () => {
    const result = await spawnMcp([
      initialize,
      initialized,
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
      call(3, "list_providers"),
      call(4, "get_transcript", { transcript_id: "0123456789abcdef0123" }),
      { jsonrpc: "2.0", id: 5, method: "resources/templates/list" },
    ]);
    const messages = parseAll(result.stdoutLines);

    expect(result.exitCode).toBe(0);
    expect(messages.every((message) => message.jsonrpc === "2.0")).toBe(true);
    // Answers may come out of order: a tool call reads the config, a template list does not.
    const ids = messages.flatMap((message) => (message.id === undefined ? [] : [message.id]));
    expect(ids.sort((left, right) => left - right)).toEqual([1, 2, 3, 4, 5]);
    expect(
      messages
        .find((message) => message.id === 2)
        ?.result?.tools?.map((tool) => tool.name)
        .sort(),
    ).toEqual(TOOLS);
    expect(messages.find((message) => message.id === 4)?.result?.isError).toBe(true);
    expect(messages.find((message) => message.id === 5)?.result?.resourceTemplates).toHaveLength(1);
  });

  test("the v2 import and debug logs go to stderr, never stdout", async () => {
    mkdirSync(path.join(home, ".pi-tube"), { recursive: true });
    writeFileSync(
      path.join(home, ".pi-tube", "2026-04-10-aula-1.md"),
      readFileSync(path.join("test", "fixtures", "v2", "groq-timestamps.md")),
    );

    const result = await spawnMcp(
      [initialize, initialized, call(2, "list_transcripts"), call(3, "get_transcript", { transcript_id: "x" })],
      {
        HOME: home,
        PI_TUBE_LIBRARY_DIR: path.join(home, "library"),
        PI_TUBE_CONFIG_PATH: path.join(home, "config.json"),
        PI_TUBE_LOG_LEVEL: "debug",
      },
    );

    expect(result.exitCode).toBe(0);
    expect(parseAll(result.stdoutLines).every((message) => message.jsonrpc === "2.0")).toBe(true);
    expect(result.stderr).toContain("MCP server on stdio");
    expect(result.stderr).toContain("v2 import: found=1 imported=1");
  });

  test.skipIf(process.platform === "win32")("SIGTERM after initialize exits 0 within 5 s", async () => {
    const result = await spawnMcp([initialize, initialized], {}, { signalAfterMs: 0 });

    expect(result.exitCode).toBe(0);
    expect(result.exitedAfterSignalMs).toBeLessThan(5000);
    expect(parseAll(result.stdoutLines).map((message) => message.id)).toEqual([1]);
  });
});
