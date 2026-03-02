import { describe, expect, test } from "bun:test";

function runCli(args: string[]) {
  return Bun.spawnSync({
    cmd: ["bun", "run", "--bun", "bin/pi-tube.ts", ...args],
    stdout: "pipe",
    stderr: "pipe",
  });
}

describe("CLI help contract", () => {
  test("uses the locked section order and labels deferred capabilities", () => {
    const result = runCli(["--help"]);
    const stdout = result.stdout.toString();

    expect(result.exitCode).toBe(0);

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

    expect(stdout).toContain("coming soon (Phase 2)");
    expect(stdout).toContain("coming soon (Phase 3)");
    expect(stdout).toContain("coming soon (Phase 4)");

    const exampleLines = stdout
      .split("\n")
      .filter((line) => line.trim().startsWith("pi-tube "));
    expect(exampleLines.length).toBeGreaterThanOrEqual(4);
  });
});
