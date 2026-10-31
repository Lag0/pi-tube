import { createError, type PiTubeError } from "../../core/domain/errors.ts";
import type { ProviderId } from "../../core/domain/providers.ts";

/** HTTP status of an SDK error: `status` (Groq, Deepgram) or `statusCode` (ElevenLabs). */
export const extractStatus = (error: unknown): number | undefined => {
  if (typeof error !== "object" || error === null) return undefined;
  const status = "status" in error ? error.status : "statusCode" in error ? error.statusCode : undefined;
  return typeof status === "number" ? status : undefined;
};

/** A short, key-free description of an SDK error. */
export const extractDetail = (error: unknown): string | undefined => {
  if (error instanceof Error && error.message.trim().length > 0) return error.message.trim();
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
    return error.message.trim() || undefined;
  }
  return undefined;
};

/**
 * One mapping for every cloud provider: 401/403 auth, 429 rate limit, 408/5xx or no status unavailable,
 * any other status failed.
 */
export const mapProviderError = (provider: ProviderId, error: unknown): PiTubeError => {
  const status = extractStatus(error);
  const detail = extractDetail(error);
  const suffix = detail ? ` (${detail})` : "";
  if (status === 401 || status === 403) {
    return createError("PROVIDER_AUTH", `Transcription provider authentication failed for \`${provider}\`${suffix}.`);
  }
  if (status === 429) {
    return createError(
      "PROVIDER_RATE_LIMIT",
      `Transcription provider rate limit reached for \`${provider}\`${suffix}.`,
    );
  }
  if (status === undefined || status === 408 || status >= 500) {
    return createError("PROVIDER_UNAVAILABLE", `Transcription provider \`${provider}\` is unavailable${suffix}.`);
  }
  return createError("PROVIDER_FAILED", `Transcription failed for provider \`${provider}\` (HTTP ${status})${suffix}.`);
};

export const invalidResponseError = (provider: ProviderId): PiTubeError =>
  createError("PROVIDER_INVALID_RESPONSE", `Provider \`${provider}\` returned an invalid transcription response.`);
