import type { OutputArtifact } from "./contract.ts";

export interface JsonOutputArtifact {
  schema_version: string;
  generated_at: string;
  source: {
    kind: string;
    original_input: string;
    normalized_url: string | null;
    media_url: string | null;
    absolute_path: string | null;
    extension: string | null;
    title: string | null;
  };
  transcription: {
    provider: string;
    requested_language: string | null;
    detected_language: string | null;
  };
  summary: {
    paragraph: string;
    key_points: string[];
  };
  transcript: {
    full_text: string;
    segments: Array<{ start_ms: number; end_ms: number; text: string }>;
  };
}

export function toJsonOutputArtifact(artifact: OutputArtifact): JsonOutputArtifact {
  return {
    schema_version: artifact.schema_version,
    generated_at: artifact.generated_at,
    source: {
      kind: artifact.source.kind,
      original_input: artifact.source.original_input,
      normalized_url: artifact.source.normalized_url ?? null,
      media_url: artifact.source.media_url ?? null,
      absolute_path: artifact.source.absolute_path ?? null,
      extension: artifact.source.extension ?? null,
      title: artifact.source.title ?? null,
    },
    transcription: {
      provider: artifact.transcription.provider,
      requested_language: artifact.transcription.requested_language ?? null,
      detected_language: artifact.transcription.detected_language ?? null,
    },
    summary: {
      paragraph: artifact.summary.paragraph,
      key_points: [...artifact.summary.key_points],
    },
    transcript: {
      full_text: artifact.transcript.full_text,
      segments: artifact.transcript.segments ? [...artifact.transcript.segments] : [],
    },
  };
}

export function renderJson(artifact: OutputArtifact): string {
  return JSON.stringify(toJsonOutputArtifact(artifact), null, 2);
}
