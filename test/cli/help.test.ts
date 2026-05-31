import { describe, expect, test } from "vitest";

function runCli(args: string[]) {
  return Bun.spawnSync({
    cmd: ["bun", "run", "--bun", "bin/pi-tube.ts", ...args],
    stdout: "pipe",
    stderr: "pipe",
  });
}

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, "");
}

describe("CLI help contract", () => {
  test("uses v2 command groups and section order", () => {
    const result = runCli(["--help"]);
    const stdout = result.stdout.toString();
    const clean = stripAnsi(stdout);

    expect(result.exitCode).toBe(0);
    expect(clean).toContain("pi-tube transcribe <input> [--provider <deepgram|groq|elevenlabs>]");
    expect(clean).toContain("pi-tube download <url> [--audio] [--output <dir>]");
    expect(clean).toContain("pi-tube auth <login|status|logout> [provider]");
    expect(clean).toContain("pi-tube defaults <provider|language|show> [value]");
    expect(clean).toContain("Core");
    expect(clean).toContain("Account");
    expect(clean).toContain("Defaults");
    expect(clean).toContain("Setup");
    expect(clean).not.toContain("provider-status");
    expect(clean).not.toContain("Deferred command");

    const usage = clean.indexOf("Usage");
    const commands = clean.indexOf("Commands");
    const options = clean.indexOf("Global options");
    const examples = clean.indexOf("Examples");
    const notes = clean.indexOf("Notes");

    expect(usage).toBeGreaterThanOrEqual(0);
    expect(commands).toBeGreaterThan(usage);
    expect(options).toBeGreaterThan(commands);
    expect(examples).toBeGreaterThan(options);
    expect(notes).toBeGreaterThan(examples);
    expect(stdout).toContain("\u001b[");
  });

  test("supports no-color fallback for readable help output", () => {
    const result = runCli(["--no-color", "--help"]);
    const stdout = result.stdout.toString();

    expect(result.exitCode).toBe(0);
    expect(stdout).not.toContain("\u001b[");
    expect(stdout).toContain("Usage");
    expect(stdout).toContain("Global options");
    expect(stdout).toContain("--no-color");
    expect(stdout).toContain("pi-tube auth login elevenlabs");
    expect(stdout).toContain("pi-tube transcribe");
  });

  test("supports help command and scoped subcommand help", () => {
    const helpCommand = runCli(["help"]);
    const transcribeScoped = runCli(["transcribe", "--help"]);
    const authHelpCommand = runCli(["help", "auth"]);
    const setupScoped = runCli(["setup", "--help"]);

    const rootHelp = stripAnsi(helpCommand.stdout.toString());
    const transcribeHelp = stripAnsi(transcribeScoped.stdout.toString());
    const authHelp = stripAnsi(authHelpCommand.stdout.toString());
    const setupHelp = stripAnsi(setupScoped.stdout.toString());

    expect(helpCommand.exitCode).toBe(0);
    expect(transcribeScoped.exitCode).toBe(0);
    expect(authHelpCommand.exitCode).toBe(0);
    expect(setupScoped.exitCode).toBe(0);

    expect(rootHelp).toContain("pi-tube CLI");
    expect(transcribeHelp).toContain("pi-tube transcribe");
    expect(transcribeHelp).toContain("--provider <deepgram|groq|elevenlabs>");
    expect(authHelp).toContain("pi-tube auth");
    expect(authHelp).toContain("auth login <deepgram|groq|elevenlabs>");
    expect(setupHelp).toContain("pi-tube setup");
    expect(setupHelp).toContain("setup skills [--global] [--agent <name>] [--yes|--no-prompt]");
    expect(setupHelp).not.toContain("provider-status [--json]");
  });
});
