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

export function renderMarkdown(artifact: OutputArtifact): string {
  const lines = [
    buildFrontmatter(artifact),
    "",
    "## Summary",
    artifact.summary.paragraph,
    "",
    "### Key Points",
    ...artifact.summary.key_points.map((point) => `- ${point}`),
    "",
    "## Transcript",
    "",
    "### Full Text",
    artifact.transcript.full_text,
  ];

  return lines.join("\n");
}
