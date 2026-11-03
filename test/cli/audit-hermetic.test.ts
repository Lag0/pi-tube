import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { runCliInProcess } from "../helpers/cli-harness.ts";
import { createFakeMediaFetcher } from "../helpers/fake-media.ts";
import { SPAWN_ROOT, spawnCli } from "../helpers/spawn-cli.ts";
import { fakeProviders, transcript } from "../helpers/transcribe-fakes.ts";

const MONTH_FILE = /^\d{4}-\d{2}\.jsonl$/;

let home: string;

beforeEach(() => {
  home = mkdtempSync(path.join(os.tmpdir(), "pi-tube-audit-hermetic-"));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

const auditText = (auditDir: string): string =>
  readdirSync(auditDir)
    .filter((name) => MONTH_FILE.test(name))
    .map((name) => readFileSync(path.join(auditDir, name), "utf8"))
    .join("");

describe("audit log", () => {
  test("the audit never holds keys, cookies, signed URLs or transcript text", async () => {
    const cookies = path.join(home, "cookies-SECRET.txt");
    writeFileSync(cookies, "# Netscape HTTP Cookie File\n");
    const configPath = path.join(home, "config.json");
    writeFileSync(configPath, JSON.stringify({ version: 1, cookies: { file: cookies } }));
    const input = "https://user:pw@cdn.example.com/a.mp3?X-Amz-Signature=SIG-SECRET&token=TOK-SECRET";

    const result = await runCliInProcess(["transcribe", input], {
      env: { HOME: home, PI_TUBE_CONFIG_PATH: configPath, DEEPGRAM_API_KEY: "dg-SECRET-123" },
      fakes: {
        media: createFakeMediaFetcher().fetcher,
        stt: fakeProviders({ deepgram: transcript("TRANSCRIPT-SECRET", "en") }),
      },
    });

    expect(result.exitCode).toBe(0);
    const text = auditText(path.join(home, ".pi-tube", "audit"));
    expect(text).toContain('"operation":"transcribe"');
    for (const secret of [
      "dg-SECRET-123",
      "cookies-SECRET",
      "SIG-SECRET",
      "TOK-SECRET",
      "user:pw",
      "TRANSCRIPT-SECRET",
    ]) {
      expect(text).not.toContain(secret);
    }
  });

  test("a spawned CLI never reads the developer's PI_TUBE_OUTPUT_DIR", () => {
    const outputDir = path.join(home, "v2-transcripts");
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(
      path.join(outputDir, "2026-03-02-demo.json"),
      readFileSync(path.join("test", "fixtures", "v2", "json-golden.json")),
    );
    const previous = process.env.PI_TUBE_OUTPUT_DIR;
    process.env.PI_TUBE_OUTPUT_DIR = outputDir;
    try {
      const result = spawnCli(["library", "list"]);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).not.toContain("[LIBRARY_IMPORT]");
    } finally {
      if (previous === undefined) delete process.env.PI_TUBE_OUTPUT_DIR;
      else process.env.PI_TUBE_OUTPUT_DIR = previous;
    }
  });

  test("a spawned CLI writes its audit under the temp HOME", () => {
    const media = path.join(home, "clip.mp3");
    mkdirSync(home, { recursive: true });
    writeFileSync(media, "fake-audio");

    const result = spawnCli(["info", media]);

    expect(result.exitCode).toBe(0);
    const auditDir = path.join(SPAWN_ROOT, ".pi-tube", "audit");
    expect(readdirSync(auditDir).filter((name) => MONTH_FILE.test(name))).toHaveLength(1);
    expect(auditText(auditDir)).toContain('"operation":"info"');
  });
});
