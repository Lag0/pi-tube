import { isYouTubeUrl, tryParseHttpUrl } from "../policy.ts";
import { resolveYouTubeWithYtDlp } from "../tools/yt-dlp.ts";
import type { ResolvedSource } from "../types.ts";

interface YouTubeAdapterDeps {
  resolveMedia?: typeof resolveYouTubeWithYtDlp;
}

export async function resolveYouTubeSource(input: string, deps: YouTubeAdapterDeps = {}): Promise<ResolvedSource> {
  const parsed = tryParseHttpUrl(input);
  const normalizedUrl = parsed?.toString() ?? input;

  if (!isYouTubeUrl(normalizedUrl)) {
    throw new Error("resolveYouTubeSource called with a non-YouTube URL");
  }

  const resolveMedia = deps.resolveMedia ?? resolveYouTubeWithYtDlp;
  const media = await resolveMedia(normalizedUrl);

  return {
    kind: "youtube",
    originalInput: input,
    normalizedUrl,
    mediaUrl: media.mediaUrl,
    title: media.title,
    publishedAt: media.publishedAt,
    description: media.description,
    descriptionLinks: media.descriptionLinks,
  };
}
