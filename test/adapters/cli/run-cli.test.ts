import { readFileSync } from "node:fs";
import { describe, expect, test, vi } from "vitest";
import { runCliInProcess } from "../../helpers/cli-harness.ts";

// Vitest intercepts `console`, so a stray console call never reaches `process.stdout.write`: spy on both.
const spyOnProcessOutput = () => [
  vi.spyOn(process.stdout, "write"),
  vi.spyOn(process.stderr, "write"),
  vi.spyOn(console, "log"),
  vi.spyOn(console, "error"),
];

const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };

describe("runCli in process", () => {
  test("prints the version to the injected stdout only", async () => {
    const processOutput = spyOnProcessOutput();

    const result = await runCliInProcess(["--version"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(`pi-tube ${pkg.version}\n`);
    expect(result.stderr).toBe("");
    for (const spy of processOutput) expect(spy).not.toHaveBeenCalled();
  });

  test("prints a usage error as the code line and the hint line on the injected stderr only", async () => {
    const processOutput = spyOnProcessOutput();

    const result = await runCliInProcess(["sample-input"]);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr.trimEnd().split("\n")).toEqual([
      "[INPUT_INVALID] Implicit transcription is no longer supported.",
      "hint: Use one of: `pi-tube transcribe <input>`, `pi-tube download <url>`, `pi-tube auth status`, `pi-tube defaults show`, `pi-tube setup yt-dlp`.",
    ]);
    for (const spy of processOutput) expect(spy).not.toHaveBeenCalled();
  });
});
