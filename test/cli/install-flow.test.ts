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
    expect(readme).toContain("config set defaults.provider");
    expect(readme).toContain("Config Keys and Precedence");
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

  test("CI and release-gate docs stay aligned with executable commands", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };
    const ciWorkflow = readFileSync(".github/workflows/ci.yml", "utf8");
    const releaseChecklist = readFileSync("docs/release-checklist.md", "utf8");
    const readme = readFileSync("README.md", "utf8");

    expect(pkg.scripts?.["verify:fixtures"]).toBe("bun run --bun scripts/verify-fixtures.ts");
    expect(ciWorkflow).toContain("run: bun test");
    expect(ciWorkflow).toContain("run: bun run verify:fixtures");
    expect(releaseChecklist).toContain("bun test");
    expect(releaseChecklist).toContain("bun run verify:fixtures");
    expect(releaseChecklist).toContain("test/errors/error-taxonomy.test.ts");
    expect(releaseChecklist).toContain("test/cli/error-exit-codes.test.ts");
    expect(readme).toContain("docs/release-checklist.md");
  });
});
