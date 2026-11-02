import { describe, expect, test } from "vitest";
import {
  type AuditRecord,
  auditRecordToLine,
  estimateCost,
  matchesAuditQuery,
  parseAuditLine,
  redactAuditInput,
  resolveAuditSettings,
  summarizeAudit,
} from "../../../src/core/domain/audit.ts";
import { DEFAULT_CONFIG } from "../../../src/core/domain/config.ts";

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

const fullRecord = record({
  sourceKey: "youtube:jNQXAC9IVRw",
  provider: "deepgram",
  model: "nova-3",
  audioSeconds: 19,
  cost: { estimate: 0.001362, currency: "USD", priceTable: "2026-10-31" },
  cacheHit: false,
  result: "error",
  errorCode: "STORAGE_IO_FAILED",
  versions: { piTube: "2.2.1", runtime: "node 24.1.0", ytDlp: "2026.10.01", ffmpeg: "7.1" },
});

describe("estimateCost", () => {
  test("Deepgram nova-3 bills by the second at $0.0043/min", () => {
    expect(estimateCost("deepgram", "nova-3", 19)).toEqual({
      estimate: 0.001362,
      currency: "USD",
      priceTable: "2026-10-31",
    });
  });

  test("Groq whisper-large-v3 bills at $0.111/h", () => {
    expect(estimateCost("groq", "whisper-large-v3", 19)?.estimate).toBe(0.000586);
  });

  test("Groq bills at least 10 seconds", () => {
    expect(estimateCost("groq", "whisper-large-v3", 5)?.estimate).toBe(0.000308);
  });

  test("ElevenLabs scribe_v2 bills at $0.22/h", () => {
    expect(estimateCost("elevenlabs", "scribe_v2", 19)?.estimate).toBe(0.001161);
  });

  test("a model outside the price table has no estimate", () => {
    expect(estimateCost("deepgram", "nova-2", 19)).toBeUndefined();
  });
});

describe("redactAuditInput", () => {
  test("a URL loses its credentials, signature parameters and fragment", () => {
    expect(redactAuditInput("https://user:pw@cdn.example.com/a.mp3?X-Amz-Signature=abc&episode=12#t=3")).toBe(
      "https://cdn.example.com/a.mp3?episode=12",
    );
  });

  test("a POSIX path keeps only the file name", () => {
    expect(redactAuditInput("/Users/bruno/Movies/Aula 1.mp4")).toBe("Aula 1.mp4");
  });

  test("a Windows path keeps only the file name", () => {
    expect(redactAuditInput("C:\\Users\\bruno\\a.wav")).toBe("a.wav");
  });

  test("a YouTube URL keeps the video id", () => {
    expect(redactAuditInput("https://www.youtube.com/watch?v=jNQXAC9IVRw&si=x")).toContain("v=jNQXAC9IVRw");
  });
});

describe("audit lines", () => {
  test.each([
    ["a full record", fullRecord],
    ["a minimal record", record()],
  ])("%s survives the round trip", (_name, value) => {
    expect(parseAuditLine(auditRecordToLine(value))).toStrictEqual(value);
  });

  test("a line is one JSON object in snake_case, led by schema_version 1, absent fields null", () => {
    const line = auditRecordToLine(record());
    expect(line).not.toContain("\n");
    const parsed = JSON.parse(line) as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual([
      "schema_version",
      "operation_id",
      "started_at",
      "operation",
      "adapter",
      "input",
      "source_key",
      "provider",
      "model",
      "duration_ms",
      "audio_seconds",
      "cost",
      "cache_hit",
      "result",
      "error_code",
      "versions",
    ]);
    expect(parsed.schema_version).toBe(1);
    expect(parsed.source_key).toBeNull();
    expect(parsed.cost).toBeNull();
    expect(parsed.versions).toEqual({ pi_tube: "2.2.1", runtime: "bun 1.3.14", yt_dlp: null, ffmpeg: null });
  });

  test("cost is written as estimate, currency and price_table", () => {
    const parsed = JSON.parse(auditRecordToLine(fullRecord)) as Record<string, unknown>;
    expect(parsed.cost).toEqual({ estimate: 0.001362, currency: "USD", price_table: "2026-10-31" });
  });

  test.each([
    ["broken JSON", "{"],
    ["another schema version", auditRecordToLine(record()).replace('"schema_version":1', '"schema_version":2')],
    ["an unknown operation", auditRecordToLine(record()).replace('"operation":"transcribe"', '"operation":"rm"')],
  ])("%s is not a record", (_name, line) => {
    expect(parseAuditLine(line)).toBeUndefined();
  });
});

