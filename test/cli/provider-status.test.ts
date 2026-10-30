import { describe, expect, test } from "vitest";
import { runCliInProcess } from "../helpers/cli-harness.ts";

describe("providers command", () => {
  test("lists every provider as unconfigured without keys", async () => {
    const result = await runCliInProcess(["providers"]);
    const lines = result.stdout.trimEnd().split("\n");

    expect(result.exitCode).toBe(0);
    expect(lines[0]).toBe("[PROVIDERS]");
    expect(lines[1]).toMatch(/^config_path=.+config\.json$/);
    expect(lines.slice(2)).toEqual([
      "deepgram configured=false key_source=none",
      "groq configured=false key_source=none",
      "elevenlabs configured=false key_source=none",
    ]);
  });

  test("reports env keys by name and never prints them", async () => {
    const result = await runCliInProcess(["providers"], {
      env: { DEEPGRAM_API_KEY: "dg-secret", ELEVENLABS_API_KEY: "sk-eleven-secret" },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("deepgram configured=true key_source=env env_name=DEEPGRAM_API_KEY\n");
    expect(result.stdout).toContain("groq configured=false key_source=none\n");
    expect(result.stdout).toContain("elevenlabs configured=true key_source=env env_name=ELEVENLABS_API_KEY\n");
    expect(result.stdout).not.toMatch(/dg-secret|sk-eleven-secret/);
  });

  test("accepts ELEVEN_API_KEY as an ElevenLabs env alias", async () => {
    const result = await runCliInProcess(["providers"], { env: { ELEVEN_API_KEY: "legacy-eleven-secret" } });

    expect(result.stdout).toContain("elevenlabs configured=true key_source=env env_name=ELEVEN_API_KEY\n");
  });

  test("auth status is an alias of providers", async () => {
    const env = { GROQ_API_KEY: "gsk" };

    const providers = await runCliInProcess(["providers"], { env });
    const status = await runCliInProcess(["auth", "status"], { env });

    expect(status.stdout.split("\n").slice(2)).toEqual(providers.stdout.split("\n").slice(2));
  });

  test("emits JSON with null env_name outside env", async () => {
    const result = await runCliInProcess(["providers", "--json"], { env: { GROQ_API_KEY: "gsk" } });
    const payload = JSON.parse(result.stdout) as { config_path: string; providers: unknown[] };

    expect(result.exitCode).toBe(0);
    expect(payload.config_path).toMatch(/config\.json$/);
    expect(payload.providers).toEqual([
      { id: "deepgram", positioning: "best_value", configured: false, key_source: "none", env_name: null },
      { id: "groq", positioning: "best_value", configured: true, key_source: "env", env_name: "GROQ_API_KEY" },
      { id: "elevenlabs", positioning: "highest_accuracy", configured: false, key_source: "none", env_name: null },
    ]);
  });
});
