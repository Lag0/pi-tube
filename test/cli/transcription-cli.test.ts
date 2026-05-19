import { afterAll, describe, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { readOutputFileFromStdout } from "./output-file.ts";

const outputDir = mkdtempSync(path.join(os.tmpdir(), "pi-tube-cli-transcription-"));
const configDir = mkdtempSync(path.join(os.tmpdir(), "pi-tube-cli-transcription-config-"));
const configPath = path.join(configDir, "config.json");

afterAll(() => {
  rmSync(outputDir, { recursive: true, force: true });
  rmSync(configDir, { recursive: true, force: true });
});

function runCli(args: string[], env: Record<string, string> = {}) {
  return Bun.spawnSync({
    cmd: ["bun", "run", "--bun", "bin/pi-tube.ts", ...args],
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      PI_TUBE_OUTPUT_DIR: outputDir,
      PI_TUBE_CONFIG_PATH: configPath,
      DEEPGRAM_API_KEY: "",
      GROQ_API_KEY: "",
      ...env,
    },
  });
}

const mediaUrl = "https://cdn.example.com/audio/demo.wav";

describe("CLI transcription integration", () => {
  test("executes deepgram provider and renders deterministic markdown output", () => {
    const result = runCli(["--provider", "deepgram", mediaUrl], {
      PI_TUBE_TEST_DEEPGRAM_RESPONSE: JSON.stringify({
        results: {
          channels: [
            {
              detected_language: "en",
              alternatives: [{ transcript: "hello deepgram" }],
            },
          ],
        },
      }),
    });

    const stdout = readOutputFileFromStdout(result.stdout.toString());
    expect(result.exitCode).toBe(0);
    expect(stdout).toContain('source_kind: "direct_url"');
    expect(stdout).toContain('provider: "deepgram"');
    expect(stdout).not.toContain("## Transcript");
    expect(stdout).toContain("### Full Text");
    expect(stdout).toContain("hello deepgram");
  });

  test("supports groq provider switching and language preference", () => {
    const result = runCli(["--provider", "groq", "--language", "pt-BR", mediaUrl], {
      PI_TUBE_TEST_GROQ_RESPONSE: JSON.stringify({ text: "ola groq", language: "pt" }),
    });

    const stdout = readOutputFileFromStdout(result.stdout.toString());
    expect(result.exitCode).toBe(0);
    expect(stdout).toContain('provider: "groq"');
    expect(stdout).toContain('requested_language: "pt-br"');
    expect(stdout).toContain('detected_language: "pt"');
  });

  test("uses env provider fallback when --provider is omitted", () => {
    const result = runCli([mediaUrl], {
      PI_TUBE_TRANSCRIPTION_PROVIDER: "groq",
      PI_TUBE_TEST_GROQ_RESPONSE: JSON.stringify({ text: "env groq", language: "es" }),
    });

    const stdout = readOutputFileFromStdout(result.stdout.toString());
    expect(result.exitCode).toBe(0);
    expect(stdout).toContain('provider: "groq"');
    expect(stdout).toContain("env groq");
  });

  test("prioritizes --provider over env provider fallback", () => {
    const result = runCli(["--provider", "deepgram", mediaUrl], {
      PI_TUBE_TRANSCRIPTION_PROVIDER: "groq",
      PI_TUBE_TEST_DEEPGRAM_RESPONSE: JSON.stringify({
        results: { channels: [{ alternatives: [{ transcript: "cli wins" }] }] },
      }),
      PI_TUBE_TEST_GROQ_RESPONSE: JSON.stringify({ text: "env loses", language: "en" }),
    });

    const stdout = readOutputFileFromStdout(result.stdout.toString());
    expect(result.exitCode).toBe(0);
    expect(stdout).toContain('provider: "deepgram"');
    expect(stdout).toContain("cli wins");
  });

  test("maps provider auth failure to stable code with non-zero exit", () => {
    const result = runCli(["--provider", "deepgram", mediaUrl], {
      PI_TUBE_TEST_DEEPGRAM_ERROR: "auth",
    });

    expect(result.exitCode).toBe(2);
    expect(result.stderr.toString()).toContain("[TRANSCRIPTION_PROVIDER_AUTH]");
  });

  test("maps provider rate-limit failure to stable code with non-zero exit", () => {
    const result = runCli(["--provider", "groq", mediaUrl], {
      PI_TUBE_TEST_GROQ_ERROR: "rate_limit",
    });

    expect(result.exitCode).toBe(2);
    expect(result.stderr.toString()).toContain("[TRANSCRIPTION_PROVIDER_RATE_LIMIT]");
  });

  test("maps generic provider failure to stable code with non-zero exit", () => {
    const result = runCli(["--provider", "deepgram", mediaUrl], {
      PI_TUBE_TEST_DEEPGRAM_ERROR: "failed",
    });

    expect(result.exitCode).toBe(2);
    expect(result.stderr.toString()).toContain("[TRANSCRIPTION_PROVIDER_FAILED]");
  });

  test("maps provider unavailable failure to stable code with non-zero exit", () => {
    const result = runCli(["--provider", "groq", mediaUrl], {
      PI_TUBE_TEST_GROQ_ERROR: "unavailable",
    });

    expect(result.exitCode).toBe(2);
    expect(result.stderr.toString()).toContain("[TRANSCRIPTION_PROVIDER_UNAVAILABLE]");
  });

  test("maps provider invalid response to stable code with non-zero exit", () => {
    const result = runCli(["--provider", "groq", mediaUrl], {
      PI_TUBE_TEST_GROQ_RESPONSE: JSON.stringify({ text: "" }),
    });

    expect(result.exitCode).toBe(2);
    expect(result.stderr.toString()).toContain("[TRANSCRIPTION_PROVIDER_INVALID_RESPONSE]");
  });

  test("fails fast when no provider credentials are configured", () => {
    const result = runCli([mediaUrl], {
      DEEPGRAM_API_KEY: "",
      GROQ_API_KEY: "",
    });

    expect(result.exitCode).toBe(2);
    expect(result.stderr.toString()).toContain("[TRANSCRIPTION_PROVIDER_NOT_CONFIGURED]");
    expect(result.stderr.toString()).toContain("provider-status");
  });

  test("falls back to alternate provider when primary fails", () => {
    const result = runCli(["--provider", "deepgram", mediaUrl], {
      PI_TUBE_TEST_DEEPGRAM_ERROR: "failed",
      PI_TUBE_TEST_GROQ_RESPONSE: JSON.stringify({ text: "fallback groq", language: "en" }),
    });

    const stdout = readOutputFileFromStdout(result.stdout.toString());
    expect(result.exitCode).toBe(0);
    expect(stdout).toContain('provider: "groq"');
    expect(stdout).toContain("fallback groq");
  });
});
