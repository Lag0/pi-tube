import type { ProviderId } from "../providers.ts";
import type { LiveStatus, SourceKind, SourceTier } from "../source.ts";

export const OUTPUT_SCHEMA_VERSION = "1.3.0" as const;

/** Schema versions a stored transcript may carry; 1.2.0 lacks the library fields. */
export type OutputSchemaVersion = typeof OUTPUT_SCHEMA_VERSION | "1.2.0";

export interface OutputArtifactChapter {
  title: string;
  start_ms: number;
  end_ms: number;
}

export interface OutputArtifactSource {
  kind: SourceKind;
  source_key?: string;
  tier: SourceTier;
  platform?: string;
  media_id?: string;
  canonical_url?: string;
  duration_seconds?: number;
  live_status?: LiveStatus;
  chapters?: OutputArtifactChapter[];
  original_input: string;
  normalized_url?: string;
  media_url?: string;
  absolute_path?: string;
  extension?: string;
  title?: string;
  published_at?: string;
  description?: string;
  description_links?: string[];
}

export interface OutputArtifactTranscription {
  provider: ProviderId;
  model?: string;
  requested_language?: string;
  detected_language?: string;
}

export interface OutputArtifactSummary {
  paragraph: string;
  key_points: [string, string, string, string, string];
}

export interface OutputArtifactSegment {
  start_ms: number;
  end_ms: number;
  text: string;
  /** Index into `source.chapters`; absent before the first chapter or when the source has none. */
  chapter?: number;
}

export interface OutputArtifactTranscript {
  full_text: string;
  segments?: OutputArtifactSegment[];
}

export interface OutputArtifact {
  schema_version: OutputSchemaVersion;
  generated_at: string;
  transcript_id?: string;
  source: OutputArtifactSource;
  transcription: OutputArtifactTranscription;
  summary: OutputArtifactSummary;
  transcript: OutputArtifactTranscript;
}
