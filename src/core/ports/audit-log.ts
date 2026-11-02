import type { AuditQuery, AuditRecord } from "../domain/audit.ts";
import type { Result } from "../domain/result.ts";

/** Records read from the audit log, newest first, and how many lines could not be read. */
export interface AuditReadout {
  readonly records: readonly AuditRecord[];
  readonly skippedLines: number;
}

/** The local, append-only audit log. Nothing in it leaves the machine. */
export interface AuditLog {
  /** Adds one record; a record is never split across writes, so concurrent processes do not interleave lines. */
  readonly append: (record: AuditRecord) => Promise<Result<void>>;
  /** The records inside a query, newest first; a line this version cannot read is skipped and counted. */
  readonly read: (query: AuditQuery) => Promise<Result<AuditReadout>>;
}
