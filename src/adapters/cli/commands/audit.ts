import {
  type AuditGroup,
  type AuditPage,
  type AuditRecord,
  type AuditStatsOutput,
  auditRecordToLine,
  createError,
  PRICE_TABLE_DATE,
  toSafeLine,
} from "../../../core/index.ts";
import { CliFailure, unwrapOrFail } from "../error-output.ts";
import type { CliDeps } from "../io.ts";
import { hintForCommand } from "../usage-hints.ts";

export interface AuditCommand {
  readonly action?: string;
  readonly args: readonly string[];
  readonly since?: string;
  readonly until?: string;
  readonly operation?: string;
  readonly provider?: string;
  readonly errors: boolean;
  readonly limit?: string;
  readonly offset?: string;
  readonly json: boolean;
}

const DEFAULT_LIMIT = 20;

const usageError = (message: string): CliFailure =>
  new CliFailure(createError("INPUT_INVALID", message, { hint: hintForCommand("audit") }));

/** A whole number from the flag, or NaN, which the use case refuses with the flag's name. */
const wholeNumber = (value: string | undefined, fallback: number): number =>
  value === undefined ? fallback : /^\d+$/.test(value.trim()) ? Number(value.trim()) : Number.NaN;

const usd = (value: number): string => value.toFixed(6);

/** The record as the audit log stores it: snake_case, absent fields `null`. */
const recordJson = (record: AuditRecord): unknown => JSON.parse(auditRecordToLine(record));

/** One line per record; the input may come from a page or a file name, so it goes through `toSafeLine`. */
const recordLine = (record: AuditRecord): string =>
  [
    record.startedAt,
    record.operation,
    record.result,
    ...(record.errorCode === undefined ? [] : [record.errorCode]),
    `provider=${record.provider ?? "-"}`,
    `cost_usd=${record.cost === undefined ? "-" : usd(record.cost.estimate)}`,
    `cache_hit=${record.cacheHit ?? "-"}`,
    toSafeLine(record.input),
  ].join(" ");

const writeList = (deps: CliDeps, page: AuditPage, json: boolean): void => {
  if (json) {
    const next = page.offset + page.records.length;
    const body = {
      total: page.total,
      offset: page.offset,
      limit: page.limit,
      next_offset: next < page.total ? next : null,
      skipped_lines: page.skippedLines,
      records: page.records.map(recordJson),
    };
    deps.io.writeOut(JSON.stringify(body, null, 2));
    return;
  }
  const header = `[AUDIT] total=${page.total} offset=${page.offset} limit=${page.limit}`;
  deps.io.writeOut([header, ...page.records.map(recordLine)].join("\n"));
};

const groupJson = (group: AuditGroup) => ({
  ...(group.provider === undefined ? {} : { provider: group.provider }),
  operations: group.operations,
  errors: group.errors,
  error_rate: group.errorRate,
  cache_hits: group.cacheHits,
  cost_estimate: group.costEstimate,
  audio_seconds: group.audioSeconds,
  average_duration_ms: group.averageDurationMs,
});

const writeStats = (deps: CliDeps, output: AuditStatsOutput, json: boolean): void => {
  const { total, byProvider } = output.stats;
  if (json) {
    const body = {
      since: output.since ?? null,
      until: output.until ?? null,
      skipped_lines: output.skippedLines,
      currency: "USD",
      price_table: PRICE_TABLE_DATE,
      total: groupJson(total),
      by_provider: byProvider.map(groupJson),
    };
    deps.io.writeOut(JSON.stringify(body, null, 2));
    return;
  }
  const summary = [
    "[AUDIT_STATS]",
    `since=${output.since ?? "all"}`,
    `until=${output.until ?? "all"}`,
    `operations=${total.operations}`,
    `errors=${total.errors}`,
    `error_rate=${total.errorRate.toFixed(3)}`,
    `cost_usd=${usd(total.costEstimate)}`,
    `(estimate, price table ${PRICE_TABLE_DATE})`,
  ].join(" ");
  const providerLine = (group: AuditGroup): string =>
    [
      `provider=${group.provider}`,
      `operations=${group.operations}`,
      `errors=${group.errors}`,
      `error_rate=${group.errorRate.toFixed(3)}`,
      `cache_hits=${group.cacheHits}`,
      `cost_usd=${usd(group.costEstimate)}`,
      `audio_seconds=${group.audioSeconds}`,
      `avg_duration_ms=${group.averageDurationMs}`,
    ].join(" ");
  deps.io.writeOut([summary, ...byProvider.map(providerLine)].join("\n"));
};

/** `pi-tube audit [list|stats]`: the local audit log and its totals. */
export const runAudit = async (deps: CliDeps, command: AuditCommand): Promise<number> => {
  const action = command.action ?? "list";
  if (action !== "list" && action !== "stats") throw usageError(`Unknown audit action \`${action}\`.`);
  if (command.args.length > 0) throw usageError(`\`audit ${action}\` takes no arguments.`);
  const dates = {
    ...(command.since === undefined ? {} : { since: command.since }),
    ...(command.until === undefined ? {} : { until: command.until }),
  };
  if (action === "stats") {
    const listOnly = [command.operation, command.provider, command.limit, command.offset];
    if (command.errors || listOnly.some((value) => value !== undefined)) {
      throw usageError("`audit stats` accepts only --since, --until and --json.");
    }
    writeStats(deps, unwrapOrFail(await deps.app.auditStats(dates)), command.json);
    return 0;
  }
  const page = unwrapOrFail(
    await deps.app.queryAudit({
      ...dates,
      ...(command.operation === undefined ? {} : { operation: command.operation }),
      ...(command.provider === undefined ? {} : { provider: command.provider }),
      errorsOnly: command.errors,
      limit: wholeNumber(command.limit, DEFAULT_LIMIT),
      offset: wholeNumber(command.offset, 0),
    }),
  );
  writeList(deps, page, command.json);
  return 0;
};
