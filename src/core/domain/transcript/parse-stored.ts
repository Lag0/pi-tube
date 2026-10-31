import { createError } from "../errors.ts";
import { err, ok, type Result } from "../result.ts";
import type { LiveStatus, SourceKind, SourceTier } from "../source.ts";
import type {
  OutputArtifact,
  OutputArtifactChapter,
  OutputArtifactSegment,
  OutputArtifactSource,
  OutputSchemaVersion,
} from "./contract.ts";

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);
const num = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;
/** Omits `undefined` values, so a parsed artifact equals the one that was rendered. */
const defined = <T extends object>(value: T): T =>
  Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as T;

const invalid = (message: string): Result<never> => err(createError("STORAGE_IO_FAILED", message));

const SCHEMA_VERSIONS: ReadonlySet<string> = new Set(["1.2.0", "1.3.0"]);

const chapterOf = (value: unknown): OutputArtifactChapter | undefined => {
  if (!isRecord(value)) return undefined;
  const title = text(value.title);
  const start = num(value.start_ms);
  const end = num(value.end_ms);
  return title === undefined || start === undefined || end === undefined
    ? undefined
    : { title, start_ms: start, end_ms: end };
};

const segmentOf = (value: unknown): OutputArtifactSegment | undefined => {
  if (!isRecord(value)) return undefined;
  const start = num(value.start_ms);
  const end = num(value.end_ms);
  const segmentText = text(value.text);
  if (start === undefined || end === undefined || segmentText === undefined) return undefined;
  return defined({ start_ms: start, end_ms: end, text: segmentText, chapter: num(value.chapter) });
};

const listOf = <T>(value: unknown, item: (entry: unknown) => T | undefined): T[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const items = value.map(item).filter((entry): entry is T => entry !== undefined);
  return items.length > 0 ? items : undefined;
};

const sourceOf = (value: Json): OutputArtifactSource =>
  defined({
    kind: text(value.kind) as SourceKind,
    source_key: text(value.source_key),
    tier: (text(value.tier) ?? "tested") as SourceTier,
    platform: text(value.platform),
    media_id: text(value.media_id),
    canonical_url: text(value.canonical_url),
    duration_seconds: num(value.duration_seconds),
    live_status: text(value.live_status) as LiveStatus | undefined,
    chapters: listOf(value.chapters, chapterOf),
    original_input: text(value.original_input) ?? "",
    normalized_url: text(value.normalized_url),
    media_url: text(value.media_url),
    absolute_path: text(value.absolute_path),
    extension: text(value.extension),
    title: text(value.title),
    published_at: text(value.published_at),
    description: text(value.description),
    description_links: listOf(value.description_links, text),
  });

/**
 * Reads a transcript the library saved (`renderJson` output, schema 1.2.0 or 1.3.0) back into an artifact;
 * `null` fields become absent ones. A file that is not such a transcript is `STORAGE_IO_FAILED`.
 */
export const parseStoredArtifact = (raw: string): Result<OutputArtifact> => {
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return invalid("Stored transcript is not valid JSON.");
  }
  if (!isRecord(payload)) return invalid("Stored transcript is not valid JSON.");
  const transcript = isRecord(payload.transcript) ? payload.transcript : {};
  const fullText = text(transcript.full_text);
  if (fullText === undefined) return invalid("Stored transcript is missing `transcript.full_text`.");
  const schemaVersion = text(payload.schema_version);
  if (schemaVersion === undefined || !SCHEMA_VERSIONS.has(schemaVersion)) {
    return invalid(`Stored transcript has an unsupported \`schema_version\` (${schemaVersion ?? "none"}).`);
  }
  const source = isRecord(payload.source) ? payload.source : {};
  const transcription = isRecord(payload.transcription) ? payload.transcription : {};
  const summary = isRecord(payload.summary) ? payload.summary : {};
  const keyPoints = Array.isArray(summary.key_points) ? summary.key_points.map((point) => String(point)) : [];
  const [a = "", b = "", c = "", d = "", e = ""] = keyPoints;

  return ok(
    defined({
      schema_version: schemaVersion as OutputSchemaVersion,
      generated_at: text(payload.generated_at) ?? "",
      transcript_id: text(payload.transcript_id),
      source: sourceOf(source),
      transcription: defined({
        provider: text(transcription.provider) ?? "unknown",
        model: text(transcription.model),
        requested_language: text(transcription.requested_language),
        detected_language: text(transcription.detected_language),
      }),
      summary: { paragraph: text(summary.paragraph) ?? "", key_points: [a, b, c, d, e] },
      transcript: defined({ full_text: fullText, segments: listOf(transcript.segments, segmentOf) }),
    }),
  );
};
