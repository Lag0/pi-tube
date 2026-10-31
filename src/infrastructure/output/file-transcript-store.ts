import { constants } from "node:fs";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createError, type PiTubeError } from "../../core/domain/errors.ts";
import { err, ok } from "../../core/domain/result.ts";
import type { TranscriptStore } from "../../core/ports/transcript-store.ts";
import { errnoOf } from "../errno.ts";

const MAX_NUMBERED_SUFFIX = 999;

const storageError = (target: string, error: unknown): PiTubeError =>
  createError("STORAGE_IO_FAILED", `Cannot write \`${target}\` (${errnoOf(error)}).`, {
    hint: "Check that your user can write to the transcripts directory, or set PI_TUBE_OUTPUT_DIR to another directory.",
  });

const candidateName = (fileName: string, attempt: number): string => {
  if (attempt === 1) return fileName;
  const { name, ext } = path.parse(fileName);
  return `${name}-${attempt <= MAX_NUMBERED_SUFFIX ? attempt : Date.now()}${ext}`;
};

/**
 * Transcript files under `outputDir`, mode 600. A name that already exists gets `-2` to `-999`, then a
 * timestamp; `wx` makes the check and the write one step, so two runs never overwrite each other.
 */
export const createFileTranscriptStore = (outputDir: string): TranscriptStore => ({
  prepare: async () => {
    try {
      await mkdir(outputDir, { recursive: true, mode: 0o700 });
      await access(outputDir, constants.W_OK);
      return ok(undefined);
    } catch (error) {
      return err(storageError(outputDir, error));
    }
  },
  save: async ({ fileName, content }) => {
    try {
      await mkdir(outputDir, { recursive: true, mode: 0o700 });
    } catch (error) {
      return err(storageError(outputDir, error));
    }
    for (let attempt = 1; attempt <= MAX_NUMBERED_SUFFIX + 1; attempt += 1) {
      const target = path.join(outputDir, candidateName(fileName, attempt));
      try {
        await writeFile(target, content, { encoding: "utf8", mode: 0o600, flag: "wx" });
        return ok({ path: target, uri: pathToFileURL(target).href });
      } catch (error) {
        if (errnoOf(error) !== "EEXIST") return err(storageError(target, error));
      }
    }
    return err(storageError(path.join(outputDir, fileName), new Error("too many files with this name")));
  },
});
