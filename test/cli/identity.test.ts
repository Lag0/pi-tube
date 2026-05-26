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

  test("keeps version flag compatible with color flag", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
    const result = runCli(["--version", "--no-color"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString().trim()).toBe(`pi-tube ${pkg.version}`);
    expect(result.stderr.toString().trim()).toBe("");
  });

  test("returns migration guidance for implicit transcription", () => {
    const result = runCli(["youtube", "https://youtube.com/watch?v=abc"]);
    const stderr = result.stderr.toString();

    expect(result.exitCode).toBe(2);
    expect(stderr).toContain("[CLI_CONTRACT_VIOLATION]");
    expect(stderr).toContain("Implicit transcription is no longer supported");
    expect(stderr).toContain("pi-tube transcribe <input>");
  });
});
