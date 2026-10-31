import type { OutputArtifact } from "./contract.ts";

export interface JsonOutputArtifact {
  schema_version: string;
  generated_at: string;
  transcript_id: string | null;
  source: {
    kind: string;
    source_key: string | null;
    tier: string;
    platform: string | null;
    media_id: string | null;
    original_input: string;
    normalized_url: string | null;
    media_url: string | null;
    absolute_path: string | null;
    extension: string | null;
    title: string | null;
    published_at: string | null;
    description: string | null;
    description_links: string[];
    canonical_url: string | null;
    duration_seconds: number | null;
    live_status: string | null;
    chapters: Array<{ title: string; start_ms: number; end_ms: number }>;
  };
  transcription: {
    provider: string;
    model: string | null;
    requested_language: string | null;
    detected_language: string | null;
  };
  summary: {
    paragraph: string;
    key_points: string[];
  };
  transcript: {
    full_text: string;
    segments: Array<{ start_ms: number; end_ms: number; text: string; chapter: number | null }>;
  };
}

export function toJsonOutputArtifact(artifact: OutputArtifact): JsonOutputArtifact {
  return {
    schema_version: artifact.schema_version,
    generated_at: artifact.generated_at,
    transcript_id: artifact.transcript_id ?? null,
    source: {
      kind: artifact.source.kind,
      source_key: artifact.source.source_key ?? null,
      tier: artifact.source.tier,
      platform: artifact.source.platform ?? null,
      media_id: artifact.source.media_id ?? null,
      original_input: artifact.source.original_input,
      normalized_url: artifact.source.normalized_url ?? null,
      media_url: artifact.source.media_url ?? null,
      absolute_path: artifact.source.absolute_path ?? null,
      extension: artifact.source.extension ?? null,
      title: artifact.source.title ?? null,
      published_at: artifact.source.published_at ?? null,
      description: artifact.source.description ?? null,
      description_links: artifact.source.description_links ? [...artifact.source.description_links] : [],
      canonical_url: artifact.source.canonical_url ?? null,
      duration_seconds: artifact.source.duration_seconds ?? null,
      live_status: artifact.source.live_status ?? null,
      chapters: artifact.source.chapters ? artifact.source.chapters.map((chapter) => ({ ...chapter })) : [],
    },
    transcription: {
      provider: artifact.transcription.provider,
      model: artifact.transcription.model ?? null,
      requested_language: artifact.transcription.requested_language ?? null,
      detected_language: artifact.transcription.detected_language ?? null,
    },
    summary: {
      paragraph: artifact.summary.paragraph,
      key_points: [...artifact.summary.key_points],
    },
    transcript: {
      full_text: artifact.transcript.full_text,
      segments: (artifact.transcript.segments ?? []).map((segment) => ({
        start_ms: segment.start_ms,
        end_ms: segment.end_ms,
        text: segment.text,
        chapter: segment.chapter ?? null,
      })),
    },
  };
}

export function renderJson(artifact: OutputArtifact): string {
  return JSON.stringify(toJsonOutputArtifact(artifact), null, 2);
}
