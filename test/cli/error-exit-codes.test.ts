import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, test } from "vitest";

const configDir = mkdtempSync(path.join(os.tmpdir(), "pi-tube-cli-error-config-"));
const configPath = path.join(configDir, "config.json");

function runCli(args: string[], env: Record<string, string> = {}) {
  return Bun.spawnSync({
    cmd: ["bun", "run", "--bun", "bin/pi-tube.ts", ...args],
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      PI_TUBE_CONFIG_PATH: configPath,
      DEEPGRAM_API_KEY: "",
      GROQ_API_KEY: "",
      ...env,
    },
  });
}

const mediaUrl = "https://cdn.example.com/audio/demo.wav";

describe("CLI error exits and formatting", () => {
  test("returns zero on success", () => {
    const result = runCli(["transcribe", mediaUrl], {
      PI_TUBE_TEST_DEEPGRAM_RESPONSE: JSON.stringify({
        results: { channels: [{ alternatives: [{ transcript: "ok" }] }] },
      }),
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr.toString().trim()).toBe("");
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
    const result = runCli(["transcribe", "https://example.com/blog"]);
    const stderr = result.stderr.toString();
    const lines = stderr.trim().split("\n");

    expect(result.exitCode).toBe(5);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("[UNSUPPORTED_URL_NOT_DIRECT_MEDIA]");
    expect(lines[1]?.startsWith("hint: ")).toBe(true);
  });

  test("returns deterministic provider auth failure code", () => {
    const result = runCli(["transcribe", mediaUrl, "--provider", "deepgram"], {
      PI_TUBE_TEST_DEEPGRAM_ERROR: "auth",
    });

    expect(result.exitCode).toBe(4);
    expect(result.stderr.toString()).toContain("[PROVIDER_AUTH]");
  });

  test("keeps unexpected failures distinguishable with exit code 1", () => {
    const result = runCli(["transcribe", mediaUrl], {
      PI_TUBE_TEST_DEEPGRAM_RESPONSE: "{bad-json",
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain("[UNEXPECTED]");
  });

  test("keeps config validation deterministic for friendly and legacy routes", () => {
    const friendlyInvalidProvider = runCli(["config", "provider", "set", "invalid-provider"]);
    const legacyInvalidProvider = runCli(["config", "set", "defaults.provider", "invalid-provider"]);
    const missingFriendlyValue = runCli(["config", "provider", "env", "groq"]);

    expect(friendlyInvalidProvider.exitCode).toBe(2);
    expect(friendlyInvalidProvider.stderr.toString()).toContain("[INPUT_INVALID]");

    expect(legacyInvalidProvider.exitCode).toBe(2);
    expect(legacyInvalidProvider.stderr.toString()).toContain("[INPUT_INVALID]");

    expect(missingFriendlyValue.exitCode).toBe(2);
    expect(missingFriendlyValue.stderr.toString()).toContain("[INPUT_INVALID]");
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
