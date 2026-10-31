import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const SRC_DIR = path.resolve("src");
// Catches `stdin: "inherit"`, `stdio: "inherit"` and `stdio: ["inherit", ...]`.
const INHERITED_STDIN = /stdin:\s*"inherit"|stdio:\s*"inherit"|stdio:\s*\[\s*"inherit"/;
// `pi-tube setup` runs interactive installers (brew, npx skills) in the user's terminal; never reachable from MCP.
const INTERACTIVE_PASSTHROUGH = new Set(["src/infrastructure/interactive-command.ts"]);
const SPAWNS_PROCESS = /["'](node:)?child_process["']|Bun\.spawn(Sync)?\b/;
const SPAWNERS = new Set(["src/infrastructure/process/run-process.ts", "src/infrastructure/interactive-command.ts"]);

function listTypeScriptFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((entry) => entry.endsWith(".ts"))
    .map((entry) => path.join(dir, entry));
}

describe("child process hygiene", () => {
  // The MCP server talks JSON-RPC over stdin; a child that inherits it would steal protocol bytes.
  test("no child process inherits stdin", () => {
    const offenders = listTypeScriptFiles(SRC_DIR)
      .filter((file) => INHERITED_STDIN.test(readFileSync(file, "utf8")))
      .map((file) => path.relative(process.cwd(), file).split(path.sep).join("/"))
      .filter((file) => !INTERACTIVE_PASSTHROUGH.has(file));

    expect(offenders).toEqual([]);
  });

  // Every child process goes through the hardened runner (stdin ignored, allowlisted env, tree kill).
  test("only the process runner and the setup runner spawn processes", () => {
    const offenders = listTypeScriptFiles(SRC_DIR)
      .filter((file) => SPAWNS_PROCESS.test(readFileSync(file, "utf8")))
      .map((file) => path.relative(process.cwd(), file).split(path.sep).join("/"))
      .filter((file) => !SPAWNERS.has(file));

    expect(offenders).toEqual([]);
  });
});
