import { describe, expect, test } from "bun:test";
import { existsSync, statSync } from "node:fs";

function runCli(args: string[]) {
  return Bun.spawnSync({
    cmd: ["bun", "run", "--bun", "bin/pi-tube.ts", ...args],
    stdout: "pipe",
    stderr: "pipe",
  });
}

describe("CLI entrypoint", () => {
  test("bin/pi-tube.ts exists and is runnable", () => {
    expect(existsSync("bin/pi-tube.ts")).toBe(true);

    const mode = statSync("bin/pi-tube.ts").mode;
    expect((mode & 0o111) > 0).toBe(true);

    const result = runCli(["--help"]);
    expect(result.exitCode).toBe(0);

    const helpCommand = runCli(["help"]);
    expect(helpCommand.exitCode).toBe(0);
    expect(helpCommand.stdout.toString()).toContain("pi-tube CLI");
  });
});
