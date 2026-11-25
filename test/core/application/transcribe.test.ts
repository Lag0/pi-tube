import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { copyFile, link } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createDownloadMedia } from "../../../src/core/application/download-media.ts";
import { createTranscribe, type TranscribeDeps } from "../../../src/core/application/transcribe.ts";
import type { PiTubeConfig } from "../../../src/core/domain/config.ts";
import { createError } from "../../../src/core/domain/errors.ts";
import { err } from "../../../src/core/domain/result.ts";
import { renderMarkdown } from "../../../src/core/domain/transcript/render-markdown.ts";
import {
  createFileLibraryStore,
  sourceDirName,
  transcriptIdOf,
} from "../../../src/infrastructure/library/file-library-store.ts";
import { createMediaFetcher } from "../../../src/infrastructure/media/media-fetcher.ts";
import { PROVIDER_DESCRIPTORS } from "../../../src/infrastructure/stt/registry.ts";
import { createFakeMediaFetcher } from "../../helpers/fake-media.ts";
import { createFakeSttProvider, TRANSCRIPT_HELLO } from "../../helpers/fake-stt.ts";
import { auditDepsFor, createInMemoryAuditLog } from "../../helpers/in-memory-audit-log.ts";
import { createInMemoryConfigStore } from "../../helpers/in-memory-config-store.ts";

const INPUT = "https://cdn.example.com/audio/demo.wav";
const NOW = new Date(2026, 9, 30, 12, 0, 0);

let outputDir: string;

beforeEach(() => {
  outputDir = mkdtempSync(path.join(os.tmpdir(), "pi-tube-transcribe-"));
});

afterEach(() => {
  rmSync(outputDir, { recursive: true, force: true });
});

const config = (overrides: Partial<PiTubeConfig> = {}): PiTubeConfig => ({
  version: 1,
  defaults: {},
  providers: {},
  ...overrides,
});

const setup = (options: { env?: Record<string, string>; config?: PiTubeConfig } = {}) => {
  const stt = {
    deepgram: createFakeSttProvider("deepgram"),
    groq: createFakeSttProvider("groq"),
    elevenlabs: createFakeSttProvider("elevenlabs"),
  };
  const media = createFakeMediaFetcher();
  const audit = createInMemoryAuditLog();
  const deps: TranscribeDeps = {
    configStore: createInMemoryConfigStore(options.config ?? config()),
    env: options.env ?? {},
    providers: PROVIDER_DESCRIPTORS,
    stt,
    media: media.fetcher,
    library: createFileLibraryStore({ libraryDir: outputDir }),
    now: () => NOW,
    audit: auditDepsFor(audit),
  };
  return { stt, media, audit, deps, transcribe: createTranscribe(deps) };
};

const run = (
  transcribe: ReturnType<typeof createTranscribe>,
  overrides: { provider?: string; language?: string } = {},
) => transcribe({ input: INPUT, format: "markdown", ...overrides });

describe("provider selection", () => {
  test("an explicit provider wins over the config default", async () => {
    const { stt, transcribe } = setup({
      env: { GROQ_API_KEY: "gq", DEEPGRAM_API_KEY: "dg" },
      config: config({ defaults: { provider: "deepgram" } }),
    });

    const result = await run(transcribe, { provider: "groq" });

    expect(result.success).toBe(true);
    expect(stt.groq.requests).toHaveLength(1);
    expect(stt.deepgram.requests).toHaveLength(0);
  });

  test("PI_TUBE_TRANSCRIPTION_PROVIDER wins over the config default", async () => {
    const { stt, transcribe } = setup({
      env: { PI_TUBE_TRANSCRIPTION_PROVIDER: "elevenlabs", ELEVENLABS_API_KEY: "el", GROQ_API_KEY: "gq" },
      config: config({ defaults: { provider: "groq" } }),
    });

    await run(transcribe);

    expect(stt.elevenlabs.requests).toHaveLength(1);
    expect(stt.groq.requests).toHaveLength(0);
  });

  test("with no choice, the first configured provider in registry order is used", async () => {
    const { stt, transcribe } = setup({ env: { GROQ_API_KEY: "gq" } });

    await run(transcribe);

    expect(stt.groq.requests).toHaveLength(1);
  });

  test("nothing configured is PROVIDER_NOT_CONFIGURED with an auth login hint", async () => {
    const { transcribe } = setup();

    const result = await run(transcribe);

    expect(result.success ? undefined : result.error.code).toBe("PROVIDER_NOT_CONFIGURED");
    expect(result.success ? "" : result.error.hint).toContain("auth login");
  });

  test("a chosen provider without a key is PROVIDER_NOT_CONFIGURED and no other provider runs", async () => {
    const { stt, transcribe } = setup({ env: { GROQ_API_KEY: "gq" } });

    const result = await run(transcribe, { provider: "deepgram" });

    expect(result.success ? undefined : result.error.code).toBe("PROVIDER_NOT_CONFIGURED");
    expect(result.success ? "" : result.error.hint).toContain("DEEPGRAM_API_KEY");
    expect(stt.groq.requests).toHaveLength(0);
  });

  test("an unknown provider in PI_TUBE_TRANSCRIPTION_PROVIDER is PROVIDER_INVALID naming the variable", async () => {
    const { transcribe } = setup({ env: { PI_TUBE_TRANSCRIPTION_PROVIDER: "openai", GROQ_API_KEY: "gq" } });

    const result = await run(transcribe);

    expect(result.success ? undefined : result.error.code).toBe("PROVIDER_INVALID");
    expect(result.success ? "" : result.error.message).toContain("PI_TUBE_TRANSCRIPTION_PROVIDER");
  });
});

describe("credentials and fallback", () => {
  test("the env key wins over the stored key and is passed to the provider", async () => {
    const { stt, transcribe } = setup({
      env: { GROQ_API_KEY: "env-key" },
      config: config({ providers: { groq: { api_key: "config-key" } } }),
    });

    const result = await run(transcribe);

    expect(stt.groq.requests[0]?.apiKey).toBe("env-key");
    expect(JSON.stringify(result)).not.toMatch(/env-key|config-key/);
  });

  test("a rate-limited provider fails without trying another one, and the hint names the alternatives", async () => {
    const { stt, deps } = setup({ env: { GROQ_API_KEY: "gq", DEEPGRAM_API_KEY: "dg" } });
    const limited = createFakeSttProvider("groq", createError("PROVIDER_RATE_LIMIT", "Too many requests."));
    const transcribe = createTranscribe({ ...deps, stt: { ...stt, groq: limited } });

    const result = await run(transcribe, { provider: "groq" });

    expect(result.success ? undefined : result.error.code).toBe("PROVIDER_RATE_LIMIT");
    // Only other configured providers: not the chosen groq, not the unconfigured elevenlabs.
    expect(result.success ? "" : result.error.hint).toBe(
      "Retry later, or choose another configured provider: deepgram.",
    );
    expect(stt.deepgram.requests).toHaveLength(0);
  });
});

