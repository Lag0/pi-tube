import { readFile } from "node:fs/promises";
import path from "node:path";
import { createError, type PiTubeError } from "../../core/domain/errors.ts";
import type { OperationOptions } from "../../core/domain/operation.ts";
import type { ProviderId } from "../../core/domain/providers.ts";
import { err, ok, type Result } from "../../core/domain/result.ts";
import type { AudioInput } from "../../core/domain/source.ts";
import type { TranscriptionSegment } from "../../core/domain/transcript/types.ts";
import type { SttRequest, SttTranscript } from "../../core/ports/stt-provider.ts";
import { errnoOf } from "../errno.ts";
import { mapProviderError } from "./http-errors.ts";

/** Per-request limit for a cloud transcription call. */
export const PROVIDER_REQUEST_TIMEOUT_MS = 600_000;

export type DeadlineOutcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: "aborted" | "timed_out" | "failed"; readonly error?: unknown };

/**
 * Runs `work` with a signal that fires on the caller's abort or on the timeout, and stops waiting when it
 * fires even if `work` ignores the signal (the Deepgram SDK 4.x request then finishes in the background).
 */
export const withDeadline = <T>(
  work: (signal: AbortSignal) => Promise<T>,
  options: { readonly signal?: AbortSignal; readonly timeoutMs: number },
): Promise<DeadlineOutcome<T>> => {
  if (options.signal?.aborted) return Promise.resolve({ ok: false, reason: "aborted" });
  const timeout = AbortSignal.timeout(options.timeoutMs);
  const combined = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  const stoppedReason = (): "aborted" | "timed_out" => (options.signal?.aborted ? "aborted" : "timed_out");

  const stopped = new Promise<DeadlineOutcome<T>>((resolve) => {
    combined.addEventListener("abort", () => resolve({ ok: false, reason: stoppedReason() }), { once: true });
  });
  const finished = work(combined).then(
    (value): DeadlineOutcome<T> => ({ ok: true, value }),
    (error: unknown): DeadlineOutcome<T> => ({
      ok: false,
      reason: combined.aborted ? stoppedReason() : "failed",
      error,
    }),
  );
  return Promise.race([finished, stopped]);
};

/** Turns a failed deadline outcome into the error the caller reports. */
export const deadlineError = (
  provider: ProviderId,
  outcome: Extract<DeadlineOutcome<unknown>, { ok: false }>,
  timeoutMs: number,
): PiTubeError => {
  if (outcome.reason === "aborted") return createError("CANCELLED", "Operation cancelled.");
  if (outcome.reason === "timed_out") {
    return createError(
      "PROVIDER_UNAVAILABLE",
      `Transcription provider \`${provider}\` timed out after ${Math.round(timeoutMs / 1000)}s.`,
    );
  }
  return mapProviderError(provider, outcome.error);
};

/** Capabilities shared by the three cloud providers; file size limits are not verified, so none is declared. */
export const CLOUD_STT_CAPABILITIES = {
  timestamps: true,
  languageDetection: true,
  requiresLanguage: false,
  offline: false,
} as const;

/** Transcript fields as the legacy parsers return them. */
export interface ParsedTranscript {
  readonly transcript: string;
  readonly detectedLanguage?: string;
  readonly segments?: TranscriptionSegment[];
}

/** Audio ready for an SDK: a URL, or the bytes of a local file with its name. */
export type LoadedAudio =
  | { readonly kind: "url"; readonly url: string }
  | { readonly kind: "file"; readonly bytes: Buffer; readonly name: string };

/** The error for an audio file that cannot be read: missing, over the 2 GiB `readFile` limit, or anything else. */
export const audioReadError = (audioPath: string, error: unknown): PiTubeError => {
  const code = errnoOf(error);
  if (code === "ENOENT") return createError("LOCAL_FILE_NOT_FOUND", `Cannot read audio file \`${audioPath}\`.`);
  if (code === "ERR_FS_FILE_TOO_LARGE") {
    return createError(
      "LOCAL_FILE_TOO_LARGE",
      `Audio file \`${audioPath}\` is larger than 2 GiB, the most pi-tube can read in one request.`,
      { hint: "Use a shorter recording." },
    );
  }
  return createError("STORAGE_IO_FAILED", `Cannot read audio file \`${audioPath}\` (${code}).`, {
    hint: "Check that your user can read the file.",
  });
};

// The whole file is read into memory: the local file limit (`local_files.max_bytes`) bounds it.
const loadAudio = async (audio: AudioInput): Promise<Result<LoadedAudio>> => {
  if (audio.kind === "url") return ok(audio);
  try {
    return ok({ kind: "file", bytes: await readFile(audio.path), name: path.basename(audio.path) });
  } catch (error) {
    return err(audioReadError(audio.path, error));
  }
};

/**
 * The flow every cloud provider shares: cancellation check, audio loading, the SDK call under a deadline,
 * then `interpret` turning the SDK response into a transcript or an error.
 */
export const runProviderCall = async <T>(input: {
  readonly provider: ProviderId;
  readonly request: SttRequest;
  readonly options?: OperationOptions;
  readonly timeoutMs: number;
  readonly call: (audio: LoadedAudio, signal: AbortSignal) => Promise<T>;
  readonly interpret: (response: T) => Result<ParsedTranscript>;
}): Promise<Result<SttTranscript>> => {
  if (input.options?.signal?.aborted) return err(createError("CANCELLED", "Operation cancelled."));
  const audio = await loadAudio(input.request.audio);
  if (!audio.success) return audio;

  const outcome = await withDeadline((signal) => input.call(audio.data, signal), {
    signal: input.options?.signal,
    timeoutMs: input.timeoutMs,
  });
  if (!outcome.ok) return err(deadlineError(input.provider, outcome, input.timeoutMs));
  const parsed = input.interpret(outcome.value);
  if (!parsed.success) return parsed;
  return ok({
    text: parsed.data.transcript,
    ...(parsed.data.detectedLanguage ? { detectedLanguage: parsed.data.detectedLanguage } : {}),
    segments: parsed.data.segments ?? [],
  });
};
