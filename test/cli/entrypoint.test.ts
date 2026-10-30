import { existsSync, statSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { spawnCli } from "../helpers/spawn-cli.ts";

function runCli(args: string[]) {
  return spawnCli(args);
}

describe("CLI entrypoint", () => {
  test("bin/pi-tube.ts exists and is runnable", () => {
    expect(existsSync("bin/pi-tube.ts")).toBe(true);

    // Windows has no POSIX execute bits; the spawn below still proves the entrypoint runs there.
    if (process.platform !== "win32") {
      const mode = statSync("bin/pi-tube.ts").mode;
      expect((mode & 0o111) > 0).toBe(true);
    }

    const result = runCli(["--help"]);
    expect(result.exitCode).toBe(0);

    const helpCommand = runCli(["help"]);
    expect(helpCommand.exitCode).toBe(0);
    expect(helpCommand.stdout.toString()).toContain("pi-tube CLI");
  });
});
