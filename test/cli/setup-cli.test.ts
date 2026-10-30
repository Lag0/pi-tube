import { describe, expect, test } from "vitest";
import { runCliInProcess } from "../helpers/cli-harness.ts";

const SKILLS_ADD = "npx -y skills@1.4.1 add https://github.com/Lag0/pi-tube/tree/main";

describe("setup command", () => {
  test("prints npm install guidance via setup install", async () => {
    const result = await runCliInProcess(["setup", "install"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("[SETUP_INSTALL]");
    expect(result.stdout).toContain("npm install -g @syxs/pi-tube");
    expect(result.stdout).toContain("pi-tube setup skills");
    expect(result.systemCalls).toEqual([]);
  });

  test("runs firecrawl-style skills command with global + agent targeting", async () => {
    const result = await runCliInProcess(["setup", "skills", "--global", "--agent", "codex"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(`Running: ${SKILLS_ADD}`);
    expect(result.systemCalls).toEqual([`${SKILLS_ADD} --global --agent codex`]);
  });

  test("supports short option aliases -g and -a for setup skills", async () => {
    const result = await runCliInProcess(["setup", "skills", "-g", "-a", "codex"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(`Running: ${SKILLS_ADD}`);
    expect(result.systemCalls).toEqual([`${SKILLS_ADD} --global --agent codex`]);
  });

  test("supports non-interactive setup flags for automation paths", async () => {
    const result = await runCliInProcess(["setup", "skills", "--global", "--yes"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(`Running: ${SKILLS_ADD}`);
    expect(result.systemCalls).toEqual([`${SKILLS_ADD} --yes --global`]);
  });

  test("maps --no-prompt alias to non-interactive execution", async () => {
    const result = await runCliInProcess(["setup", "skills", "--global", "--no-prompt", "--agent", "codex"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(`Running: ${SKILLS_ADD}`);
    expect(result.systemCalls).toEqual([`${SKILLS_ADD} --yes --global --agent codex`]);
  });

  test("supports --non-interactive alias for automation", async () => {
    const result = await runCliInProcess(["setup", "skills", "--global", "--non-interactive"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(`Running: ${SKILLS_ADD}`);
    expect(result.systemCalls).toEqual([`${SKILLS_ADD} --yes --global`]);
  });

  test("prints yt-dlp installation guidance", async () => {
    const result = await runCliInProcess(["setup", "yt-dlp"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("[SETUP_YTDLP]");
    expect(result.stdout).toContain("brew install yt-dlp");
    expect(result.stdout).toContain("pipx install yt-dlp");
    expect(result.stdout).toContain("yt-dlp --version");
    expect(result.systemCalls).toEqual([]);
  });

  test("runs the Homebrew install with --yes on macOS", async () => {
    const result = await runCliInProcess(["setup", "yt-dlp", "--yes"], { system: { platform: "darwin" } });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Running: brew install yt-dlp");
    expect(result.systemCalls).toEqual(["brew install yt-dlp"]);
  });

  test("does not assume Homebrew installer on non-macOS", async () => {
    const result = await runCliInProcess(["setup", "yt-dlp", "--yes"], { system: { platform: "linux" } });

    expect(result.exitCode).toBe(3);
    expect(result.stderr).toContain("[SETUP_COMMAND_FAILED]");
    expect(result.stderr).toContain("Automatic yt-dlp install is only supported on macOS with Homebrew");
    expect(result.stderr).toContain("pipx install yt-dlp");
    expect(result.systemCalls).toEqual([]);
  });

  test("a failing installer is SETUP_COMMAND_FAILED with exit 3", async () => {
    const result = await runCliInProcess(["setup", "yt-dlp", "--yes"], {
      system: { platform: "darwin", runInteractive: () => 1 },
    });

    expect(result.exitCode).toBe(3);
    expect(result.stderr).toContain("[SETUP_COMMAND_FAILED] Failed to run setup command: `brew install yt-dlp`.");
  });

  test("returns deterministic guidance for setup mcp placeholder", async () => {
    const result = await runCliInProcess(["setup", "mcp"]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("[NOT_IMPLEMENTED]");
    expect(result.stderr).toContain("setup mcp");
  });
});
