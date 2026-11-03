import {
  AUDIT_OPERATIONS,
  type AuditOperation,
  type AuditRecord,
  type AuditStats,
  summarizeAudit,
} from "../domain/audit.ts";
import { createError } from "../domain/errors.ts";
import { err, ok, type Result } from "../domain/result.ts";
import type { AuditLog } from "../ports/audit-log.ts";
import { checkPage } from "./library.ts";
import { ensureNotAborted, type UseCase } from "./operation.ts";

/** What `audit list` asks for. Dates are `YYYY-MM-DD` in UTC, both ends inclusive. */
export interface AuditListInput {
  readonly since?: string;
  readonly until?: string;
  readonly operation?: string;
  readonly provider?: string;
  readonly errorsOnly?: boolean;
  readonly limit: number;
  readonly offset: number;
}

/** One page of audit records, newest first, and how many lines of the log could not be read. */
export interface AuditPage {
  readonly total: number;
  readonly offset: number;
  readonly limit: number;
  readonly records: readonly AuditRecord[];
  readonly skippedLines: number;
}

/** What `audit stats` asks for. */
export interface AuditStatsInput {
  readonly since?: string;
  readonly until?: string;
}

/** `audit stats`: the totals over the dates asked for. */
export interface AuditStatsOutput {
  readonly stats: AuditStats;
  readonly skippedLines: number;
  readonly since?: string;
  readonly until?: string;
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const isCalendarDate = (value: string): boolean => {
  const match = DATE.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

/** Checks `--since` and `--until`: calendar dates as YYYY-MM-DD, `since` not after `until`. */
export const checkDayRange = ({ since, until }: { readonly since?: string; readonly until?: string }): Result<void> => {
  for (const [flag, value] of [
    ["since", since],
    ["until", until],
  ] as const) {
    if (value !== undefined && !isCalendarDate(value)) {
      return err(createError("INPUT_INVALID", `\`--${flag}\` must be a date as YYYY-MM-DD.`));
    }
  }
  if (since !== undefined && until !== undefined && since > until) {
    return err(createError("INPUT_INVALID", "`--since` must not be after `--until`."));
  }
  return ok(undefined);
};

const checkOperation = (operation: string | undefined): Result<AuditOperation | undefined> => {
  if (operation === undefined) return ok(undefined);
  const known = AUDIT_OPERATIONS.find((candidate) => candidate === operation);
  if (known) return ok(known);
  return err(
    createError("INPUT_INVALID", `Unknown audit operation \`${operation}\`.`, {
      hint: `Use one of: ${AUDIT_OPERATIONS.join(", ")}.`,
    }),
  );
};

/** Lists the audit log, newest first, filtered by dates, operation, provider and errors, a page at a time. */
export const createQueryAudit =
  (deps: { readonly audit: AuditLog }): UseCase<AuditListInput, AuditPage> =>
  async (input, options) => {
    const ready = ensureNotAborted(options?.signal);
    if (!ready.success) return ready;
    const dates = checkDayRange(input);
    if (!dates.success) return dates;
    const operation = checkOperation(input.operation);
    if (!operation.success) return operation;
    const page = checkPage(input);
    if (!page.success) return page;
    const read = await deps.audit.read({
      ...(input.since === undefined ? {} : { since: input.since }),
      ...(input.until === undefined ? {} : { until: input.until }),
      ...(operation.data === undefined ? {} : { operation: operation.data }),
      ...(input.provider === undefined ? {} : { provider: input.provider }),
      ...(input.errorsOnly ? { errorsOnly: true } : {}),
    });
    if (!read.success) return read;
    return ok({
      total: read.data.records.length,
      offset: input.offset,
      limit: input.limit,
      records: read.data.records.slice(input.offset, input.offset + input.limit),
      skippedLines: read.data.skippedLines,
    });
  };

/** Totals of the audit log between two dates: operations, errors, cache hits, estimated cost, by provider. */
export const createAuditStats =
  (deps: { readonly audit: AuditLog }): UseCase<AuditStatsInput, AuditStatsOutput> =>
  async (input, options) => {
    const ready = ensureNotAborted(options?.signal);
    if (!ready.success) return ready;
    const dates = checkDayRange(input);
    if (!dates.success) return dates;
    const read = await deps.audit.read(input);
    if (!read.success) return read;
    return ok({
      stats: summarizeAudit(read.data.records),
      skippedLines: read.data.skippedLines,
      ...(input.since === undefined ? {} : { since: input.since }),
      ...(input.until === undefined ? {} : { until: input.until }),
    });
  };
