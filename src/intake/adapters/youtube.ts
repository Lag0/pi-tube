import { tryParseHttpUrl } from "../policy.ts";
import type { ResolvedSource } from "../types.ts";

export async function resolveYouTubeSource(input: string): Promise<ResolvedSource> {
  const parsed = tryParseHttpUrl(input);
  const normalizedUrl = parsed ? parsed.toString() : input;

  // Phase 01 boundary: deterministic placeholder until yt-dlp integration is added.
  return {
    kind: "youtube",
    originalInput: input,
    normalizedUrl,
    mediaUrl: normalizedUrl,
  };
}
