import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createError } from "../../src/core/domain/errors.ts";
import { runCliInProcess } from "../helpers/cli-harness.ts";
import { createFakeSttProvider } from "../helpers/fake-stt.ts";
import { spawnCli } from "../helpers/spawn-cli.ts";
import { fakeProviders, PROVIDER_KEYS, transcript } from "../helpers/transcribe-fakes.ts";
import { readOutputFileFromStdout } from "./output-file.ts";

const mediaUrl = "https://cdn.example.com/audio/demo.wav";

let outputDir: string;

beforeEach(() => {
  outputDir = mkdtempSync(path.join(os.tmpdir(), "pi-tube-cli-transcription-"));
});

afterEach(() => {
  rmSync(outputDir, { recursive: true, force: true });
});

const run = (
  args: string[],
  options: { env?: Record<string, string>; stt?: Parameters<typeof fakeProviders>[0] } = {},
) =>
  runCliInProcess(["transcribe", ...args], {
    env: { PI_TUBE_OUTPUT_DIR: outputDir, ...PROVIDER_KEYS, ...options.env },
    fakes: { stt: fakeProviders(options.stt) },
  });

describe("CLI transcription", () => {
  test("executes deepgram and renders deterministic markdown output", async () => {
    const result = await run([mediaUrl, "--provider", "deepgram"], {
      stt: { deepgram: transcript("hello deepgram", "en") },
    });

    const output = readOutputFileFromStdout(result.stdout);
    expect(result.exitCode).toBe(0);
    expect(output).toContain('source_kind: "direct_url"');
    expect(output).toContain('provider: "deepgram"');
    expect(output).not.toContain("## Transcript");
    expect(output).toContain("### Full Text");
    expect(output).toContain("hello deepgram");
  });

  test("supports groq with a language preference", async () => {
    const result = await run([mediaUrl, "--provider", "groq", "--language", "pt-BR"], {
      stt: { groq: transcript("ola groq", "pt") },
    });

    const output = readOutputFileFromStdout(result.stdout);
    expect(result.exitCode).toBe(0);
    expect(output).toContain('provider: "groq"');
    expect(output).toContain('requested_language: "pt-br"');
    expect(output).toContain('detected_language: "pt"');
  });

  test("supports elevenlabs with a language preference", async () => {
    const result = await run([mediaUrl, "--provider", "elevenlabs", "--language", "es"], {
      stt: { elevenlabs: transcript("hola elevenlabs", "es") },
    });

    const output = readOutputFileFromStdout(result.stdout);
    expect(result.exitCode).toBe(0);
    expect(output).toContain('provider: "elevenlabs"');
    expect(output).toContain('requested_language: "es"');
    expect(output).toContain("hola elevenlabs");
  });

  test("uses PI_TUBE_TRANSCRIPTION_PROVIDER when --provider is omitted", async () => {
    const result = await run([mediaUrl], { env: { PI_TUBE_TRANSCRIPTION_PROVIDER: "groq" } });

    expect(readOutputFileFromStdout(result.stdout)).toContain('provider: "groq"');
  });

  test("--provider wins over PI_TUBE_TRANSCRIPTION_PROVIDER", async () => {
    const result = await run([mediaUrl, "--provider", "deepgram"], { env: { PI_TUBE_TRANSCRIPTION_PROVIDER: "groq" } });

    expect(readOutputFileFromStdout(result.stdout)).toContain('provider: "deepgram"');
  });

  test.each([
    ["PROVIDER_AUTH", 4],
    ["PROVIDER_RATE_LIMIT", 4],
    ["PROVIDER_FAILED", 4],
    ["PROVIDER_UNAVAILABLE", 4],
    ["PROVIDER_INVALID_RESPONSE", 4],
  ] as const)("a provider %s exits %i", async (code, exitCode) => {
    const result = await run([mediaUrl, "--provider", "groq"], {
      stt: { groq: createError(code, "Upstream said no.") },
    });

    expect(result.exitCode).toBe(exitCode);
    expect(result.stderr).toContain(`[${code}]`);
  });

  test("fails fast when no provider is configured", async () => {
    const result = await runCliInProcess(["transcribe", mediaUrl], {
      env: { PI_TUBE_OUTPUT_DIR: outputDir },
      fakes: { stt: fakeProviders() },
    });

    expect(result.exitCode).toBe(4);
    expect(result.stderr).toContain("[PROVIDER_NOT_CONFIGURED]");
    expect(result.stderr).toContain("auth login");
  });

  test("never falls back: an unavailable provider fails and names the other configured ones", async () => {
    const groq = createFakeSttProvider("groq");
    const result = await run([mediaUrl, "--provider", "deepgram"], {
      stt: { deepgram: createError("PROVIDER_UNAVAILABLE", "Down."), groq },
    });

    expect(result.exitCode).toBe(4);
    expect(result.stderr).toContain("[PROVIDER_UNAVAILABLE]");
    expect(result.stderr).toMatch(/hint: .*groq/);
    expect(groq.requests).toHaveLength(0);
  });

  test("--json prints one JSON result object on stdout and saves the JSON file", async () => {
    const result = await run([mediaUrl, "--json"], { stt: { deepgram: transcript("json response", "en") } });
    const payload = JSON.parse(result.stdout) as Record<string, unknown>;

    expect(result.exitCode).toBe(0);
    expect(Object.keys(payload)).toEqual([
      "output_path",
      "output_uri",
      "format",
      "provider",
      "source",
      "requested_language",
      "detected_language",
      "summary",
      "characters",
      "segments",
    ]);
    expect(payload).toMatchObject({
      format: "json",
      provider: "deepgram",
      source: { kind: "direct_url", reference: mediaUrl, title: null, platform: null, tier: "tested" },
      detected_language: "en",
      characters: "json response".length,
    });
    expect(JSON.parse(readOutputFileFromStdout(result.stdout)).transcript.full_text).toBe("json response");
    expect(result.stdout).not.toContain("[OUTPUT_FILE]");
  });

  test("never writes to the process stdout or console", async () => {
    const spies = [vi.spyOn(process.stdout, "write"), vi.spyOn(console, "log"), vi.spyOn(console, "error")];

    await run([mediaUrl]);

    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  test("the real bin reports a missing local file", () => {
    const result = spawnCli(["transcribe", "./missing-pi-tube-input.mp3"], { DEEPGRAM_API_KEY: "dg-test-key" });

    expect(result.exitCode).toBe(5);
    expect(result.stderr).toContain("[LOCAL_FILE_NOT_FOUND]");
  });
});