describe("language", () => {
  test("--language wins, then PI_TUBE_TRANSCRIPTION_LANGUAGE, then the config default", async () => {
    const env = { GROQ_API_KEY: "gq", PI_TUBE_TRANSCRIPTION_LANGUAGE: "es" };
    const { stt, transcribe } = setup({ env, config: config({ defaults: { language: "pt" } }) });

    await run(transcribe, { language: "EN" });
    await run(transcribe);

    expect(stt.groq.requests.map((request) => request.language)).toEqual(["en", "es"]);
  });
});

describe("audio and output", () => {
  test("releases the fetched audio on success and on provider failure", async () => {
    const { media, stt, deps } = setup({ env: { GROQ_API_KEY: "gq" } });
    const failing = createFakeSttProvider("groq", createError("PROVIDER_FAILED", "boom"));

    await createTranscribe(deps)({ input: INPUT, format: "markdown" });
    // `force`: the first transcript is in the library, and only a fresh run fetches audio again.
    await createTranscribe({ ...deps, stt: { ...stt, groq: failing } })({
      input: INPUT,
      format: "markdown",
      force: true,
    });

    expect(media.released()).toBe(2);
  });

  test("releases the fetched audio when cancelled during transcription", async () => {
    const { media, stt, deps } = setup({ env: { GROQ_API_KEY: "gq" } });
    const waiting = createFakeSttProvider("groq", undefined, { waitForAbort: true });
    const controller = new AbortController();

    const pending = createTranscribe({ ...deps, stt: { ...stt, groq: waiting } })(
      { input: INPUT, format: "markdown" },
      { signal: controller.signal },
    );
    setTimeout(() => controller.abort(), 20);
    const result = await pending;

    expect(result.success ? undefined : result.error.code).toBe("CANCELLED");
    expect(media.released()).toBe(1);
    expect(readdirSync(outputDir)).toEqual([]);
  });

  test("saves the rendered markdown with mode 600", async () => {
    const { transcribe } = setup({ env: { GROQ_API_KEY: "gq" } });

    const result = await run(transcribe);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(path.basename(result.data.paths.markdown)).toBe(
      `2026-10-30-demo-${result.data.transcriptId.slice(0, 8)}.md`,
    );
    expect(readFileSync(result.data.paths.markdown, "utf8")).toBe(renderMarkdown(result.data.artifact));
    if (process.platform !== "win32") expect(statSync(result.data.paths.markdown).mode & 0o777).toBe(0o600);
  });

  test("an output dir that is a file is STORAGE_IO_FAILED", async () => {
    const blocker = path.join(outputDir, "blocker");
    writeFileSync(blocker, "x");
    const { deps, stt } = setup({ env: { GROQ_API_KEY: "gq" } });

    const result = await createTranscribe({ ...deps, library: createFileLibraryStore({ libraryDir: blocker }) })({
      input: INPUT,
      format: "markdown",
    });

    expect(result.success ? undefined : result.error.code).toBe("STORAGE_IO_FAILED");
    expect(result.success ? "" : result.error.hint).toContain("PI_TUBE_LIBRARY_DIR");
    // Checked before the paid call, so a bad output dir never costs a transcription.
    expect(stt.groq.requests).toHaveLength(0);
  });

  test("a Ctrl-C that lands after the provider answered still saves the paid transcript", async () => {
    const { deps, stt } = setup({ env: { GROQ_API_KEY: "gq" } });
    const controller = new AbortController();
    const answersThenCancel = {
      ...createFakeSttProvider("groq"),
      transcribe: async () => {
        controller.abort();
        return { success: true as const, data: { text: "paid text", segments: [] } };
      },
    };

    const result = await createTranscribe({ ...deps, stt: { ...stt, groq: answersThenCancel } })(
      { input: INPUT, format: "markdown" },
      { signal: controller.signal },
    );

    expect(result.success).toBe(true);
    expect(readdirSync(outputDir)).toHaveLength(1);
  });
});

