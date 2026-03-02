import { describe, expect, test } from "bun:test";

function runCli(args: string[]) {
  return Bun.spawnSync({
    cmd: ["bun", "run", "--bun", "bin/pi-tube.ts", ...args],
    stdout: "pipe",
    stderr: "pipe",
  });
}

describe("CLI help baseline", () => {
  test("prints help from Bun entrypoint", () => {
    const result = runCli(["--help"]);
    const stdout = result.stdout.toString();

    expect(result.exitCode).toBe(0);
    expect(stdout).toContain("Usage");
    expect(stdout).toContain("Global options");

    // TODO(phase-01-02): Assert strict section ordering and coming-soon labeling.
  });
});
