import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { AuditRecord } from "../../src/core/domain/audit.ts";
import { createFileAuditLog } from "../../src/infrastructure/audit/file-audit-log.ts";
import { runCliInProcess } from "../helpers/cli-harness.ts";
import { createInMemoryConfigStore } from "../helpers/in-memory-config-store.ts";

let home: string;

beforeEach(() => {
  home = mkdtempSync(path.join(os.tmpdir(), "pi-tube-audit-cli-"));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

const VERSIONS = { piTube: "2.2.1", runtime: "bun 1.3.14" };

const RECORDS: readonly AuditRecord[] = [
  {
    operationId: "a",
    startedAt: "2026-10-30T10:00:00.000Z",
    operation: "transcribe",
    adapter: "cli",
    input: "https://www.youtube.com/watch?v=jNQXAC9IVRw",
    sourceKey: "youtube:jNQXAC9IVRw",
    provider: "deepgram",
    model: "nova-3",
    durationMs: 3000,
    audioSeconds: 19,
    cost: { estimate: 0.001362, currency: "USD", priceTable: "2026-10-31" },
    cacheHit: false,
    result: "ok",
    versions: VERSIONS,
  },
  {
    operationId: "b",
    startedAt: "2026-10-31T10:00:00.000Z",
    operation: "transcribe",
    adapter: "cli",
    input: "a\u001b[31m.mp3",
    provider: "groq",
    model: "whisper-large-v3",
    durationMs: 1000,
    result: "error",
    errorCode: "PROVIDER_RATE_LIMIT",
    versions: VERSIONS,
  },
  {
    operationId: "c",
    startedAt: "2026-10-31T11:00:00.000Z",
    operation: "download",
    adapter: "cli",
    input: "https://vimeo.com/1",
    durationMs: 500,
    result: "ok",
    versions: VERSIONS,
  },
];

const seed = async () => {
  const log = createFileAuditLog({
    auditDir: path.join(home, ".pi-tube", "audit"),
    configStore: createInMemoryConfigStore(),
  });
  for (const record of RECORDS) await log.append(record);
};

const audit = (args: string[]) => runCliInProcess(["audit", ...args], { env: { HOME: home } });

describe("audit", () => {
  test("prints the header and one line per record, newest first", async () => {
    await seed();

    const result = await audit([]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trimEnd().split("\n")).toEqual([
      "[AUDIT] total=3 offset=0 limit=20",
      "2026-10-31T11:00:00.000Z download ok provider=- cost_usd=- cache_hit=- https://vimeo.com/1",
      "2026-10-31T10:00:00.000Z transcribe error PROVIDER_RATE_LIMIT provider=groq cost_usd=- cache_hit=- a [31m.mp3",
      "2026-10-30T10:00:00.000Z transcribe ok provider=deepgram cost_usd=0.001362 cache_hit=false https://www.youtube.com/watch?v=jNQXAC9IVRw",
    ]);
  });

  test("list --errors --json returns only errors, with snake_case keys", async () => {
    await seed();

    const result = await audit(["list", "--errors", "--json"]);
    const parsed = JSON.parse(result.stdout);

    expect(parsed).toMatchObject({ total: 1, offset: 0, limit: 20, next_offset: null, skipped_lines: 0 });
    expect(parsed.records).toHaveLength(1);
    expect(parsed.records[0]).toMatchObject({
      operation_id: "b",
      started_at: "2026-10-31T10:00:00.000Z",
      error_code: "PROVIDER_RATE_LIMIT",
      cost: null,
      versions: { pi_tube: "2.2.1", runtime: "bun 1.3.14", yt_dlp: null, ffmpeg: null },
    });
  });

  test("--since and --until select the days", async () => {
    await seed();

    const result = JSON.parse((await audit(["--since", "2026-10-31", "--json"])).stdout);

    expect(result.records.map((record: { operation_id: string }) => record.operation_id)).toEqual(["c", "b"]);
  });

  test("stats prints the totals line and one line per provider", async () => {
    await seed();

    const result = await audit(["stats"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trimEnd().split("\n")).toEqual([
      "[AUDIT_STATS] since=all until=all operations=3 errors=1 error_rate=0.333 cost_usd=0.001362 (estimate, price table 2026-10-31)",
      "provider=deepgram operations=1 errors=0 error_rate=0.000 cache_hits=0 cost_usd=0.001362 audio_seconds=19 avg_duration_ms=3000",
      "provider=groq operations=1 errors=1 error_rate=1.000 cache_hits=0 cost_usd=0.000000 audio_seconds=0 avg_duration_ms=1000",
    ]);
  });

  test("stats --json has the totals and by_provider in snake_case", async () => {
    await seed();

    const result = JSON.parse((await audit(["stats", "--since", "2026-10-01", "--json"])).stdout);

    expect(result).toMatchObject({
      since: "2026-10-01",
      until: null,
      skipped_lines: 0,
      currency: "USD",
      price_table: "2026-10-31",
      total: { operations: 3, errors: 1, cost_estimate: 0.001362 },
    });
    expect(result.by_provider).toEqual([
      {
        provider: "deepgram",
        operations: 1,
        errors: 0,
        error_rate: 0,
        cache_hits: 0,
        cost_estimate: 0.001362,
        audio_seconds: 19,
        average_duration_ms: 3000,
      },
      {
        provider: "groq",
        operations: 1,
        errors: 1,
        error_rate: 1,
        cache_hits: 0,
        cost_estimate: 0,
        audio_seconds: 0,
        average_duration_ms: 1000,
      },
    ]);
  });

  test("an empty audit log lists nothing", async () => {
    const result = await audit([]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("[AUDIT] total=0 offset=0 limit=20");
  });

  test("--since 31/10/2026 exits 2", async () => {
    const result = await audit(["--since", "31/10/2026"]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("`since` must be a date as YYYY-MM-DD.");
  });

  test.each([
    [["foo"], "Unknown audit action `foo`."],
    [["stats", "--errors"], "`audit stats` accepts only --since, --until and --json."],
    [["list", "extra"], "`audit list` takes no arguments."],
  ])("audit %j exits 2 with the audit usage hint", async (args, message) => {
    const result = await audit(args);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain(message);
    expect(result.stderr).toContain("pi-tube audit stats");
  });

  test("help audit documents every flag", async () => {
    const result = await runCliInProcess(["help", "audit", "--no-color"]);

    expect(result.exitCode).toBe(0);
    for (const flag of [
      "--since",
      "--until",
      "--operation",
      "--provider",
      "--errors",
      "--limit",
      "--offset",
      "--json",
    ]) {
      expect(result.stdout).toContain(flag);
    }
    expect(result.stdout).toContain("audit stats");
  });
});