describe("library cache", () => {
  const YOUTUBE = "https://www.youtube.com/watch?v=jNQXAC9IVRw";
  const youtube = {
    kind: "youtube" as const,
    originalInput: YOUTUBE,
    normalizedUrl: YOUTUBE,
    metadata: { platform: "Youtube", mediaId: "jNQXAC9IVRw", title: "Me at the zoo" },
  };
  const cached = (source?: Parameters<typeof createFakeMediaFetcher>[0]) => {
    const { stt, deps } = setup({ env: { GROQ_API_KEY: "gq", DEEPGRAM_API_KEY: "dg" } });
    const media = createFakeMediaFetcher({ audio: { kind: "url", url: "https://cdn.example.com/a.m4a" }, ...source });
    return { stt, media, transcribe: createTranscribe({ ...deps, media: media.fetcher }) };
  };

  test.each([true, false])("late waiter does not inspect a live publication (URL key: %s)", async (earlyKey) => {
    const { deps, stt } = setup({ env: { GROQ_API_KEY: "gq" } });
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const waiting = Promise.withResolvers<void>();
    const library = createFileLibraryStore({
      libraryDir: outputDir,
      fs: {
        link: async (temp, target) => {
          if (target.endsWith(".json")) {
            writeFileSync(target, "{");
            entered.resolve();
            await release.promise;
            rmSync(target);
          }
          await link(temp, target);
        },
      },
    });
    const media = createFakeMediaFetcher(earlyKey ? { source: youtube } : undefined);
    const transcribe = createTranscribe({ ...deps, media: media.fetcher, library });
    const input = { input: earlyKey ? YOUTUBE : INPUT, format: "json", provider: "groq" } as const;
    const owner = transcribe(input);
    await entered.promise;
    const read = createTranscribe({ ...deps, env: {}, media: media.fetcher, library });
    const waiter = read(input, {
      onProgress: ({ label }) => {
        if (label === "Waiting for transcription...") waiting.resolve();
      },
    });
    try {
      expect(await Promise.race([waiting.promise, waiter])).toBeUndefined();
      if (earlyKey) {
        release.resolve();
        const saved = await owner;
        expect(saved.success).toBe(true);
        expect(await waiter).toMatchObject({
          success: true,
          data: {
            cacheHit: true,
            transcriptId: saved.success && saved.data.transcriptId,
            cost: { estimate: 0 },
          },
        });
        expect(media.calls.resolve).toHaveLength(1);
      } else {
        vi.spyOn(performance, "now").mockReturnValue(Number.MAX_SAFE_INTEGER);
        expect(await waiter).toMatchObject({
          success: false,
          error: { hint: expect.stringContaining("provider usage") },
        });
      }
    } finally {
      release.resolve();
      await owner;
    }
    expect(stt.groq.requests).toHaveLength(1);
  });

  test("a waiting reader cannot repair Markdown before the producer records its receipt", async () => {
    const { deps, stt } = setup({ env: { GROQ_API_KEY: "gq" } });
    const publishing = Promise.withResolvers<void>();
    const waiting = Promise.withResolvers<void>();
    const jsonPublished = Promise.withResolvers<void>();
    const finish = Promise.withResolvers<void>();
    let producerMarkdown: string | undefined;
    const library = createFileLibraryStore({
      libraryDir: outputDir,
      fs: {
        link: async (temp, target) => {
          if (target.endsWith(".json")) {
            publishing.resolve();
            await waiting.promise;
          } else if (target.endsWith(".md") && !producerMarkdown) {
            producerMarkdown = target;
            jsonPublished.resolve();
            await finish.promise;
          }
          await link(temp, target);
        },
      },
    });
    const transcribe = createTranscribe({ ...deps, library });
    const input = { input: INPUT, format: "json", provider: "groq" } as const;
    const owner = transcribe(input);
    await publishing.promise;
    const waiter = transcribe(input, {
      onProgress: ({ label }) => {
        if (label === "Waiting for transcription...") waiting.resolve();
      },
    });
    try {
      await jsonPublished.promise;
      const autoWait = Promise.withResolvers<void>();
      const explicit = transcribe(
        { ...input, language: "en" },
        {
          onProgress: ({ label }) => {
            if (label === "Waiting for transcription...") autoWait.resolve();
          },
        },
      );
      expect(await Promise.race([autoWait.promise, explicit])).toBeUndefined();
      vi.spyOn(performance, "now").mockReturnValue(Number.MAX_SAFE_INTEGER);
      expect(await waiter).toMatchObject({
        success: false,
        error: { hint: expect.stringContaining("provider usage") },
      });
      expect(await explicit).toMatchObject({
        success: false,
        error: { hint: expect.stringContaining("provider usage") },
      });
      if (!producerMarkdown) throw Error("Missing producer Markdown path");
      expect(readdirSync(path.dirname(producerMarkdown))).not.toContain(path.basename(producerMarkdown));
    } finally {
      finish.resolve();
      await owner;
    }
    const metadata = JSON.parse(readFileSync(path.join(path.dirname(producerMarkdown), "source.json"), "utf8"));
    expect(metadata.cleanup.files[path.basename(producerMarkdown)]).toEqual(expect.any(String));
    expect(stt.groq.requests).toHaveLength(1);
  });

  test("a second YouTube transcribe is a cache hit without resolve, audio or provider", async () => {
    const { stt, media, transcribe } = cached({ source: youtube });

    const first = await transcribe({ input: YOUTUBE, provider: "groq", format: "markdown" });
    const second = await transcribe({ input: YOUTUBE, provider: "groq", format: "markdown" });

    expect(first.success && second.success).toBe(true);
    if (!first.success || !second.success) return;
    expect(first.data.cacheHit).toBe(false);
    expect(second.data).toMatchObject({ cacheHit: true, transcriptId: first.data.transcriptId });
    expect(media.calls.resolve).toHaveLength(1);
    expect(media.calls.fetchAudio).toHaveLength(1);
    expect(stt.groq.requests).toHaveLength(1);
  });

  test("with the key gone, a chosen provider still serves a cache hit", async () => {
    const { stt, deps } = setup({ env: { GROQ_API_KEY: "gq" } });
    const media = createFakeMediaFetcher({ source: youtube });
    await createTranscribe({ ...deps, media: media.fetcher })({ input: YOUTUBE, provider: "groq", format: "markdown" });

    const again = await createTranscribe({ ...deps, env: {}, media: media.fetcher })({
      input: YOUTUBE,
      provider: "groq",
      format: "markdown",
    });

    expect(again.success ? again.data.cacheHit : again.error.code).toBe(true);
    expect(stt.groq.requests).toHaveLength(1);
  });

  test("with the key gone, a direct URL already in the library is a cache hit after the resolve", async () => {
    const { stt, deps } = setup({ env: { GROQ_API_KEY: "gq" } });
    const media = createFakeMediaFetcher();
    await createTranscribe({ ...deps, media: media.fetcher })({ input: INPUT, provider: "groq", format: "markdown" });

    const again = await createTranscribe({ ...deps, env: {}, media: media.fetcher })({
      input: INPUT,
      provider: "groq",
      format: "markdown",
    });

    expect(again.success ? again.data.cacheHit : again.error.code).toBe(true);
    expect(media.calls.fetchAudio).toHaveLength(1);
    expect(stt.groq.requests).toHaveLength(1);
  });

  test("a page miss without a key is PROVIDER_NOT_CONFIGURED before yt-dlp runs", async () => {
    const { deps } = setup();
    const media = createFakeMediaFetcher({ source: youtube });

    const result = await createTranscribe({ ...deps, media: media.fetcher })({
      input: YOUTUBE,
      provider: "groq",
      format: "markdown",
    });

    expect(result.success ? undefined : result.error.code).toBe("PROVIDER_NOT_CONFIGURED");
    expect(media.calls.resolve).toHaveLength(0);
  });

  test("force without a key fails before resolving: the library is not read, so nothing can be served", async () => {
    const { deps } = setup();
    const media = createFakeMediaFetcher();

    const result = await createTranscribe({ ...deps, media: media.fetcher })({
      input: INPUT,
      provider: "groq",
      force: true,
      format: "markdown",
    });

    expect(result.success ? undefined : result.error.code).toBe("PROVIDER_NOT_CONFIGURED");
    expect(media.calls.resolve).toHaveLength(0);
  });

  test("a direct URL miss without a key fails before any download", async () => {
    const { deps } = setup();
    const media = createFakeMediaFetcher();

    const result = await createTranscribe({ ...deps, media: media.fetcher })({
      input: INPUT,
      provider: "groq",
      format: "markdown",
    });

    expect(result.success ? undefined : result.error.code).toBe("PROVIDER_NOT_CONFIGURED");
    expect(media.calls.fetchAudio).toHaveLength(0);
  });

  test("a direct URL is resolved again (no yt-dlp) but neither downloaded nor transcribed again", async () => {
    const { stt, media, transcribe } = cached();

    await transcribe({ input: INPUT, provider: "groq", format: "markdown" });
    const second = await transcribe({ input: INPUT, provider: "groq", format: "markdown" });

    expect(second.success ? second.data.cacheHit : undefined).toBe(true);
    expect(media.calls.resolve).toHaveLength(2);
    expect(media.calls.fetchAudio).toHaveLength(1);
    expect(stt.groq.requests).toHaveLength(1);
  });

  test("a best-effort site is resolved again but neither downloaded nor transcribed again", async () => {
    const page = "https://vimeo.com/1";
    const { stt, media, transcribe } = cached({
      source: { kind: "site", originalInput: page, normalizedUrl: page, metadata: { platform: "Vimeo", mediaId: "1" } },
    });

    await transcribe({ input: page, provider: "groq", format: "markdown" });
    const second = await transcribe({ input: page, provider: "groq", format: "markdown" });

    expect(second.success ? second.data.cacheHit : undefined).toBe(true);
    expect(media.calls.resolve).toHaveLength(2);
    expect(media.calls.fetchAudio).toHaveLength(1);
    expect(stt.groq.requests).toHaveLength(1);
  });

  test.each(["release", "completed", "cancel"] as const)(
    "explicit en reuses a claimed auto candidate: %s",
    async (end) => {
      const { deps, stt } = setup({ env: { GROQ_API_KEY: "gq" } });
      const file = path.join(outputDir, "demo.wav");
      writeFileSync(file, "fake audio");
      const { fetcher } = createFakeMediaFetcher({
        source: { kind: "local_file", originalInput: file, absolutePath: file, extension: "wav", sizeBytes: 10 },
      });
      const transcribe = createTranscribe({ ...deps, media: fetcher });
      const input = { input: file, format: "json" } as const;
      const seed = await transcribe(input);
      if (!seed.success) throw Error(seed.error.message);
      const entered = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const reader = createTranscribe({
        ...deps,
        media: fetcher,
        library: {
          ...deps.library,
          find: async (key) => {
            entered.resolve();
            await release.promise;
            return deps.library.find(key);
          },
        },
      });
      const auto = reader(input);
      await entered.promise;
      const waiting = Promise.withResolvers<void>();
      const controller = new AbortController();
      const explicit = transcribe(
        { ...input, language: "en" },
        {
          signal: controller.signal,
          onProgress: ({ label }) => {
            if (label === "Waiting for transcription...") waiting.resolve();
          },
        },
      );
      const hit = {
        success: true,
        data: { cacheHit: true, transcriptId: seed.data.transcriptId, cost: { estimate: 0 } },
      };
      try {
        expect(await Promise.race([waiting.promise, explicit])).toBeUndefined();
        if (end === "completed") {
          const claim = path.join(outputDir, `.transcribing-${seed.data.transcriptId}`);
          writeFileSync(path.join(claim, "block-release"), "");
        }
        if (end === "cancel") {
          controller.abort();
          expect(await explicit).toMatchObject({ success: false, error: { code: "CANCELLED" } });
        }
        release.resolve();
        expect(await auto).toMatchObject(hit);
        if (end === "completed") vi.spyOn(performance, "now").mockReturnValue(Number.MAX_SAFE_INTEGER);
        if (end !== "cancel") expect(await explicit).toMatchObject(hit);
      } finally {
        controller.abort();
        release.resolve();
        await Promise.allSettled([auto, explicit]);
      }
      expect(stt.groq.requests).toHaveLength(1);
    },
  );

  test("a request in en reuses an automatic transcript that detected en, but not one in pt", async () => {
    const { stt, transcribe } = cached({ source: youtube });

    await transcribe({ input: YOUTUBE, provider: "groq", format: "markdown" });
    const en = await transcribe({ input: YOUTUBE, provider: "groq", language: "en", format: "markdown" });
    const pt = await transcribe({ input: YOUTUBE, provider: "groq", language: "pt", format: "markdown" });

    expect(en.success ? en.data.cacheHit : undefined).toBe(true);
    expect(pt.success ? pt.data.cacheHit : undefined).toBe(false);
    expect(stt.groq.requests).toHaveLength(2);
  });

  test("a detected language name (Groq) is saved as its code, so a later request in that code is a hit", async () => {
    const { deps } = setup({ env: { GROQ_API_KEY: "gq" } });
    const groq = createFakeSttProvider("groq", { text: "olá", detectedLanguage: "Portuguese", segments: [] });
    const media = createFakeMediaFetcher({
      source: youtube,
      audio: { kind: "url", url: "https://cdn.example.com/a.m4a" },
    });
    const transcribe = createTranscribe({ ...deps, media: media.fetcher, stt: { ...deps.stt, groq } });

    const first = await transcribe({ input: YOUTUBE, provider: "groq", format: "json" });
    const pt = await transcribe({ input: YOUTUBE, provider: "groq", language: "pt", format: "json" });

    expect(first.success ? first.data.artifact.transcription.detected_language : undefined).toBe("pt");
    expect(pt.success ? pt.data.cacheHit : undefined).toBe(true);
    expect(groq.requests).toHaveLength(1);
  });

  test("another provider is a miss", async () => {
    const { stt, transcribe } = cached({ source: youtube });

    await transcribe({ input: YOUTUBE, provider: "groq", format: "markdown" });
    const other = await transcribe({ input: YOUTUBE, provider: "deepgram", format: "markdown" });

    expect(other.success ? other.data.cacheHit : undefined).toBe(false);
    expect(stt.deepgram.requests).toHaveLength(1);
  });

  test("--force transcribes again into <id>-2, keeps the first, and later runs get <id>-2", async () => {
    const { stt, transcribe } = cached({ source: youtube });

    const first = await transcribe({ input: YOUTUBE, provider: "groq", format: "markdown" });
    const forced = await transcribe({ input: YOUTUBE, provider: "groq", format: "markdown", force: true });
    const again = await transcribe({ input: YOUTUBE, provider: "groq", format: "markdown" });

    if (!first.success || !forced.success || !again.success) throw new Error("transcribe failed");
    expect(forced.data).toMatchObject({ cacheHit: false, transcriptId: `${first.data.transcriptId}-2` });
    expect(again.data).toMatchObject({ cacheHit: true, transcriptId: `${first.data.transcriptId}-2` });
    expect(stt.groq.requests).toHaveLength(2);
  });

  test("the saved artifact always has segments and its library identity", async () => {
    const { transcribe } = cached({ source: youtube });

    const result = await transcribe({ input: YOUTUBE, provider: "groq", format: "json" });

    if (!result.success) throw new Error("transcribe failed");
    expect(result.data.artifact).toMatchObject({
      transcript_id: result.data.transcriptId,
      source: { source_key: "youtube:jNQXAC9IVRw" },
      transcription: { provider: "groq", model: "groq-fake-model" },
    });
    expect(result.data.artifact.transcript.segments?.length).toBeGreaterThan(0);
  });
});

