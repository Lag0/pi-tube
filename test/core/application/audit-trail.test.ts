import { describe, expect, test } from "vitest";
import { audited, beginAudit } from "../../../src/core/application/audit-trail.ts";
import { createError } from "../../../src/core/domain/errors.ts";
import type { ProgressEvent } from "../../../src/core/domain/operation.ts";
import { err, ok } from "../../../src/core/domain/result.ts";
import { auditDepsFor, createInMemoryAuditLog } from "../../helpers/in-memory-audit-log.ts";

const advancingClock = (stepMs: number) => {
  let current = Date.parse("2026-10-31T12:00:00.000Z");
  return () => {
    const at = new Date(current);
    current += stepMs;
    return at;
  };
};

describe("beginAudit", () => {
  test("an ok result is recorded with its duration and operation id", async () => {
    const log = createInMemoryAuditLog();
    const trail = beginAudit(
      auditDepsFor(log, advancingClock(1500)),
      "info",
      "https://www.youtube.com/watch?v=jNQXAC9IVRw",
    );

    const result = await trail.finish(ok("done"));

    expect(result).toEqual(ok("done"));
    expect(log.records).toEqual([
      {
        operationId: "op-1",
        startedAt: "2026-10-31T12:00:00.000Z",
        operation: "info",
        adapter: "cli",
        input: "https://www.youtube.com/watch?v=jNQXAC9IVRw",
        durationMs: 1500,
        result: "ok",
        versions: { piTube: "0.0.0-test", runtime: "test 1.0.0" },
      },
    ]);
  });

  test("an error result is recorded with its code", async () => {
    const log = createInMemoryAuditLog();
    const trail = beginAudit(auditDepsFor(log), "download", "https://vimeo.com/1");

    await trail.finish(err(createError("DOWNLOAD_FAILED", "failed")));

    expect(log.records[0]).toMatchObject({ result: "error", errorCode: "DOWNLOAD_FAILED" });
  });

  test("noted fields are recorded, and provider, model and audio seconds give the cost", async () => {
    const log = createInMemoryAuditLog();
    const trail = beginAudit(auditDepsFor(log), "transcribe", "/Users/bruno/a.mp3");

    trail.note({ provider: "deepgram", model: "nova-3" });
    trail.note({ sourceKey: "file:abc", cacheHit: false, audioSeconds: 19 });
    await trail.finish(ok(undefined));

    expect(log.records[0]).toMatchObject({
      input: "a.mp3",
      sourceKey: "file:abc",
      provider: "deepgram",
      model: "nova-3",
      audioSeconds: 19,
      cacheHit: false,
      cost: { estimate: 0.001362, currency: "USD", priceTable: "2026-10-31" },
    });
  });

  test("an append that throws keeps the operation's result and reports it as progress", async () => {
    const events: ProgressEvent[] = [];
    const throwing = {
      ...createInMemoryAuditLog(),
      append: async () => {
        throw new Error("disk vanished");
      },
    };
    const trail = beginAudit(auditDepsFor(throwing), "transcribe", "x");

    const result = await trail.finish(ok("saved"), { onProgress: (event) => events.push(event) });

    expect(result).toEqual(ok("saved"));
    expect(events).toEqual([{ label: "Audit log not written", detail: "UNEXPECTED" }]);
  });

  test("audited records a throw in the body as UNEXPECTED and rethrows it", async () => {
    const log = createInMemoryAuditLog();
    const boom = new SyntaxError("Unexpected token");

    const run = audited(auditDepsFor(log), "info", "x", undefined, async () => {
      throw boom;
    });

    await expect(run).rejects.toBe(boom);
    expect(log.records).toHaveLength(1);
    expect(log.records[0]).toMatchObject({ operation: "info", result: "error", errorCode: "UNEXPECTED" });
  });

  test("a failed append keeps the operation's result and reports it as progress", async () => {
    const events: ProgressEvent[] = [];
    const trail = beginAudit(auditDepsFor(createInMemoryAuditLog({ failAppend: true })), "info", "x");

    const result = await trail.finish(ok(42), { onProgress: (event) => events.push(event) });

    expect(result).toEqual(ok(42));
    expect(events).toEqual([{ label: "Audit log not written", detail: "STORAGE_IO_FAILED" }]);
  });
});
