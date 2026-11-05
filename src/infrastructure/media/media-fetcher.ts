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
import { MAX_LOCAL_FILE_BYTES_LIMIT, type SourceSettings } from "../../core/domain/source-settings.ts";
import type { MediaFetcher, ToolVersion } from "../../core/ports/media-fetcher.ts";
import { errnoOf } from "../errno.ts";
import { type ProcessRequest, type ProcessResult, runProcess } from "../process/run-process.ts";
import { checkCookies, prepareCookies } from "./cookies.ts";
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

/** `stat` follows symlinks, so the type and size checks apply to the file a link points to. */
const resolveLocalFile = async (
  input: string,
  cwd: string,
  settings: SourceSettings,
): Promise<Result<ResolvedSource>> => {
  const absolutePath = path.resolve(cwd, input);
  const stats = await stat(absolutePath).catch(() => undefined);
  if (!stats) return err(createError("LOCAL_FILE_NOT_FOUND", `Local file not found: \`${absolutePath}\`.`));
  if (!stats.isFile()) return err(createError("LOCAL_FILE_NOT_FOUND", `\`${absolutePath}\` is not a regular file.`));
  const extension = getLocalFileExtension(absolutePath);
  if (!extension) {
    return err(
      createError("LOCAL_FILE_UNSUPPORTED_EXTENSION", `Local file extension is not supported: \`${absolutePath}\`.`),
    );
  }
  if (stats.size > settings.maxLocalFileBytes) {
    return err(
      createError(
        "LOCAL_FILE_TOO_LARGE",
        `Local file \`${absolutePath}\` is ${stats.size} bytes; the limit is ${settings.maxLocalFileBytes} bytes.`,
      ),
    );
  }
  return ok({ kind: "local_file", originalInput: input, absolutePath, extension, sizeBytes: stats.size });
};

const VERSION_TIMEOUT_MS = 10_000;

/** The version a tool prints: yt-dlp's first line, ffmpeg's `ffmpeg version <v>`. */
const VERSION_OF: Readonly<Record<"yt-dlp" | "ffmpeg", (stdout: string) => string | undefined>> = {
  "yt-dlp": (stdout) => stdout.split(/\r?\n/)[0]?.trim() || undefined,
  ffmpeg: (stdout) => /^ffmpeg version (\S+)/.exec(stdout)?.[1],
};

/** `MediaFetcher` on yt-dlp, run through the hardened process runner. */
export const createMediaFetcher = (deps: MediaFetcherDeps): MediaFetcher => {
  const run = deps.run ?? runProcess;
  const lookupHost = deps.lookup ?? defaultLookup;

  // The only path to yt-dlp: every run passes the host guard, then gets a temporary copy of the user's cookies,
  // removed whatever the outcome.
  const ytDlp = async (
    args: readonly string[],
    purpose: YtDlpPurpose,
    url: string,
    defaultTimeoutMs: number,
    settings: SourceSettings,
    options: OperationOptions | undefined,
  ): Promise<Result<string>> => {
    const allowed = await checkHost(url, settings, lookupHost, purpose, {
      ...(options?.signal ? { signal: options.signal } : {}),
    });
    // checkHost returns CANCELLED for an aborted signal, so a cancelled operation never copies the cookies.
    if (!allowed.success) return allowed;
    const cookies = await prepareCookies(settings, deps.tmpDir);
    if (!cookies.success) return cookies;
    try {
      const timeoutMs = resolveYtDlpTimeoutMs(deps.env, defaultTimeoutMs);
      const result = await run({
        command: "yt-dlp",
        args: withUrl([...cookies.data.args, ...args], url),
        env: deps.env,
        timeoutMs,
        signal: options?.signal,
      });
      return interpretYtDlpRun(result, purpose, {
        url,
        timeoutMs,
        ...(settings.cookies ? { cookies: settings.cookies.origin } : {}),
      });
    } finally {
      await cookies.data.cleanup();
    }
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
          // metadata; the guards and the audio download then fail with the precise error. `--flat-playlist`: a
          // playlist or channel is listed, not extracted entry by entry, so it is refused at once.
          const stdout = await ytDlp(
            ["--dump-single-json", "--ignore-no-formats-error", "--flat-playlist"],
            METADATA_PURPOSE[classification],
            normalizedUrl,
            METADATA_TIMEOUT_MS,
            settings,
            options,
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
          return resolveLocalFile(input, deps.cwd, settings);
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
          // The provider upload reads the whole file into memory: the local file limit bounds page audio too.
          "--max-filesize",
          String(settings.maxLocalFileBytes),
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
      );
      const filePath = stdout.success ? parseDownloadedPath(stdout.data) : undefined;
      if (!filePath) {
        await removeDir(dir);
        // `--max-filesize` makes yt-dlp skip the file and still exit 0, with nothing printed.
        return stdout.success
          ? err(
              createError(
                "DOWNLOAD_FAILED",
                "Failed to download media via yt-dlp (no file was reported; the audio may be larger than local_files.max_bytes).",
                {
                  hint: `If the audio is larger than local_files.max_bytes, raise it with \`pi-tube config set local_files.max_bytes <bytes>\` (at most ${MAX_LOCAL_FILE_BYTES_LIMIT}); otherwise check that the page opens in a browser and retry.`,
                },
              ),
            )
          : stdout;
      }
      // yt-dlp cannot apply `--max-filesize` when the size is unknown in advance (fragmented streams).
      const size = (await stat(filePath).catch(() => undefined))?.size;
      if (size !== undefined && size > settings.maxLocalFileBytes) {
        await removeDir(dir);
        return err(
          createError(
            "LOCAL_FILE_TOO_LARGE",
            `The audio downloaded from the page is ${size} bytes; the limit is ${settings.maxLocalFileBytes} bytes (local_files.max_bytes).`,
          ),
        );
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
      );
      await removeDir(tempDir);
      if (!stdout.success) return stdout;
      const filePath = parseDownloadedPath(stdout.data);
      if (!filePath)
        return err(createError("DOWNLOAD_FAILED", "Failed to download media via yt-dlp (no file was reported)."));
      return ok({ path: filePath, uri: pathToFileURL(filePath).href });
    },

    inspect: async (settings, options) => {
      const version = async (command: "yt-dlp" | "ffmpeg", args: readonly string[]): Promise<Result<ToolVersion>> => {
        const result = await run({
          command,
          args,
          env: deps.env,
          timeoutMs: VERSION_TIMEOUT_MS,
          signal: options?.signal,
        });
        if (result.outcome === "aborted") return err(createError("CANCELLED", "Operation cancelled."));
        if (result.outcome === "not_found") return ok({ found: false });
        if (result.outcome === "spawn_failed") return ok({ found: true, cannotRun: result.stderr });
        const found =
          result.outcome === "exited" && result.exitCode === 0 ? VERSION_OF[command](result.stdout) : undefined;
        return ok(found === undefined ? { found: true } : { found: true, version: found });
      };
      const ytDlp = await version("yt-dlp", ["--version"]);
      if (!ytDlp.success) return ytDlp;
      const ffmpeg = await version("ffmpeg", ["-version"]);
      if (!ffmpeg.success) return ffmpeg;
      return ok({ ytDlp: ytDlp.data, ffmpeg: ffmpeg.data, cookies: await checkCookies(settings) });
    },
  };
};