describe("kept audio", () => {
  const YOUTUBE = "https://www.youtube.com/watch?v=jNQXAC9IVRw";
  const youtube = {
    kind: "youtube" as const,
    originalInput: YOUTUBE,
    normalizedUrl: YOUTUBE,
    metadata: { platform: "Youtube", mediaId: "jNQXAC9IVRw", title: "Me at the zoo" },
  };
  const withDownloadedAudio = (configOverrides: Partial<PiTubeConfig> = {}) => {
    const downloaded = path.join(outputDir, "downloaded.m4a");
    writeFileSync(downloaded, "audio");
    const { stt, deps } = setup({
      env: { GROQ_API_KEY: "gq", DEEPGRAM_API_KEY: "dg" },
      config: config(configOverrides),
    });
    const media = createFakeMediaFetcher({ source: youtube, audio: { kind: "file", path: downloaded } });
    return { stt, media, transcribe: createTranscribe({ ...deps, media: media.fetcher }) };
  };

  test("an unenforced one-byte cap leaves the paid transcript reusable", async () => {
    const { stt, transcribe } = withDownloadedAudio({ library: { max_audio_bytes: 1 } });
    const respond = stt.groq.transcribe;
    vi.spyOn(stt.groq, "transcribe").mockImplementation(async (request, options) => {
      expect(request.audio.kind === "file" && readFileSync(request.audio.path, "utf8")).toBe("audio");
      return respond(request, options);
    });
    const input = { input: YOUTUBE, provider: "groq", format: "json" } as const;
    const first = await transcribe(input);
    if (!first.success) throw new Error(first.error.message);
    const canonical = readFileSync(first.data.paths.json);
    expect(first.data).toMatchObject({ cacheHit: false, audioCap: "unenforced" });
    const retry = await transcribe(input);
    expect(retry).toMatchObject({ success: true, data: { transcriptId: first.data.transcriptId, cacheHit: true } });
    expect(readFileSync(first.data.paths.json)).toEqual(canonical);
    expect(stt.groq.requests).toHaveLength(1);
  });

  test.skipIf(process.platform !== "win32").each([
    { occupied: false, keep: true, fallback: false },
    { occupied: true, keep: true, fallback: false },
    { occupied: true, keep: true, fallback: true },
    { occupied: false, keep: false, fallback: true },
  ])(
    "private provider input and ordinary retry ($occupied, $keep, $fallback)",
    async ({ occupied, keep, fallback }) => {
      const { stt, deps } = setup({
        env: { DEEPGRAM_API_KEY: "dg" },
        config: config({ library: { keep_audio: keep } }),
      });
      const tmpDir = path.join(outputDir, "tmp");
      mkdirSync(tmpDir);
      const warning = vi.spyOn(process, "emitWarning").mockImplementation(() => {});
      const residue = fallback && occupied;
      const unusable = path.join(outputDir, "not-a-directory");
      writeFileSync(unusable, "fixture");
      const local = vi
        .spyOn(await import("../../../src/infrastructure/library/windows-audio.ts"), "localDownloadRoot")
        .mockReturnValue(tmpDir);
      try {
        const media = createMediaFetcher({
          env: { PATH: "/bin" },
          cwd: outputDir,
          tmpDir: fallback ? unusable : tmpDir,
          lookup: async () => [{ address: "93.184.216.34", family: 4 }],
          run: async ({ args }) => {
            const file = args[args.indexOf("-o") + 1]?.replace("%(id)s.%(ext)s", "download.m4a");
            if (!file) throw new Error("missing download template");
            writeFileSync(file, "fresh bytes");
            if (residue) writeFileSync(path.join(path.dirname(file), "sidecar"), "unknown");
            return {
              outcome: "exited",
              exitCode: 0,
              stdout: `${file}
`,
              stderr: "",
            };
          },
        });
        const dir = path.join(outputDir, sourceDirName("youtube:jNQXAC9IVRw"));
        const retained = path.join(dir, "audio.m4a");
        if (occupied) {
          mkdirSync(dir);
          writeFileSync(retained, "incumbent");
        }
        const transcribe = createTranscribe({
          ...deps,
          media: { ...media, resolve: async () => ({ success: true, data: youtube }) },
        });
        const respond = stt.deepgram.transcribe;
        vi.spyOn(stt.deepgram, "transcribe").mockImplementation(async (req, opts) => {
          if (req.audio.kind !== "file") throw new Error("expected downloaded file");
          const file = req.audio.path;
          expect(path.dirname(path.dirname(file))).toBe(tmpDir);
          expect(() => writeFileSync(file, "changed")).toThrow();
          expect(readFileSync(file, "utf8")).toBe("fresh bytes");
          return respond(req, opts);
        });
        const request = { input: YOUTUBE, provider: "deepgram", format: "markdown" } as const;
        const result = await transcribe(request);
        expect(result.success).toBe(true);
        if (!result.success) throw new Error(result.error.message);
        expect(JSON.parse(readFileSync(result.data.paths.json, "utf8"))).toBeTruthy();
        expect(readFileSync(result.data.paths.markdown, "utf8").length).toBeGreaterThan(0);
        expect(result.data.audioRetention).toBe(keep ? (occupied ? "skipped" : "kept") : undefined);
        if (keep) expect(readFileSync(retained, "utf8")).toBe(occupied ? "incumbent" : "fresh bytes");
        expect(local).toHaveBeenCalledTimes(fallback ? 1 : 0);
        if (residue) {
          const [left] = readdirSync(tmpDir);
          if (!left) throw new Error("Missing sidecar directory");
          expect(readdirSync(path.join(tmpDir, left))).toEqual(["sidecar"]);
        } else expect(readdirSync(tmpDir)).toEqual([]);
        expect(warning).toHaveBeenCalledTimes(residue ? 1 : 0);
        expect(await transcribe(request)).toMatchObject({ success: true, data: { cacheHit: true } });
        expect(stt.deepgram.requests).toHaveLength(1);
      } finally {
        local.mockRestore();
        warning.mockRestore();
      }
    },
  );

  test.skipIf(process.platform === "win32")(
    "another provider reuses the kept audio and the stored source: no resolve, no download",
    async () => {
      const { stt, media, transcribe } = withDownloadedAudio();

      await transcribe({ input: YOUTUBE, provider: "groq", format: "markdown" });
      const second = await transcribe({ input: YOUTUBE, provider: "deepgram", format: "markdown" });

      expect(second.success ? second.data.cacheHit : undefined).toBe(false);
      expect(media.calls.resolve).toHaveLength(1);
      expect(media.calls.fetchAudio).toHaveLength(1);
      const audio = stt.deepgram.requests[0]?.audio;
      expect(audio?.kind).toBe("file");
      expect(audio?.kind === "file" ? audio.path : "").toMatch(/youtube-jnqxac9ivrw-[0-9a-f]{10}[\\/]audio\.m4a$/);
      expect(audio?.kind === "file" ? audio.path.startsWith(outputDir) : false).toBe(true);
    },
  );

  test("with library.keep_audio false the audio is not kept and is downloaded again", async () => {
    const { media, transcribe } = withDownloadedAudio({ library: { keep_audio: false } });

    await transcribe({ input: YOUTUBE, provider: "groq", format: "markdown" });
    await transcribe({ input: YOUTUBE, provider: "deepgram", format: "markdown" });

    expect(media.calls.fetchAudio).toHaveLength(2);
  });
});

