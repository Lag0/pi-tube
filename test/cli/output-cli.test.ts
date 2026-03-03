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

describe("CLI output contract", () => {
  test("renders deterministic markdown output by default", () => {
    const result = runCli([mediaUrl], {
      PI_TUBE_TEST_DEEPGRAM_RESPONSE: JSON.stringify({
        results: {
          channels: [{ detected_language: "en", alternatives: [{ transcript: "hello deepgram" }] }],
        },
      }),
    });
    const stdout = result.stdout.toString();

    expect(result.exitCode).toBe(0);
    expect(stdout).toContain("---\nschema_version: \"1.0.0\"");
    expect(stdout).toContain("source_kind: \"direct_url\"");
    expect(stdout).toContain("provider: \"deepgram\"");
    expect(stdout).toContain("## Summary");
    expect(stdout).toContain("### Key Points");
    expect(stdout).not.toContain("## Transcript");
    expect(stdout).toContain("### Full Text");
    expect(stdout).toContain("hello deepgram");
  });

  test("renders timestamped transcript lines when provider segments are available", () => {
    const result = runCli(["--timestamps", mediaUrl], {
      PI_TUBE_TEST_DEEPGRAM_RESPONSE: JSON.stringify({
        results: {
          channels: [
            {
              alternatives: [
                {
                  transcript: "hello world",
                  words: [
                    { word: "hello", start: 0.2, end: 0.7 },
                    { word: "world", start: 0.71, end: 1.2 },
                  ],
                },
              ],
            },
          ],
        },
      }),
    });
    const stdout = result.stdout.toString();

    expect(result.exitCode).toBe(0);
    expect(stdout).toContain("## Transcript");
    expect(stdout).toContain("### Timestamped Segments");
    expect(stdout).toContain("- [00:00:00.200 - 00:00:00.700] hello");
    expect(stdout).toContain("- [00:00:00.710 - 00:00:01.200] world");
  });

  test("keeps timestamp blocks disabled by default", () => {
    const result = runCli([mediaUrl], {
      PI_TUBE_TEST_DEEPGRAM_RESPONSE: JSON.stringify({
        results: {
          channels: [
            {
              alternatives: [
                {
                  transcript: "hello world",
                  words: [
                    { word: "hello", start: 0.2, end: 0.7 },
                    { word: "world", start: 0.71, end: 1.2 },
                  ],
                },
              ],
            },
          ],
        },
      }),
    });
    const stdout = result.stdout.toString();

    expect(result.exitCode).toBe(0);
    expect(stdout).not.toContain("## Transcript");
    expect(stdout).not.toContain("### Timestamped Segments");
    expect(stdout).toContain("Timestamp mode: off (use --timestamps)");
  });

  test("returns deterministic schema-versioned JSON when --json is used", () => {
    const result = runCli(["--json", mediaUrl], {
      PI_TUBE_TEST_DEEPGRAM_RESPONSE: JSON.stringify({
        results: {
          channels: [{ alternatives: [{ transcript: "json response" }] }],
        },
      }),
    });

    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout.toString()) as {
      schema_version: string;
      source: { kind: string };
      transcription: { provider: string };
      transcript: { full_text: string };
    };
    expect(payload.schema_version).toBe("1.0.0");
    expect(payload.source.kind).toBe("direct_url");
    expect(payload.transcription.provider).toBe("deepgram");
    expect(payload.transcript.full_text).toBe("json response");
  });

  test("keeps markdown and JSON CLI modes semantically aligned for the same input", () => {
    const env = {
      PI_TUBE_TEST_DEEPGRAM_RESPONSE: JSON.stringify({
        results: {
          channels: [
            {
              detected_language: "en",
              alternatives: [
                {
                  transcript: "aligned output",
                  words: [{ word: "aligned", start: 0.1, end: 0.8 }],
                },
              ],
            },
          ],
        },
      }),
    };

    const markdownResult = runCli(["--timestamps", mediaUrl], env);
    const jsonResult = runCli(["--timestamps", "--json", mediaUrl], env);

    expect(markdownResult.exitCode).toBe(0);
    expect(jsonResult.exitCode).toBe(0);

    const markdown = markdownResult.stdout.toString();
    const jsonPayload = JSON.parse(jsonResult.stdout.toString()) as {
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

  test("supports documented provider + language JSON workflow deterministically", () => {
    const result = runCli(["--provider", "groq", "--language", "pt", "--json", mediaUrl], {
      PI_TUBE_TEST_GROQ_RESPONSE: JSON.stringify({
        text: "ola groq",
        language: "pt",
      }),
    });

    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout.toString()) as {
      schema_version: string;
      transcription: { provider: string; requested_language: string | null; detected_language: string | null };
      transcript: { full_text: string };
    };
    expect(payload.schema_version).toBe("1.0.0");
    expect(payload.transcription.provider).toBe("groq");
    expect(payload.transcription.requested_language).toBe("pt");
    expect(payload.transcription.detected_language).toBe("pt");
    expect(payload.transcript.full_text).toBe("ola groq");
  });
});
