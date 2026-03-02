import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

function runCli(args: string[]) {
  return Bun.spawnSync({
    cmd: ["bun", "run", "--bun", "bin/pi-tube.ts", ...args],
    stdout: "pipe",
    stderr: "pipe",
  });
}

describe("Install and run contract", () => {
  test("README documents canonical invocation path", () => {
    const readme = readFileSync("README.md", "utf8");

    expect(readme).toContain("pi-tube --help");
    expect(readme).toContain("Bun");
    expect(readme).toContain("pi-tube --json");
    expect(readme).toContain("provider-status");
  });

  test("canonical help command returns required sections", () => {
    const result = runCli(["--help"]);
    const output = result.stdout.toString();

    expect(result.exitCode).toBe(0);
    expect(output).toContain("Usage");
    expect(output).toContain("Commands");
    expect(output).toContain("Global options");
    expect(output).toContain("Examples");
    expect(output).toContain("Notes");
  });
});