describe("source settings", () => {
  test("resolve and fetchAudio receive the settings resolved from config and env", async () => {
    const { media, transcribe } = setup({
      env: { GROQ_API_KEY: "gq", PI_TUBE_COOKIES_FILE: "/a/cookies.txt" },
      config: config({ network: { allow_private_hosts: true }, local_files: { max_bytes: 10 } }),
    });

    const result = await run(transcribe);

    expect(result.success).toBe(true);
    const expected = {
      allowPrivateHosts: true,
      maxLocalFileBytes: 10,
      cookies: { file: "/a/cookies.txt", origin: "env" },
    };
    expect(media.calls.settings).toEqual([expected, expected]);
  });

  test("a relative PI_TUBE_COOKIES_FILE fails before the source is resolved", async () => {
    const { media, transcribe } = setup({ env: { GROQ_API_KEY: "gq", PI_TUBE_COOKIES_FILE: "cookies.txt" } });

    const result = await run(transcribe);

    expect(result.success ? undefined : result.error.code).toBe("COOKIES_FILE_INVALID");
    expect(media.calls.resolve).toHaveLength(0);
  });
});

describe("site sources", () => {
  test("the progress detail of an untitled site is its platform", async () => {
    const vimeo = "https://vimeo.com/1";
    const media = createFakeMediaFetcher({
      source: { kind: "site", originalInput: vimeo, normalizedUrl: vimeo, metadata: { platform: "Vimeo" } },
      audio: { kind: "url", url: "https://cdn.example.com/v.mp3" },
    });
    const { deps } = setup({ env: { GROQ_API_KEY: "gq" } });
    const transcribe = createTranscribe({ ...deps, media: media.fetcher });
    const details: Array<string | undefined> = [];

    const result = await transcribe(
      { input: vimeo, format: "markdown" },
      { onProgress: (event) => details.push(event.detail) },
    );

    expect(result.success).toBe(true);
    expect(details).toContain("(Vimeo)");
  });
});

