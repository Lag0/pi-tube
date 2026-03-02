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
}

export interface YtDlpExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type YtDlpExecutor = (args: string[]) => Promise<YtDlpExecutionResult>;

async function defaultYtDlpExecutor(args: string[]): Promise<YtDlpExecutionResult> {
  let process: Bun.Subprocess<"pipe", "pipe", "inherit">;

  try {
    process = Bun.spawn({
      cmd: ["yt-dlp", ...args],
      stdout: "pipe",
      stderr: "pipe",
      stdin: "inherit",
    });
  } catch (error) {
    if (error instanceof Error && /ENOENT|not found/i.test(error.message)) {
      throw createYtDlpNotFoundError();
    }

    throw createYouTubeExtractFailedError(error instanceof Error ? error.message : String(error));
  }

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);

  return { exitCode, stdout, stderr };
}

function parseYtDlpOutput(stdout: string): YtDlpResult {
  let parsed: Record<string, unknown>;

  try {
    parsed = JSON.parse(stdout) as Record<string, unknown>;
  } catch {
    throw createYtDlpMalformedOutputError();
  }

  const mediaUrl =
    typeof parsed.url === "string"
      ? parsed.url
      : Array.isArray(parsed.formats)
        ? (parsed.formats.find(
            (item) => typeof item === "object" && item !== null && typeof (item as { url?: unknown }).url === "string",
          ) as { url: string } | undefined)?.url
        : undefined;

  if (!mediaUrl) {
    throw createYtDlpMalformedOutputError();
  }

  const title = typeof parsed.title === "string" ? parsed.title : undefined;
  return { mediaUrl, title };
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
    result = await executor(["--no-warnings", "--no-playlist", "--dump-single-json", input]);
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
