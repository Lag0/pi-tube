import type { ResolvedSource } from "../intake/types.ts";
import type { TranscriptionProviderId } from "../transcription/types.ts";

export const OUTPUT_SCHEMA_VERSION = "1.0.0" as const;

export interface OutputArtifactSource {
  kind: ResolvedSource["kind"];
  original_input: string;
  normalized_url?: string;
  media_url?: string;
  absolute_path?: string;
  extension?: string;
  title?: string;
}

export interface OutputArtifactTranscription {
  provider: TranscriptionProviderId;
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
}

export interface OutputArtifactTranscript {
  full_text: string;
  segments?: OutputArtifactSegment[];
}

export interface OutputArtifact {
  schema_version: typeof OUTPUT_SCHEMA_VERSION;
  generated_at: string;
  source: OutputArtifactSource;
  transcription: OutputArtifactTranscription;
  summary: OutputArtifactSummary;
  transcript: OutputArtifactTranscript;
}
