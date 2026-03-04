import { describe, expect, test } from "bun:test";

function runCli(args: string[], env: Record<string, string> = {}) {
  return Bun.spawnSync({
    cmd: ["bun", "run", "--bun", "bin/pi-tube.ts", ...args],
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...env },
  });
}

const mediaUrl = "https://cdn.example.com/audio/demo.wav";

describe("CLI error exits and formatting", () => {
  test("returns zero on success", () => {
    const result = runCli([mediaUrl], {
      PI_TUBE_TEST_DEEPGRAM_RESPONSE: JSON.stringify({
        results: { channels: [{ alternatives: [{ transcript: "ok" }] }] },
      }),
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr.toString().trim()).toBe("");
  });

  test("returns deterministic contract error for unsupported flags", () => {
    const result = runCli(["--bad-flag", mediaUrl]);
    const stderr = result.stderr.toString();

    expect(result.exitCode).toBe(2);
    expect(stderr).toContain("[CLI_CONTRACT_VIOLATION]");
    expect(stderr).toContain("guidance: Run `pi-tube --help`");
  });

  test("returns deterministic intake error code and guidance formatting", () => {
    const result = runCli(["https://example.com/blog"]);
    const stderr = result.stderr.toString();
    const lines = stderr.trim().split("\n");

    expect(result.exitCode).toBe(2);
    expect(lines[0]).toContain("[UNSUPPORTED_URL_NOT_DIRECT_MEDIA]");
    for (const line of lines.slice(1)) {
      expect(line.startsWith("guidance: ")).toBe(true);
    }
  });

  test("returns deterministic provider auth failure code", () => {
    const result = runCli(["--provider", "deepgram", mediaUrl], {
      PI_TUBE_TEST_DEEPGRAM_ERROR: "auth",
    });

    expect(result.exitCode).toBe(2);
    expect(result.stderr.toString()).toContain("[TRANSCRIPTION_PROVIDER_AUTH]");
  });

  test("keeps unexpected failures distinguishable with exit code 1", () => {
    const result = runCli([mediaUrl], {
      PI_TUBE_TEST_DEEPGRAM_RESPONSE: "{bad-json",
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain("[CLI_UNEXPECTED]");
  });

  test("keeps config validation deterministic for friendly and legacy routes", () => {
    const friendlyInvalidProvider = runCli(["config", "provider", "set", "invalid-provider"]);
    const legacyInvalidProvider = runCli(["config", "set", "defaults.provider", "invalid-provider"]);
    const missingFriendlyValue = runCli(["config", "provider", "env", "groq"]);

    expect(friendlyInvalidProvider.exitCode).toBe(2);
    expect(friendlyInvalidProvider.stderr.toString()).toContain("[CLI_CONTRACT_VIOLATION]");

    expect(legacyInvalidProvider.exitCode).toBe(2);
    expect(legacyInvalidProvider.stderr.toString()).toContain("[CLI_CONTRACT_VIOLATION]");

    expect(missingFriendlyValue.exitCode).toBe(2);
    expect(missingFriendlyValue.stderr.toString()).toContain("[CLI_CONTRACT_VIOLATION]");
  });

  test("keeps setup automation flags scoped to setup command", () => {
    const misplacedSetupFlag = runCli(["--yes", mediaUrl]);

    expect(misplacedSetupFlag.exitCode).toBe(2);
    expect(misplacedSetupFlag.stderr.toString()).toContain("[CLI_CONTRACT_VIOLATION]");
  });
});
