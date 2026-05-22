import { describe, expect, test } from "vitest";

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

  test("supports non-interactive setup flags for automation paths", () => {
    const result = runCli(["setup", "skills", "--global", "--yes"], {
      PI_TUBE_TEST_SETUP_DRY_RUN: "1",
    });
    const stdout = result.stdout.toString();

    expect(result.exitCode).toBe(0);
    expect(stdout).toContain("Running: npx -y skills@1.4.1 add https://github.com/Lag0/pi-tube/tree/main");
    expect(stdout).toContain("--global");
    expect(stdout).toContain("--yes");
  });

  test("maps --no-prompt alias to non-interactive execution", () => {
    const result = runCli(["setup", "skills", "--global", "--no-prompt", "--agent", "codex"], {
      PI_TUBE_TEST_SETUP_DRY_RUN: "1",
    });
    const stdout = result.stdout.toString();

    expect(result.exitCode).toBe(0);
    expect(stdout).toContain("Running: npx -y skills@1.4.1 add https://github.com/Lag0/pi-tube/tree/main");
    expect(stdout).toContain("--global");
    expect(stdout).toContain("--agent codex");
    expect(stdout).toContain("--yes");
  });

  test("supports --non-interactive alias for automation", () => {
    const result = runCli(["setup", "skills", "--global", "--non-interactive"], {
      PI_TUBE_TEST_SETUP_DRY_RUN: "1",
    });
    const stdout = result.stdout.toString();

    expect(result.exitCode).toBe(0);
    expect(stdout).toContain("Running: npx -y skills@1.4.1 add https://github.com/Lag0/pi-tube/tree/main");
    expect(stdout).toContain("--global");
    expect(stdout).toContain("--yes");
  });

  test("prints yt-dlp installation guidance", () => {
    const result = runCli(["setup", "yt-dlp"]);
    const stdout = result.stdout.toString();

    expect(result.exitCode).toBe(0);
    expect(stdout).toContain("[SETUP_YTDLP]");
    expect(stdout).toContain("brew install yt-dlp");
    expect(stdout).toContain("pipx install yt-dlp");
    expect(stdout).toContain("yt-dlp --version");
  });

  test("prints dry-run yt-dlp install command with --yes", () => {
    const result = runCli(["setup", "yt-dlp", "--yes"], {
      PI_TUBE_TEST_SETUP_DRY_RUN: "1",
    });
    const stdout = result.stdout.toString();

    expect(result.exitCode).toBe(0);
    expect(stdout).toContain("Running: brew install yt-dlp");
  });

  test("returns deterministic guidance for setup mcp placeholder", () => {
    const result = runCli(["setup", "mcp"]);
    const stderr = result.stderr.toString();

    expect(result.exitCode).toBe(2);
    expect(stderr).toContain("[CLI_NOT_IMPLEMENTED]");
    expect(stderr).toContain("setup mcp");
  });
});
