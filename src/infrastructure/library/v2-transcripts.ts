import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createError } from "../../core/domain/errors.ts";
import { err, ok } from "../../core/domain/result.ts";
import { type ImportSummary, V2_FILE_NAME } from "../../core/domain/transcript/parse-v2.ts";
import type { LegacyTranscriptFile, LegacyTranscripts } from "../../core/ports/legacy-transcripts.ts";
import { errnoOf } from "../errno.ts";

const MARKER = ".v2-import.json";
const MARKER_SCHEMA_VERSION = 1;

/** A scan being filled, folder by folder. */
interface Scan {
  readonly files: LegacyTranscriptFile[];
  readonly unreadable: Array<{ readonly path: string; readonly reason: string }>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The transcripts pi-tube v2 left at the top of its folders (`~/.pi-tube`, and `PI_TUBE_OUTPUT_DIR` if set). They
 * are only read; `<libraryDir>/.v2-import.json` (mode 600) records that the import ran.
 */
export const createV2Transcripts = (deps: {
  readonly dirs: readonly string[];
  readonly libraryDir: string;
  readonly now?: () => Date;
}): LegacyTranscripts => {
  const now = deps.now ?? (() => new Date());
  const marker = path.join(deps.libraryDir, MARKER);

  /** Reads the v2 files of one folder; a file that cannot be read is reported, not fatal. */
  const scan = async (dir: string, into: Scan) => {
    const entries = await readdir(dir, { withFileTypes: true });
    const names = entries
      .filter((entry) => entry.isFile() && V2_FILE_NAME.test(entry.name))
      .map((entry) => entry.name)
      .sort();
    for (const name of names) {
      const filePath = path.join(dir, name);
      try {
        const bytes = await readFile(filePath);
        into.files.push({
          path: filePath,
          name,
          text: bytes.toString("utf8"),
          sha256: createHash("sha256").update(bytes).digest("hex"),
        });
      } catch (error) {
        into.unreadable.push({ path: filePath, reason: `Cannot read the file (${errnoOf(error)}).` });
      }
    }
  };

  return {
    isImported: async () => {
      try {
        const saved: unknown = JSON.parse(await readFile(marker, "utf8"));
        return isRecord(saved) && saved.schema_version === MARKER_SCHEMA_VERSION;
      } catch {
        return false;
      }
    },

    files: async () => {
      const found: Scan = { files: [], unreadable: [] };
      for (const dir of [...new Set(deps.dirs)]) {
        try {
          await scan(dir, found);
        } catch (error) {
          if (errnoOf(error) === "ENOENT") continue;
          return err(
            createError("STORAGE_IO_FAILED", `Cannot read \`${dir}\` (${errnoOf(error)}).`, {
              hint: "Check that your user can read the folder, or move the pi-tube v2 transcripts out of it.",
            }),
          );
        }
      }
      return ok(found);
    },

    markImported: async (summary: ImportSummary) => {
      const content = {
        schema_version: MARKER_SCHEMA_VERSION,
        imported_at: now().toISOString(),
        found: summary.found,
        imported: summary.imported,
        already: summary.already,
        skipped: summary.skipped,
      };
      const temp = path.join(deps.libraryDir, `${MARKER}.${randomUUID()}.tmp`);
      try {
        await mkdir(deps.libraryDir, { recursive: true, mode: 0o700 });
        await writeFile(temp, `${JSON.stringify(content, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
        await rename(temp, marker);
        return ok(undefined);
      } catch (error) {
        await rm(temp, { force: true }).catch(() => undefined);
        return err(
          createError("STORAGE_IO_FAILED", `Cannot write \`${marker}\` (${errnoOf(error)}).`, {
            hint: "Check that your user can write the library directory, or set PI_TUBE_LIBRARY_DIR to another directory.",
          }),
        );
      }
    },
  };
};
