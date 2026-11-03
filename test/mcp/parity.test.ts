import { writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import type { AppOverrides } from "../../src/bootstrap.ts";
import { createError, type ResolvedSource } from "../../src/core/index.ts";
import { runCliInProcess } from "../helpers/cli-harness.ts";
import { createFakeMediaFetcher } from "../helpers/fake-media.ts";
import { createFakeSttProvider, TRANSCRIPT_HELLO } from "../helpers/fake-stt.ts";
import { connectMcp, type McpHarness } from "../helpers/mcp-harness.ts";
import { fakeProviders, PROVIDER_KEYS } from "../helpers/transcribe-fakes.ts";

let harness: McpHarness | undefined;

afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

const YOUTUBE = "https://www.youtube.com/watch?v=jNQXAC9IVRw";
const PAGE: ResolvedSource = {
  kind: "youtube",
  originalInput: YOUTUBE,
  normalizedUrl: YOUTUBE,
  metadata: {
    platform: "Youtube",
    mediaId: "jNQXAC9IVRw",
    title: "Me at the zoo",
    durationSeconds: 19,
    chapters: [{ title: "Intro", startMs: 0, endMs: 1000 }],
  },
};

const pricedFakes = (): AppOverrides => ({
  media: createFakeMediaFetcher({ source: PAGE }).fetcher,
  stt: {
    ...fakeProviders(),
    deepgram: { ...createFakeSttProvider("deepgram", { ...TRANSCRIPT_HELLO, durationSeconds: 19 }), model: "nova-3" },
  },
});

/** An MCP server and a CLI on the same HOME, config and library, with the same fakes and env. */
const both = async (env: Record<string, string>, fakes: AppOverrides) => {
  harness = await connectMcp({ env, fakes });
  const home = harness.home;
  const cli = (args: string[]) =>
    runCliInProcess(args, { env: { HOME: home, PI_TUBE_CONFIG_PATH: path.join(home, "config.json"), ...env }, fakes });
  return { mcp: harness, cli };
};

const json = (stdout: string): Record<string, unknown> => JSON.parse(stdout) as Record<string, unknown>;

describe("CLI and MCP agree on results", () => {
  test("transcribe", async () => {
    // Separate HOMEs, so both are fresh transcriptions of the same input.
    const cliRun = await runCliInProcess(["transcribe", YOUTUBE, "--provider", "deepgram", "--json"], {
      env: PROVIDER_KEYS,
      fakes: pricedFakes(),
    });
    harness = await connectMcp({ env: PROVIDER_KEYS, fakes: pricedFakes() });
    const mcpRun = await harness.call("transcribe", { input: YOUTUBE, provider: "deepgram" });
    const pick = (value: Record<string, unknown>) => ({
      transcript_id: value.transcript_id,
      cache_hit: value.cache_hit,
      provider: value.provider,
      characters: value.characters,
      estimated_tokens: value.estimated_tokens,
      audio_seconds: value.audio_seconds,
      cost: value.cost,
    });

    expect(cliRun.exitCode).toBe(0);
    expect(pick(mcpRun.json as Record<string, unknown>)).toEqual(pick(json(cliRun.stdout)));
    expect(pick(json(cliRun.stdout)).cost).toEqual({ estimate: 0.001362, currency: "USD", price_table: "2026-10-31" });
  });

  test("info and get_media_info", async () => {
    const { mcp, cli } = await both(PROVIDER_KEYS, pricedFakes());

    const fromCli = json((await cli(["info", YOUTUBE, "--json"])).stdout);
    const fromMcp = (await mcp.call("get_media_info", { input: YOUTUBE, response_format: "detailed" })).json as {
      source_kind: string;
      duration_seconds: number;
      untrusted: { title: string; chapters: Array<{ index: number; title: string; start_ms: number; end_ms: number }> };
    };

    expect({
      source_kind: fromMcp.source_kind,
      title: fromMcp.untrusted.title,
      duration_seconds: fromMcp.duration_seconds,
      chapters: fromMcp.untrusted.chapters.map(({ index: _index, ...chapter }) => chapter),
    }).toEqual({
      source_kind: fromCli.source_kind,
      title: fromCli.title,
      duration_seconds: fromCli.duration_seconds,
      chapters: fromCli.chapters,
    });
  });

  test("library list and list_transcripts", async () => {
    const { mcp, cli } = await both(PROVIDER_KEYS, { media: createFakeMediaFetcher().fetcher, stt: fakeProviders() });
    for (const name of ["a", "b", "c"]) {
      await mcp.call("transcribe", { input: `https://cdn.example.com/${name}.mp3` });
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    const fromCli = json((await cli(["library", "list", "--json"])).stdout) as {
      total: number;
      entries: Array<{ transcript_id: string }>;
    };
    const fromMcp = (await mcp.call("list_transcripts")).json as {
      total: number;
      transcripts: Array<{ transcript_id: string }>;
    };

    expect(fromMcp.total).toBe(3);
    expect(fromMcp.total).toBe(fromCli.total);
    expect(fromMcp.transcripts.map((entry) => entry.transcript_id)).toEqual(
      fromCli.entries.map((entry) => entry.transcript_id),
    );
  });

  test("providers and list_providers", async () => {
    const { mcp, cli } = await both({ GROQ_API_KEY: "gq-test-key" }, {});
    const keySources = (providers: Array<{ id: string; key_source: string }>) =>
      providers.map((provider) => [provider.id, provider.key_source]);

    const fromCli = json((await cli(["providers", "--json"])).stdout) as {
      providers: Array<{ id: string; key_source: string }>;
    };
    const fromMcp = (await mcp.call("list_providers")).json as { providers: Array<{ id: string; key_source: string }> };

    expect(keySources(fromMcp.providers)).toEqual(keySources(fromCli.providers));
  });

  test("audit stats and get_usage", async () => {
    const { mcp, cli } = await both(PROVIDER_KEYS, pricedFakes());
    await mcp.call("transcribe", { input: YOUTUBE, provider: "deepgram" });
    await cli(["info", YOUTUBE]);

    const fromCli = json((await cli(["audit", "stats", "--json"])).stdout) as {
      total: { operations: number; cost_estimate: number };
    };
    const fromMcp = (await mcp.call("get_usage")).json as {
      stats: { total: { operations: number; cost_estimate: number } };
    };

    expect(fromMcp.stats.total.operations).toBe(2);
    expect(fromMcp.stats.total).toMatchObject({
      operations: fromCli.total.operations,
      cost_estimate: fromCli.total.cost_estimate,
    });
  });
});

/** The code and hint the CLI printed on stderr. */
const cliError = (stderr: string) => ({
  code: /^\[([A-Z_]+)\]/m.exec(stderr)?.[1],
  hint: /^hint: (.*)$/m.exec(stderr)?.[1],
});

const mcpError = (value: unknown) => {
  const { error } = value as { error: { code: string; hint: string } };
  return { code: error.code, hint: error.hint };
};

interface ErrorCase {
  readonly code: string;
  readonly env?: Record<string, string>;
  readonly fakes?: AppOverrides;
  /** Prepares a file in HOME and returns its path, for the local file cases. */
  readonly file?: (home: string) => string;
  readonly cli: (input: string) => string[];
  readonly tool: string;
  readonly args: (input: string) => Record<string, unknown>;
  readonly input?: string;
}

const CASES: readonly ErrorCase[] = [
  {
    code: "PROVIDER_NOT_CONFIGURED",
    env: {},
    fakes: { media: createFakeMediaFetcher().fetcher, stt: fakeProviders() },
    cli: (input) => ["transcribe", input],
    tool: "transcribe",
    args: (input) => ({ input }),
  },
  {
    code: "PROVIDER_INVALID",
    cli: (input) => ["transcribe", input, "--provider", "whisper"],
    tool: "transcribe",
    args: (input) => ({ input, provider: "whisper" }),
  },
  {
    code: "LOCAL_FILE_NOT_FOUND",
    file: (home) => path.join(home, "missing.mp3"),
    cli: (input) => ["transcribe", input],
    tool: "transcribe",
    args: (input) => ({ input }),
  },
  {
    code: "LOCAL_FILE_UNSUPPORTED_EXTENSION",
    file: (home) => {
      const file = path.join(home, "notes.txt");
      writeFileSync(file, "text");
      return file;
    },
    cli: (input) => ["transcribe", input],
    tool: "transcribe",
    args: (input) => ({ input }),
  },
  {
    code: "SOURCE_HOST_BLOCKED",
    fakes: { lookup: async () => [{ address: "10.0.0.1", family: 4 }], stt: fakeProviders() },
    input: "https://intranet.example.com/watch/1",
    cli: (input) => ["info", input],
    tool: "get_media_info",
    args: (input) => ({ input }),
  },
  {
    code: "SOURCE_AUTH_REQUIRED",
    fakes: {
      media: createFakeMediaFetcher({ resolveError: createError("SOURCE_AUTH_REQUIRED", "Sign in to confirm.") })
        .fetcher,
      stt: fakeProviders(),
    },
    cli: (input) => ["transcribe", input],
    tool: "transcribe",
    args: (input) => ({ input }),
  },
  {
    code: "PROVIDER_AUTH",
    fakes: {
      media: createFakeMediaFetcher().fetcher,
      stt: fakeProviders({ deepgram: createError("PROVIDER_AUTH", "Key refused.") }),
    },
    input: "https://cdn.example.com/a.mp3",
    cli: (input) => ["transcribe", input, "--provider", "deepgram"],
    tool: "transcribe",
    args: (input) => ({ input, provider: "deepgram" }),
  },
  {
    code: "TRANSCRIPT_NOT_FOUND",
    input: "0123456789abcdef0123",
    cli: (input) => ["library", "show", input],
    tool: "get_transcript",
    args: (input) => ({ transcript_id: input }),
  },
  {
    code: "DOWNLOAD_FAILED",
    file: (home) => {
      const file = path.join(home, "a.mp3");
      writeFileSync(file, "audio");
      return file;
    },
    cli: (input) => ["download", input],
    tool: "download_media",
    args: (input) => ({ input }),
  },
  {
    code: "INPUT_INVALID",
    input: "",
    cli: () => ["audit", "--since", "2026-11-02", "--until", "2026-11-01"],
    tool: "get_usage",
    args: () => ({ since: "2026-11-02", until: "2026-11-01" }),
  },
];

describe("CLI and MCP agree on errors", () => {
  test.each(CASES)("$code: the same code and hint", async (errorCase) => {
    const { mcp, cli } = await both(errorCase.env ?? PROVIDER_KEYS, errorCase.fakes ?? { stt: fakeProviders() });
    const input = errorCase.file ? errorCase.file(mcp.home) : (errorCase.input ?? YOUTUBE);

    const fromCli = await cli(errorCase.cli(input));
    const fromMcp = await mcp.call(errorCase.tool, errorCase.args(input));

    expect(fromMcp.isError).toBe(true);
    expect(mcpError(fromMcp.json)).toEqual({ code: errorCase.code, hint: expect.any(String) });
    expect(cliError(fromCli.stderr)).toEqual(mcpError(fromMcp.json));
  });
});
