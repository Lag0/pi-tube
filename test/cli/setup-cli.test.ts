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

  test("keeps setup skills interactive by default in dry-run mode", () => {
    const result = runCli(["setup", "skills", "--global", "--agent", "codex", "--dry-run"]);
    const stdout = result.stdout.toString();

    expect(result.exitCode).toBe(0);
    expect(stdout).toContain("[SETUP_SKILLS_DRY_RUN]");
    expect(stdout).toContain("npx -y skills@1.4.1 add https://github.com/Lag0/pi-tube/tree/main");
    expect(stdout).toContain("--global");
    expect(stdout).toContain("--agent codex");
    expect(stdout).not.toContain("--yes");
  });

  test("supports non-interactive automation mode with enforced global install", () => {
    const result = runCli(["setup", "skills", "--non-interactive", "--dry-run"]);
    const stdout = result.stdout.toString();

    expect(result.exitCode).toBe(0);
    expect(stdout).toContain("[SETUP_SKILLS_DRY_RUN]");
    expect(stdout).toContain("--yes");
    expect(stdout).toContain("--global");
  });

  test("rejects --agent when --non-interactive is used", () => {
    const result = runCli(["setup", "skills", "--non-interactive", "--agent", "codex", "--dry-run"]);
    const stderr = result.stderr.toString();

    expect(result.exitCode).toBe(2);
    expect(stderr).toContain("[CLI_CONTRACT_VIOLATION]");
    expect(stderr).toContain("--agent");
    expect(stderr).toContain("--non-interactive");
  });

  test("returns deterministic guidance for setup mcp placeholder", () => {
    const result = runCli(["setup", "mcp"]);
    const stderr = result.stderr.toString();

    expect(result.exitCode).toBe(2);
    expect(stderr).toContain("[CLI_NOT_IMPLEMENTED]");
    expect(stderr).toContain("setup mcp");
  });
});
