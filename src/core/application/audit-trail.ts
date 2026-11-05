import {
  type AuditAdapter,
  type AuditCost,
  type AuditOperation,
  type AuditVersions,
  estimateCost,
  PRICE_TABLE_DATE,
  redactAuditInput,
} from "../domain/audit.ts";
import { toPiTubeError } from "../domain/errors.ts";
import type { OperationOptions } from "../domain/operation.ts";
import { err, type Result } from "../domain/result.ts";
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
      // A log that throws instead of returning an error (before or after returning a promise, or while the record is
      // built) must not turn a finished, maybe paid, operation into a crash.
      const append = async (): Promise<Result<void>> =>
        deps.audit.append({
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
      const appended = await append().catch((caught: unknown) => err(toPiTubeError(caught)));
      if (!appended.success) options?.onProgress?.({ label: "Audit log not written", detail: appended.error.code });
      return result;
    },
  };
};

/**
 * Runs an audited use case body and always records it: its result, or a throw, recorded as UNEXPECTED and then
 * rethrown, so the caller still sees the bug.
 */
export const audited = async <T>(
  deps: AuditTrailDeps,
  operation: AuditOperation,
  input: string,
  options: OperationOptions | undefined,
  body: (trail: AuditTrail) => Promise<Result<T>>,
): Promise<Result<T>> => {
  const trail = beginAudit(deps, operation, input);
  let result: Result<T>;
  try {
    result = await body(trail);
  } catch (caught) {
    await trail.finish(err(toPiTubeError(caught)), options);
    throw caught;
  }
  return trail.finish(result, options);
};
