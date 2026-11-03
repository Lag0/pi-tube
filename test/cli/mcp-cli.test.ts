import { describe, expect, test } from "vitest";
import { runCliInProcess } from "../helpers/cli-harness.ts";

describe("pi-tube mcp in the CLI", () => {
  test.each([
    ["mcp", "extra"],
    ["mcp", "--json"],
  ])("%s %s exits 2: the command takes no arguments", async (...argv) => {
    const result = await runCliInProcess(argv);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("[INPUT_INVALID] `pi-tube mcp` takes no arguments.");
    expect(result.stderr).toContain("hint: Run `pi-tube mcp` alone; your agent app starts it.");
    expect(result.stdout).toBe("");
  });

  test("mcp --help shows the notes on stdio and logs", async () => {
    const result = await runCliInProcess(["mcp", "--help", "--no-color"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("pi-tube mcp");
    expect(result.stdout).toContain("PI_TUBE_LOG_LEVEL (error, warn, info, debug; default warn)");
    expect(result.stdout).toContain("stdout carries only MCP messages");
  });
});
