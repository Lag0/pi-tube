import type { AuditTrailDeps } from "../../src/core/application/audit-trail.ts";
import { type AuditRecord, matchesAuditQuery } from "../../src/core/domain/audit.ts";
import { createError } from "../../src/core/domain/errors.ts";
import { err, ok } from "../../src/core/domain/result.ts";
import type { AuditLog } from "../../src/core/ports/audit-log.ts";

/** An audit log kept in memory; `failAppend` makes every append fail with `STORAGE_IO_FAILED`. */
export const createInMemoryAuditLog = (
  options: { readonly failAppend?: boolean } = {},
): AuditLog & { readonly records: AuditRecord[] } => {
  const records: AuditRecord[] = [];
  return {
    records,
    append: async (record) => {
      if (options.failAppend) return err(createError("STORAGE_IO_FAILED", "Cannot write the audit log."));
      records.push(record);
      return ok(undefined);
    },
    read: async (query) =>
      ok({
        records: records
          .filter((record) => matchesAuditQuery(record, query))
          .sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt)),
        skippedLines: 0,
      }),
  };
};

/** Audit deps over `log`, with ids `op-1`, `op-2`, ... and a fixed clock unless one is given. */
export const auditDepsFor = (
  log: AuditLog,
  clock: () => Date = () => new Date("2026-10-31T12:00:00.000Z"),
): AuditTrailDeps => {
  let next = 0;
  return {
    audit: log,
    now: clock,
    newId: () => {
      next += 1;
      return `op-${next}`;
    },
    adapter: "cli",
    versions: { piTube: "0.0.0-test", runtime: "test 1.0.0" },
  };
};
