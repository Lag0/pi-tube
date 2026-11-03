import { writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import type { AppOverrides } from "../../src/bootstrap.ts";
import { createError, type ResolvedSource, type SttProvider } from "../../src/core/index.ts";
import { createFakeMediaFetcher } from "../helpers/fake-media.ts";
import { createFakeSttProvider } from "../helpers/fake-stt.ts";
import { connectMcp, type McpHarness, type McpHarnessOptions } from "../helpers/mcp-harness.ts";
import { fakeProviders, PROVIDER_KEYS } from "../helpers/transcribe-fakes.ts";

let harness: McpHarness | undefined;

afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

const YOUTUBE = "https://www.youtube.com/watch?v=jNQXAC9IVRw";
const INTRANET = "https://intranet.example.com/watch/1";
const PRIVATE_LOOKUP = async () => [{ address: "10.0.0.1", family: 4 }];
const LIVE: ResolvedSource = {
  kind: "youtube",
  originalInput: YOUTUBE,
  normalizedUrl: YOUTUBE,
  metadata: { platform: "Youtube", mediaId: "jNQXAC9IVRw", liveStatus: "is_live" },
};
const AUTH_REQUIRED = createError("SOURCE_AUTH_REQUIRED", "Sign in to confirm.");

interface Row {
  readonly tool: string;
  readonly code: string;
  readonly args: (home: string) => Record<string, unknown>;
  readonly options?: McpHarnessOptions;
}

const media = (options: Parameters<typeof createFakeMediaFetcher>[0] = {}): AppOverrides => ({
  media: createFakeMediaFetcher(options).fetcher,
  stt: fakeProviders(),
});

const textFile = (home: string): string => {
  const file = path.join(home, "notes.txt");
  writeFileSync(file, "text");
  return file;
};

const audioFile = (home: string): string => {
  const file = path.join(home, "a.mp3");
  writeFileSync(file, "audio");
  return file;
};

const ROWS: readonly Row[] = [
  {
    tool: "transcribe",
    code: "PROVIDER_NOT_CONFIGURED",
    args: () => ({ input: YOUTUBE }),
    options: { env: {}, fakes: media() },
  },
  { tool: "transcribe", code: "PROVIDER_INVALID", args: () => ({ input: YOUTUBE, provider: "whisper" }) },
  { tool: "transcribe", code: "LOCAL_FILE_NOT_FOUND", args: (home) => ({ input: path.join(home, "missing.mp3") }) },
  { tool: "transcribe", code: "LOCAL_FILE_UNSUPPORTED_EXTENSION", args: (home) => ({ input: textFile(home) }) },
  {
    tool: "transcribe",
    code: "SOURCE_HOST_BLOCKED",
    args: () => ({ input: INTRANET }),
    options: { fakes: { lookup: PRIVATE_LOOKUP, stt: fakeProviders() } },
  },
  {
    tool: "transcribe",
    code: "SOURCE_AUTH_REQUIRED",
    args: () => ({ input: YOUTUBE }),
    options: { fakes: media({ resolveError: AUTH_REQUIRED }) },
  },
  {
    tool: "transcribe",
    code: "SOURCE_LIVE_NOT_ENDED",
    args: () => ({ input: YOUTUBE }),
    options: { fakes: media({ source: LIVE }) },
  },
  {
    tool: "transcribe",
    code: "PROVIDER_AUTH",
    args: () => ({ input: "https://cdn.example.com/a.mp3", provider: "deepgram" }),
    options: {
      fakes: {
        media: createFakeMediaFetcher().fetcher,
        stt: fakeProviders({ deepgram: createError("PROVIDER_AUTH", "Key refused.") }),
      },
    },
  },
  {
    tool: "get_media_info",
    code: "SOURCE_HOST_BLOCKED",
    args: () => ({ input: INTRANET }),
    options: { fakes: { lookup: PRIVATE_LOOKUP } },
  },
  { tool: "get_media_info", code: "LOCAL_FILE_NOT_FOUND", args: (home) => ({ input: path.join(home, "missing.mp3") }) },
  {
    tool: "get_media_info",
    code: "SOURCE_AUTH_REQUIRED",
    args: () => ({ input: YOUTUBE }),
    options: { fakes: media({ resolveError: AUTH_REQUIRED }) },
  },
  { tool: "download_media", code: "DOWNLOAD_FAILED", args: (home) => ({ input: audioFile(home) }) },
  {
    tool: "download_media",
    code: "SOURCE_HOST_BLOCKED",
    args: () => ({ input: INTRANET }),
    options: { fakes: { lookup: PRIVATE_LOOKUP } },
  },
  {
    tool: "download_media",
    code: "SOURCE_LIVE_NOT_ENDED",
    args: () => ({ input: YOUTUBE }),
    options: { fakes: media({ source: LIVE }) },
  },
  { tool: "get_transcript", code: "TRANSCRIPT_NOT_FOUND", args: () => ({ transcript_id: "0123456789abcdef0123" }) },
  { tool: "list_transcripts", code: "INPUT_INVALID", args: () => ({ since: "2026-11-02", until: "2026-11-01" }) },
  {
    tool: "search_transcripts",
    code: "INPUT_INVALID",
    args: () => ({ query: "aula", since: "2026-11-02", until: "2026-11-01" }),
  },
  { tool: "get_usage", code: "INPUT_INVALID", args: () => ({ since: "2026-11-02", until: "2026-11-01" }) },
  { tool: "list_providers", code: "CONFIG_INVALID", args: () => ({}), options: { config: { version: "one" } } },
];

describe("every tool error is isError with its code and catalog hint", () => {
  test.each(ROWS)("$tool → $code", async (row) => {
    harness = await connectMcp({ env: PROVIDER_KEYS, fakes: { stt: fakeProviders() }, ...row.options });

    const { isError, json } = await harness.call(row.tool, row.args(harness.home));
    const { error } = json as { error: { code: string; message: string; hint: string } };

    expect(isError).toBe(true);
    expect(error.code).toBe(row.code);
    expect(error.message.length).toBeGreaterThan(0);
    expect(error.hint.length).toBeGreaterThan(0);
  });
});

describe("UNEXPECTED and CANCELLED", () => {
  test("a provider that throws is UNEXPECTED, without a stack in the result", async () => {
    const throwing: SttProvider = {
      ...createFakeSttProvider("deepgram"),
      transcribe: async () => {
        throw new SyntaxError("Unexpected token < in JSON at position 0");
      },
    };
    harness = await connectMcp({
      env: PROVIDER_KEYS,
      fakes: { media: createFakeMediaFetcher().fetcher, stt: { ...fakeProviders(), deepgram: throwing } },
    });

    const { isError, json } = await harness.call("transcribe", {
      input: "https://cdn.example.com/a.mp3",
      provider: "deepgram",
    });

    expect(isError).toBe(true);
    expect(json).toMatchObject({ error: { code: "UNEXPECTED", message: "Unexpected token < in JSON at position 0" } });
    expect(JSON.stringify(json)).not.toMatch(/\bat .*\.ts:\d+/);
  });

  test("a server shutdown during a transcription is CANCELLED", async () => {
    const deepgram = createFakeSttProvider("deepgram", undefined, { waitForAbort: true });
    harness = await connectMcp({
      env: PROVIDER_KEYS,
      fakes: { media: createFakeMediaFetcher().fetcher, stt: { ...fakeProviders(), deepgram } },
    });
    const mcp = harness;

    const pending = mcp.call("transcribe", { input: "https://cdn.example.com/a.mp3", provider: "deepgram" });
    for (let tries = 0; deepgram.requests.length === 0 && tries < 1000; tries += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    mcp.shutdown();
    const { isError, json } = await pending;

    expect(isError).toBe(true);
    expect(json).toMatchObject({ error: { code: "CANCELLED" } });
  });
});
