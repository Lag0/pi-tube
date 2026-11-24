import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { createApp } from "../../src/bootstrap.ts";
import { createError } from "../../src/core/domain/errors.ts";
import { err } from "../../src/core/domain/result.ts";
import { createFakeMediaFetcher } from "../helpers/fake-media.ts";
import { createFakeSttProvider } from "../helpers/fake-stt.ts";

const input = { input: "https://example.org/audio.mp3", format: "json", language: "EN" } as const;
function latch() {
  let open = () => {};
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

test.each([false, true])("overlapping ordinary transcription (producer fails: %s)", async (fails) => {
  const home = mkdtempSync(path.join(os.tmpdir(), "ordinary-"));
  const entered = latch(),
    release = latch(),
    duplicate = latch(),
    waiting = latch();
  const fake = createFakeSttProvider("groq");
  let calls = 0;
  const app = createApp(
    {
      env: { HOME: home, GROQ_API_KEY: "fake", PI_TUBE_LIBRARY_DIR: path.join(home, "library") },
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
              entered.open();
              await release.promise;
              if (fails) return err(createError("PROVIDER_FAILED", "Ambiguous response"));
            } else if (request.language === "en") duplicate.open();
            return fake.transcribe(request);
          },
        },
      },
    },
  );
  const owner = app.transcribe(input);
  await entered.promise;
  const alias = { ...input, input: `${input.input}#alias`, format: "markdown", language: " en " } as const;
  const waiter = app.transcribe(alias, {
    onProgress: ({ label }) => {
      if (label === "Waiting for transcription...") waiting.open();
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
    release.open();
    const result = await owner;
    if (fails) {
      expect(result.success).toBe(false);
      expect((await waiter).success).toBe(false);
    } else {
      expect(result).toMatchObject({ success: true, data: { cacheHit: false } });
      expect(await waiter).toMatchObject({
        success: true,
        data: { transcriptId: result.success && result.data.transcriptId, cacheHit: true, cost: { estimate: 0 } },
      });
    }
    expect(calls).toBe(2);
  } finally {
    release.open();
    await Promise.all([owner, waiter]);
    rmSync(home, { recursive: true, force: true });
  }
});
