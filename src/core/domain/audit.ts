import type { PiTubeConfig } from "./config.ts";
import { keyUrlOf } from "./library.ts";
import { isHttpUrl } from "./source-policy.ts";
import { toSafeLine } from "./text.ts";

/** An operation the audit log records. Reads of the library, `config` and `auth` are not recorded. */
export type AuditOperation = "transcribe" | "download" | "info" | "library_prune";

/** Every operation the audit log records, in the order help lists them. */
export const AUDIT_OPERATIONS: readonly AuditOperation[] = ["transcribe", "download", "info", "library_prune"];

/** The adapter an operation came through. */
export type AuditAdapter = "cli" | "mcp";

/** What an operation cost, as estimated from the price table; providers bill on their own terms. */
export interface AuditCost {
  readonly estimate: number;
  readonly currency: "USD";
  /** The date of the price table the estimate came from. */
  readonly priceTable: string;
}

/** The versions an operation ran with; `ytDlp` and `ffmpeg` are absent until pi-tube manages them. */
export interface AuditVersions {
  readonly piTube: string;
  /** `bun x.y.z` or `node x.y.z`. */
  readonly runtime: string;
  readonly ytDlp?: string;
  readonly ffmpeg?: string;
}

/** One line of the audit log. It never holds a key, a cookie, transcript text or a signed URL. */
export interface AuditRecord {
  readonly operationId: string;
  /** ISO 8601, UTC. */
  readonly startedAt: string;
  readonly operation: AuditOperation;
  readonly adapter: AuditAdapter;
  /** The input as `redactAuditInput` leaves it. */
  readonly input: string;
  readonly sourceKey?: string;
  readonly provider?: string;
  readonly model?: string;
  readonly durationMs: number;
  readonly audioSeconds?: number;
  readonly cost?: AuditCost;
  readonly cacheHit?: boolean;
  readonly result: "ok" | "error";
  readonly errorCode?: string;
  readonly versions: AuditVersions;
}

/** Which records to read. Dates are `YYYY-MM-DD` in UTC, both ends inclusive. */
export interface AuditQuery {
  readonly since?: string;
  readonly until?: string;
  readonly operation?: AuditOperation;
  readonly provider?: string;
  readonly errorsOnly?: boolean;
}

/** Totals over a set of records: all of them, or one provider's. */
export interface AuditGroup {
  /** Absent in the total. */
  readonly provider?: string;
  readonly operations: number;
  readonly errors: number;
  /** `errors / operations`; 0 when there are no operations. */
  readonly errorRate: number;
  readonly cacheHits: number;
  /** Sum of the cost estimates, in USD. */
  readonly costEstimate: number;
  readonly audioSeconds: number;
  readonly averageDurationMs: number;
}

/** `audit stats`: the total and one group per provider, sorted by provider. */
export interface AuditStats {
  readonly total: AuditGroup;
  readonly byProvider: readonly AuditGroup[];
}

/** The date of the price table `estimateCost` uses. */
export const PRICE_TABLE_DATE = "2026-10-31";

/** Months of audit log kept when `audit.retention_months` is not set. */
export const DEFAULT_AUDIT_RETENTION_MONTHS = 12;

const AUDIT_SCHEMA_VERSION = 1;

interface Price {
  readonly usdPerHour: number;
  /** Seconds billed at least, per request. */
  readonly minimumSeconds: number;
}

// Research brief 2026-10-31 §4: list prices, pay as you go.
const PRICES: Readonly<Record<string, Price>> = {
  "deepgram/nova-3": { usdPerHour: 0.258, minimumSeconds: 0 },
  "groq/whisper-large-v3": { usdPerHour: 0.111, minimumSeconds: 10 },
  "elevenlabs/scribe_v2": { usdPerHour: 0.22, minimumSeconds: 0 },
};

const roundUsd = (value: number): number => Math.round(value * 1e6) / 1e6;

/**
 * The input as the audit log keeps it: a URL without credentials, fragment or signature parameters, and a local
 * path as its file name only. The source key already identifies the content.
 */
export const redactAuditInput = (input: string): string => {
  const trimmed = input.trim();
  if (isHttpUrl(trimmed)) return toSafeLine(keyUrlOf(trimmed));
  return toSafeLine(trimmed.split(/[\\/]/).pop() ?? "");
};

/** The estimated cost of transcribing `audioSeconds` of audio; absent for a model outside the price table. */
export const estimateCost = (provider: string, model: string, audioSeconds: number): AuditCost | undefined => {
  const price = PRICES[`${provider}/${model}`];
  if (!price) return undefined;
  const billed = Math.max(audioSeconds, price.minimumSeconds);
  return { estimate: roundUsd((billed / 3600) * price.usdPerHour), currency: "USD", priceTable: PRICE_TABLE_DATE };
};

/** One audit log line, without the line break: snake_case keys led by `schema_version`, absent fields `null`. */
export const auditRecordToLine = (record: AuditRecord): string =>
  JSON.stringify({
    schema_version: AUDIT_SCHEMA_VERSION,
    operation_id: record.operationId,
    started_at: record.startedAt,
    operation: record.operation,
    adapter: record.adapter,
    input: record.input,
    source_key: record.sourceKey ?? null,
    provider: record.provider ?? null,
    model: record.model ?? null,
    duration_ms: record.durationMs,
    audio_seconds: record.audioSeconds ?? null,
    cost: record.cost
      ? { estimate: record.cost.estimate, currency: record.cost.currency, price_table: record.cost.priceTable }
      : null,
    cache_hit: record.cacheHit ?? null,
    result: record.result,
    error_code: record.errorCode ?? null,
    versions: {
      pi_tube: record.versions.piTube,
      runtime: record.versions.runtime,
      yt_dlp: record.versions.ytDlp ?? null,
      ffmpeg: record.versions.ffmpeg ?? null,
    },
  });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isAuditOperation = (value: unknown): value is AuditOperation =>
  AUDIT_OPERATIONS.some((operation) => operation === value);

