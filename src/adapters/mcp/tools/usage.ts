import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { AUDIT_OPERATIONS, type AuditGroup, type AuditRecord, err, ok, PRICE_TABLE_DATE } from "../../../core/index.ts";
import { runTool } from "../results.ts";
import type { McpDeps } from "../server.ts";
import { LOCAL_READ_ONLY } from "./annotations.ts";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

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

const recordJson = (record: AuditRecord) => ({
  started_at: record.startedAt,
  operation: record.operation,
  adapter: record.adapter,
  result: record.result,
  error_code: record.errorCode ?? null,
  provider: record.provider ?? null,
  model: record.model ?? null,
  input: record.input,
  source_key: record.sourceKey ?? null,
  audio_seconds: record.audioSeconds ?? null,
  cost_estimate: record.cost?.estimate ?? null,
  cache_hit: record.cacheHit ?? null,
  duration_ms: record.durationMs,
});

/** `get_usage`: the audit log's totals for a period and one page of its records. */
export const registerGetUsageTool = (server: McpServer, deps: McpDeps): void => {
  server.registerTool(
    "get_usage",
    {
      title: "Get usage and cost",
      description:
        "Reads the local audit log: totals for the period (operations, errors, cache hits, estimated cost in USD, audio seconds), overall and per provider, and one page of records, newest first. since and until are UTC days (YYYY-MM-DD), both included; operation, provider and errors_only filter only the records. Costs are estimates from a dated price table.",
      inputSchema: z.object({
        since: z.string().regex(DAY, "Use YYYY-MM-DD.").optional(),
        until: z.string().regex(DAY, "Use YYYY-MM-DD.").optional(),
        operation: z.enum(AUDIT_OPERATIONS).optional(),
        provider: z.string().min(1).optional(),
        errors_only: z.boolean().default(false),
        limit: z.number().int().min(1).max(100).default(10),
        offset: z.number().int().min(0).default(0),
      }),
      annotations: LOCAL_READ_ONLY,
    },
    (args, ctx) =>
      runTool(
        ctx,
        deps,
        async (options) => {
          const dates = {
            ...(args.since === undefined ? {} : { since: args.since }),
            ...(args.until === undefined ? {} : { until: args.until }),
          };
          const stats = await deps.app.auditStats(dates, options);
          if (!stats.success) return stats;
          const page = await deps.app.queryAudit(
            {
              ...dates,
              ...(args.operation === undefined ? {} : { operation: args.operation }),
              ...(args.provider === undefined ? {} : { provider: args.provider }),
              errorsOnly: args.errors_only,
              limit: args.limit,
              offset: args.offset,
            },
            options,
          );
          return page.success ? ok({ stats: stats.data, page: page.data }) : err(page.error);
        },
        ({ stats, page }) => {
          const next = page.offset + page.records.length;
          return {
            since: stats.since ?? null,
            until: stats.until ?? null,
            currency: "USD",
            price_table: PRICE_TABLE_DATE,
            stats: { total: groupJson(stats.stats.total), by_provider: stats.stats.byProvider.map(groupJson) },
            total: page.total,
            offset: page.offset,
            limit: page.limit,
            next_offset: next < page.total ? next : null,
            skipped_lines: page.skippedLines,
            records: page.records.map(recordJson),
          };
        },
      ),
  );
};
