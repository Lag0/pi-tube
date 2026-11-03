import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import type { App } from "../../src/bootstrap.ts";
import { createError, ok, renderMarkdown, type SiteSource } from "../../src/core/index.ts";
import { createFakeMediaFetcher } from "../helpers/fake-media.ts";
import { connectMcp, type McpHarness, type McpHarnessOptions } from "../helpers/mcp-harness.ts";
import { fakeProviders, PROVIDER_KEYS, transcript } from "../helpers/transcribe-fakes.ts";

let harness: McpHarness | undefined;

afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

const youtube = (id: string) => `https://www.youtube.com/watch?v=${id}`;

/** A fake media fetcher whose YouTube pages carry the given titles. */
const pages = (titles: Readonly<Record<string, string>>) => {
  const media = createFakeMediaFetcher();
  return {
    ...media.fetcher,
    resolve: async (input: string) => {
      const id = new URL(input).searchParams.get("v") ?? "";
      const source: SiteSource = {
        kind: "youtube",
        originalInput: input,
        normalizedUrl: input,
        metadata: { platform: "Youtube", mediaId: id, ...(titles[id] ? { title: titles[id] } : {}) },
      };
      return ok(source);
    },
  };
};

const TITLES = { aaaaaaaaaaa: "Aula de Ação Penal", bbbbbbbbbbb: "Reunião semanal", ccccccccccc: "Aula civil" };

