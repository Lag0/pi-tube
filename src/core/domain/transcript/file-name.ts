import type { OutputArtifact } from "./contract.ts";

/** Longest slug in a transcript file name; long titles used to hit ENAMETOOLONG after a paid transcription. */
export const MAX_SLUG_LENGTH = 80;

const FALLBACK_SLUG = "transcript";

const sanitizeLabel = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/, "");

/** File name without directory and extension, for both `/` and `\` separators. */
const stem = (filePath: string): string => {
  const base = filePath.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
};

const extractFilenameLabel = (source: OutputArtifact["source"]): string => {
  if (source.title && source.title.trim().length > 0) return source.title.trim();
  if (source.absolute_path && source.absolute_path.trim().length > 0) return stem(source.absolute_path);

  const urlCandidate = source.media_url ?? source.normalized_url ?? source.original_input;
  try {
    const parsed = new URL(urlCandidate);
    const base = stem(parsed.pathname);
    return base.length > 0 ? base : parsed.hostname;
  } catch {
    return source.kind;
  }
};

const formatDatePart = (now: Date): string =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

/** `YYYY-MM-DD-<slug>.<md|json>`, with the slug taken from the title, file name or URL and capped. */
export const transcriptFileName = (input: {
  readonly artifact: OutputArtifact;
  readonly now: Date;
  readonly format: "markdown" | "json";
}): string => {
  const slug = sanitizeLabel(extractFilenameLabel(input.artifact.source)) || FALLBACK_SLUG;
  return `${formatDatePart(input.now)}-${slug}.${input.format === "json" ? "json" : "md"}`;
};
