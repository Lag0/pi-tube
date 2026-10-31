import { randomUUID } from "node:crypto";
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { EnvironmentVariables } from "../../core/domain/config.ts";
import { createError } from "../../core/domain/errors.ts";
import type { OperationOptions } from "../../core/domain/operation.ts";
import { err, ok, type Result } from "../../core/domain/result.ts";
import type { ResolvedSource, SiteKind } from "../../core/domain/source.ts";
import {
  classifyInput,
  getLocalFileExtension,
  getMediaExtensionFromPathname,
  normalizeDirectMediaUrl,
  tryParseHttpUrl,
} from "../../core/domain/source-policy.ts";
import type { SourceSettings } from "../../core/domain/source-settings.ts";
import type { MediaFetcher } from "../../core/ports/media-fetcher.ts";
import { errnoOf } from "../errno.ts";
import { type ProcessRequest, type ProcessResult, runProcess } from "../process/run-process.ts";
import { checkHost, defaultLookup, type LookupHost } from "./host-guard.ts";
import {
  AUDIO_FORMAT_SELECTOR,
  DOWNLOAD_TEMPLATE,
  interpretYtDlpRun,
  MEDIA_TIMEOUT_MS,
  METADATA_TIMEOUT_MS,
  parseDownloadedPath,
  parseYtDlpInfo,
  resolveYtDlpTimeoutMs,
  withUrl,
  type YtDlpPurpose,
} from "./yt-dlp.ts";

export interface MediaFetcherDeps {
  readonly env: EnvironmentVariables;
  /** Base for relative local file paths. */
  readonly cwd: string;
  /** Parent of the per-run temp dirs that hold downloaded audio. */
  readonly tmpDir: string;
  readonly run?: (request: ProcessRequest) => Promise<ProcessResult>;
  /** Host resolution for the SSRF guard; tests pass a fake so no test resolves real DNS. */
  readonly lookup?: LookupHost;
}

const METADATA_PURPOSE: Readonly<Record<SiteKind, YtDlpPurpose>> = {
  youtube: "youtube_metadata",
  instagram: "instagram_metadata",
  site: "site_metadata",
};

// Best-effort: a temp dir that cannot be removed (a Windows antivirus lock) must not fail a finished operation.
const removeDir = (dir: string): Promise<void> =>
  rm(dir, { recursive: true, force: true, maxRetries: 3 }).catch(() => undefined);

const TEMP_DIR_HINT =
  "Check that your user can create and write to this directory; pi-tube keeps temporary audio there.";

/** Without `hint`, the catalog hint applies: it is about the output directory and `--output`. */
const makeDir = async (dir: string, hint?: string): Promise<Result<void>> => {
  try {
    await mkdir(dir, { recursive: true, mode: 0o700 });
    return ok(undefined);
  } catch (error) {
    return err(createError("STORAGE_IO_FAILED", `Cannot create directory \`${dir}\` (${errnoOf(error)}).`, { hint }));
  }
};

const resolveLocalFile = async (input: string, cwd: string): Promise<Result<ResolvedSource>> => {
  const absolutePath = path.resolve(cwd, input);
  const isFile = await stat(absolutePath).then(
    (stats) => stats.isFile(),
    () => false,
  );
  if (!isFile) return err(createError("LOCAL_FILE_NOT_FOUND", `Local file not found: \`${absolutePath}\`.`));
  const extension = getLocalFileExtension(absolutePath);
  if (!extension) {
    return err(
      createError("LOCAL_FILE_UNSUPPORTED_EXTENSION", `Local file extension is not supported: \`${absolutePath}\`.`),
    );
  }
  return ok({ kind: "local_file", originalInput: input, absolutePath, extension });
};

