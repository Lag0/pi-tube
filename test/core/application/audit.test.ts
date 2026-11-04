import { describe, expect, test } from "vitest";
import { createAuditStats, createQueryAudit } from "../../../src/core/application/audit.ts";
import type { AuditRecord } from "../../../src/core/domain/audit.ts";
import { createInMemoryAuditLog } from "../../helpers/in-memory-audit-log.ts";

const record = (fields: Partial<AuditRecord> = {}): AuditRecord => ({
  operationId: "op",
  startedAt: "2026-10-31T12:00:00.000Z",
  operation: "transcribe",
  adapter: "cli",
  input: "https://www.youtube.com/watch?v=jNQXAC9IVRw",
  durationMs: 1000,
  result: "ok",
  versions: { piTube: "2.2.1", runtime: "bun 1.3.14" },
  ...fields,
});

const seeded = async (records: readonly AuditRecord[]) => {
  const log = createInMemoryAuditLog();
  for (const entry of records) await log.append(entry);
  return log;
};

const PAGE = { limit: 20, offset: 0 };

describe("queryAudit", () => {
  test.each(["since", "until"] as const)("a %s that is not a YYYY-MM-DD date is INPUT_INVALID", async (field) => {
    const query = createQueryAudit({ audit: createInMemoryAuditLog() });

    for (const value of ["2026-13-01", "31/10/2026", "2026-02-30"]) {
      const result = await query({ ...PAGE, [field]: value });
      expect(result.success ? undefined : result.error.code).toBe("INPUT_INVALID");
      expect(result.success ? undefined : result.error.message).toBe(`\`${field}\` must be a date as YYYY-MM-DD.`);
    }
  });

  test("since after until is INPUT_INVALID", async () => {
    const result = await createQueryAudit({ audit: createInMemoryAuditLog() })({
      ...PAGE,
      since: "2026-11-01",
      until: "2026-10-01",
    });

    expect(result.success ? undefined : result.error.code).toBe("INPUT_INVALID");
  });

  test("an unknown operation is INPUT_INVALID, with the operations in the hint", async () => {
    const result = await createQueryAudit({ audit: createInMemoryAuditLog() })({ ...PAGE, operation: "delete" });

    expect(result.success ? undefined : result.error.code).toBe("INPUT_INVALID");
    expect(result.success ? undefined : result.error.hint).toContain("transcribe, download, info, library_prune");
  });

  test("pages like the library, newest first, at most 500 per page", async () => {
    const log = await seeded(
      ["a", "b", "c"].map((id, index) =>
        record({ operationId: id, startedAt: new Date(Date.UTC(2026, 9, 31, 12, index)).toISOString() }),
      ),
    );
    const query = createQueryAudit({ audit: log });

    const page = await query({ limit: 2, offset: 1 });
    const tooMany = await query({ limit: 501, offset: 0 });

    expect(
      page.success ? { ...page.data, records: page.data.records.map((entry) => entry.operationId) } : page,
    ).toEqual({
      total: 3,
      offset: 1,
      limit: 2,
      records: ["b", "a"],
      skippedLines: 0,
    });
    expect(tooMany.success ? undefined : tooMany.error.code).toBe("INPUT_INVALID");
  });

  test("filters by operation, provider and errors only", async () => {
    const log = await seeded([
      record({ operationId: "a", provider: "groq" }),
      record({ operationId: "b", operation: "download" }),
      record({ operationId: "c", provider: "deepgram", result: "error", errorCode: "PROVIDER_FAILED" }),
    ]);
    const ids = async (input: Parameters<ReturnType<typeof createQueryAudit>>[0]) => {
      const result = await createQueryAudit({ audit: log })(input);
      return result.success ? result.data.records.map((entry) => entry.operationId) : result;
    };

    expect(await ids({ ...PAGE, operation: "download" })).toEqual(["b"]);
    expect(await ids({ ...PAGE, provider: "groq" })).toEqual(["a"]);
    expect(await ids({ ...PAGE, errorsOnly: true })).toEqual(["c"]);
  });
});

describe("auditStats", () => {
  test("sums the records inside the dates, by provider", async () => {
    const log = await seeded([
      record({
        provider: "groq",
        model: "whisper-large-v3",
        cacheHit: true,
        cost: { estimate: 0, currency: "USD", priceTable: "2026-10-31" },
      }),
      record({
        provider: "deepgram",
        model: "nova-3",
        audioSeconds: 19,
        cost: { estimate: 0.001, currency: "USD", priceTable: "2026-10-31" },
      }),
      record({ provider: "deepgram", model: "nova-3", result: "error", errorCode: "PROVIDER_FAILED" }),
      record({ operation: "download" }),
      record({ provider: "deepgram", startedAt: "2026-09-01T00:00:00.000Z" }),
    ]);

    const result = await createAuditStats({ audit: log })({ since: "2026-10-01", until: "2026-10-31" });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toMatchObject({ since: "2026-10-01", until: "2026-10-31", skippedLines: 0 });
    expect(result.data.stats.total).toMatchObject({ operations: 4, errors: 1 });
    expect(result.data.stats.byProvider).toMatchObject([
      { provider: "deepgram", operations: 2, errors: 1, errorRate: 0.5, costEstimate: 0.001, audioSeconds: 19 },
      { provider: "groq", cacheHits: 1, costEstimate: 0 },
    ]);
  });

  test("checks the dates like the list", async () => {
    const result = await createAuditStats({ audit: createInMemoryAuditLog() })({ until: "2026-1-1" });

    expect(result.success ? undefined : result.error.message).toBe("`until` must be a date as YYYY-MM-DD.");
  });
});
