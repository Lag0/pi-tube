import {
  CliError,
  createInstagramAuthRequiredError,
  createInstagramExtractFailedError,
  createYtDlpMalformedOutputError,
  createYtDlpNotFoundError,
  createYouTubeExtractFailedError,
} from "../../errors/cli-errors.ts";

export interface YtDlpResult {
  mediaUrl: string;
  title?: string;
  publishedAt?: string;
  description?: string;
  descriptionLinks?: string[];
}

export interface YtDlpExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type YtDlpExecutor = (args: string[]) => Promise<YtDlpExecutionResult>;

const DEFAULT_YTDLP_TIMEOUT_MS = 120_000;
const YTDLP_TIMEOUT_ENV = "PI_TUBE_YTDLP_TIMEOUT_MS";

function resolveYtDlpTimeoutMs(env: Record<string, string | undefined> = process.env): number {
  const raw = env[YTDLP_TIMEOUT_ENV]?.trim();
  if (!raw) {
    return DEFAULT_YTDLP_TIMEOUT_MS;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_YTDLP_TIMEOUT_MS;
  }

  return parsed;
}

async function waitForExitWithTimeout(
  process: Bun.Subprocess<"pipe", "pipe", "inherit">,
  timeoutMs: number,
): Promise<{ timedOut: boolean; exitCode: number }> {
  return new Promise((resolve) => {
    let settled = false;

    const timeoutHandle = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      try {
        process.kill();
      } catch {
        // Best effort: command timeout should still unblock CLI execution.
      }
      resolve({ timedOut: true, exitCode: 124 });
    }, timeoutMs);

    process.exited.then((exitCode) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutHandle);
      resolve({ timedOut: false, exitCode });
    });
  });
}

async function defaultYtDlpExecutor(args: string[]): Promise<YtDlpExecutionResult> {
  let process: Bun.Subprocess<"pipe", "pipe", "inherit">;

  try {
    process = Bun.spawn({
      cmd: ["yt-dlp", ...args],
      stdout: "pipe",
      stderr: "pipe",
      stdin: "inherit",
      env: globalThis.process.env,
    });
  } catch (error) {
    if (error instanceof Error && /ENOENT|not found/i.test(error.message)) {
      throw createYtDlpNotFoundError();
    }

    throw createYouTubeExtractFailedError(error instanceof Error ? error.message : String(error));
  }

  const timeoutMs = resolveYtDlpTimeoutMs();
  const exitResult = await waitForExitWithTimeout(process, timeoutMs);
  if (exitResult.timedOut) {
    throw createYouTubeExtractFailedError(`yt-dlp timed out after ${timeoutMs}ms`);
  }

  const [stdout, stderr] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);

  return { exitCode: exitResult.exitCode, stdout, stderr };
}

interface ParsedFormatLike {
  url?: unknown;
  protocol?: unknown;
  ext?: unknown;
  vcodec?: unknown;
  acodec?: unknown;
  format_note?: unknown;
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeTimestamp(value: unknown): string | undefined {
  const seconds = typeof value === "number"
    ? value
    : typeof value === "string" && /^\d+$/.test(value.trim())
      ? Number.parseInt(value.trim(), 10)
      : undefined;

  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) {
    return undefined;
  }

  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return date.toISOString();
}

function normalizeUploadDate(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^\d{8}$/.test(value)) {
    return undefined;
  }

  const year = Number.parseInt(value.slice(0, 4), 10);
  const month = Number.parseInt(value.slice(4, 6), 10);
  const day = Number.parseInt(value.slice(6, 8), 10);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return undefined;
  }

  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function trimLinkCandidate(value: string): string {
  return value.replace(/[),.;:!?]+$/g, "");
}