/** `MediaFetcher` on yt-dlp, run through the hardened process runner. */
export const createMediaFetcher = (deps: MediaFetcherDeps): MediaFetcher => {
  const run = deps.run ?? runProcess;
  const lookupHost = deps.lookup ?? defaultLookup;

  // The only path to yt-dlp: every run passes the host guard first.
  const ytDlp = async (
    args: readonly string[],
    purpose: YtDlpPurpose,
    url: string,
    defaultTimeoutMs: number,
    settings: SourceSettings,
    options: OperationOptions | undefined,
    isInstagram: boolean,
  ): Promise<Result<string>> => {
    const allowed = await checkHost(url, settings, lookupHost, purpose);
    if (!allowed.success) return allowed;
    const timeoutMs = resolveYtDlpTimeoutMs(deps.env, defaultTimeoutMs);
    const result = await run({
      command: "yt-dlp",
      args: withUrl(args, url),
      env: deps.env,
      timeoutMs,
      signal: options?.signal,
    });
    return interpretYtDlpRun(result, purpose, { url, timeoutMs, isInstagram });
  };

  return {
    resolve: async (rawInput, settings, options) => {
      const input = rawInput.trim();
      if (input.length === 0) return err(createError("INPUT_INVALID", "Input cannot be empty."));

      const classification = classifyInput(input);
      const url = tryParseHttpUrl(input);
      switch (classification) {
        case "youtube":
        case "instagram":
        case "site": {
          const normalizedUrl = url?.toString() ?? input;
          // `--ignore-no-formats-error`: an upcoming live, or a page whose formats need a login, still reports its
          // metadata; the guards and the audio download then fail with the precise error.
          const stdout = await ytDlp(
            ["--dump-single-json", "--ignore-no-formats-error"],
            METADATA_PURPOSE[classification],
            normalizedUrl,
            METADATA_TIMEOUT_MS,
            settings,
            options,
            classification === "instagram",
          );
          if (!stdout.success) return stdout;
          const metadata = parseYtDlpInfo(stdout.data, normalizedUrl);
          if (!metadata.success) return metadata;
          return ok({ kind: classification, originalInput: input, normalizedUrl, metadata: metadata.data });
        }
        case "direct_url": {
          if (!url) throw new Error("classifyInput returned direct_url for a non-URL input");
          const normalizedUrl = normalizeDirectMediaUrl(url);
          const extension = getMediaExtensionFromPathname(url.pathname) ?? "";
          return ok({ kind: "direct_url", originalInput: input, normalizedUrl, mediaUrl: normalizedUrl, extension });
        }
        case "local_file":
          return resolveLocalFile(input, deps.cwd);
      }
    },

    fetchAudio: async (source, settings, options) => {
      if (source.kind === "local_file")
        return ok({ audio: { kind: "file", path: source.absolutePath }, release: async () => {} });
      if (source.kind === "direct_url")
        return ok({ audio: { kind: "url", url: source.mediaUrl }, release: async () => {} });

      const dir = path.join(deps.tmpDir, randomUUID());
      const created = await makeDir(dir, TEMP_DIR_HINT);
      if (!created.success) return created;
      const stdout = await ytDlp(
        [
          "--no-progress",
          "-f",
          AUDIO_FORMAT_SELECTOR,
          "--print",
          "after_move:filepath",
          "-o",
          path.join(dir, "%(id)s.%(ext)s"),
        ],
        "download",
        source.normalizedUrl,
        MEDIA_TIMEOUT_MS,
        settings,
        options,
        source.kind === "instagram",
      );
      const filePath = stdout.success ? parseDownloadedPath(stdout.data) : undefined;
      if (!filePath) {
        await removeDir(dir);
        return stdout.success
          ? err(createError("DOWNLOAD_FAILED", "Failed to download media via yt-dlp (no file was reported)."))
          : stdout;
      }
      let released = false;
      const release = async (): Promise<void> => {
        if (released) return;
        released = true;
        await removeDir(dir);
      };
      return ok({ audio: { kind: "file", path: filePath }, release });
    },

    download: async (source, request, settings, options) => {
      const outputDir = path.resolve(deps.cwd, request.outputDir);
      const created = await makeDir(outputDir);
      if (!created.success) return created;
      // yt-dlp keeps .part and fragment files in the temp path, removed below, so a failed or cancelled run leaves
      // nothing in outputDir. The path sits inside outputDir: the final move stays a rename on the same filesystem.
      const tempDir = path.join(outputDir, `.pi-tube-tmp-${randomUUID()}`);
      const tempCreated = await makeDir(tempDir);
      if (!tempCreated.success) return tempCreated;
      const format =
        request.media === "audio"
          ? ["-f", "bestaudio/best", "-x", "--audio-format", "mp3"]
          : ["-f", "bestvideo*+bestaudio/best", "--merge-output-format", "mp4"];
      const stdout = await ytDlp(
        [
          "-P",
          `home:${outputDir}`,
          "-P",
          `temp:${tempDir}`,
          "-o",
          DOWNLOAD_TEMPLATE,
          "--print",
          "after_move:filepath",
          ...format,
        ],
        "download",
        source.normalizedUrl,
        MEDIA_TIMEOUT_MS,
        settings,
        options,
        source.kind === "instagram",
      );
      await removeDir(tempDir);
      if (!stdout.success) return stdout;
      const filePath = parseDownloadedPath(stdout.data);
      if (!filePath)
        return err(createError("DOWNLOAD_FAILED", "Failed to download media via yt-dlp (no file was reported)."));
      return ok({ path: filePath, uri: pathToFileURL(filePath).href });
    },
  };
};
