import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";

function runCli(args: string[]) {
  return Bun.spawnSync({
    cmd: ["bun", "run", "--bun", "bin/pi-tube.ts", ...args],
    stdout: "pipe",
    stderr: "pipe",
  });
}

describe("CLI identity and placeholders", () => {
  test("keeps command identity as pi-tube", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { name: string; version: string };
    const result = runCli(["--version"]);

    expect(pkg.name).toBe("@syxs/pi-tube");
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString().trim()).toBe(`pi-tube ${pkg.version}`);
  });

  test("keeps version flag compatible with other global flags", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
    const result = runCli(["--version", "--json"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString().trim()).toBe(`pi-tube ${pkg.version}`);
    expect(result.stderr.toString().trim()).toBe("");
  });

  test("returns deterministic non-zero guidance for deferred command paths", () => {
    const result = runCli(["youtube", "https://youtube.com/watch?v=abc"]);
    const stderr = result.stderr.toString();

    expect(result.exitCode).toBe(2);
    expect(stderr).toContain("[CLI_NOT_IMPLEMENTED]");
    expect(stderr).toContain("Current implemented contract: `pi-tube <input>`.");
    expect(stderr).toContain("pi-tube --help");
  });
});
