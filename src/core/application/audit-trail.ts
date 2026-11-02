import {
  type AuditAdapter,
  type AuditCost,
  type AuditOperation,
  type AuditVersions,
  estimateCost,
  PRICE_TABLE_DATE,
  redactAuditInput,
} from "../domain/audit.ts";
import type { OperationOptions } from "../domain/operation.ts";
import type { Result } from "../domain/result.ts";
import type { AuditLog } from "../ports/audit-log.ts";

/** What an audited use case needs to record its operation. */
export interface AuditTrailDeps {
  readonly audit: AuditLog;
  readonly now: () => Date;
  readonly newId: () => string;
  readonly adapter: AuditAdapter;
  readonly versions: AuditVersions;
}

/** Facts a use case learns while it runs; a later note of a field replaces the earlier one. */
export interface AuditNote {
  readonly sourceKey?: string;
  readonly provider?: string;
  readonly model?: string;
  readonly audioSeconds?: number;
  readonly cacheHit?: boolean;
}

/** One operation being audited: notes along the way, one record at the end. */
export interface AuditTrail {
  readonly note: (fields: AuditNote) => void;
  /** Records the operation and returns its result unchanged, also when the audit log cannot be written. */
  readonly finish: <T>(result: Result<T>, options?: OperationOptions) => Promise<Result<T>>;
}

const costOf = (noted: AuditNote): AuditCost | undefined => {
  if (noted.cacheHit) return { estimate: 0, currency: "USD", priceTable: PRICE_TABLE_DATE };
  if (noted.audioSeconds === undefined || noted.provider === undefined || noted.model === undefined) return undefined;
  return estimateCost(noted.provider, noted.model, noted.audioSeconds);
};

/** Starts the audit of one operation; its clock starts now. */
export const beginAudit = (deps: AuditTrailDeps, operation: AuditOperation, input: string): AuditTrail => {
  const startedAt = deps.now();
  const operationId = deps.newId();
  let noted: AuditNote = {};
  return {
    note: (fields) => {
      noted = { ...noted, ...fields };
    },
    finish: async (result, options) => {
      const cost = costOf(noted);
      const appended = await deps.audit.append({
        operationId,
        startedAt: startedAt.toISOString(),
        operation,
        adapter: deps.adapter,
        input: redactAuditInput(input),
        ...(noted.sourceKey === undefined ? {} : { sourceKey: noted.sourceKey }),
        ...(noted.provider === undefined ? {} : { provider: noted.provider }),
        ...(noted.model === undefined ? {} : { model: noted.model }),
        durationMs: deps.now().getTime() - startedAt.getTime(),
        ...(noted.audioSeconds === undefined ? {} : { audioSeconds: noted.audioSeconds }),
        ...(cost === undefined ? {} : { cost }),
        ...(noted.cacheHit === undefined ? {} : { cacheHit: noted.cacheHit }),
        result: result.success ? "ok" : "error",
        ...(result.success ? {} : { errorCode: result.error.code }),
        versions: deps.versions,
      });
      if (!appended.success) options?.onProgress?.({ label: "Audit log not written", detail: appended.error.code });
      return result;
    },
  };
};
