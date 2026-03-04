import { describe, expect, test } from "bun:test";

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
  test("uses section order and labels active/deferred capabilities", () => {
    const result = runCli(["--help"]);
    const stdout = result.stdout.toString();
    const clean = stripAnsi(stdout);

    expect(result.exitCode).toBe(0);
    expect(clean).toContain(
      "pi-tube <input> [--provider <deepgram|groq>] [--language <code>] [--timestamps] [--json]",
    );
    expect(clean).toContain(
      "pi-tube setup <install|skills|mcp> [--global] [--agent <name>]",
    );
    expect(clean).toContain("pi-tube config <set|get|list> [args] [--json]");
    expect(clean).toContain("pi-tube provider-status [--json]");
    expect(clean).toContain("Core");
    expect(clean).toContain("Setup");
    expect(clean).toContain("Config");
    expect(clean).toContain("Provider");
    expect(clean).toContain("Compatibility");

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

    expect(clean).toContain("Markdown default, JSON optional");
    expect(clean).toContain("setup <install|skills|mcp>");
    expect(clean).toContain("config <set|get|list>");
    expect(clean).toContain("provider-status");
    expect(clean).toContain("defaults.provider");
    expect(clean).toContain("Deferred command (use `pi-tube <input>`)");
    expect(clean).toContain("INSTAGRAM_AUTH_REQUIRED");
    expect(clean).toContain("--provider deepgram|groq");
    expect(clean).toContain("--timestamps");
    expect(clean).toContain("CLI flags > config defaults > env defaults");
    expect(clean).toContain("TRANSCRIPTION_PROVIDER_*");
    expect(stdout).toContain("\u001b[");

    const exampleLines = clean
      .split("\n")
      .filter((line) => line.trim().startsWith("pi-tube "));
    expect(exampleLines.length).toBeGreaterThanOrEqual(4);
  });

  test("supports no-color fallback for readable help output", () => {
    const result = runCli(["--no-color", "--help"]);
    const stdout = result.stdout.toString();

    expect(result.exitCode).toBe(0);
    expect(stdout).not.toContain("\u001b[");
    expect(stdout).toContain("Usage");
    expect(stdout).toContain("Global options");
    expect(stdout).toContain("--no-color");
    expect(stdout).toContain("pi-tube help [command]");
    expect(stdout).toContain("pi-tube config provider set groq");
  });

  test("supports help command and scoped subcommand help", () => {
    const helpCommand = runCli(["help"]);
    const configScoped = runCli(["config", "--help"]);
    const configHelpCommand = runCli(["help", "config"]);
    const setupScoped = runCli(["setup", "--help"]);

    const rootHelp = stripAnsi(helpCommand.stdout.toString());
    const configHelp = stripAnsi(configScoped.stdout.toString());
    const configHelpViaHelpCommand = stripAnsi(configHelpCommand.stdout.toString());
    const setupHelp = stripAnsi(setupScoped.stdout.toString());

    expect(helpCommand.exitCode).toBe(0);
    expect(configScoped.exitCode).toBe(0);
    expect(configHelpCommand.exitCode).toBe(0);
    expect(setupScoped.exitCode).toBe(0);

    expect(rootHelp).toContain("pi-tube CLI");
    expect(configHelp).toContain("pi-tube config");
    expect(configHelp).toContain("provider set <deepgram|groq>");
    expect(configHelp).toContain("language set <code>");
    expect(configHelp).toContain("set <key> <value>");
    expect(configHelp).toContain("Legacy `config set/get/list` commands remain supported");
    expect(configHelp).toContain("Supported keys:");
    expect(configHelp).not.toContain("Deferred command");
    expect(configHelpViaHelpCommand).toContain("pi-tube config");
    expect(setupHelp).toContain("pi-tube setup");
    expect(setupHelp).toContain("setup skills [--global] [--agent <name>] [--yes|--no-prompt]");
    expect(setupHelp).toContain("Interactive setup remains the default for humans.");
    expect(setupHelp).toContain("--yes, -y");
    expect(setupHelp).not.toContain("provider-status [--json]");
  });
});
