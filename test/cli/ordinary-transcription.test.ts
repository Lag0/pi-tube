import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test, vi } from "vitest";
import { createApp } from "../../src/bootstrap.ts";
import { createError } from "../../src/core/domain/errors.ts";
import { err } from "../../src/core/domain/result.ts";
import { createFakeMediaFetcher } from "../helpers/fake-media.ts";
import { createFakeSttProvider } from "../helpers/fake-stt.ts";

const input = { input: "https://example.org/audio.mp3", format: "json", language: "EN" } as const;
test.each([
  { fails: false, stuck: false },
  { fails: true, stuck: false },
  { fails: false, stuck: true },
  { fails: true, stuck: true },
])("overlapping ordinary transcription (producer fails: $fails, claim stuck: $stuck)", async ({ fails, stuck }) => {
  const home = mkdtempSync(path.join(os.tmpdir(), "ordinary-"));
  const entered = Promise.withResolvers<void>(),
    release = Promise.withResolvers<void>(),
    duplicate = Promise.withResolvers<void>(),
    waiting = Promise.withResolvers<void>();
  const warn = vi.spyOn(process, "emitWarning").mockImplementation(() => {});
  const library = path.join(home, "library");
  const fake = createFakeSttProvider("groq");
  let calls = 0;
  const app = createApp(
    {
      env: { HOME: home, GROQ_API_KEY: "fake", PI_TUBE_LIBRARY_DIR: library },
      cwd: home,
      homedir: () => home,
      adapter: "cli",
    },
    {
      media: createFakeMediaFetcher().fetcher,
      stt: {
        groq: {
          ...fake,
          transcribe: async (request) => {
            calls++;
            if (calls === 1) {
              entered.resolve();
              await release.promise;
              if (fails) return err(createError("PROVIDER_FAILED", "Ambiguous response"));
            } else if (request.language === "en") duplicate.resolve();
            return fake.transcribe(request);
          },
        },
      },
    },
  );
  const owner = app.transcribe(input);
  await entered.promise;
  const alias = { ...input, input: `${input.input}#alias`, format: "markdown", language: " en " } as const;
  const stopWait = new AbortController();
  const waiter = app.transcribe(alias, {
    signal: stopWait.signal,
    onProgress: ({ label }) => {
      if (label === "Waiting for transcription...") waiting.resolve();
    },
  });
  try {
    await Promise.race([waiting.promise, duplicate.promise]);
    expect(calls).toBe(1);
    const controller = new AbortController();
    const cancelled = await app.transcribe(input, {
      signal: controller.signal,
      onProgress: ({ label }) => {
        if (label === "Waiting for transcription...") controller.abort();
      },
    });
    expect(cancelled).toMatchObject({ success: false, error: { code: "CANCELLED" } });
    expect(await app.transcribe({ ...input, language: "fr" })).toMatchObject({
      success: true,
      data: { cacheHit: false },
    });
    const name = readdirSync(library).find((entry) => entry.startsWith(".transcribing-"));
    if (!name) throw Error("Expected a held transcription claim");
    const claim = path.join(library, name);
    if (stuck) writeFileSync(path.join(claim, "block-release"), "");
    release.resolve();
    const result = await owner;
    if (stuck) expect(warn).toHaveBeenCalledWith(expect.stringContaining(claim));
    if (stuck) vi.spyOn(performance, "now").mockReturnValue(Number.MAX_SAFE_INTEGER);
    if (fails) {
      expect(result).toMatchObject({
        success: false,
        error: { code: "PROVIDER_FAILED", message: "Ambiguous response" },
      });
      expect(await waiter).toMatchObject({
        success: false,
        error: { code: "STORAGE_IO_FAILED", hint: expect.stringContaining("provider usage") },
      });
    } else {
      expect(result).toMatchObject({ success: true, data: { cacheHit: false } });
      expect(await waiter).toMatchObject({
        success: true,
        data: { transcriptId: result.success && result.data.transcriptId, cacheHit: true, cost: { estimate: 0 } },
      });
    }
    if (stuck) expect(readdirSync(claim)).toEqual(fails ? ["block-release"] : ["block-release", "completed"]);
    expect(calls).toBe(2);
  } finally {
    release.resolve();
    stopWait.abort();
    await Promise.allSettled([owner, waiter]);
    rmSync(home, { recursive: true, force: true });
  }
});
