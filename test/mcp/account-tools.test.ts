import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { createFakeMediaFetcher } from "../helpers/fake-media.ts";
import { connectMcp, type McpHarness } from "../helpers/mcp-harness.ts";
import { fakeProviders } from "../helpers/transcribe-fakes.ts";

let harness: McpHarness | undefined;

afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

describe("list_providers", () => {
  test("shows where each key comes from, never the key", async () => {
    harness = await connectMcp({ env: { GROQ_API_KEY: "gq-test-key" } });

    const { isError, json } = await harness.call("list_providers");

    expect(isError).toBe(false);
    expect(json).toMatchObject({
      config_path: path.join(harness.home, "config.json"),
      providers: [
        { id: "deepgram", configured: false, key_source: "none", env_name: null, overrides_config_key: false },
        { id: "groq", configured: true, key_source: "env", env_name: "GROQ_API_KEY", overrides_config_key: false },
        { id: "elevenlabs", configured: false, key_source: "none", env_name: null, overrides_config_key: false },
      ],
      next_actions: [{ tool: "transcribe" }],
    });
    expect(JSON.stringify(json)).not.toContain("gq-test-key");
    expect(json).not.toHaveProperty("hint");
  });

  test("with no key it says how to add one, outside the chat", async () => {
    harness = await connectMcp();

    const { json } = await harness.call("list_providers");

    expect(json).toMatchObject({
      hint: "No provider has a key. Ask the user to run `pi-tube auth login <provider>` in a terminal, or to set its key variable (for example `GROQ_API_KEY`) in this app's MCP server config.",
      next_actions: [],
    });
  });
});

describe("doctor", () => {
  test("returns the report, with transcribe as the next action when it is ok", async () => {
    harness = await connectMcp({
      env: { GROQ_API_KEY: "gq-test-key" },
      fakes: { media: createFakeMediaFetcher().fetcher },
    });

    const { isError, json } = await harness.call("doctor");

    expect(isError).toBe(false);
    expect(json).toMatchObject({
      ok: true,
      checks: expect.arrayContaining([
        { id: "provider:groq", status: "ok", summary: "Key from `GROQ_API_KEY`.", fix: null },
        {
          id: "provider:deepgram",
          status: "warn",
          summary: "No key.",
          fix: "Run `pi-tube auth login deepgram` or set `DEEPGRAM_API_KEY`.",
        },
      ]),
      next_actions: [{ tool: "transcribe" }],
    });
  });

  test("a report that is not ok has no next action", async () => {
    harness = await connectMcp({ fakes: { media: createFakeMediaFetcher().fetcher } });

    const { json } = await harness.call("doctor");

    expect(json).toMatchObject({ ok: false, next_actions: [] });
  });
});

describe("get_usage", () => {
  const priced = () => ({
    ...fakeProviders().deepgram,
    model: "nova-3",
    transcribe: async () => ({
      success: true as const,
      data: { text: "hello", segments: [], durationSeconds: 19 },
    }),
  });

  test("returns the period's stats and the records, made by the mcp adapter", async () => {
    harness = await connectMcp({
      env: { DEEPGRAM_API_KEY: "dg-test-key" },
      fakes: { media: createFakeMediaFetcher().fetcher, stt: { ...fakeProviders(), deepgram: priced() } },
    });
    await harness.app.getMediaInfo({ input: "https://cdn.example.com/a.mp3" });
    await harness.app.transcribe({ input: "https://cdn.example.com/a.mp3", format: "json" });

    const { isError, json } = await harness.call("get_usage");

    expect(isError).toBe(false);
    expect(json).toMatchObject({
      since: null,
      until: null,
      currency: "USD",
      price_table: "2026-10-31",
      stats: { total: { operations: 2, errors: 0, cost_estimate: 0.001362 } },
      total: 2,
      offset: 0,
      limit: 10,
      next_offset: null,
      skipped_lines: 0,
    });
    const records = (json as { records: Array<Record<string, unknown>> }).records;
    expect(records.map((record) => [record.operation, record.adapter])).toEqual([
      ["transcribe", "mcp"],
      ["info", "mcp"],
    ]);
    expect(records[0]).toMatchObject({
      provider: "deepgram",
      model: "nova-3",
      cost_estimate: 0.001362,
      cache_hit: false,
    });
    expect(Object.keys(records[0] ?? {})).toEqual([
      "started_at",
      "operation",
      "adapter",
      "result",
      "error_code",
      "provider",
      "model",
      "input",
      "source_key",
      "audio_seconds",
      "cost_estimate",
      "cache_hit",
      "duration_ms",
    ]);
  });

  test("since after until is INPUT_INVALID", async () => {
    harness = await connectMcp();

    const { isError, json } = await harness.call("get_usage", { since: "2026-11-02", until: "2026-11-01" });

    expect(isError).toBe(true);
    expect(json).toMatchObject({
      error: { code: "INPUT_INVALID", message: "`since` must not be after `until`." },
    });
  });

  test("a limit over 100 is refused by the input schema", async () => {
    harness = await connectMcp();

    const result = await harness.client.callTool({ name: "get_usage", arguments: { limit: 101 } });

    expect(result.isError).toBe(true);
  });
});
