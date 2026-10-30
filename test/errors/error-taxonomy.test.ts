import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { ERROR_CATALOG } from "../../src/core/domain/errors.ts";

function listTypeScriptFiles(directory: string): string[] {
  const entries = readdirSync(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listTypeScriptFiles(entryPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(entryPath);
    }
  }

  return files;
}

function extractUsedCodes(files: string[]): string[] {
  const matches = new Set<string>();
  const patterns = [/code:\s*"([A-Z0-9_]+)"/g, /createError\(\s*"([A-Z0-9_]+)"/g];

  for (const file of files) {
    const content = readFileSync(file, "utf8");
    for (const pattern of patterns) {
      for (const match of content.matchAll(pattern)) {
        matches.add(match[1] ?? "");
      }
    }
  }

  return Array.from(matches).sort();
}

describe("error taxonomy", () => {
  // Catalog keys are not `code: "X"` literals, so scanning errors.ts cannot self-satisfy; it holds the only UNEXPECTED raiser.
  const usedCodes = extractUsedCodes(listTypeScriptFiles("src"));
  const catalogCodes = Object.keys(ERROR_CATALOG);

  test("every code literal in source is in the catalog", () => {
    expect(usedCodes.filter((code) => !catalogCodes.includes(code))).toEqual([]);
  });

  test("every catalog code is raised somewhere in source", () => {
    expect(catalogCodes.filter((code) => !usedCodes.includes(code))).toEqual([]);
  });

  test("every catalog entry has a non-empty hint", () => {
    for (const entry of Object.values(ERROR_CATALOG)) {
      expect(entry.hint.trim().length).toBeGreaterThan(0);
    }
  });
});