const INVALID = Symbol("invalid");
type Field<T> = T | undefined | typeof INVALID;

// `null` and absent read the same; any other type makes the line unreadable.
const optional = <T>(value: unknown, is: (candidate: unknown) => candidate is T): Field<T> => {
  if (value === null || value === undefined) return undefined;
  return is(value) ? value : INVALID;
};

const isString = (value: unknown): value is string => typeof value === "string";
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";

const parseCost = (value: unknown): Field<AuditCost> => {
  if (value === null || value === undefined) return undefined;
  if (!isRecord(value) || !isNumber(value.estimate) || value.currency !== "USD" || !isString(value.price_table)) {
    return INVALID;
  }
  return { estimate: value.estimate, currency: "USD", priceTable: value.price_table };
};

const parseVersions = (value: unknown): AuditVersions | undefined => {
  if (!isRecord(value) || !isString(value.pi_tube) || !isString(value.runtime)) return undefined;
  const ytDlp = optional(value.yt_dlp, isString);
  const ffmpeg = optional(value.ffmpeg, isString);
  if (ytDlp === INVALID || ffmpeg === INVALID) return undefined;
  return {
    piTube: value.pi_tube,
    runtime: value.runtime,
    ...(ytDlp === undefined ? {} : { ytDlp }),
    ...(ffmpeg === undefined ? {} : { ffmpeg }),
  };
};

/** A record from one audit log line; absent when the line is not a record this version reads. */
export const parseAuditLine = (line: string): AuditRecord | undefined => {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (!isRecord(value) || value.schema_version !== AUDIT_SCHEMA_VERSION) return undefined;
  const { operation_id, started_at, operation, adapter, input, duration_ms, result } = value;
  if (!isString(operation_id) || !isString(started_at) || !isAuditOperation(operation)) return undefined;
  if ((adapter !== "cli" && adapter !== "mcp") || !isString(input) || !isNumber(duration_ms)) return undefined;
  if (result !== "ok" && result !== "error") return undefined;
  const sourceKey = optional(value.source_key, isString);
  const provider = optional(value.provider, isString);
  const model = optional(value.model, isString);
  const audioSeconds = optional(value.audio_seconds, isNumber);
  const cacheHit = optional(value.cache_hit, isBoolean);
  const errorCode = optional(value.error_code, isString);
  const cost = parseCost(value.cost);
  const versions = parseVersions(value.versions);
  if (
    !versions ||
    sourceKey === INVALID ||
    provider === INVALID ||
    model === INVALID ||
    audioSeconds === INVALID ||
    cacheHit === INVALID ||
    errorCode === INVALID ||
    cost === INVALID
  ) {
    return undefined;
  }
  return {
    operationId: operation_id,
    startedAt: started_at,
    operation,
    adapter,
    input,
    ...(sourceKey === undefined ? {} : { sourceKey }),
    ...(provider === undefined ? {} : { provider }),
    ...(model === undefined ? {} : { model }),
    durationMs: duration_ms,
    ...(audioSeconds === undefined ? {} : { audioSeconds }),
    ...(cost === undefined ? {} : { cost }),
    ...(cacheHit === undefined ? {} : { cacheHit }),
    result,
    ...(errorCode === undefined ? {} : { errorCode }),
    versions,
  };
};

/** Whether a record falls inside a query. */
export const matchesAuditQuery = (record: AuditRecord, query: AuditQuery): boolean => {
  const day = record.startedAt.slice(0, 10);
  if (query.since !== undefined && day < query.since) return false;
  if (query.until !== undefined && day > query.until) return false;
  if (query.errorsOnly && record.result !== "error") return false;
  if (query.operation !== undefined && record.operation !== query.operation) return false;
  return query.provider === undefined || record.provider === query.provider;
};

const groupOf = (records: readonly AuditRecord[], provider?: string): AuditGroup => {
  const operations = records.length;
  const errors = records.filter((entry) => entry.result === "error").length;
  const totalDurationMs = records.reduce((sum, entry) => sum + entry.durationMs, 0);
  return {
    ...(provider === undefined ? {} : { provider }),
    operations,
    errors,
    errorRate: operations === 0 ? 0 : errors / operations,
    cacheHits: records.filter((entry) => entry.cacheHit === true).length,
    costEstimate: roundUsd(records.reduce((sum, entry) => sum + (entry.cost?.estimate ?? 0), 0)),
    audioSeconds: Math.round(records.reduce((sum, entry) => sum + (entry.audioSeconds ?? 0), 0) * 1000) / 1000,
    averageDurationMs: operations === 0 ? 0 : Math.round(totalDurationMs / operations),
  };
};

/** The total and per-provider totals; an operation without a provider counts only in the total. */
export const summarizeAudit = (records: readonly AuditRecord[]): AuditStats => {
  const byProvider = new Map<string, AuditRecord[]>();
  for (const entry of records) {
    if (entry.provider === undefined) continue;
    const group = byProvider.get(entry.provider) ?? [];
    group.push(entry);
    byProvider.set(entry.provider, group);
  }
  return {
    total: groupOf(records),
    byProvider: [...byProvider.keys()].sort().map((provider) => groupOf(byProvider.get(provider) ?? [], provider)),
  };
};

/** Audit settings from the config; an absent section means its defaults. */
export const resolveAuditSettings = (config: PiTubeConfig): { readonly retentionMonths: number } => ({
  retentionMonths: config.audit?.retention_months ?? DEFAULT_AUDIT_RETENTION_MONTHS,
});
