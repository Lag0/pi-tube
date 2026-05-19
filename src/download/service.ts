import { mkdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  CliError,
  createDownloadFailedError,
  createInstagramAuthRequiredError,
  createYtDlpNotFoundError,
} from "../errors/cli-errors.ts";
import { classifyInput } from "../intake/policy.ts";
import type {
  DownloadExecutionResult,
  DownloadMediaKind,
  DownloadOptions,
  DownloadResult,
  DownloadSourceKind,
} from "./types.ts";

const DEFAULT_OUTPUT_DIR = "downloads";
const DEFAULT_TEMPLATE = "%(title).200B [%(id)s].%(ext)s";
const DOWNLOAD_TIMEOUT_ENV = "PI_TUBE_YTDLP_TIMEOUT_MS";
const DEFAULT_DOWNLOAD_TIMEOUT_MS = 120_000;

function resolveTimeoutMs(env: Record<string, string | undefined>): number {
  const raw = env[DOWNLOAD_TIMEOUT_ENV]?.trim();
  if (!raw) return DEFAULT_DOWNLOAD_TIMEOUT_MS;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DOWNLOAD_TIMEOUT_MS;
}

async function waitForExitWithTimeout(
  process: Bun.Subprocess<"pipe", "pipe", "inherit">,
  timeoutMs: number,
): Promise<{ timedOut: boolean; exitCode: number }> {
  return new Promise((resolve) => {
    let settled = false;
    const timeoutHandle = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        process.kill();
      } catch {
        // Best effort timeout cleanup.
      }
      resolve({ timedOut: true, exitCode: 124 });
    }, timeoutMs);

    process.exited.then((exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      resolve({ timedOut: false, exitCode });
    });
  });
}

function createDefaultExecutor(env: Record<string, string | undefined>) {
  return async (args: string[]): Promise<DownloadExecutionResult> => {
    let child: Bun.Subprocess<"pipe", "pipe", "inherit">;
    try {
      child = Bun.spawn({
        cmd: ["yt-dlp", ...args],
        stdout: "pipe",
        stderr: "pipe",
        stdin: "inherit",
        env,
      });
    } catch (error) {
      if (error instanceof Error && /ENOENT|not found/i.test(error.message)) {
        throw createYtDlpNotFoundError();
      }
      throw createDownloadFailedError(error instanceof Error ? error.message : String(error));
    }

    const exitResult = await waitForExitWithTimeout(child, resolveTimeoutMs(env));
    if (exitResult.timedOut) {
      throw createDownloadFailedError(`yt-dlp download timed out after ${resolveTimeoutMs(env)}ms`);
    }

    const [stdout, stderr] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    return { exitCode: exitResult.exitCode, stdout, stderr };
  };
}

function resolveSourceKind(input: string): DownloadSourceKind {
  const classification = classifyInput(input);
  if (classification === "youtube" || classification === "instagram") {
    return classification;
  }

  throw createDownloadFailedError("download supports YouTube and Instagram URLs only");
}

function buildYtDlpArgs(input: string, media: DownloadMediaKind, outputDir: string): string[] {
  const base = [
    "--no-warnings",
    "--no-playlist",
    "-P",
    outputDir,
    "-o",
    DEFAULT_TEMPLATE,
    "--print",
    "after_move:filepath",
  ];

  if (media === "audio") {
    return [...base, "-f", "bestaudio/best", "-x", "--audio-format", "mp3", input];
  }

  return [...base, "-f", "bestvideo*+bestaudio/best", "--merge-output-format", "mp4", input];
}

function parseDownloadedPath(stdout: string): string | undefined {
  const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.at(-1);
}

function isInstagramAuthRequiredFailure(detail: string): boolean {
  return /(login required|requires login|you need to log in|challenge_required|checkpoint_required|private content|not available due to login)/i.test(detail);
}

function maybeMockDownload(env: Record<string, string | undefined>): DownloadExecutionResult | undefined {
  const outputPath = env.PI_TUBE_TEST_DOWNLOAD_FILE?.trim();
  if (outputPath) {
    return { exitCode: 0, stdout: `${outputPath}\n`, stderr: "" };
  }

  const error = env.PI_TUBE_TEST_DOWNLOAD_ERROR?.trim();
  if (error === "not_found") {
    throw createYtDlpNotFoundError();
  }
  if (error === "auth_required") {
    return { exitCode: 1, stdout: "", stderr: "login required" };
  }
  if (error === "failed") {
    return { exitCode: 1, stdout: "", stderr: "mocked download failure" };
  }

  return undefined;
}

export async function downloadMedia(input: string, options: DownloadOptions = {}): Promise<DownloadResult> {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const media = options.media ?? "video";
  const sourceKind = resolveSourceKind(input);
  const outputDir = path.resolve(cwd, options.outputDir ?? DEFAULT_OUTPUT_DIR);
  mkdirSync(outputDir, { recursive: true });

  const args = buildYtDlpArgs(input, media, outputDir);
  const executor = options.executor ?? createDefaultExecutor(env);
  let result: DownloadExecutionResult;

  try {
    result = maybeMockDownload(env) ?? await executor(args);
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw createDownloadFailedError(error instanceof Error ? error.message : String(error));
  }

  if (result.exitCode !== 0) {
    const detail = [result.stderr.trim(), result.stdout.trim()].filter(Boolean).join(" ").trim() || `exit code ${result.exitCode}`;
    if (sourceKind === "instagram" && isInstagramAuthRequiredFailure(detail)) {
      throw createInstagramAuthRequiredError(input);
    }
    if (/not found|command not found|enoent/i.test(detail)) {
      throw createYtDlpNotFoundError();
    }
    throw createDownloadFailedError(detail);
  }

  const outputPath = parseDownloadedPath(result.stdout);
  if (!outputPath) {
    throw createDownloadFailedError("yt-dlp did not report a downloaded filepath");
  }

  const absoluteOutputPath = path.resolve(cwd, outputPath);
  return {
    sourceKind,
    media,
    outputDir,
    outputPath: absoluteOutputPath,
    outputUri: pathToFileURL(absoluteOutputPath).toString(),
  };
}

export const downloadInternalsForTests = {
  buildYtDlpArgs,
  parseDownloadedPath,
};
