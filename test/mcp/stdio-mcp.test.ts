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

  test("a dependency's console.log goes to stderr, and DEBUG=true is dropped (groq-sdk would print the key)", async () => {
    // A preload stands in for a dependency that logs once pi-tube is running.
    writeFileSync(path.join(home, "bunfig.toml"), 'preload = ["./noisy.ts"]\n');
    writeFileSync(
      path.join(home, "noisy.ts"),
      [
        "const original = console.log;",
        // biome-ignore lint/suspicious/noTemplateCurlyInString: this is the preload's source code, written to a file
        'const report = () => console.log(`NOISY debug=${process.env.DEBUG ?? "unset"}`);',
        "const poll = setInterval(() => { if (console.log !== original) { clearInterval(poll); report(); } }, 5);",
        "poll.unref();",
        "",
      ].join("\n"),
    );

    const result = await spawnMcp([initialize, initialized], { DEBUG: "true" }, { cwd: home, endAfterMs: 300 });

    expect(result.exitCode).toBe(0);
    expect(result.stdoutLines.every((line) => (JSON.parse(line) as Message).jsonrpc === "2.0")).toBe(true);
    expect(result.stderr).toContain("NOISY debug=unset");
  });

  test("a thrown error is UNEXPECTED on stdout without its stack; the error and stack go to stderr", async () => {
    // A preload makes serializing list_providers' result throw, a failure no use case returns as a Result.
    writeFileSync(path.join(home, "bunfig.toml"), 'preload = ["./explode.ts"]\n');
    writeFileSync(
      path.join(home, "explode.ts"),
      [
        "const original = JSON.stringify;",
        "JSON.stringify = function (value, ...rest) {",
        '  if (value && typeof value === "object" && "config_path" in value) throw new TypeError("stringify exploded");',
        "  return original.call(this, value, ...rest);",
        "};",
        "",
      ].join("\n"),
    );

    const result = await spawnMcp(
      [initialize, initialized, call(2, "list_providers")],
      { PI_TUBE_LOG_LEVEL: "debug" },
      {
        cwd: home,
      },
    );
    const messages = parseAll(result.stdoutLines);
    const answer = messages.find((message) => message.id === 2) as
      | { result?: { isError?: boolean; content?: Array<{ text: string }> } }
      | undefined;

    expect(result.exitCode).toBe(0);
    expect(messages.every((message) => message.jsonrpc === "2.0")).toBe(true);
    expect(answer?.result?.isError).toBe(true);
    expect(JSON.parse(answer?.result?.content?.[0]?.text ?? "{}")).toMatchObject({
      error: { code: "UNEXPECTED", message: "stringify exploded" },
    });
    expect(result.stdoutLines.join("\n")).not.toMatch(/\bat .*\.ts:\d+/);
    expect(result.stderr).toContain("Tool failed unexpectedly");
    expect(result.stderr).toMatch(/Stack stack=.*explode\.ts/);
  });

  test.skipIf(process.platform === "win32")("SIGTERM after initialize exits 0 within 5 s", async () => {
    const result = await spawnMcp([initialize, initialized], {}, { signalAfterMs: 0 });

    expect(result.exitCode).toBe(0);
    expect(result.exitedAfterSignalMs).toBeLessThan(5000);
    expect(parseAll(result.stdoutLines).map((message) => message.id)).toEqual([1]);
  });
});
