import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { runCli } from "../../../src/adapters/cli/run-cli.ts";
import { createApp } from "../../../src/bootstrap.ts";
import type { MediaFetcher } from "../../../src/core/ports/media-fetcher.ts";
import { fakeProviders, PROVIDER_KEYS } from "../../helpers/transcribe-fakes.ts";

const HIDE_CURSOR = "\u001b[?25l";
const SHOW_CURSOR = "\u001b[?25h";

const boom = async (): Promise<never> => {
  throw new Error("boom");
};
const throwingMedia: MediaFetcher = { resolve: boom, fetchAudio: boom, download: boom };

describe("progress spinner", () => {
  test.each([
    ["transcribe", "https://cdn.example.com/a.mp3"],
    ["download", "https://www.youtube.com/watch?v=abc"],
  ])("%s stops the spinner and shows the cursor again when the operation throws", async (command, input) => {
    const writes: string[] = [];
    const progressStream = {
      isTTY: true,
      columns: 80,
      write: (chunk: string) => writes.push(chunk) > 0,
    } as unknown as NodeJS.WriteStream;
    const home = mkdtempSync(path.join(os.tmpdir(), "pi-tube-progress-"));

    try {
      const exitCode = await runCli([command, input], {
        app: createApp(
          {
            env: { HOME: home, PI_TUBE_CONFIG_PATH: path.join(home, "config.json"), ...PROVIDER_KEYS },
            cwd: home,
            homedir: () => home,
          },
          { media: throwingMedia, stt: fakeProviders() },
        ),
        io: { writeOut: () => {}, writeErr: () => {}, readStdin: async () => "", progressStream },
        system: { platform: process.platform, runInteractive: () => 0 },
      });
      const writesAtExit = writes.length;
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(exitCode).toBe(1);
      expect(writes).toContain(HIDE_CURSOR);
      expect(writes.lastIndexOf(SHOW_CURSOR)).toBeGreaterThan(writes.lastIndexOf(HIDE_CURSOR));
      expect(writes.length).toBe(writesAtExit);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