/** Three transcripts, oldest first: A (groq), B (deepgram), C (groq). */
const seeded = async (options: McpHarnessOptions = {}) => {
  harness = await connectMcp({
    env: PROVIDER_KEYS,
    fakes: { media: pages(TITLES), stt: fakeProviders() },
    ...options,
  });
  const ids: string[] = [];
  for (const [id, provider] of [
    ["aaaaaaaaaaa", "groq"],
    ["bbbbbbbbbbb", "deepgram"],
    ["ccccccccccc", "groq"],
  ] as const) {
    const done = await harness.app.transcribe({ input: youtube(id), provider, format: "json" });
    if (!done.success) throw new Error(done.error.message);
    ids.push(done.data.transcriptId);
    // Distinct generated_at values, so newest-first order is fixed.
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return { harness, ids };
};

interface ListJson {
  total: number;
  next_offset: number | null;
  transcripts: Array<Record<string, unknown> & { transcript_id: string; untrusted: { title: string | null } }>;
  next_actions: Array<{ tool: string; arguments: Record<string, unknown>; reason: string }>;
}

describe("list_transcripts", () => {
  test("concise entries are newest first, with the size and the title under untrusted", async () => {
    const { harness: mcp, ids } = await seeded();

    const { isError, json } = await mcp.call("list_transcripts");
    const list = json as ListJson;

    expect(isError).toBe(false);
    expect(list.total).toBe(3);
    expect(list.transcripts.map((entry) => entry.transcript_id)).toEqual([...ids].reverse());
    expect(Object.keys(list.transcripts[0] ?? {})).toEqual([
      "transcript_id",
      "kind",
      "provider",
      "language",
      "generated_at",
      "characters",
      "estimated_tokens",
      "untrusted",
    ]);
    expect(list.transcripts[0]).toMatchObject({
      kind: "youtube",
      provider: "groq",
      language: null,
      characters: "hello groq".length,
      estimated_tokens: 3,
      untrusted: { title: "Aula civil" },
    });
    expect(list.next_actions).toEqual([
      {
        tool: "get_transcript",
        arguments: { transcript_id: ids[2] },
        reason: "Check characters and estimated_tokens, then read with offset/limit pages or full: true.",
      },
    ]);
  });

  test("detailed entries add the source and transcription facts", async () => {
    const { harness: mcp } = await seeded();

    const { json } = await mcp.call("list_transcripts", { response_format: "detailed" });

    expect((json as ListJson).transcripts[0]).toMatchObject({
      source_key: "youtube:ccccccccccc",
      platform: "Youtube",
      model: "groq-fake-model",
      requested_language: null,
      detected_language: null,
      source_name: youtube("ccccccccccc"),
    });
  });

  test("filters by provider, and points to the next page", async () => {
    const { harness: mcp, ids } = await seeded();

    const { json } = await mcp.call("list_transcripts", { provider: "groq", limit: 1 });
    const list = json as ListJson;

    expect(list).toMatchObject({ total: 2, next_offset: 1 });
    expect(list.transcripts.map((entry) => entry.transcript_id)).toEqual([ids[2]]);
    expect(list.next_actions.map((action) => [action.tool, action.arguments])).toEqual([
      ["get_transcript", { transcript_id: ids[2] }],
      ["list_transcripts", { provider: "groq", limit: 1, offset: 1 }],
    ]);
  });

  test("since after until is INPUT_INVALID", async () => {
    harness = await connectMcp();

    const { isError, json } = await harness.call("list_transcripts", { since: "2026-11-02", until: "2026-11-01" });

    expect(isError).toBe(true);
    expect(json).toMatchObject({ error: { code: "INPUT_INVALID" } });
  });
});

describe("search_transcripts", () => {
  test("matches title words ignoring case and accents, and echoes the query", async () => {
    const { harness: mcp, ids } = await seeded();

    const { json } = await mcp.call("search_transcripts", { query: "AULA acao" });

    expect(json).toMatchObject({ query: "AULA acao", total: 1 });
    expect((json as ListJson).transcripts.map((entry) => entry.transcript_id)).toEqual([ids[0]]);
  });

  test("an empty query is refused", async () => {
    harness = await connectMcp();

    const result = await harness.client.callTool({ name: "search_transcripts", arguments: { query: "" } });

    expect(result.isError).toBe(true);
  });
});

interface PageJson {
  transcript_id: string;
  total: number;
  next_offset: number | null;
  truncated: boolean;
  resource_uri: string;
  untrusted: { text?: string; segments?: unknown[]; chapters: unknown[] };
  next_actions: Array<{ tool: string; arguments: Record<string, unknown> }>;
  hint?: string;
}

// 150 segments of about 333 characters: a transcript of about 50,000 characters.
const SEGMENTS = Array.from({ length: 150 }, (_, index) => ({
  startMs: index * 10_000,
  endMs: index * 10_000 + 9_000,
  text: `${index}: ${"palavra ".repeat(41)}`.trim(),
}));
const BIG_TEXT = SEGMENTS.map((segment) => segment.text).join(" ");

const big = async (options: McpHarnessOptions = {}) => {
  harness = await connectMcp({
    env: PROVIDER_KEYS,
    fakes: { media: pages({}), stt: fakeProviders({ groq: transcript(BIG_TEXT, "pt", SEGMENTS) }) },
    ...options,
  });
  const done = await harness.app.transcribe({ input: youtube("ddddddddddd"), provider: "groq", format: "json" });
  if (!done.success) throw new Error(done.error.message);
  return { harness, id: done.data.transcriptId };
};

describe("get_transcript", () => {
  test("the default page is 20000 characters, and pages concatenate to the whole text", async () => {
    const { harness: mcp, id } = await big();
    const texts: string[] = [];
    let offset: number | null = 0;
    let first: PageJson | undefined;

    while (offset !== null) {
      const page = (await mcp.call("get_transcript", { transcript_id: id, offset })).json as PageJson;
      first ??= page;
      texts.push(page.untrusted.text ?? "");
      offset = page.next_offset;
    }

    expect(BIG_TEXT.length).toBeGreaterThan(49_000);
    expect(first).toMatchObject({
      transcript_id: id,
      total: BIG_TEXT.length,
      next_offset: 20_000,
      truncated: false,
      resource_uri: `pi-tube://transcripts/${id}`,
      next_actions: [{ tool: "get_transcript", arguments: { transcript_id: id, offset: 20_000 } }],
    });
    expect(first?.untrusted.text).toHaveLength(20_000);
    expect(first?.hint).toBe(
      `This is not the whole transcript: 20000 of ${BIG_TEXT.length} characters. Continue with get_transcript offset=20000.`,
    );
    expect(texts.join("")).toBe(BIG_TEXT);
  });

  test("full over mcp.max_full_chars is truncated and says so", async () => {
    const { harness: mcp, id } = await big({ config: { mcp: { max_full_chars: 1000 } } });

    const { json } = await mcp.call("get_transcript", { transcript_id: id, full: true });
    const page = json as PageJson;

    expect(page).toMatchObject({ truncated: true, next_offset: 1000, total: BIG_TEXT.length });
    expect(page.untrusted.text).toHaveLength(1000);
    expect(page.hint).toBe(
      `This is not the whole transcript: 1000 of ${BIG_TEXT.length} characters. Continue with get_transcript offset=1000.`,
    );
  });

  test("format segments pages 100 segments by default", async () => {
    const { harness: mcp, id } = await big();

    const { json } = await mcp.call("get_transcript", { transcript_id: id, format: "segments" });
    const page = json as PageJson;

    expect(page.untrusted.segments).toHaveLength(100);
    expect(page.untrusted.segments?.[0]).toEqual({ start_ms: 0, end_ms: 9000, text: SEGMENTS[0]?.text });
    expect(page).toMatchObject({ total: 150, next_offset: 100 });
  });

  test("an unknown id is TRANSCRIPT_NOT_FOUND with the catalog hint", async () => {
    harness = await connectMcp();

    const { isError, json } = await harness.call("get_transcript", { transcript_id: "0123456789abcdef0123" });

    expect(isError).toBe(true);
    expect(json).toEqual({
      error: {
        code: "TRANSCRIPT_NOT_FOUND",
        message: "No transcript `0123456789abcdef0123` in the library.",
        hint: createError("TRANSCRIPT_NOT_FOUND", "x").hint,
      },
    });
  });

  test("a limit over 40000 is refused", async () => {
    harness = await connectMcp();

    const result = await harness.client.callTool({
      name: "get_transcript",
      arguments: { transcript_id: "0123456789abcdef0123", limit: 40_001 },
    });

    expect(result.isError).toBe(true);
  });
});

describe("pi-tube://transcripts/{id}", () => {
  test("reads the transcript as its Markdown", async () => {
    const { harness: mcp, ids } = await seeded();
    const stored = await mcp.app.getTranscript({ transcriptId: ids[0] ?? "" });
    if (!stored.success) throw new Error(stored.error.message);

    const read = await mcp.client.readResource({ uri: `pi-tube://transcripts/${ids[0]}` });

    expect(read.contents).toEqual([
      {
        uri: `pi-tube://transcripts/${ids[0]}`,
        mimeType: "text/markdown",
        text: renderMarkdown(stored.data.artifact),
      },
    ]);
  });

  test("an unknown id is a JSON-RPC error naming TRANSCRIPT_NOT_FOUND", async () => {
    harness = await connectMcp();

    await expect(harness.client.readResource({ uri: "pi-tube://transcripts/0123456789abcdef0123" })).rejects.toThrow(
      /\[TRANSCRIPT_NOT_FOUND\]/,
    );
  });

  test("resources/templates/list lists the template", async () => {
    harness = await connectMcp();

    const { resourceTemplates } = await harness.client.listResourceTemplates();

    expect(resourceTemplates).toEqual([
      expect.objectContaining({
        uriTemplate: "pi-tube://transcripts/{id}",
        name: "transcript",
        mimeType: "text/markdown",
      }),
    ]);
  });
});

describe("v2 import", () => {
  const seedV2 = (home: string): void => {
    const dir = path.join(home, ".pi-tube");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      path.join(dir, "2026-04-10-aula-1.md"),
      readFileSync(path.join("test", "fixtures", "v2", "groq-timestamps.md")),
    );
  };

  test("runs once under concurrent calls, and both see the imported transcript", async () => {
    let imports = 0;
    harness = await connectMcp({
      env: { PI_TUBE_LOG_LEVEL: "info" },
      wrapApp: (app: App): App => ({
        ...app,
        importV2Transcripts: (input, options) => {
          imports += 1;
          return app.importV2Transcripts(input, options);
        },
      }),
    });
    seedV2(harness.home);

    const [first, second] = await Promise.all([harness.call("list_transcripts"), harness.call("list_transcripts")]);

    expect(imports).toBe(1);
    expect((first.json as ListJson).total).toBe(1);
    expect((second.json as ListJson).total).toBe(1);
    expect(harness.logs.join("")).toContain("v2 import: found=1 imported=1 already=0 skipped=0");
  });
});
