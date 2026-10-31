import type { OutputArtifact, OutputArtifactSource } from "./contract.ts";

/** The one URL or path that identifies the source in the frontmatter and in CLI JSON output. */
export function sourceReferenceOf(source: OutputArtifactSource): string {
  return source.media_url ?? source.absolute_path ?? source.normalized_url ?? source.original_input;
}

function encodeFrontmatterValue(value: string | undefined): string {
  return value ? JSON.stringify(value) : "null";
}

function buildFrontmatter(artifact: OutputArtifact): string {
  const sourceReference = sourceReferenceOf(artifact.source);

  const lines = [
    "---",
    `schema_version: ${encodeFrontmatterValue(artifact.schema_version)}`,
    `generated_at: ${encodeFrontmatterValue(artifact.generated_at)}`,
    `source_kind: ${encodeFrontmatterValue(artifact.source.kind)}`,
    `source_reference: ${encodeFrontmatterValue(sourceReference)}`,
    `provider: ${encodeFrontmatterValue(artifact.transcription.provider)}`,
    `requested_language: ${encodeFrontmatterValue(artifact.transcription.requested_language)}`,
    `detected_language: ${encodeFrontmatterValue(artifact.transcription.detected_language)}`,
    "---",
  ];

  return lines.join("\n");
}

function formatTimestamp(milliseconds: number): string {
  const normalized = Math.max(0, milliseconds);
  const hours = Math.floor(normalized / 3_600_000);
  const minutes = Math.floor((normalized % 3_600_000) / 60_000);
  const seconds = Math.floor((normalized % 60_000) / 1000);
  const ms = normalized % 1000;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
    2,
    "0",
  )}.${String(ms).padStart(3, "0")}`;
}

function buildSourceMetadataLines(artifact: OutputArtifact): string[] {
  const links = artifact.source.description_links ?? [];
  const chapters = artifact.source.chapters ?? [];
  const hasMetadata = Boolean(
    artifact.source.title ||
      artifact.source.platform ||
      artifact.source.published_at ||
      artifact.source.duration_seconds ||
      artifact.source.description ||
      links.length > 0 ||
      chapters.length > 0,
  );

  if (!hasMetadata) {
    return [];
  }

  const lines = ["", "## Source Metadata"];

  if (artifact.source.title) {
    lines.push(`- Title: ${artifact.source.title}`);
  }

  if (artifact.source.platform) {
    lines.push(`- Platform: ${artifact.source.platform}`);
  }

  if (artifact.source.published_at) {
    lines.push(`- Published at: ${artifact.source.published_at}`);
  }

  if (artifact.source.duration_seconds) {
    lines.push(`- Duration: ${formatTimestamp(artifact.source.duration_seconds * 1000)}`);
  }

  if (artifact.source.description) {
    lines.push("", "### Description", artifact.source.description);
  }

  if (links.length > 0) {
    lines.push("", "### Description Links", ...links.map((link) => `- ${link}`));
  }

  if (chapters.length > 0) {
    lines.push(
      "",
      "### Chapters",
      ...chapters.map((chapter) => `- [${formatTimestamp(chapter.start_ms)}] ${chapter.title}`),
    );
  }

  return lines;
}

/** One line per segment, with a `####` heading before the first segment of each chapter. */
function buildSegmentLines(artifact: OutputArtifact): string[] {
  const chapters = artifact.source.chapters ?? [];
  const lines: string[] = [];
  let currentChapter: number | undefined;
  for (const segment of artifact.transcript.segments ?? []) {
    if (segment.chapter !== undefined && segment.chapter !== currentChapter) {
      const chapter = chapters[segment.chapter];
      if (chapter) lines.push(`#### ${chapter.title}`);
    }
    currentChapter = segment.chapter;
    lines.push(`- [${formatTimestamp(segment.start_ms)} - ${formatTimestamp(segment.end_ms)}] ${segment.text}`);
  }
  return lines;
}

export function renderMarkdown(artifact: OutputArtifact): string {
  const includeTranscriptHeader = artifact.summary.key_points.some((point) => point.startsWith("Timestamp mode: on"));
  const segments = artifact.transcript.segments ?? [];
  const segmentLines =
    includeTranscriptHeader && segments.length > 0
      ? ["", "### Timestamped Segments", ...buildSegmentLines(artifact)]
      : [];
  const transcriptHeaderLines = includeTranscriptHeader ? ["", "## Transcript"] : [];

  const lines = [
    buildFrontmatter(artifact),
    ...buildSourceMetadataLines(artifact),
    "",
    "## Summary",
    artifact.summary.paragraph,
    "",
    "### Key Points",
    ...artifact.summary.key_points.map((point) => `- ${point}`),
    ...transcriptHeaderLines,
    ...segmentLines,
    "",
    "### Full Text",
    artifact.transcript.full_text,
  ];

  return lines.join("\n");
}
