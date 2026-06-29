import type { ResolvedSource } from "../intake/types.ts";
import type { TranscriptionExecutionResult } from "../transcription/types.ts";
import type {
  OutputArtifact,
  OutputArtifactSegment,
  OutputArtifactSource,
} from "./contract.ts";
import { OUTPUT_SCHEMA_VERSION } from "./contract.ts";

interface SegmentLike {
  startMs: number;
  endMs: number;
  text: string;
}

const SEGMENT_COMPACTION_THRESHOLD = 400;
const SEGMENT_COMPACTION_TARGET_WORDS = 16;
const SEGMENT_COMPACTION_MIN_SENTENCE_WORDS = 8;
const SEGMENT_COMPACTION_MAX_GAP_MS = 1400;
const SEGMENT_COMPACTION_MAX_DURATION_MS = 18000;

export interface BuildOutputArtifactOptions {
  generatedAt?: string;
  includeTimestamps?: boolean;
}

function mapSource(source: ResolvedSource): OutputArtifactSource {
  switch (source.kind) {
    case "youtube":
      return {
        kind: source.kind,
        original_input: source.originalInput,
        normalized_url: source.normalizedUrl,
        media_url: source.mediaUrl,
        title: source.title,
        published_at: source.publishedAt,
        description: source.description,
        description_links: source.descriptionLinks,
      };
    case "instagram":
      return {
        kind: source.kind,
        original_input: source.originalInput,
        normalized_url: source.normalizedUrl,
        media_url: source.mediaUrl,
        title: source.title,
      };
    case "direct_url":
      return {
        kind: source.kind,
        original_input: source.originalInput,
        normalized_url: source.normalizedUrl,
        media_url: source.mediaUrl,
        extension: source.extension,
      };
    case "local_file":
      return {
        kind: source.kind,
        original_input: source.originalInput,
        absolute_path: source.absolutePath,
        extension: source.extension,
      };
  }
}

function mapSegments(segments: SegmentLike[] | undefined, includeTimestamps: boolean): OutputArtifactSegment[] | undefined {
  if (!includeTimestamps) {
    return undefined;
  }

  if (!segments || segments.length === 0) {
    return undefined;
  }

  const normalized = [...segments]
    .filter((segment) => segment.text.trim().length > 0 && segment.endMs >= segment.startMs)
    .sort((left, right) => {
      if (left.startMs !== right.startMs) {
        return left.startMs - right.startMs;
      }
      if (left.endMs !== right.endMs) {
        return left.endMs - right.endMs;
      }
      return left.text.localeCompare(right.text);
    })
    .map((segment) => ({
      startMs: segment.startMs,
      endMs: segment.endMs,
      text: segment.text.trim(),
    }));

  const compacted = normalized.length >= SEGMENT_COMPACTION_THRESHOLD
    ? compactDenseSegments(normalized)
    : normalized;

  return compacted.map((segment) => ({
    start_ms: segment.startMs,
    end_ms: segment.endMs,
    text: segment.text.trim(),
  }));
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function appendSegmentText(base: string, token: string): string {
  if (!base) {
    return token;
  }

  if (/^[,.;:!?)]/.test(token) || token.startsWith("'")) {
    return `${base}${token}`;
  }

  return `${base} ${token}`;
}

function compactDenseSegments(segments: SegmentLike[]): SegmentLike[] {
  const compacted: SegmentLike[] = [];
  let current: (SegmentLike & { wordCount: number; lastToken: string }) | null = null;

  for (const segment of segments) {
    const token = segment.text.trim();
    const tokenWordCount = countWords(token);

    if (!current) {
      current = {
        startMs: segment.startMs,
        endMs: segment.endMs,
        text: token,
        wordCount: tokenWordCount,
        lastToken: token,
      };
      continue;
    }

    const gapMs = segment.startMs - current.endMs;
    const projectedDurationMs = segment.endMs - current.startMs;
    const reachedWordTarget = current.wordCount >= SEGMENT_COMPACTION_TARGET_WORDS;
    const sentenceBoundary = /[.!?]$/.test(current.lastToken) && current.wordCount >= SEGMENT_COMPACTION_MIN_SENTENCE_WORDS;
    const shouldBreak =
      gapMs > SEGMENT_COMPACTION_MAX_GAP_MS ||
      projectedDurationMs > SEGMENT_COMPACTION_MAX_DURATION_MS ||
      reachedWordTarget ||
      sentenceBoundary;

    if (shouldBreak) {
      compacted.push({
        startMs: current.startMs,
        endMs: current.endMs,
        text: current.text,
      });
      current = {
        startMs: segment.startMs,
        endMs: segment.endMs,
        text: token,
        wordCount: tokenWordCount,
        lastToken: token,
      };
      continue;
    }

    current = {
      ...current,
      endMs: Math.max(current.endMs, segment.endMs),
      text: appendSegmentText(current.text, token),
      wordCount: current.wordCount + tokenWordCount,
      lastToken: token,
    };
  }

  if (current) {
    compacted.push({
      startMs: current.startMs,
      endMs: current.endMs,
      text: current.text,
    });
  }

  return compacted;
}

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

function buildExtractiveSummary(fullText: string): string {
  const normalized = fullText.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "No transcript text was produced.";
  }

  const sentences = splitSentences(normalized);
  if (sentences.length === 0) {
    return normalized.slice(0, 280);
  }

  const selected = sentences.slice(0, 2).join(" ");
  if (selected.length <= 320) {
    return selected;
  }

  return `${selected.slice(0, 317).trimEnd()}...`;
}

function summarize(
  result: TranscriptionExecutionResult,
  segmentCount: number,
  includeTimestamps: boolean,
) {
  const requestedLanguage = result.requestedLanguage ?? "auto";
  const detectedLanguage = result.detectedLanguage ?? "unknown";
  const paragraph = buildExtractiveSummary(result.transcript);
  const timestampPoint = includeTimestamps
    ? `Timestamp mode: on (${segmentCount} blocks)`
    : "Timestamp mode: off (use --timestamps)";

  return {
    paragraph,
    key_points: [
      `Source kind: ${result.source.kind}`,
      `Provider: ${result.provider}`,
      `Requested language: ${requestedLanguage}`,
      `Detected language: ${detectedLanguage}`,
      timestampPoint,
    ] as [string, string, string, string, string],
  };
}

export function buildOutputArtifact(
  result: TranscriptionExecutionResult,
  options: BuildOutputArtifactOptions = {},
): OutputArtifact {
  const includeTimestamps = options.includeTimestamps ?? false;
  const segments = mapSegments(
    (result as TranscriptionExecutionResult & { segments?: SegmentLike[] }).segments,
    includeTimestamps,
  );
  const segmentCount = segments?.length ?? 0;
  const summary = summarize(result, segmentCount, includeTimestamps);

  return {
    schema_version: OUTPUT_SCHEMA_VERSION,
    generated_at: options.generatedAt ?? new Date().toISOString(),
    source: mapSource(result.source),
    transcription: {
      provider: result.provider,
      requested_language: result.requestedLanguage,
      detected_language: result.detectedLanguage,
    },
    summary,
    transcript: {
      full_text: result.transcript,
      segments,
    },
  };
}
