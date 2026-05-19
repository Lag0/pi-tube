import { describe, expect, test } from "vitest";
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
    expect(readme).toContain("npm install -g @syxs/pi-tube");
    expect(readme).toContain("pi-tube setup skills");
    expect(readme).toContain("pi-tube setup skills --global --yes");
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
    expect(output).toContain("pi-tube help [command]");
    expect(output).toContain("pi-tube config provider set groq");
    expect(output).toContain("pi-tube setup <install|skills|mcp> [--global] [--agent <name>] [--yes|--no-prompt]");
  });

  test("CI and release-gate docs stay aligned with executable commands", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };
    const ciWorkflow = readFileSync(".github/workflows/ci.yml", "utf8");
    const publishWorkflow = readFileSync(".github/workflows/publish.yml", "utf8");
    const releaseChecklist = readFileSync("docs/release-checklist.md", "utf8");
    const readme = readFileSync("README.md", "utf8");

    expect(pkg.scripts?.["verify:fixtures"]).toBe("bun run --bun scripts/verify-fixtures.ts");
    expect(pkg.scripts?.["publish-beta"]).toContain("npm publish");
    expect(pkg.scripts?.["publish-prod"]).toContain("npm publish");
    expect(ciWorkflow).toContain("run: bun test");
    expect(ciWorkflow).toContain("run: bun run verify:fixtures");
    expect(publishWorkflow).toContain("name: Publish to npm");
    expect(publishWorkflow).toContain("npm publish --provenance --access public");
    expect(releaseChecklist).toContain("bun test");
    expect(releaseChecklist).toContain("bun run verify:fixtures");
    expect(releaseChecklist).toContain("test/errors/error-taxonomy.test.ts");
    expect(releaseChecklist).toContain("test/cli/error-exit-codes.test.ts");
    expect(readme).toContain("docs/release-checklist.md");
  });
});
