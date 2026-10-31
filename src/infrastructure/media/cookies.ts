import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createError } from "../../core/domain/errors.ts";
import { err, ok, type Result } from "../../core/domain/result.ts";
import { COOKIES_FILE_ENV, type SourceSettings } from "../../core/domain/source-settings.ts";
import { errnoOf } from "../errno.ts";

/** The yt-dlp arguments for one run's cookies, and the cleanup that removes the temporary copy. */
export interface PreparedCookies {
  readonly args: readonly string[];
  readonly cleanup: () => Promise<void>;
}

// CPython's MozillaCookieJar, which yt-dlp uses, requires this on the first line.
const NETSCAPE_HEADER = /^#( Netscape)? HTTP Cookie File/i;

const NO_COOKIES: PreparedCookies = { args: [], cleanup: async () => {} };

/** Where the cookies file was set, for messages that must never show its path. */
export const cookiesOriginName = (origin: "env" | "config"): string =>
  origin === "env" ? COOKIES_FILE_ENV : "cookies.file";

const removeDir = (dir: string): Promise<void> =>
  rm(dir, { recursive: true, force: true, maxRetries: 3 }).catch(() => undefined);

/**
 * Copies the user's cookies file into `<tmpDir>/cookies-<uuid>/cookies.txt` (dir 0700, file 0600) for one yt-dlp
 * run. yt-dlp always rewrites the file it gets and silently creates a missing one, so it only ever sees the copy,
 * and a missing or malformed original fails here. A UTF-8 BOM is dropped, since yt-dlp would refuse it.
 */
export const prepareCookies = async (settings: SourceSettings, tmpDir: string): Promise<Result<PreparedCookies>> => {
  if (!settings.cookies) return ok(NO_COOKIES);
  const name = cookiesOriginName(settings.cookies.origin);

  let content: string;
  try {
    content = (await readFile(settings.cookies.file, "utf8")).replace(/^﻿/, "");
  } catch (error) {
    return err(
      createError("COOKIES_FILE_INVALID", `The cookies file set by \`${name}\` cannot be read (${errnoOf(error)}).`),
    );
  }
  if (!NETSCAPE_HEADER.test(content.split(/\r?\n/, 1)[0] ?? "")) {
    return err(
      createError(
        "COOKIES_FILE_INVALID",
        `The cookies file set by \`${name}\` is not in Netscape format: its first line must be \`# Netscape HTTP Cookie File\`.`,
      ),
    );
  }

  const dir = path.join(tmpDir, `cookies-${randomUUID()}`);
  const copy = path.join(dir, "cookies.txt");
  try {
    await mkdir(dir, { recursive: true, mode: 0o700 });
    await writeFile(copy, content, { encoding: "utf8", mode: 0o600, flag: "wx" });
  } catch (error) {
    await removeDir(dir);
    return err(
      createError("STORAGE_IO_FAILED", `Cannot create the temporary cookies copy (${errnoOf(error)}).`, {
        hint: "Check that your user can create and write to ~/.pi-tube/tmp; pi-tube keeps temporary files there.",
      }),
    );
  }
  return ok({ args: ["--cookies", copy], cleanup: () => removeDir(dir) });
};
