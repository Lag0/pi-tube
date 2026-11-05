import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createDownloadMedia } from "../../../src/core/application/download-media.ts";
import { createTranscribe, type TranscribeDeps } from "../../../src/core/application/transcribe.ts";
import type { PiTubeConfig } from "../../../src/core/domain/config.ts";
import { createError } from "../../../src/core/domain/errors.ts";
import { err } from "../../../src/core/domain/result.ts";
import { renderMarkdown } from "../../../src/core/domain/transcript/render-markdown.ts";
import { createFileLibraryStore } from "../../../src/infrastructure/library/file-library-store.ts";
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

  test("another provider reuses the kept audio and the stored source: no resolve, no download", async () => {
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
  });

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