describe("live streams", () => {
  const liveSource = (liveStatus: "is_live" | "is_upcoming" | "was_live") => ({
    kind: "youtube" as const,
    originalInput: "https://www.youtube.com/watch?v=live",
    normalizedUrl: "https://www.youtube.com/watch?v=live",
    metadata: { platform: "Youtube", title: "Live show", liveStatus },
  });

  test("a live stream in progress is refused before any download or provider call", async () => {
    const { stt, deps } = setup({ env: { GROQ_API_KEY: "gq" } });
    const media = createFakeMediaFetcher({ source: liveSource("is_live") });
    const transcribe = createTranscribe({ ...deps, media: media.fetcher });

    const result = await run(transcribe);

    expect(result.success ? undefined : result.error.code).toBe("SOURCE_LIVE_NOT_ENDED");
    expect(media.calls.fetchAudio).toHaveLength(0);
    expect(stt.groq.requests).toHaveLength(0);
  });

  test("a finished live stream is transcribed", async () => {
    const { stt, deps } = setup({ env: { GROQ_API_KEY: "gq" } });
    const media = createFakeMediaFetcher({
      source: liveSource("was_live"),
      audio: { kind: "url", url: "https://cdn.example.com/v.mp3" },
    });
    const transcribe = createTranscribe({ ...deps, media: media.fetcher });

    const result = await run(transcribe);

    expect(result.success).toBe(true);
    expect(stt.groq.requests).toHaveLength(1);
  });

  test("download refuses an upcoming live stream without downloading", async () => {
    const media = createFakeMediaFetcher({ source: liveSource("is_upcoming") });
    const download = createDownloadMedia({
      configStore: createInMemoryConfigStore(config()),
      env: {},
      media: media.fetcher,
      defaultOutputDir: outputDir,
      audit: auditDepsFor(createInMemoryAuditLog()),
    });

    const result = await download({ input: "https://www.youtube.com/watch?v=live", media: "audio" });

    expect(result.success ? undefined : result.error.code).toBe("SOURCE_LIVE_NOT_ENDED");
    expect(media.calls.download).toHaveLength(0);
  });
});

describe("progress detail", () => {
  test("a page title reaches the progress line without control characters", async () => {
    const page = "https://vimeo.com/1";
    const media = createFakeMediaFetcher({
      source: {
        kind: "site",
        originalInput: page,
        normalizedUrl: page,
        metadata: { platform: "Vimeo", title: "Evil\u001b[2J\ntitle" },
      },
      audio: { kind: "url", url: "https://cdn.example.com/v.mp3" },
    });
    const { deps } = setup({ env: { GROQ_API_KEY: "gq" } });
    const transcribe = createTranscribe({ ...deps, media: media.fetcher });
    const details: Array<string | undefined> = [];

    await transcribe({ input: page, format: "markdown" }, { onProgress: (event) => details.push(event.detail) });

    expect(details).toContain("(Evil [2J title)");
  });
});

describe("downloadMedia", () => {
  test("a best-effort site is resolved, then downloaded from the resolved source", async () => {
    const vimeo = "https://vimeo.com/1";
    const source = {
      kind: "site" as const,
      originalInput: vimeo,
      normalizedUrl: vimeo,
      metadata: { platform: "Vimeo" },
    };
    const media = createFakeMediaFetcher({ source });
    const download = createDownloadMedia({
      configStore: createInMemoryConfigStore(config()),
      env: {},
      media: media.fetcher,
      defaultOutputDir: outputDir,
      audit: auditDepsFor(createInMemoryAuditLog()),
    });

    const result = await download({ input: vimeo, media: "video" });

    expect(result.success ? result.data.sourceKind : undefined).toBe("site");
    expect(media.calls.resolve).toEqual([vimeo]);
    expect(media.calls.download[0]?.source).toEqual(source);
  });

  test("a direct media URL is DOWNLOAD_FAILED and nothing is downloaded", async () => {
    const media = createFakeMediaFetcher();
    const download = createDownloadMedia({
      configStore: createInMemoryConfigStore(config()),
      env: {},
      media: media.fetcher,
      defaultOutputDir: outputDir,
      audit: auditDepsFor(createInMemoryAuditLog()),
    });

    const result = await download({ input: INPUT, media: "audio" });

    expect(result.success ? undefined : result.error).toMatchObject({
      code: "DOWNLOAD_FAILED",
      message: "`download` takes a page URL that yt-dlp supports; direct media URLs and local files are already files.",
    });
    expect(media.calls.resolve).toHaveLength(0);
    expect(media.calls.download).toHaveLength(0);
  });

  test("without outputDir it downloads into the default directory", async () => {
    const media = createFakeMediaFetcher();
    const download = createDownloadMedia({
      configStore: createInMemoryConfigStore(config()),
      env: {},
      media: media.fetcher,
      defaultOutputDir: outputDir,
      audit: auditDepsFor(createInMemoryAuditLog()),
    });

    const result = await download({ input: "https://www.youtube.com/watch?v=abc", media: "video" });

    expect(result.success ? result.data : undefined).toMatchObject({ sourceKind: "youtube", media: "video" });
    expect(media.calls.download[0]?.request.outputDir).toBe(outputDir);
  });

  test("passes the resolved source settings to the fetcher", async () => {
    const media = createFakeMediaFetcher();
    const download = createDownloadMedia({
      configStore: createInMemoryConfigStore(config({ network: { allow_private_hosts: true } })),
      env: {},
      media: media.fetcher,
      defaultOutputDir: outputDir,
      audit: auditDepsFor(createInMemoryAuditLog()),
    });

    const result = await download({ input: "https://www.youtube.com/watch?v=abc", media: "audio" });

    expect(result.success).toBe(true);
    const expected = { allowPrivateHosts: true, maxLocalFileBytes: 1073741824 };
    expect(media.calls.settings).toEqual([expected, expected]);
  });
});

