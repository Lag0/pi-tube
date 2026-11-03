import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const MCP_DIR = path.resolve("src", "adapters", "mcp");

const filesUnder = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? filesUnder(path.join(dir, entry.name)) : [path.join(dir, entry.name)],
  );

describe("MCP adapter and stdout", () => {
  test("no file under src/adapters/mcp writes to the console or process.stdout", () => {
    const files = filesUnder(MCP_DIR);
    const offenders = files.filter((file) => /\bconsole\.|process\.stdout/.test(readFileSync(file, "utf8")));

    expect(files.length).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });
});
