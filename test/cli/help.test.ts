import { describe, expect, test } from "bun:test";

function runCli(args: string[]) {
  return Bun.spawnSync({
    cmd: ["bun", "run", "--bun", "bin/pi-tube.ts", ...args],
    stdout: "pipe",
    stderr: "pipe",
  });
}

describe("CLI help contract", () => {
  test("uses the locked section order and labels active/deferred capabilities", () => {
    const result = runCli(["--help"]);
    const stdout = result.stdout.toString();

    expect(result.exitCode).toBe(0);
    expect(stdout).toContain("pi-tube <input> [--provider <deepgram|groq>] [--language <code>] [--timestamps] [--json]");
    expect(stdout).toContain(
      "pi-tube setup <install|skills|mcp> [--global] [--agent <name>]",
    );
    expect(stdout).toContain("pi-tube config <set|get|list> [args] [--json]");
    expect(stdout).toContain("pi-tube provider-status [--json]");

    const usage = stdout.indexOf("Usage");
    const commands = stdout.indexOf("Commands");
    const options = stdout.indexOf("Global options");
    const examples = stdout.indexOf("Examples");
    const notes = stdout.indexOf("Notes");

    expect(usage).toBeGreaterThanOrEqual(0);
    expect(commands).toBeGreaterThan(usage);
    expect(options).toBeGreaterThan(commands);
    expect(examples).toBeGreaterThan(options);
    expect(notes).toBeGreaterThan(examples);

    expect(stdout).toContain("Markdown default, JSON optional");
    expect(stdout).toContain("setup <...>");
    expect(stdout).toContain("config <set|get|list>");
    expect(stdout).toContain("provider-status");
    expect(stdout).toContain("defaults.provider");
    expect(stdout).toContain("deferred command (use `pi-tube <input>`)");
    expect(stdout).toContain("INSTAGRAM_AUTH_REQUIRED");
    expect(stdout).toContain("--provider deepgram|groq");
    expect(stdout).toContain("--timestamps");
    expect(stdout).toContain("CLI flags > config defaults > env defaults");
    expect(stdout).toContain("TRANSCRIPTION_PROVIDER_*");

    const exampleLines = stdout
      .split("\n")
      .filter((line) => line.trim().startsWith("pi-tube "));
    expect(exampleLines.length).toBeGreaterThanOrEqual(4);
  });
});
