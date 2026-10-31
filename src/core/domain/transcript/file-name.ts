import type { OutputArtifact } from "./contract.ts";

/** Longest slug in a Markdown file name; long titles used to hit ENAMETOOLONG after a paid transcription. */
export const MAX_SLUG_LENGTH = 80;

const FALLBACK_SLUG = "transcript";
const SHORT_ID_LENGTH = 8;

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

const labelOf = (source: OutputArtifact["source"]): string => {
  if (source.title && source.title.trim().length > 0) return source.title.trim();
  if (source.absolute_path && source.absolute_path.trim().length > 0) return stem(source.absolute_path);
  try {
    const parsed = new URL(source.normalized_url ?? source.original_input);
    const base = stem(parsed.pathname);
    return base.length > 0 ? base : parsed.hostname;
  } catch {
    return source.kind;
  }
};

/**
 * The Markdown file of a library transcript: `<YYYY-MM-DD>-<title slug>-<first 8 of the id>[-<n>].md`, readable in a
 * file browser. The date is the UTC date of `generated_at`, so the name is derived from the saved JSON alone and is
 * the same on every machine. `<n>` is the copy number of a `--force` transcript.
 */
export const markdownFileName = (artifact: OutputArtifact, transcriptId: string): string => {
  const date = new Date(artifact.generated_at);
  const day = Number.isNaN(date.getTime()) ? "0000-00-00" : date.toISOString().slice(0, 10);
  const slug = sanitizeLabel(labelOf(artifact.source)) || FALLBACK_SLUG;
  const [hash = "", copy] = transcriptId.split("-");
  const id = `${hash.slice(0, SHORT_ID_LENGTH)}${copy === undefined ? "" : `-${copy}`}`;
  return `${day}-${slug}-${id}.md`;
};
