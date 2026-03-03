import type { OutputArtifact } from "./contract.ts";

function encodeFrontmatterValue(value: string | undefined): string {
  return value ? JSON.stringify(value) : "null";
}

function buildFrontmatter(artifact: OutputArtifact): string {
  const sourceReference =
    artifact.source.media_url ??
    artifact.source.absolute_path ??
    artifact.source.normalized_url ??
    artifact.source.original_input;

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

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(
    seconds,
  ).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}

export function renderMarkdown(artifact: OutputArtifact): string {
  const includeTranscriptHeader = artifact.summary.key_points.some((point) =>
    point.startsWith("Timestamp mode: on"),
  );
  const segments = artifact.transcript.segments ?? [];
  const segmentLines =
    includeTranscriptHeader && segments.length > 0
      ? [
          "",
          "### Timestamped Segments",
          ...segments.map(
            (segment) =>
              `- [${formatTimestamp(segment.start_ms)} - ${formatTimestamp(segment.end_ms)}] ${segment.text}`,
          ),
        ]
      : [];
  const transcriptHeaderLines = includeTranscriptHeader ? ["", "## Transcript"] : [];

  const lines = [
    buildFrontmatter(artifact),
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
