import { describe, expect, test } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { ERROR_CATALOG } from "../../src/errors/catalog.ts";
import {
  CliError,
  createInstagramAuthRequiredError,
  createTranscriptionProviderAuthError,
  createUnsupportedUrlNotDirectMediaError,
  formatCliError,
} from "../../src/errors/cli-errors.ts";

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

function extractDeclaredCodesFromSource(files: string[]): string[] {
  const matches = new Set<string>();
  const pattern = /code:\s*"([A-Z0-9_]+)"/g;

  for (const file of files) {
    const content = readFileSync(file, "utf8");
    for (const match of content.matchAll(pattern)) {
      matches.add(match[1] ?? "");
    }
  }

  return Array.from(matches).sort();
}

describe("error taxonomy", () => {
  test("catalog includes every explicit CLI code literal in source", () => {
    const sourceCodes = extractDeclaredCodesFromSource(listTypeScriptFiles("src"));
    const catalogCodes = Object.keys(ERROR_CATALOG);
    const missing = sourceCodes.filter((code) => !catalogCodes.includes(code));

    expect(missing).toEqual([]);
  });

  test("catalog entries define deterministic non-zero exits and guidance", () => {
    for (const [code, entry] of Object.entries(ERROR_CATALOG)) {
      expect(code).toMatch(/^[A-Z0-9_]+$/);
      expect(entry.exitCode).toBeGreaterThan(0);
      expect(Array.isArray(entry.guidance)).toBe(true);
      for (const guidanceLine of entry.guidance) {
        expect(guidanceLine.length).toBeGreaterThan(0);
      }
    }
  });

  test("constructors emit catalog-backed codes with deterministic formatting", () => {
    const knownErrors = [
      createUnsupportedUrlNotDirectMediaError("https://example.com/page"),
      createInstagramAuthRequiredError("https://instagram.com/reel/private"),
      createTranscriptionProviderAuthError("deepgram", "bad token"),
      new CliError("manual contract violation", { code: "CLI_CONTRACT_VIOLATION" }),
    ];

    for (const error of knownErrors) {
      const formatted = formatCliError(error);
      expect(formatted.exitCode).toBeGreaterThan(0);
      expect(formatted.message).toContain(`[${error.code}]`);
      expect(formatted.message.startsWith(`[${error.code}]`)).toBe(true);
    }
  });
});
