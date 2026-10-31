import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import type { SttTranscript } from "../../src/core/ports/stt-provider.ts";
import { runCliInProcess } from "../helpers/cli-harness.ts";
import { fakeProviders, PROVIDER_KEYS, transcript } from "../helpers/transcribe-fakes.ts";
import { extractOutputPath, readOutputFileFromStdout } from "./output-file.ts";

const outputDir = mkdtempSync(path.join(os.tmpdir(), "pi-tube-cli-output-"));

afterAll(() => {
  rmSync(outputDir, { recursive: true, force: true });
});

const mediaUrl = "https://cdn.example.com/audio/demo.wav";

const run = (args: string[], answers: { deepgram?: SttTranscript; groq?: SttTranscript } = {}) =>
  runCliInProcess(["transcribe", ...args], {
    env: { PI_TUBE_OUTPUT_DIR: outputDir, ...PROVIDER_KEYS },
    fakes: { stt: fakeProviders(answers) },
  });

const helloWorld = transcript("hello world", undefined, [
  { startMs: 200, endMs: 700, text: "hello" },
  { startMs: 710, endMs: 1200, text: "world" },
]);

describe("CLI output contract", () => {
  test("renders deterministic markdown output by default", async () => {
    const result = await run([mediaUrl], { deepgram: transcript("hello deepgram", "en") });
    const outputPath = extractOutputPath(result.stdout);
    const fileContent = readOutputFileFromStdout(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("[OUTPUT_FILE]");
    expect(result.stdout).toContain("[OUTPUT_FILE_URI]");
    expect(path.basename(outputPath)).toMatch(/^\d{4}-\d{2}-\d{2}-demo(-\d+)?\.md$/);
    expect(fileContent).toContain('---\nschema_version: "1.1.0"');
    expect(fileContent).toContain('source_kind: "direct_url"');
    expect(fileContent).toContain('provider: "deepgram"');
    expect(fileContent).toContain("## Summary");
    expect(fileContent).toContain("### Key Points");
    expect(fileContent).not.toContain("## Transcript");
    expect(fileContent).toContain("### Full Text");
    expect(fileContent).toContain("hello deepgram");
  });

  test("renders timestamped transcript lines when provider segments are available", async () => {
    const result = await run([mediaUrl, "--timestamps"], { deepgram: helloWorld });
    const fileContent = readOutputFileFromStdout(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(fileContent).toContain("## Transcript");
    expect(fileContent).toContain("### Timestamped Segments");
    expect(fileContent).toContain("- [00:00:00.200 - 00:00:00.700] hello");
    expect(fileContent).toContain("- [00:00:00.710 - 00:00:01.200] world");
  });

  test("keeps timestamp blocks disabled by default", async () => {
    const result = await run([mediaUrl], { deepgram: helloWorld });
    const fileContent = readOutputFileFromStdout(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(fileContent).not.toContain("## Transcript");
    expect(fileContent).not.toContain("### Timestamped Segments");
    expect(fileContent).toContain("Timestamp mode: off (use --timestamps)");
  });

  test("returns deterministic schema-versioned JSON when --json is used", async () => {
    const result = await run([mediaUrl, "--json"], { deepgram: transcript("json response") });

    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(readOutputFileFromStdout(result.stdout)) as {
      schema_version: string;
      source: { kind: string };
      transcription: { provider: string };
      transcript: { full_text: string };
    };
    expect(payload.schema_version).toBe("1.1.0");
    expect(payload.source.kind).toBe("direct_url");
    expect(payload.transcription.provider).toBe("deepgram");
    expect(payload.transcript.full_text).toBe("json response");
  });

  test("keeps markdown and JSON CLI modes semantically aligned for the same input", async () => {
    const aligned = transcript("aligned output", "en", [{ startMs: 100, endMs: 800, text: "aligned" }]);

    const markdownResult = await run([mediaUrl, "--timestamps"], { deepgram: aligned });
    const jsonResult = await run([mediaUrl, "--timestamps", "--json"], { deepgram: aligned });

    expect(markdownResult.exitCode).toBe(0);
    expect(jsonResult.exitCode).toBe(0);

    const markdown = readOutputFileFromStdout(markdownResult.stdout);
    const jsonPayload = JSON.parse(readOutputFileFromStdout(jsonResult.stdout)) as {
      source: { kind: string };
      transcription: { provider: string; detected_language: string | null };
      transcript: { full_text: string; segments: Array<{ text: string }> };
    };

    expect(markdown).toContain(`source_kind: "${jsonPayload.source.kind}"`);
    expect(markdown).toContain(`provider: "${jsonPayload.transcription.provider}"`);
    expect(markdown).toContain(`detected_language: "${jsonPayload.transcription.detected_language}"`);
    expect(markdown).toContain(jsonPayload.transcript.full_text);
    expect(markdown).toContain(jsonPayload.transcript.segments[0]?.text ?? "");
  });

  test("supports documented provider + language JSON workflow deterministically", async () => {
    const result = await run([mediaUrl, "--provider", "groq", "--language", "pt", "--json"], {
      groq: transcript("ola groq", "pt"),
    });

    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(readOutputFileFromStdout(result.stdout)) as {
      schema_version: string;
      transcription: { provider: string; requested_language: string | null; detected_language: string | null };
      transcript: { full_text: string };
    };
    expect(payload.schema_version).toBe("1.1.0");
    expect(payload.transcription.provider).toBe("groq");
    expect(payload.transcription.requested_language).toBe("pt");
    expect(payload.transcription.detected_language).toBe("pt");
    expect(payload.transcript.full_text).toBe("ola groq");
  });
});
