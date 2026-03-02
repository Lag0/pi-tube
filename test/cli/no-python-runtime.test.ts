import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

function runCli(args: string[]) {
  return Bun.spawnSync({
    cmd: ["bun", "run", "--bun", "bin/pi-tube.ts", ...args],
    stdout: "pipe",
    stderr: "pipe",
  });
}

describe("No-Python runtime regression guard", () => {
  test("default Bun execution path does not fall back to Python runtime hints", () => {
    const baseline = runCli(["sample-input"]);
    const legacy = runCli(["deepgram", "sample.mp3"]);

    expect(baseline.exitCode).toBe(2);
    expect(legacy.exitCode).toBe(2);

    const combined = [
      baseline.stdout.toString(),
      baseline.stderr.toString(),
      legacy.stdout.toString(),
      legacy.stderr.toString(),
    ].join("\n");

    expect(combined).not.toMatch(/\bpython\b/i);
    expect(combined).not.toMatch(/\bpip\b/i);
    expect(combined).not.toMatch(/\btyper\b/i);
    expect(combined).toContain("pi-tube <input>");
  });

  test("runtime bootstrap modules do not shell toward Python tooling", () => {
    const files = [
      "src/index.ts",
      "src/cli/build-cli.ts",
      "src/cli/handlers.ts",
      "src/legacy/compatibility.ts",
    ];

    const content = files.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(content).not.toMatch(/python|pipx|typer/i);
  });
});
