import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createRunDoctor, type DoctorCheck, type DoctorDeps } from "../../../src/core/application/doctor.ts";
import { DEFAULT_CONFIG, type PiTubeConfig } from "../../../src/core/domain/config.ts";
import { createError, type PiTubeError } from "../../../src/core/domain/errors.ts";
import { err } from "../../../src/core/domain/result.ts";
import type { MediaToolsReport } from "../../../src/core/ports/media-fetcher.ts";
import { createFileLibraryStore } from "../../../src/infrastructure/library/file-library-store.ts";
import { PROVIDER_DESCRIPTORS } from "../../../src/infrastructure/stt/registry.ts";
import { createFakeMediaFetcher } from "../../helpers/fake-media.ts";
import { createInMemoryConfigStore, IN_MEMORY_CONFIG_LOCATION } from "../../helpers/in-memory-config-store.ts";

let libraryDir: string;

beforeEach(() => {
  libraryDir = mkdtempSync(path.join(os.tmpdir(), "pi-tube-doctor-"));
});

afterEach(() => {
  rmSync(libraryDir, { recursive: true, force: true });
});

const TOOLS: MediaToolsReport = {
  ytDlp: { found: true, version: "2026.10.26" },
  ffmpeg: { found: true, version: "7.1" },
  cookies: "none",
};

const doctor = (
  options: {
    config?: PiTubeConfig | PiTubeError;
    env?: Record<string, string>;
    tools?: Partial<MediaToolsReport>;
    library?: DoctorDeps["library"];
  } = {},
) => {
  const media = createFakeMediaFetcher({ inspect: { ...TOOLS, ...options.tools } });
  const deps: DoctorDeps = {
    configStore: createInMemoryConfigStore(options.config ?? DEFAULT_CONFIG),
    env: options.env ?? { GROQ_API_KEY: "gq-test" },
    providers: PROVIDER_DESCRIPTORS,
    media: media.fetcher,
    library: options.library ?? createFileLibraryStore({ libraryDir }),
    versions: { piTube: "2.2.1", runtime: "bun 1.3.14" },
  };
  return { media, run: () => createRunDoctor(deps)({}) };
};

const checksOf = async (run: ReturnType<typeof doctor>["run"]): Promise<readonly DoctorCheck[]> => {
  const report = await run();
  if (!report.success) throw new Error(report.error.message);
  return report.data.checks;
};

const check = async (run: ReturnType<typeof doctor>["run"], id: string): Promise<DoctorCheck | undefined> =>
  (await checksOf(run)).find((candidate) => candidate.id === id);

