import { describe, expect, test } from "bun:test";

function runCli(args: string[], env: Record<string, string> = {}) {
  return Bun.spawnSync({
    cmd: ["bun", "run", "--bun", "bin/pi-tube.ts", ...args],
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...env },
  });
}

describe("provider-status command", () => {
  test("returns deterministic text output for provider readiness", () => {
    const result = runCli(["provider-status"], {
      DEEPGRAM_API_KEY: "",
      GROQ_API_KEY: "",
    });
    const stdout = result.stdout.toString();

    expect(result.exitCode).toBe(0);
    expect(stdout).toContain("[PROVIDER_STATUS]");
    expect(stdout).toContain(
      "deepgram registered=true configured=false required_env=DEEPGRAM_API_KEY missing_env=DEEPGRAM_API_KEY",
    );
    expect(stdout).toContain(
      "groq registered=true configured=false required_env=GROQ_API_KEY missing_env=GROQ_API_KEY",
    );
  });

  test("returns deterministic JSON output with configured and missing env details", () => {
    const result = runCli(["--json", "provider-status"], {
      DEEPGRAM_API_KEY: "dg-secret",
      GROQ_API_KEY: "",
    });

    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout.toString()) as {
      command: string;
      providers: Array<{
        id: string;
        registered: boolean;
        configured: boolean;
        required_env: string[];
        missing_env: string[];
      }>;
    };

    expect(payload.command).toBe("provider-status");
    expect(payload.providers).toEqual([
      {
        id: "deepgram",
        registered: true,
        configured: true,
        required_env: ["DEEPGRAM_API_KEY"],
        missing_env: [],
      },
      {
        id: "groq",
        registered: true,
        configured: false,
        required_env: ["GROQ_API_KEY"],
        missing_env: ["GROQ_API_KEY"],
      },
    ]);
  });
});
