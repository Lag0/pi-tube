import {
  assertDirectMediaUrl,
  getDirectMediaExtension,
  normalizeDirectMediaUrl,
} from "../policy.ts";
import type { ResolvedSource } from "../types.ts";

export async function resolveDirectUrlSource(input: string): Promise<ResolvedSource> {
  assertDirectMediaUrl(input);
  const normalizedUrl = normalizeDirectMediaUrl(input);
  const extension = getDirectMediaExtension(normalizedUrl);

  return {
    kind: "direct_url",
    originalInput: input,
    normalizedUrl,
    mediaUrl: normalizedUrl,
    extension,
  };
}
