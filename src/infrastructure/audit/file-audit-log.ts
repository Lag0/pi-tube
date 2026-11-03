import { appendFile, mkdir, readdir, readFile, stat, unlink } from "node:fs/promises";
import path from "node:path";
import {
  type AuditQuery,
  type AuditRecord,
  auditRecordToLine,
  matchesAuditQuery,
  parseAuditLine,
  resolveAuditSettings,
} from "../../core/domain/audit.ts";
import { createError, type PiTubeError } from "../../core/domain/errors.ts";
import { err, ok } from "../../core/domain/result.ts";
import type { AuditLog } from "../../core/ports/audit-log.ts";
import type { ConfigStore } from "../../core/ports/config-store.ts";
import { errnoOf } from "../errno.ts";

const MONTH_FILE = /^(\d{4})-(\d{2})\.jsonl$/;
const HINT = "Check that your user can read and write the pi-tube audit directory.";

const ioError = (action: "read" | "write", target: string, error: unknown): PiTubeError =>
  createError("STORAGE_IO_FAILED", `Cannot ${action} \`${target}\` (${errnoOf(error)}).`, { hint: HINT });

/** `YYYY-MM` of an ISO timestamp, in UTC. */
const monthOf = (timestamp: string): string => new Date(timestamp).toISOString().slice(0, 7);

/** Months since year 0, so two months compare and subtract as numbers. */
const monthIndex = (month: string): number => Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1;

const exists = async (file: string): Promise<boolean> =>
  stat(file).then(
    () => true,
    () => false,
  );

const listMonthFiles = async (auditDir: string): Promise<readonly string[]> =>
  (await readdir(auditDir)).filter((name) => MONTH_FILE.test(name));

/**
 * The audit log as one JSONL file per UTC month, `<auditDir>/YYYY-MM.jsonl`, 0600 inside a 0700 directory. The first
 * record of a month deletes the months older than `audit.retention_months`; the month written to is always kept.
 */
export const createFileAuditLog = (deps: {
  readonly auditDir: string;
  readonly configStore: ConfigStore;
}): AuditLog => {
  // Best-effort: an unreadable config or a failed delete keeps the old months rather than failing the record.
  const applyRetention = async (currentMonth: string): Promise<void> => {
    const config = await deps.configStore.read();
    if (!config.success) return;
    const oldestKept = monthIndex(currentMonth) - resolveAuditSettings(config.data).retentionMonths + 1;
    const files = await listMonthFiles(deps.auditDir).catch(() => []);
    for (const name of files) {
      if (monthIndex(name) >= oldestKept) continue;
      await unlink(path.join(deps.auditDir, name)).catch(() => undefined);
    }
  };

  const readMonth = async (name: string, query: AuditQuery): Promise<{ records: AuditRecord[]; skipped: number }> => {
    const text = await readFile(path.join(deps.auditDir, name), "utf8");
    const records: AuditRecord[] = [];
    let skipped = 0;
    for (const line of text.split("\n")) {
      if (line.trim().length === 0) continue;
      const parsed = parseAuditLine(line);
      if (!parsed) skipped += 1;
      else if (matchesAuditQuery(parsed, query)) records.push(parsed);
    }
    return { records, skipped };
  };

  return {
    append: async (record) => {
      const month = monthOf(record.startedAt);
      const file = path.join(deps.auditDir, `${month}.jsonl`);
      try {
        await mkdir(deps.auditDir, { recursive: true, mode: 0o700 });
        const isNewMonth = !(await exists(file));
        // One write per record: O_APPEND keeps concurrent writers from interleaving lines.
        await appendFile(file, `${auditRecordToLine(record)}\n`, { encoding: "utf8", mode: 0o600, flag: "a" });
        if (isNewMonth) await applyRetention(month);
        return ok(undefined);
      } catch (error) {
        return err(ioError("write", file, error));
      }
    },

    read: async (query) => {
      let names: readonly string[];
      try {
        names = await listMonthFiles(deps.auditDir);
      } catch (error) {
        if (errnoOf(error) === "ENOENT") return ok({ records: [], skippedLines: 0 });
        return err(ioError("read", deps.auditDir, error));
      }
      const first = query.since?.slice(0, 7);
      const last = query.until?.slice(0, 7);
      const inRange = names.filter((name) => {
        const month = name.slice(0, 7);
        return (first === undefined || month >= first) && (last === undefined || month <= last);
      });
      const records: AuditRecord[] = [];
      let skippedLines = 0;
      for (const name of inRange) {
        try {
          const month = await readMonth(name, query);
          records.push(...month.records);
          skippedLines += month.skipped;
        } catch (error) {
          return err(ioError("read", path.join(deps.auditDir, name), error));
        }
      }
      records.sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt));
      return ok({ records, skippedLines });
    },
  };
};
