import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type AuditRecord, auditRecordToLine, parseAuditLine } from "../../../src/core/domain/audit.ts";
import { DEFAULT_CONFIG } from "../../../src/core/domain/config.ts";
import { createFileAuditLog } from "../../../src/infrastructure/audit/file-audit-log.ts";
import { createInMemoryConfigStore } from "../../helpers/in-memory-config-store.ts";

const isWindows = process.platform === "win32";

let root: string;
let auditDir: string;

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), "pi-tube-audit-"));
  auditDir = path.join(root, "audit");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const record = (fields: Partial<AuditRecord> = {}): AuditRecord => ({
  operationId: "op-1",
  startedAt: "2026-10-31T12:00:00.000Z",
  operation: "transcribe",
  adapter: "cli",
  input: "https://www.youtube.com/watch?v=jNQXAC9IVRw",
  durationMs: 1200,
  result: "ok",
  versions: { piTube: "2.2.1", runtime: "bun 1.3.14" },
  ...fields,
});

const auditLog = (config = DEFAULT_CONFIG) =>
  createFileAuditLog({ auditDir, configStore: createInMemoryConfigStore(config) });

const seed = (name: string, lines: readonly string[]): void => {
  mkdirSync(auditDir, { recursive: true });
  writeFileSync(path.join(auditDir, name), lines.map((line) => `${line}\n`).join(""));
};

const monthFiles = (): string[] => readdirSync(auditDir).sort();

describe("file audit log", () => {
  test("appends one JSON line per record to <YYYY-MM>.jsonl (UTC month of started_at)", async () => {
    const log = auditLog();
    const late = record({ startedAt: "2026-10-31T23:30:00.000-03:00" });

    expect(await log.append(late)).toEqual({ success: true, data: undefined });
    expect(await log.append(record({ operationId: "op-2", startedAt: "2026-11-02T10:00:00.000Z" }))).toEqual({
      success: true,
      data: undefined,
    });

    const lines = readFileSync(path.join(auditDir, "2026-11.jsonl"), "utf8").split("\n");
    expect(lines).toEqual([
      auditRecordToLine(late),
      auditRecordToLine(record({ operationId: "op-2", startedAt: "2026-11-02T10:00:00.000Z" })),
      "",
    ]);
  });

  test.skipIf(isWindows)("the audit file is 0600 inside a 0700 directory", async () => {
    await auditLog().append(record());

    expect(statSync(path.join(auditDir, "2026-10.jsonl")).mode & 0o777).toBe(0o600);
    expect(statSync(auditDir).mode & 0o777).toBe(0o700);
  });

  test("50 concurrent appends leave 50 parseable lines", async () => {
    const log = auditLog();

    await Promise.all(Array.from({ length: 50 }, (_, index) => log.append(record({ operationId: `op-${index}` }))));

    const lines = readFileSync(path.join(auditDir, "2026-10.jsonl"), "utf8").split("\n").filter(Boolean);
    expect(lines).toHaveLength(50);
    expect(lines.every((line) => parseAuditLine(line) !== undefined)).toBe(true);
    expect(new Set(lines.map((line) => parseAuditLine(line)?.operationId)).size).toBe(50);
  });

  test("read returns newest first and filters by since, until, operation, provider and errors only", async () => {
    const log = auditLog();
    const oldest = record({ operationId: "a", startedAt: "2026-09-30T08:00:00.000Z", provider: "groq" });
    const middle = record({ operationId: "b", startedAt: "2026-10-01T08:00:00.000Z", provider: "deepgram" });
    const failed = record({
      operationId: "c",
      startedAt: "2026-10-15T08:00:00.000Z",
      provider: "deepgram",
      result: "error",
      errorCode: "PROVIDER_FAILED",
    });
    const download = record({ operationId: "d", startedAt: "2026-11-01T08:00:00.000Z", operation: "download" });
    for (const entry of [middle, oldest, download, failed]) await log.append(entry);
    seed("2026-01.jsonl", ["garbage"]);

    const ids = async (query: Parameters<typeof log.read>[0]) => {
      const read = await log.read(query);
      return read.success
        ? { ids: read.data.records.map((entry) => entry.operationId), skipped: read.data.skippedLines }
        : read;
    };

    expect(await ids({ since: "2026-09-01" })).toEqual({ ids: ["d", "c", "b", "a"], skipped: 0 });
    expect(await ids({ since: "2026-10-01" })).toEqual({ ids: ["d", "c", "b"], skipped: 0 });
    expect(await ids({ since: "2026-10-01", until: "2026-10-31" })).toEqual({ ids: ["c", "b"], skipped: 0 });
    expect(await ids({ since: "2026-09-01", operation: "download" })).toEqual({ ids: ["d"], skipped: 0 });
    expect(await ids({ since: "2026-09-01", provider: "deepgram" })).toEqual({ ids: ["c", "b"], skipped: 0 });
    expect(await ids({ since: "2026-09-01", errorsOnly: true })).toEqual({ ids: ["c"], skipped: 0 });
  });

  test("a corrupt line is skipped and counted, the rest is read", async () => {
    seed("2026-10.jsonl", [
      auditRecordToLine(record({ operationId: "a" })),
      "{not json",
      auditRecordToLine(record({ operationId: "b" })),
    ]);

    const read = await auditLog().read({});

    expect(read.success ? read.data.skippedLines : read).toBe(1);
    expect(read.success ? read.data.records.map((entry) => entry.operationId).sort() : read).toEqual(["a", "b"]);
  });

  test("the first record of a month deletes months past the retention, never the current one", async () => {
    for (const name of ["2025-09.jsonl", "2025-10.jsonl", "2025-11.jsonl", "notes.txt"]) seed(name, ["x"]);

    await auditLog().append(record({ startedAt: "2026-10-05T00:00:00.000Z" }));
    expect(monthFiles()).toEqual(["2025-11.jsonl", "2026-10.jsonl", "notes.txt"]);

    seed("2025-10.jsonl", ["x"]);
    await auditLog().append(record({ startedAt: "2026-10-06T00:00:00.000Z" }));
    expect(monthFiles()).toEqual(["2025-10.jsonl", "2025-11.jsonl", "2026-10.jsonl", "notes.txt"]);

    await auditLog({ ...DEFAULT_CONFIG, audit: { retention_months: 1 } }).append(
      record({ startedAt: "2026-11-01T00:00:00.000Z" }),
    );
    expect(monthFiles()).toEqual(["2026-11.jsonl", "notes.txt"]);
  });

  test("read on a missing audit dir is an empty readout", async () => {
    expect(await auditLog().read({})).toEqual({ success: true, data: { records: [], skippedLines: 0 } });
  });

  test("an audit dir that cannot be created is STORAGE_IO_FAILED", async () => {
    writeFileSync(auditDir, "a file, not a directory");

    const appended = await auditLog().append(record());

    expect(appended.success ? undefined : appended.error.code).toBe("STORAGE_IO_FAILED");
  });
});
