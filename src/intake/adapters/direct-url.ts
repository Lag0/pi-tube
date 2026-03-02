import { assertDirectMediaUrl, getDirectMediaExtension } from "../policy.ts";
import type { ResolvedSource } from "../types.ts";

export async function resolveDirectUrlSource(input: string): Promise<ResolvedSource> {
  const normalizedUrl = assertDirectMediaUrl(input).toString();
  const extension = getDirectMediaExtension(normalizedUrl);

  return {
    kind: "direct_url",
    originalInput: input,
    normalizedUrl,
    mediaUrl: normalizedUrl,
    extension,
  };
}