describe("matchesAuditQuery", () => {
  const lastSecond = record({ startedAt: "2026-10-31T23:59:59.000Z" });

  test("until is inclusive and since excludes the day before it, both in UTC", () => {
    expect(matchesAuditQuery(lastSecond, { until: "2026-10-31" })).toBe(true);
    expect(matchesAuditQuery(lastSecond, { since: "2026-11-01" })).toBe(false);
    expect(matchesAuditQuery(lastSecond, { since: "2026-10-31", until: "2026-10-31" })).toBe(true);
  });

  test("errorsOnly keeps only errors", () => {
    expect(matchesAuditQuery(record(), { errorsOnly: true })).toBe(false);
    expect(matchesAuditQuery(record({ result: "error" }), { errorsOnly: true })).toBe(true);
  });

  test("operation and provider filter by name", () => {
    expect(matchesAuditQuery(record(), { operation: "download" })).toBe(false);
    expect(matchesAuditQuery(record(), { operation: "transcribe" })).toBe(true);
    expect(matchesAuditQuery(record({ provider: "groq" }), { provider: "deepgram" })).toBe(false);
    expect(matchesAuditQuery(record({ provider: "groq" }), { provider: "groq" })).toBe(true);
  });
});

describe("summarizeAudit", () => {
  const stats = summarizeAudit([
    record({
      provider: "groq",
      model: "whisper-large-v3",
      cacheHit: true,
      cost: { estimate: 0, currency: "USD", priceTable: "2026-10-31" },
      durationMs: 100,
    }),
    record({
      provider: "deepgram",
      model: "nova-3",
      audioSeconds: 19,
      cost: { estimate: 0.001, currency: "USD", priceTable: "2026-10-31" },
      durationMs: 3000,
    }),
    record({ provider: "deepgram", model: "nova-3", result: "error", errorCode: "PROVIDER_FAILED", durationMs: 1000 }),
    record({ operation: "download", durationMs: 500 }),
  ]);

  test("the total counts every operation", () => {
    expect(stats.total.operations).toBe(4);
    expect(stats.total.errors).toBe(1);
    expect(stats.total.provider).toBeUndefined();
  });

  test("each provider gets its own group, sorted by provider", () => {
    expect(stats.byProvider.map((group) => group.provider)).toEqual(["deepgram", "groq"]);
    expect(stats.byProvider[0]).toMatchObject({
      provider: "deepgram",
      operations: 2,
      errors: 1,
      errorRate: 0.5,
      costEstimate: 0.001,
      audioSeconds: 19,
      averageDurationMs: 2000,
    });
    expect(stats.byProvider[1]).toMatchObject({ provider: "groq", cacheHits: 1, costEstimate: 0 });
  });

  test("an operation without a provider counts only in the total", () => {
    const counted = stats.byProvider.reduce((sum, group) => sum + group.operations, 0);
    expect(counted).toBe(3);
  });

  test("no records give an empty total", () => {
    expect(summarizeAudit([]).total).toMatchObject({ operations: 0, errors: 0, errorRate: 0, averageDurationMs: 0 });
  });
});

describe("resolveAuditSettings", () => {
  test("retention defaults to 12 months", () => {
    expect(resolveAuditSettings(DEFAULT_CONFIG)).toEqual({ retentionMonths: 12 });
  });

  test("audit.retention_months sets the retention", () => {
    expect(resolveAuditSettings({ ...DEFAULT_CONFIG, audit: { retention_months: 3 } })).toEqual({
      retentionMonths: 3,
    });
  });
});
