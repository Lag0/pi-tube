import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import {
  createTranscriptionProviderFailedError,
  createYtDlpNotFoundError,
} from "../../errors/cli-errors.ts";
import type { ResolvedSource } from "../../intake/types.ts";
import type { TranscriptionProviderId } from "../types.ts";

export interface ProviderMediaInput {
  key: "url" | "file";
  value: string | Blob;
  cleanup?: () => void;
}

const AUDIO_FORMAT_SELECTOR = "bestaudio[ext=m4a]/bestaudio/best";
const DEFAULT_YTDLP_TIMEOUT_MS = 120_000;
const YTDLP_TIMEOUT_ENV = "PI_TUBE_YTDLP_TIMEOUT_MS";

function resolvePiTubeBaseDir(): string {
  const home = process.env.HOME?.trim();
  if (home) {
    return path.join(home, ".pi-tube");
  }

  return path.resolve(process.cwd(), ".pi-tube");
}

function shouldUseDownloadedMedia(source: ResolvedSource): boolean {
  return source.kind === "youtube" || source.kind === "instagram";
}

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

function parseDownloadedPath(stdout: string): string | undefined {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length > 0 ? lines[lines.length - 1] : undefined;
}

async function downloadMediaForTranscription(
  input: string,
  providerId: TranscriptionProviderId,
): Promise<string> {
  const mockedPath = process.env.PI_TUBE_TEST_YTDLP_DOWNLOAD_PATH?.trim();
  if (mockedPath) {
    return mockedPath;
  }

  const mockedFailure = process.env.PI_TUBE_TEST_YTDLP_DOWNLOAD_ERROR?.trim().toLowerCase();
  if (mockedFailure === "not_found") {
    throw createYtDlpNotFoundError();
  }
  if (mockedFailure === "failed") {
    throw createTranscriptionProviderFailedError(providerId, "yt-dlp media download failed: mocked failure");
  }

  const tempDir = path.join(resolvePiTubeBaseDir(), "tmp");
  mkdirSync(tempDir, { recursive: true });
  const outputTemplate = path.join(tempDir, `${crypto.randomUUID()}-%(id)s.%(ext)s`);

  let child: Bun.Subprocess<"pipe", "pipe", "inherit">;
  try {
    child = Bun.spawn({
      cmd: [
        "yt-dlp",
        "--no-warnings",
        "--no-playlist",
        "--no-progress",
        "-f",
        AUDIO_FORMAT_SELECTOR,
        "--print",
        "after_move:filepath",
        "-o",
        outputTemplate,
        input,
      ],
      stdout: "pipe",
      stderr: "pipe",
      stdin: "inherit",
      env: globalThis.process.env,
    });
  } catch (error) {
    if (error instanceof Error && /ENOENT|not found/i.test(error.message)) {
      throw createYtDlpNotFoundError();
    }
    throw createTranscriptionProviderFailedError(
      providerId,
      `yt-dlp media download failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const timeoutMs = resolveYtDlpTimeoutMs();
  const exitResult = await waitForExitWithTimeout(child, timeoutMs);
  if (exitResult.timedOut) {
    throw createTranscriptionProviderFailedError(providerId, `yt-dlp media download timed out after ${timeoutMs}ms`);
  }

  const [stdout, stderr] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);

  if (exitResult.exitCode !== 0) {
    if (/not found|command not found|enoent/i.test(stderr)) {
      throw createYtDlpNotFoundError();
    }

    const detail = stderr.trim() || stdout.trim() || `exit code ${exitResult.exitCode}`;
    throw createTranscriptionProviderFailedError(providerId, `yt-dlp media download failed: ${detail}`);
  }

  const downloadedPath = parseDownloadedPath(stdout);
  if (!downloadedPath) {
    throw createTranscriptionProviderFailedError(providerId, "yt-dlp media download failed: missing output filepath");
  }

  return downloadedPath;
}

export async function prepareProviderMediaInput(
  source: ResolvedSource,
  providerId: TranscriptionProviderId,
): Promise<ProviderMediaInput> {
  if (source.kind === "local_file") {
    return { key: "file", value: Bun.file(source.absolutePath) };
  }

  if (!shouldUseDownloadedMedia(source)) {
    return { key: "url", value: source.mediaUrl };
  }

  const downloadedPath = await downloadMediaForTranscription(source.originalInput, providerId);
  return {
    key: "file",
    value: Bun.file(downloadedPath),
    cleanup: () => {
      try {
        rmSync(downloadedPath, { force: true });
      } catch {
        // Cleanup best-effort: transcription result should not fail if temp file removal fails.
      }
    },
  };
}