function extractDescriptionLinks(description: string | undefined): string[] | undefined {
  if (!description) {
    return undefined;
  }

  const matches = description.match(/https?:\/\/[^\s<>"']+/g) ?? [];
  const seen = new Set<string>();
  const links: string[] = [];

  for (const match of matches) {
    const link = trimLinkCandidate(match);
    if (!link || seen.has(link)) {
      continue;
    }

    seen.add(link);
    links.push(link);
  }

  return links.length > 0 ? links : undefined;
}

function isLikelyImage(format: ParsedFormatLike): boolean {
  const ext = isString(format.ext) ? format.ext.toLowerCase() : "";
  const note = isString(format.format_note) ? format.format_note.toLowerCase() : "";
  return ext === "jpg" || ext === "jpeg" || ext === "png" || ext === "webp" || ext === "gif" || note.includes("storyboard");
}

function isSupportedProtocol(format: ParsedFormatLike): boolean {
  const protocol = isString(format.protocol) ? format.protocol.toLowerCase() : "";
  return protocol !== "mhtml";
}

function hasUsableMediaUrl(format: ParsedFormatLike): format is ParsedFormatLike & { url: string } {
  return isString(format.url) && isSupportedProtocol(format) && !isLikelyImage(format);
}

function isAudioOnly(format: ParsedFormatLike): boolean {
  const vcodec = isString(format.vcodec) ? format.vcodec.toLowerCase() : "";
  const acodec = isString(format.acodec) ? format.acodec.toLowerCase() : "";
  return vcodec === "none" && acodec !== "" && acodec !== "none";
}

function pickPreferredMediaUrl(parsed: Record<string, unknown>): string | undefined {
  if (isString(parsed.url)) {
    return parsed.url;
  }

  const requestedFormats = Array.isArray(parsed.requested_formats) ? (parsed.requested_formats as ParsedFormatLike[]) : [];
  const requestedCandidates = requestedFormats.filter(hasUsableMediaUrl);
  const requestedAudio = requestedCandidates.find(isAudioOnly);
  if (requestedAudio?.url) {
    return requestedAudio.url;
  }
  if (requestedCandidates[0]?.url) {
    return requestedCandidates[0].url;
  }

  const formats = Array.isArray(parsed.formats) ? (parsed.formats as ParsedFormatLike[]) : [];
  const formatCandidates = formats.filter(hasUsableMediaUrl);
  const formatAudio = formatCandidates.find(isAudioOnly);
  if (formatAudio?.url) {
    return formatAudio.url;
  }
  if (formatCandidates[0]?.url) {
    return formatCandidates[0].url;
  }

  return undefined;
}

function parseYtDlpOutput(stdout: string): YtDlpResult {
  let parsed: Record<string, unknown>;

  try {
    parsed = JSON.parse(stdout) as Record<string, unknown>;
  } catch {
    throw createYtDlpMalformedOutputError();
  }

  const mediaUrl = pickPreferredMediaUrl(parsed);

  if (!mediaUrl) {
    throw createYtDlpMalformedOutputError();
  }

  const title = typeof parsed.title === "string" ? parsed.title : undefined;
  const description = typeof parsed.description === "string" && parsed.description.trim().length > 0
    ? parsed.description
    : undefined;
  const publishedAt = normalizeTimestamp(parsed.timestamp) ?? normalizeUploadDate(parsed.upload_date);
  const descriptionLinks = extractDescriptionLinks(description);

  return { mediaUrl, title, publishedAt, description, descriptionLinks };
}

function isInstagramAuthRequiredFailure(detail: string): boolean {
  return /(login required|requires login|you need to log in|challenge_required|checkpoint_required|private content|not available due to login)/i.test(
    detail,
  );
}

export async function resolveYouTubeWithYtDlp(
  input: string,
  executor: YtDlpExecutor = defaultYtDlpExecutor,
): Promise<YtDlpResult> {
  const mockJson = process.env.PI_TUBE_TEST_YTDLP_JSON;
  if (mockJson) {
    return parseYtDlpOutput(mockJson);
  }

  const mockFailure = process.env.PI_TUBE_TEST_YTDLP_ERROR;
  if (mockFailure === "not_found") {
    throw createYtDlpNotFoundError();
  }
  if (mockFailure === "extract_failed") {
    throw createYouTubeExtractFailedError("mocked extraction failure");
  }

  let result: YtDlpExecutionResult;

  try {
    result = await executor([
      "--no-warnings",
      "--no-playlist",
      "--dump-single-json",
      "-f",
      "bestaudio[ext=m4a]/bestaudio/best",
      input,
    ]);
  } catch (error) {
    if (error instanceof CliError) {
      throw error;
    }

    throw createYouTubeExtractFailedError(error instanceof Error ? error.message : String(error));
  }

  if (result.exitCode !== 0) {
    if (/not found|command not found|enoent/i.test(result.stderr)) {
      throw createYtDlpNotFoundError();
    }

    const detail = result.stderr.trim() || `exit code ${result.exitCode}`;
    throw createYouTubeExtractFailedError(detail);
  }

  return parseYtDlpOutput(result.stdout);
}

export async function resolveInstagramWithYtDlp(
  input: string,
  executor: YtDlpExecutor = defaultYtDlpExecutor,
): Promise<YtDlpResult> {
  const mockJson = process.env.PI_TUBE_TEST_INSTAGRAM_YTDLP_JSON;
  if (mockJson) {
    return parseYtDlpOutput(mockJson);
  }

  const mockFailure = process.env.PI_TUBE_TEST_INSTAGRAM_YTDLP_ERROR;
  if (mockFailure === "not_found") {
    throw createYtDlpNotFoundError();
  }
  if (mockFailure === "auth_required") {
    throw createInstagramAuthRequiredError(input);
  }
  if (mockFailure === "extract_failed") {
    throw createInstagramExtractFailedError("mocked extraction failure");
  }

  let result: YtDlpExecutionResult;

  try {
    result = await executor(["--no-warnings", "--no-playlist", "--dump-single-json", input]);
  } catch (error) {
    if (error instanceof CliError) {
      throw error;
    }

    throw createInstagramExtractFailedError(error instanceof Error ? error.message : String(error));
  }

  if (result.exitCode !== 0) {
    if (/not found|command not found|enoent/i.test(result.stderr)) {
      throw createYtDlpNotFoundError();
    }

    const detail = [result.stderr.trim(), result.stdout.trim()].filter(Boolean).join(" ").trim() || `exit code ${result.exitCode}`;
    if (isInstagramAuthRequiredFailure(detail)) {
      throw createInstagramAuthRequiredError(input);
    }
    throw createInstagramExtractFailedError(detail);
  }

  return parseYtDlpOutput(result.stdout);
}
