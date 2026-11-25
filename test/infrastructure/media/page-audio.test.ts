import { readFileSync } from "node:fs";
import { setEnvironmentData } from "node:worker_threads";
import { expect, test, vi } from "vitest";
import { pageAudioExtension } from "../../../src/infrastructure/media/page-audio.ts";

let active: import("node:worker_threads").Worker;

vi.mock("node:worker_threads", async (load) => {
  const actual = await load<typeof import("node:worker_threads")>();
  return {
    ...actual,
    Worker: class extends actual.Worker {
      constructor(file: URL, options: import("node:worker_threads").WorkerOptions) {
        super(file, {
          ...options,
          execArgv: ["--import", new URL("../../fixtures-process/hold-page-validation.mjs", import.meta.url).href],
        });
        active = this;
      }
    },
  };
});

test.each([
  ["walk", "abort"],
  ["parser", "timeout"],
])("interrupts a held %s on %s", async (phase, stop) => {
  const state = new Int32Array(new SharedArrayBuffer(4));
  setEnvironmentData("hold-page-validation", { phase, state });
  const file = readFileSync("test/fixtures-media/silence.mp3");
  const bytes = Buffer.from(new SharedArrayBuffer(file.length));
  bytes.set(file);
  const controller = new AbortController();
  const deadline = Date.now() + (stop === "timeout" ? 3000 : 10000);
  const poll = setInterval(() => {
    if (stop === "abort" && Atomics.load(state, 0)) controller.abort();
  }, 10);
  try {
    await expect(pageAudioExtension(bytes.buffer, deadline, controller.signal)).rejects.toThrow("validation expired");
    expect(Atomics.load(state, 0)).toBe(1);
    expect(Date.now()).toBeLessThan(stop === "abort" ? deadline : deadline + 2000);
    expect(active.threadId).toBe(-1);
  } finally {
    clearInterval(poll);
    setEnvironmentData("hold-page-validation", undefined);
  }
});