describe("audit", () => {
  const YOUTUBE = "https://www.youtube.com/watch?v=jNQXAC9IVRw";
  const paidDeepgram = (
    outcome: Parameters<typeof createFakeSttProvider>[1] = { ...TRANSCRIPT_HELLO, durationSeconds: 19 },
  ) => ({
    ...createFakeSttProvider("deepgram", outcome),
    model: "nova-3",
  });
  const auditSetup = (deepgram = paidDeepgram()) => {
    const { audit, stt, deps } = setup({ env: { DEEPGRAM_API_KEY: "dg" } });
    return { audit, deepgram, deps: { ...deps, stt: { ...stt, deepgram } } };
  };

  test("a paid transcription records provider, model, source key, audio seconds and cost", async () => {
    const { audit, deps } = auditSetup();

    await run(createTranscribe(deps));

    expect(audit.records).toHaveLength(1);
    expect(audit.records[0]).toMatchObject({
      operation: "transcribe",
      input: INPUT,
      provider: "deepgram",
      model: "nova-3",
      audioSeconds: 19,
      cacheHit: false,
      cost: { estimate: 0.001362, currency: "USD", priceTable: "2026-10-31" },
      result: "ok",
    });
    expect(audit.records[0]?.sourceKey).toMatch(/^url:[0-9a-f]{64}$/);
  });

  test("a cache hit records cache_hit true and cost 0, and calls no provider", async () => {
    const { audit, deepgram, deps } = auditSetup();
    const transcribe = createTranscribe(deps);

    await run(transcribe);
    await run(transcribe);

    expect(deepgram.requests).toHaveLength(1);
    expect(audit.records[1]).toMatchObject({ cacheHit: true, cost: { estimate: 0 }, result: "ok" });
    expect(audit.records[1]?.sourceKey).toBe(audit.records[0]?.sourceKey);
  });

  test("a fresh transcription reports the provider's audio duration and its estimated cost", async () => {
    const { deps } = auditSetup();

    const result = await run(createTranscribe(deps));

    expect(result.success && result.data.audioSeconds).toBe(19);
    expect(result.success && result.data.cost).toEqual({
      estimate: 0.001362,
      currency: "USD",
      priceTable: "2026-10-31",
    });
  });

  test("a cache hit costs 0 and reports the saved duration", async () => {
    const youtube = createFakeMediaFetcher({
      source: {
        kind: "youtube",
        originalInput: YOUTUBE,
        normalizedUrl: YOUTUBE,
        metadata: { platform: "Youtube", mediaId: "jNQXAC9IVRw", durationSeconds: 42 },
      },
    });
    const { deps } = auditSetup();
    const transcribe = createTranscribe({ ...deps, media: youtube.fetcher });
    const direct = createTranscribe(deps);

    await transcribe({ input: YOUTUBE, format: "markdown" });
    const page = await transcribe({ input: YOUTUBE, format: "markdown" });
    await run(direct);
    const file = await run(direct);

    expect(page.success && page.data.cacheHit).toBe(true);
    expect(page.success && page.data.cost).toEqual({ estimate: 0, currency: "USD", priceTable: "2026-10-31" });
    expect(page.success && page.data.audioSeconds).toBe(42);
    // No saved duration: where the last segment ends.
    expect(file.success && file.data.cacheHit).toBe(true);
    expect(file.success && file.data.audioSeconds).toBe(0.5);
    expect(file.success && file.data.cost?.estimate).toBe(0);
  });

  test("a model outside the price table reports no cost", async () => {
    const { deps } = auditSetup({ ...paidDeepgram(), model: "nova-2" });

    const result = await run(createTranscribe(deps));

    expect(result.success && result.data.audioSeconds).toBe(19);
    expect(result.success && "cost" in result.data).toBe(false);
  });

  test("a provider that throws still leaves a record, as UNEXPECTED with the provider", async () => {
    const throwing = {
      ...paidDeepgram(),
      transcribe: async () => {
        throw new SyntaxError("Unexpected token < in JSON");
      },
    };
    const { audit, deps } = auditSetup(throwing);

    await expect(run(createTranscribe(deps))).rejects.toThrow("Unexpected token");
    expect(audit.records).toHaveLength(1);
    expect(audit.records[0]).toMatchObject({ result: "error", errorCode: "UNEXPECTED", provider: "deepgram" });
  });

  test("a provider failure records its code and the provider, without a cost", async () => {
    const { audit, deps } = auditSetup(paidDeepgram(createError("PROVIDER_RATE_LIMIT", "Too many requests.")));

    await run(createTranscribe(deps));

    expect(audit.records[0]).toMatchObject({ result: "error", errorCode: "PROVIDER_RATE_LIMIT", provider: "deepgram" });
    expect(audit.records[0]?.cost).toBeUndefined();
  });

  test("Markdown publication and repair failures keep the same paid JSON", async () => {
    const { audit, deepgram, deps } = auditSetup();
    let fault = true;
    let json = "";
    let markdown = "";
    const library = createFileLibraryStore({
      libraryDir: outputDir,
      fs: {
        copyFile: async (temp, target, flags) => {
          if (fault && target.endsWith(".md")) throw Error("Markdown copy failed");
          await copyFile(temp, target, flags);
        },
        link: async (temp, target) => {
          if (target.endsWith(".json")) json = target;
          if (target.endsWith(".md")) {
            markdown = target;
            throw Error("no links");
          }
          await link(temp, target);
        },
      },
    });
    const first = await run(createTranscribe({ ...deps, library }));
    const bytes = readFileSync(json, "utf8");
    const id = path.basename(json, ".json");
    expect(JSON.parse(bytes)).toMatchObject({ transcript_id: id, transcript: { full_text: TRANSCRIPT_HELLO.text } });
    const failure = {
      success: false,
      error: {
        code: "STORAGE_IO_FAILED",
        message: expect.stringContaining(json),
        hint: expect.stringMatching(/retry/i),
      },
    };
    expect(first).toMatchObject(failure);
    const retry = createTranscribe({ ...deps, library, env: {} });
    expect(await run(retry, { provider: "deepgram" })).toMatchObject(failure);
    expect(readdirSync(path.dirname(json))).not.toContain(path.basename(markdown));
    expect(readFileSync(json, "utf8")).toBe(bytes);
    fault = false;
    const repaired = await run(retry, { provider: "deepgram" });
    expect(repaired).toMatchObject({
      success: true,
      data: { transcriptId: id, cacheHit: true, paths: { json, markdown }, cost: { estimate: 0 } },
    });
    expect(readFileSync(markdown, "utf8")).toBe(renderMarkdown(JSON.parse(bytes)));
    expect(readFileSync(json, "utf8")).toBe(bytes);
    expect(deepgram.requests).toHaveLength(1);
    expect(audit.records).toMatchObject([
      {
        result: "error",
        errorCode: "STORAGE_IO_FAILED",
        cacheHit: false,
        provider: "deepgram",
        model: "nova-3",
        audioSeconds: 19,
        cost: { estimate: 0.001362 },
      },
      { result: "error", errorCode: "STORAGE_IO_FAILED", cacheHit: true, cost: { estimate: 0 } },
      { result: "ok", cacheHit: true, cost: { estimate: 0 } },
    ]);
  });

  test("a reserved JSON claim never admits an ordinary paid request", async () => {
    const { deepgram, deps } = auditSetup();
    const key = await deps.library.sourceKeyOf({
      kind: "direct_url",
      originalInput: INPUT,
      normalizedUrl: INPUT,
      mediaUrl: INPUT,
      extension: "wav",
    });
    if (!key.success) throw Error("missing source key");
    const sourceKey = key.data;
    const dir = path.join(outputDir, sourceDirName(sourceKey));
    mkdirSync(dir, { recursive: true });
    const id = transcriptIdOf({ sourceKey, provider: "deepgram", model: deepgram.model });
    const claim = path.join(dir, `${id}.json.publishing`);
    writeFileSync(claim, "foreign");
    const request = createTranscribe(deps);
    for (let i = 0; i < 2; i++) {
      const result = await run(request);
      expect(deepgram.requests).toHaveLength(0);
      expect(result).toMatchObject({
        success: false,
        error: { code: "STORAGE_IO_FAILED", hint: expect.stringMatching(/retry/i) },
      });
    }
    expect(deepgram.requests).toHaveLength(0);
    expect(readFileSync(claim, "utf8")).toBe("foreign");
  });

  test("failed JSON certification preserves the known local copy and an ordinary retry never repays", async () => {
    const { audit, deepgram, deps } = auditSetup();
    let json = "";
    const library = createFileLibraryStore({
      libraryDir: outputDir,
      fs: {
        link: async (_, target) => {
          json = target;
          throw Error("no links");
        },
        rename: async () => {
          throw Error("cannot certify");
        },
      },
    });
    const request = createTranscribe({ ...deps, library });
    expect(await run(request)).toMatchObject({
      success: false,
      error: {
        code: "STORAGE_IO_FAILED",
        message: expect.stringMatching(/local copy.*could not be certified/),
        hint: expect.stringMatching(/preserve/i),
      },
    });
    const bytes = readFileSync(json, "utf8");
    expect(JSON.parse(bytes).transcript.full_text).toBe(TRANSCRIPT_HELLO.text);
    expect(await run(request)).toMatchObject({
      success: false,
      error: { code: "STORAGE_IO_FAILED", message: expect.stringContaining(json) },
    });
    expect(readFileSync(json, "utf8")).toBe(bytes);
    expect(readFileSync(`${json}.publication`, "utf8")).toContain("pending:");
    expect(deepgram.requests).toHaveLength(1);
    expect(audit.records[0]?.cost?.estimate).toBe(0.001362);
    expect(audit.records[1]?.cost?.estimate ?? 0).toBe(0);
  });

  test("a paid transcription whose save fails still records the cost", async () => {
    const { audit, deps } = auditSetup();
    const library = { ...deps.library, save: async () => err(createError("STORAGE_IO_FAILED", "Disk full.")) };

    await run(createTranscribe({ ...deps, library }));

    expect(audit.records[0]).toMatchObject({
      result: "error",
      errorCode: "STORAGE_IO_FAILED",
      cost: { estimate: 0.001362 },
    });
  });

  test("without a provider duration, the yt-dlp duration, then the last segment end, is the audio length", async () => {
    const page = createFakeMediaFetcher({
      source: {
        kind: "youtube",
        originalInput: YOUTUBE,
        normalizedUrl: YOUTUBE,
        metadata: { platform: "Youtube", mediaId: "jNQXAC9IVRw", durationSeconds: 42 },
      },
    });
    const segmentsOnly = paidDeepgram({ text: "hi", segments: [{ startMs: 0, endMs: 1200, text: "hi" }] });
    const { audit, deps } = auditSetup(segmentsOnly);

    await createTranscribe({ ...deps, media: page.fetcher })({ input: YOUTUBE, format: "markdown" });
    await run(createTranscribe(deps));

    expect(audit.records.map((record) => record.audioSeconds)).toEqual([42, 1.2]);
    expect(audit.records[0]?.sourceKey).toBe("youtube:jNQXAC9IVRw");
  });

  test("a download of a page yt-dlp's Generic extractor reads records no source key", async () => {
    const audit = createInMemoryAuditLog();
    const page = "https://portal.example.com/watch?token=SECRET";
    const media = createFakeMediaFetcher({
      source: {
        kind: "site",
        originalInput: page,
        normalizedUrl: page,
        metadata: { platform: "Generic", mediaId: "watch?token=SECRET" },
      },
    });
    const download = createDownloadMedia({
      configStore: createInMemoryConfigStore(config()),
      env: {},
      media: media.fetcher,
      defaultOutputDir: outputDir,
      audit: auditDepsFor(audit),
    });

    await download({ input: page, media: "video" });

    expect(audit.records[0]?.sourceKey).toBeUndefined();
    expect(JSON.stringify(audit.records)).not.toContain("SECRET");
  });

  test("a download records one entry with the page's source key", async () => {
    const audit = createInMemoryAuditLog();
    const media = createFakeMediaFetcher({
      source: {
        kind: "youtube",
        originalInput: YOUTUBE,
        normalizedUrl: YOUTUBE,
        metadata: { platform: "Youtube", mediaId: "jNQXAC9IVRw" },
      },
    });
    const download = createDownloadMedia({
      configStore: createInMemoryConfigStore(config()),
      env: {},
      media: media.fetcher,
      defaultOutputDir: outputDir,
      audit: auditDepsFor(audit),
    });

    await download({ input: YOUTUBE, media: "audio" });

    expect(audit.records).toHaveLength(1);
    expect(audit.records[0]).toMatchObject({ operation: "download", sourceKey: "youtube:jNQXAC9IVRw", result: "ok" });
  });
});
