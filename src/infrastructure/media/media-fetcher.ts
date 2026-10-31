import { randomUUID } from "node:crypto";
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { EnvironmentVariables } from "../../core/domain/config.ts";
import { createError } from "../../core/domain/errors.ts";
import type { OperationOptions } from "../../core/domain/operation.ts";
import { err, ok, type Result } from "../../core/domain/result.ts";
import type { ResolvedSource } from "../../core/domain/source.ts";
import {
  classifyInput,
  getLocalFileExtension,
  getMediaExtensionFromPathname,
  normalizeDirectMediaUrl,
  tryParseHttpUrl,
} from "../../core/domain/source-policy.ts";
import type { MediaFetcher } from "../../core/ports/media-fetcher.ts";
import { type ProcessRequest, type ProcessResult, runProcess } from "../process/run-process.ts";
import {
  AUDIO_FORMAT_SELECTOR,
  DOWNLOAD_TEMPLATE,
  interpretYtDlpRun,
  MEDIA_TIMEOUT_MS,
  METADATA_TIMEOUT_MS,
  parseDownloadedPath,
  parseYtDlpOutput,
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
}

const errnoOf = (error: unknown): string =>
  error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : "unknown error";

// Best-effort: a temp dir that cannot be removed (a Windows antivirus lock) must not fail a finished operation.
const removeDir = (dir: string): Promise<void> =>
  rm(dir, { recursive: true, force: true, maxRetries: 3 }).catch(() => undefined);

const makeDir = async (dir: string): Promise<Result<void>> => {
  try {
    await mkdir(dir, { recursive: true, mode: 0o700 });
    return ok(undefined);
  } catch (error) {
    return err(createError("STORAGE_IO_FAILED", `Cannot create directory \`${dir}\` (${errnoOf(error)}).`));
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

  const ytDlp = async (
    args: readonly string[],
    purpose: YtDlpPurpose,
    url: string,
    defaultTimeoutMs: number,
    options: OperationOptions | undefined,
    isInstagram: boolean,
  ): Promise<Result<string>> => {
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
    resolve: async (rawInput, options) => {
      const input = rawInput.trim();
      if (input.length === 0) return err(createError("INPUT_INVALID", "Input cannot be empty."));

      const classification = classifyInput(input);
      const url = tryParseHttpUrl(input);
      switch (classification) {
        case "youtube":
        case "instagram": {
          const normalizedUrl = url?.toString() ?? input;
          const isYouTube = classification === "youtube";
          const stdout = await ytDlp(
            isYouTube ? ["--dump-single-json", "-f", AUDIO_FORMAT_SELECTOR] : ["--dump-single-json"],
            isYouTube ? "youtube_metadata" : "instagram_metadata",
            normalizedUrl,
            METADATA_TIMEOUT_MS,
            options,
            !isYouTube,
          );
          if (!stdout.success) return stdout;
          const media = parseYtDlpOutput(stdout.data, isYouTube);
          if (!media.success) return media;
          return ok(
            isYouTube
              ? { kind: "youtube", originalInput: input, normalizedUrl, ...media.data }
              : {
                  kind: "instagram",
                  originalInput: input,
                  normalizedUrl,
                  mediaUrl: media.data.mediaUrl,
                  title: media.data.title,
                },
          );
        }
        case "direct_url": {
          if (!url) throw new Error("classifyInput returned direct_url for a non-URL input");
          const normalizedUrl = normalizeDirectMediaUrl(url);
          const extension = getMediaExtensionFromPathname(url.pathname) ?? "";
          return ok({ kind: "direct_url", originalInput: input, normalizedUrl, mediaUrl: normalizedUrl, extension });
        }
        case "unsupported_url":
          return err(
            createError("UNSUPPORTED_URL_NOT_DIRECT_MEDIA", `Input URL is not a direct media URL: \`${input}\`.`),
          );
        case "local_file":
          return resolveLocalFile(input, deps.cwd);
      }
    },

    fetchAudio: async (source, options) => {
      if (source.kind === "local_file")
        return ok({ audio: { kind: "file", path: source.absolutePath }, release: async () => {} });
      if (source.kind === "direct_url")
        return ok({ audio: { kind: "url", url: source.mediaUrl }, release: async () => {} });

      const dir = path.join(deps.tmpDir, randomUUID());
      const created = await makeDir(dir);
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

    download: async (target, request, options) => {
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
        target.url,
        MEDIA_TIMEOUT_MS,
        options,
        target.kind === "instagram",
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
