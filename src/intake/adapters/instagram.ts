import { CliError } from "../../errors/cli-errors.ts";
import { isInstagramPublicUrl, tryParseHttpUrl } from "../policy.ts";
import { resolveInstagramWithYtDlp } from "../tools/yt-dlp.ts";
import type { ResolvedSource } from "../types.ts";

interface InstagramAdapterDeps {
  resolveMedia?: typeof resolveInstagramWithYtDlp;
}

export async function resolveInstagramSource(
  input: string,
  deps: InstagramAdapterDeps = {},
): Promise<ResolvedSource> {
  const parsed = tryParseHttpUrl(input);
  const normalizedUrl = parsed?.toString() ?? input;

  if (!isInstagramPublicUrl(normalizedUrl)) {
    throw new CliError(`Input is not a supported Instagram public URL: \`${input}\`.`, {
      code: "INSTAGRAM_URL_INVALID",
      exitCode: 2,
      guidance: ["Use a public Instagram post/reel/video URL."],
    });
  }

  const resolveMedia = deps.resolveMedia ?? resolveInstagramWithYtDlp;
  const media = await resolveMedia(normalizedUrl);

  return {
    kind: "instagram",
    originalInput: input,
    normalizedUrl,
    mediaUrl: media.mediaUrl,
    title: media.title,
  };
}
