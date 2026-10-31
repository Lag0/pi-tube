import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { createError } from "../../src/core/domain/errors.ts";
import type { SttProvider } from "../../src/core/ports/stt-provider.ts";
import { runCliInProcess } from "../helpers/cli-harness.ts";
import { spawnCli } from "../helpers/spawn-cli.ts";
import { fakeProviders, PROVIDER_KEYS } from "../helpers/transcribe-fakes.ts";

const configDir = mkdtempSync(path.join(os.tmpdir(), "pi-tube-cli-error-config-"));
const configPath = path.join(configDir, "config.json");

function runCli(args: string[], env: Record<string, string> = {}) {
  return spawnCli(args, { PI_TUBE_CONFIG_PATH: configPath, DEEPGRAM_API_KEY: "", GROQ_API_KEY: "", ...env });
}

const mediaUrl = "https://cdn.example.com/audio/demo.wav";

const runInProcess = (args: string[], stt: Parameters<typeof fakeProviders>[0] = {}) =>
  runCliInProcess(["transcribe", ...args], { env: { ...PROVIDER_KEYS }, fakes: { stt: fakeProviders(stt) } });

describe("CLI error exits and formatting", () => {
  test("returns zero on success", async () => {
    const result = await runInProcess([mediaUrl]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr.trim()).toBe("");
  });

  test("returns command-specific guidance for unsupported flags", () => {
    const result = runCli(["transcribe", mediaUrl, "--bad-flag"]);
    const stderr = result.stderr.toString();

    expect(result.exitCode).toBe(2);
    expect(stderr).toContain("[INPUT_INVALID]");
    expect(stderr).toContain(
      "hint: Use one of: `pi-tube transcribe <input>`, `pi-tube transcribe <input> --provider <deepgram|groq|elevenlabs>`, `pi-tube transcribe <input> --json`.",
    );
  });

  test("returns command-specific guidance for missing or unsupported command actions", () => {
    const cases: Array<{ args: string[]; expected: string }> = [
      {
        args: ["sample-input"],
        expected:
          "hint: Use one of: `pi-tube transcribe <input>`, `pi-tube download <url>`, `pi-tube auth status`, `pi-tube defaults show`, `pi-tube setup yt-dlp`.",
      },
      {
        args: ["auth"],
        expected:
          "hint: Use one of: `pi-tube auth login <deepgram|groq|elevenlabs>`, `pi-tube auth status`, `pi-tube auth logout <deepgram|groq|elevenlabs>`.",
      },
      {
        args: ["auth", "login"],
        expected:
          "hint: Use one of: `pi-tube auth login <deepgram|groq|elevenlabs>`, `pi-tube auth status`, `pi-tube auth logout <deepgram|groq|elevenlabs>`.",
      },
      {
        args: ["defaults"],
        expected:
          "hint: Use one of: `pi-tube defaults provider <deepgram|groq|elevenlabs>`, `pi-tube defaults language <code>`, `pi-tube defaults show`.",
      },
      {
        args: ["setup"],
        expected: "hint: Use one of: `pi-tube setup yt-dlp`, `pi-tube setup skills`, `pi-tube setup mcp`.",
      },
      {
        args: ["download"],
        expected:
          "hint: Use one of: `pi-tube download <url>`, `pi-tube download <url> --audio`, `pi-tube download <url> --output <dir>`.",
      },
      {
        args: ["transcribe"],
        expected:
          "hint: Use one of: `pi-tube transcribe <input>`, `pi-tube transcribe <input> --provider <deepgram|groq|elevenlabs>`, `pi-tube transcribe <input> --json`.",
      },
    ];

    for (const testCase of cases) {
      const result = runCli(testCase.args);
      expect(result.exitCode).toBe(2);
      expect(result.stderr.toString()).toContain(testCase.expected);
    }
  });

  test("returns deterministic intake error code and guidance formatting", () => {
    const result = runCli(["transcribe", "./missing-clip.mp3"], { DEEPGRAM_API_KEY: "dg-test-key" });
    const stderr = result.stderr.toString();
    const lines = stderr.trim().split("\n");

    expect(result.exitCode).toBe(5);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("[LOCAL_FILE_NOT_FOUND]");
    expect(lines[1]?.startsWith("hint: ")).toBe(true);
  });

  test("returns deterministic provider auth failure code", async () => {
    const result = await runInProcess([mediaUrl, "--provider", "deepgram"], {
      deepgram: createError("PROVIDER_AUTH", "Bad key."),
    });

    expect(result.exitCode).toBe(4);
    expect(result.stderr).toContain("[PROVIDER_AUTH]");
  });

  test("keeps unexpected failures distinguishable with exit code 1", async () => {
    const throwing: SttProvider = {
      id: "deepgram",
      model: "nova-3",
      capabilities: { timestamps: true, languageDetection: true, requiresLanguage: false, offline: false },
      transcribe: async () => {
        throw new SyntaxError("Unexpected token b in JSON");
      },
    };

    const result = await runInProcess([mediaUrl], { deepgram: throwing });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("[UNEXPECTED]");
  });

  test("keeps config validation deterministic", () => {
    const removedAlias = runCli(["config", "provider", "set", "invalid-provider"]);
    const invalidProvider = runCli(["config", "set", "defaults.provider", "invalid-provider"]);
    const missingValue = runCli(["config", "set", "defaults.provider"]);

    expect(removedAlias.exitCode).toBe(2);
    expect(removedAlias.stderr.toString()).toContain("[INPUT_INVALID]");

    expect(invalidProvider.exitCode).toBe(2);
    expect(invalidProvider.stderr.toString()).toContain("[PROVIDER_INVALID]");

    expect(missingValue.exitCode).toBe(2);
    expect(missingValue.stderr.toString()).toContain("[INPUT_INVALID]");
  });

  test("an unparsable config fails transcribe with CONFIG_INVALID and is left untouched", () => {
    const brokenConfigPath = path.join(configDir, "broken.json");
    const truncated = '{"version": 1, "providers": {';
    writeFileSync(brokenConfigPath, truncated);

    const result = runCli(["transcribe", mediaUrl], {
      PI_TUBE_CONFIG_PATH: brokenConfigPath,
      DEEPGRAM_API_KEY: "dg-test-key",
    });

    expect(result.exitCode).toBe(6);
    expect(result.stderr.toString()).toContain("[CONFIG_INVALID]");
    expect(readFileSync(brokenConfigPath, "utf8")).toBe(truncated);
  });

  test("keeps setup automation flags scoped to setup command", () => {
    const misplacedSetupFlag = runCli(["transcribe", mediaUrl, "--yes"]);

    expect(misplacedSetupFlag.exitCode).toBe(2);
    expect(misplacedSetupFlag.stderr.toString()).toContain("[INPUT_INVALID]");
  });
});

afterAll(() => {
  rmSync(configDir, { recursive: true, force: true });
});