describe("doctor", () => {
  test("runs every check in order", async () => {
    expect((await checksOf(doctor().run)).map((candidate) => candidate.id)).toEqual([
      "pi-tube",
      "config",
      "provider:deepgram",
      "provider:groq",
      "provider:elevenlabs",
      "providers",
      "yt-dlp",
      "ffmpeg",
      "cookies",
      "library",
    ]);
  });

  test("pi-tube names its version and runtime", async () => {
    expect(await check(doctor().run, "pi-tube")).toEqual({
      id: "pi-tube",
      status: "ok",
      summary: "pi-tube 2.2.1 on bun 1.3.14.",
    });
  });

  test("config names where it is", async () => {
    expect(await check(doctor().run, "config")).toEqual({
      id: "config",
      status: "ok",
      summary: `Config at \`${IN_MEMORY_CONFIG_LOCATION}\`.`,
    });
  });

  test("a config that cannot be read is an error, and the provider checks use the defaults", async () => {
    const broken = createError("CONFIG_INVALID", "Config file /x is invalid: `version` must be a number.");
    const checks = await checksOf(doctor({ config: broken }).run);

    expect(checks.find((candidate) => candidate.id === "config")).toEqual({
      id: "config",
      status: "error",
      summary: broken.message,
      fix: broken.hint,
    });
    expect(checks.find((candidate) => candidate.id === "provider:groq")?.summary).toBe("Key from `GROQ_API_KEY`.");
  });

  test("a provider shows where its key comes from", async () => {
    const config: PiTubeConfig = { ...DEFAULT_CONFIG, providers: { deepgram: { api_key: "dg-SECRET" } } };
    const checks = await checksOf(doctor({ config }).run);

    expect(checks.find((candidate) => candidate.id === "provider:deepgram")).toEqual({
      id: "provider:deepgram",
      status: "ok",
      summary: "Key from config.json.",
    });
    expect(checks.find((candidate) => candidate.id === "provider:groq")).toEqual({
      id: "provider:groq",
      status: "ok",
      summary: "Key from `GROQ_API_KEY`.",
    });
  });

  test("a provider without a key is a warning with how to add one", async () => {
    expect(await check(doctor().run, "provider:elevenlabs")).toEqual({
      id: "provider:elevenlabs",
      status: "warn",
      summary: "No key.",
      fix: "Run `pi-tube auth login elevenlabs` or set `ELEVENLABS_API_KEY`.",
    });
  });

  test("an env key over a config key is a warning", async () => {
    const config: PiTubeConfig = { ...DEFAULT_CONFIG, providers: { groq: { api_key: "gq-config" } } };

    expect(await check(doctor({ config }).run, "provider:groq")).toEqual({
      id: "provider:groq",
      status: "warn",
      summary: "`GROQ_API_KEY` in env overrides the key in config.json.",
      fix: "Unset `GROQ_API_KEY` to use the key in config.json, or run `pi-tube auth logout groq`.",
    });
  });

  test("providers counts the ones with a key", async () => {
    expect(await check(doctor().run, "providers")).toEqual({
      id: "providers",
      status: "ok",
      summary: "1 of 3 providers have a key.",
    });
  });

  test("no key at all is an error, and the report is not ok", async () => {
    const { run } = doctor({ env: {} });
    const report = await run();

    expect(report.success && report.data.ok).toBe(false);
    expect(report.success && report.data.checks.find((candidate) => candidate.id === "providers")).toEqual({
      id: "providers",
      status: "error",
      summary: "No provider has a key, so nothing can be transcribed.",
      fix: "Run `pi-tube auth login <deepgram|groq|elevenlabs>`.",
    });
  });

  test("yt-dlp and ffmpeg show their versions", async () => {
    const checks = await checksOf(doctor().run);

    expect(checks.find((candidate) => candidate.id === "yt-dlp")).toEqual({
      id: "yt-dlp",
      status: "ok",
      summary: "yt-dlp 2026.10.26.",
    });
    expect(checks.find((candidate) => candidate.id === "ffmpeg")).toEqual({
      id: "ffmpeg",
      status: "ok",
      summary: "ffmpeg 7.1.",
    });
  });

  test("yt-dlp missing is an error with the install hint", async () => {
    expect(await check(doctor({ tools: { ytDlp: { found: false } } }).run, "yt-dlp")).toEqual({
      id: "yt-dlp",
      status: "error",
      summary: "yt-dlp is not on PATH.",
      fix: createError("YTDLP_NOT_FOUND", "x").hint,
    });
  });

  test("ffmpeg missing is a warning", async () => {
    expect(await check(doctor({ tools: { ffmpeg: { found: false } } }).run, "ffmpeg")).toEqual({
      id: "ffmpeg",
      status: "warn",
      summary: "ffmpeg is not on PATH; `download` needs it to save audio as mp3 and to merge video.",
      fix: "Install ffmpeg (`brew install ffmpeg`, `winget install ffmpeg` or your package manager).",
    });
  });

  test("a tool on PATH that reports no version is a warning", async () => {
    const checks = await checksOf(doctor({ tools: { ytDlp: { found: true }, ffmpeg: { found: true } } }).run);

    expect(checks.find((candidate) => candidate.id === "yt-dlp")).toMatchObject({
      status: "warn",
      summary: "yt-dlp is on PATH but did not report its version.",
    });
    expect(checks.find((candidate) => candidate.id === "ffmpeg")).toMatchObject({
      status: "warn",
      summary: "ffmpeg is on PATH but did not report its version.",
    });
  });

  test("cookies: none set, set and readable, or the reason they cannot be used", async () => {
    const unusable = createError("COOKIES_FILE_INVALID", "The cookies file set by `cookies.file` cannot be read.");

    expect(await check(doctor().run, "cookies")).toEqual({
      id: "cookies",
      status: "ok",
      summary: "No cookies file set (only needed for content behind a login).",
    });
    expect(
      await check(
        doctor({ env: { GROQ_API_KEY: "gq", PI_TUBE_COOKIES_FILE: "/c.txt" }, tools: { cookies: "ok" } }).run,
        "cookies",
      ),
    ).toEqual({ id: "cookies", status: "ok", summary: "Cookies file set by `PI_TUBE_COOKIES_FILE` and readable." });
    expect(await check(doctor({ tools: { cookies: unusable } }).run, "cookies")).toEqual({
      id: "cookies",
      status: "error",
      summary: unusable.message,
      fix: unusable.hint,
    });
  });

  test("a relative cookies path is an error from the source settings", async () => {
    const config: PiTubeConfig = { ...DEFAULT_CONFIG, cookies: { file: "cookies.txt" } };

    expect(await check(doctor({ config }).run, "cookies")).toMatchObject({
      status: "error",
      summary: "`cookies.file` must be an absolute path.",
    });
  });

  test("library counts transcripts and kept audio, with the limit", async () => {
    const config: PiTubeConfig = { ...DEFAULT_CONFIG, library: { max_audio_bytes: 1000 } };

    expect(await check(doctor().run, "library")).toEqual({
      id: "library",
      status: "ok",
      summary: "0 transcripts; 0 kept audio files, 0 bytes (no limit).",
    });
    expect((await check(doctor({ config }).run, "library"))?.summary).toBe(
      "0 transcripts; 0 kept audio files, 0 bytes (limit 1000).",
    );
  });

  test("a library that cannot be read is an error", async () => {
    const failing = createError("STORAGE_IO_FAILED", "Cannot read the library (EACCES).");
    const library = { ...createFileLibraryStore({ libraryDir }), entries: async () => err(failing) };

    expect(await check(doctor({ library }).run, "library")).toEqual({
      id: "library",
      status: "error",
      summary: failing.message,
      fix: failing.hint,
    });
  });

  test("the report never holds a key or the cookies path", async () => {
    const file = path.join(libraryDir, "cookies-SECRET.txt");
    writeFileSync(file, "# Netscape HTTP Cookie File\n");
    const config: PiTubeConfig = { ...DEFAULT_CONFIG, providers: { groq: { api_key: "gq-SECRET-config" } } };
    const { run, media } = doctor({
      config,
      env: { GROQ_API_KEY: "gq-SECRET", PI_TUBE_COOKIES_FILE: file },
      tools: { cookies: "ok" },
    });

    const report = await run();

    expect(JSON.stringify(report)).not.toContain("SECRET");
    expect(media.calls.settings.at(-1)?.cookies?.file).toBe(file);
  });
});
