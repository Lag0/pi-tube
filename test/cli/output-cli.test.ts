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
    expect(stdout).toContain("## Transcript");
    expect(stdout).toContain("### Full Text");
    expect(stdout).toContain("hello deepgram");
  });

  test("renders timestamped transcript lines when provider segments are available", () => {
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
    expect(stdout).toContain("### Timestamped Segments");
    expect(stdout).toContain("- [00:00:00.200 - 00:00:00.700] hello");
    expect(stdout).toContain("- [00:00:00.710 - 00:00:01.200] world");
  });

  test("keeps --json mode in planned-feature state until json renderer activation", () => {
    const result = runCli(["--json", mediaUrl], {
      PI_TUBE_TEST_DEEPGRAM_RESPONSE: JSON.stringify({
        results: {
          channels: [{ alternatives: [{ transcript: "unused" }] }],
        },
      }),
    });

    expect(result.exitCode).toBe(2);
    expect(result.stderr.toString()).toContain("[CLI_NOT_IMPLEMENTED]");
  });
});
