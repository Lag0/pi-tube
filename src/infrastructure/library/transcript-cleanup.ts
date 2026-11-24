import { createHash } from "node:crypto";
import { lstat, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { PruneReport } from "../../core/ports/library-store.ts";
import { errnoOf } from "../errno.ts";
import type { pin } from "./windows-handle.ts";

const hash = (bytes: string | Buffer): string => createHash("sha256").update(bytes).digest("hex");
const serialize = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;
const identity = (s: { dev: bigint; ino: bigint; birthtimeNs: bigint }): string => `${s.dev}:${s.ino}:${s.birthtimeNs}`;
const inspect = (file: string) => lstat(file, { bigint: true });
export const receiptFor = async (file: string, written: string): Promise<string> =>
  `${identity(await inspect(file))}:${hash(written)}`;
interface Receipt {
  directory: string;
  ownsDirectory: boolean;
  ownsMetadata: boolean;
  metadata: string;
  files: Record<string, string>;
}
async function receiptOf(raw: string, dir: string, file: string): Promise<Receipt | undefined> {
  let decoded: Record<string, unknown>;
  try {
    decoded = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!decoded || typeof decoded !== "object") return undefined;
  const { cleanup_checksum, ...body } = decoded;
  const r = body.cleanup as Partial<Receipt> | undefined;
  if (
    !r?.files ||
    typeof r.files !== "object" ||
    cleanup_checksum !== hash(serialize(body)) ||
    raw !== serialize(decoded)
  )
    return undefined;
  if (identity(await inspect(dir)) !== r.directory || identity(await inspect(file)) !== r.metadata) return undefined;
  if (
    typeof r.ownsDirectory !== "boolean" ||
    typeof r.ownsMetadata !== "boolean" ||
    !Object.values(r.files).every((v) => typeof v === "string")
  )
    return undefined;
  return r as Receipt;
}
export async function sourceWithReceipts(
  dir: string,
  temp: string,
  body: Record<string, unknown>,
  previous: string | undefined,
  created: boolean,
  files: Record<string, string>,
): Promise<string> {
  const old = previous === undefined ? undefined : await receiptOf(previous, dir, path.join(dir, "source.json"));
  const { cleanup_checksum: _checksum, cleanup: _receipt, ...fields } = body;
  const content = {
    ...fields,
    cleanup: {
      directory: identity(await inspect(dir)),
      ownsDirectory: created || old?.ownsDirectory === true,
      ownsMetadata: previous === undefined || old?.ownsMetadata === true,
      metadata: identity(await inspect(temp)),
      files: { ...old?.files, ...files },
    },
  };
  return serialize({ ...content, cleanup_checksum: hash(serialize(content)) });
}

export async function pruneTranscripts(root: string, cutoff: number, dryRun: boolean): Promise<PruneReport> {
  const report = { bytes: 0, sourceDirs: 0, audioFiles: 0, dryRun, preserved: 0, failed: 0, transcriptFiles: 0 };
  // POSIX unlinkat accepts a name, not the inspected file descriptor. Do not fall back to pathname deletion.
  if (process.platform !== "win32") return { ...report, unsupported: true };
  const { pin, withPinnedRoot } = await import("./windows-handle.ts");
  const skipped = (e: unknown) => ["ENOENT", "ELOOP", "EBUSY", "ENOTEMPTY"].includes(errnoOf(e));
  const record = (e: unknown) => {
    if (skipped(e)) report.preserved++;
    else report.failed++;
  };
  async function remove(file: string, handle: ReturnType<typeof pin>, expected: string) {
    const stat = await inspect(file);
    if (
      !stat.isFile() ||
      identity(stat) !== handle.identity ||
      Number(stat.mtimeMs) >= cutoff ||
      `${handle.identity}:${hash(await readFile(file))}` !== expected
    )
      return false;
    if (!dryRun) handle.remove();
    report.bytes += Number(stat.size);
    return true;
  }
  async function scan(dir: string, directory: ReturnType<typeof pin>) {
    const names = await readdir(dir);
    if (!names.includes("source.json")) {
      report.preserved++;
      return;
    }
    const meta = path.join(dir, "source.json");
    const metadata = pin(meta, "file");
    let empty = false,
      owned = false;
    try {
      const raw = await readFile(meta, "utf8");
      const receipt = await receiptOf(raw, dir, meta);
      if (!receipt || receipt.directory !== directory.identity || receipt.metadata !== metadata.identity) {
        report.preserved += names.length;
        return;
      }
      owned = receipt.ownsDirectory;
      let remaining = names.length;
      for (const name of names) {
        if (name === "source.json") continue;
        const expected = Object.hasOwn(receipt.files, name) ? receipt.files[name] : undefined;
        if (!expected) {
          report.preserved++;
          continue;
        }
        try {
          const file = path.join(dir, name),
            handle = pin(file, "file");
          try {
            if (await remove(file, handle, expected)) {
              remaining--;
              report.transcriptFiles++;
            } else report.preserved++;
          } finally {
            handle.close();
          }
        } catch (e) {
          record(e);
        }
      }
      if (remaining === 1 && receipt.ownsMetadata && (await remove(meta, metadata, `${receipt.metadata}:${hash(raw)}`)))
        empty = true;
      else report.preserved++;
    } finally {
      metadata.close();
    }
    if (empty && owned) {
      if (!dryRun) directory.remove();
      report.sourceDirs++;
    }
  }
  try {
    await withPinnedRoot(root, async () => {
      for (const entry of await readdir(root, { withFileTypes: true })) {
        if (!entry.isDirectory()) {
          report.preserved++;
          continue;
        }
        try {
          const dir = path.join(root, entry.name),
            handle = pin(dir, "directory");
          try {
            await scan(dir, handle);
          } finally {
            handle.close();
          }
        } catch (e) {
          record(e);
        }
      }
    });
  } catch (e) {
    if (errnoOf(e) === "ENOTSUP") return { ...report, unsupported: true };
    if (errnoOf(e) === "EBUSY") return { ...report, busy: true };
    if (errnoOf(e) !== "ENOENT") record(e);
  }
  return report;
}
