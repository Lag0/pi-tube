import { describe, expect, test } from "bun:test";

function runCli(args: string[], env: Record<string, string> = {}) {
  return Bun.spawnSync({
    cmd: ["bun", "run", "--bun", "bin/pi-tube.ts", ...args],
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...env },
  });
}

describe("setup command", () => {
  test("prints npm install guidance via setup install", () => {
    const result = runCli(["setup", "install"]);
    const stdout = result.stdout.toString();

    expect(result.exitCode).toBe(0);
    expect(stdout).toContain("[SETUP_INSTALL]");
    expect(stdout).toContain("npm install -g @syxs/pi-tube");
    expect(stdout).toContain("pi-tube setup skills");
  });

  test("runs firecrawl-style skills command with global + agent targeting", () => {
    const result = runCli(["setup", "skills", "--global", "--agent", "codex"], {
      PI_TUBE_TEST_SETUP_DRY_RUN: "1",
    });
    const stdout = result.stdout.toString();

    expect(result.exitCode).toBe(0);
    expect(stdout).toContain("Running: npx -y skills@1.4.1 add https://github.com/Lag0/pi-tube/tree/main");
    expect(stdout).toContain("--global");
    expect(stdout).toContain("--agent codex");
  });

  test("supports short option aliases -g and -a for setup skills", () => {
    const result = runCli(["setup", "skills", "-g", "-a", "codex"], {
      PI_TUBE_TEST_SETUP_DRY_RUN: "1",
    });
    const stdout = result.stdout.toString();

    expect(result.exitCode).toBe(0);
    expect(stdout).toContain("Running: npx -y skills@1.4.1 add https://github.com/Lag0/pi-tube/tree/main");
    expect(stdout).toContain("--global");
    expect(stdout).toContain("--agent codex");
  });

  test("returns deterministic guidance for setup mcp placeholder", () => {
    const result = runCli(["setup", "mcp"]);
    const stderr = result.stderr.toString();

    expect(result.exitCode).toBe(2);
    expect(stderr).toContain("[CLI_NOT_IMPLEMENTED]");
    expect(stderr).toContain("setup mcp");
  });
});
