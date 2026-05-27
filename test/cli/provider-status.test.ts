import { describe, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

function runCli(args: string[], env: Record<string, string> = {}) {
  const configDir = mkdtempSync(path.join(os.tmpdir(), "pi-tube-auth-status-"));
  const configPath = path.join(configDir, "config.json");
  try {
    return Bun.spawnSync({
      cmd: ["bun", "run", "--bun", "bin/pi-tube.ts", ...args],
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, PI_TUBE_CONFIG_PATH: configPath, ...env },
    });
  } finally {
    rmSync(configDir, { recursive: true, force: true });
  }
}

describe("auth status command", () => {
  test("returns deterministic text output for provider auth state", () => {
    const result = runCli(["auth", "status"], {
      DEEPGRAM_API_KEY: "",
      GROQ_API_KEY: "",
      ELEVENLABS_API_KEY: "",
      ELEVEN_API_KEY: "",
    });
    const stdout = result.stdout.toString();
    const lines = stdout.trim().split("\n");

    expect(result.exitCode).toBe(0);
    expect(stdout).toContain("[AUTH_STATUS]");
    expect(lines[2]).toBe("deepgram configured=false source=- key=-");
    expect(lines[3]).toBe("groq configured=false source=- key=-");
    expect(lines[4]).toBe("elevenlabs configured=false source=- key=-");
  });

  test("reports env fallback auth state", () => {
    const result = runCli(["auth", "status"], {
      DEEPGRAM_API_KEY: "dg-secret",
      GROQ_API_KEY: "",
      ELEVENLABS_API_KEY: "sk-eleven-secret",
      ELEVEN_API_KEY: "",
    });
    const stdout = result.stdout.toString();

    expect(result.exitCode).toBe(0);
    expect(stdout).toContain("deepgram configured=true source=DEEPGRAM_API_KEY key=dg-s***cret");
    expect(stdout).toContain("groq configured=false source=- key=-");
    expect(stdout).toContain("elevenlabs configured=true source=ELEVENLABS_API_KEY key=sk-e***cret");
  });

  test("accepts ELEVEN_API_KEY as an ElevenLabs env alias", () => {
    const result = runCli(["auth", "status"], {
      DEEPGRAM_API_KEY: "",
      GROQ_API_KEY: "",
      ELEVENLABS_API_KEY: "",
      ELEVEN_API_KEY: "legacy-eleven-secret",
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain("elevenlabs configured=true source=ELEVEN_API_KEY key=lega***cret");
  });
});
