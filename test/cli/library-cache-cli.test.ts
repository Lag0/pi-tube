import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { ProcessRequest, ProcessResult } from "../../src/infrastructure/process/run-process.ts";
import { runCliInProcess } from "../helpers/cli-harness.ts";
import { createFakeSttProvider } from "../helpers/fake-stt.ts";
import { fakeYtDlp, PROVIDER_KEYS } from "../helpers/transcribe-fakes.ts";

const YOUTUBE = "https://www.youtube.com/watch?v=jNQXAC9IVRw";

let libraryDir: string;

beforeEach(() => {
  libraryDir = mkdtempSync(path.join(os.tmpdir(), "pi-tube-cache-cli-"));
});

afterEach(() => {
  rmSync(libraryDir, { recursive: true, force: true });
});

/** The real media fetcher on a fake yt-dlp that counts its runs, and a counting provider. */
const setup = () => {
  const runs: ProcessRequest[] = [];
  const ytDlp = fakeYtDlp({ metadata: { id: "jNQXAC9IVRw", extractor_key: "Youtube", title: "Me at the zoo" } });
  const run = async (request: ProcessRequest): Promise<ProcessResult> => {
    runs.push(request);
    return ytDlp(request);
  };
  const groq = createFakeSttProvider("groq");
  const transcribe = (args: string[] = []) =>
    runCliInProcess(["transcribe", YOUTUBE, "--provider", "groq", ...args], {
      env: { PI_TUBE_LIBRARY_DIR: libraryDir, ...PROVIDER_KEYS },
      fakes: { stt: { groq }, runProcess: run },
    });
  return { runs, groq, transcribe };
};

describe("transcribe cache", () => {
  test("the second run is a cache hit: yt-dlp and the provider run only once", async () => {
    const { runs, groq, transcribe } = setup();

    const first = JSON.parse((await transcribe(["--json"])).stdout);
    const runsAfterFirst = runs.length;
    const second = JSON.parse((await transcribe(["--json"])).stdout);

    expect(first.cache_hit).toBe(false);
    expect(second).toMatchObject({ cache_hit: true, transcript_id: first.transcript_id });
    expect(runsAfterFirst).toBeGreaterThan(0);
    expect(runs).toHaveLength(runsAfterFirst);
    expect(groq.requests).toHaveLength(1);
  });

  test("the human output names the transcript and the cache hit", async () => {
    const { transcribe } = setup();
    await transcribe();

    const second = await transcribe();

    expect(second.exitCode).toBe(0);
    expect(second.stdout).toMatch(/\[TRANSCRIPT_ID\] [0-9a-f]{20}\n/);
    expect(second.stdout).toContain("[CACHE_HIT] true");
  });

  test("--force transcribes again", async () => {
    const { groq, transcribe } = setup();
    await transcribe();

    const forced = JSON.parse((await transcribe(["--force", "--json"])).stdout);

    expect(forced.cache_hit).toBe(false);
    expect(forced.transcript_id).toMatch(/-2$/);
    expect(groq.requests).toHaveLength(2);
  });
});
