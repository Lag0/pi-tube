import { createError } from "../errors.ts";
import { err, ok, type Result } from "../result.ts";
import { isLiveStatus, SOURCE_KINDS } from "../source.ts";
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

/** Any 1.x: a newer minor only adds fields, which this version ignores. */
const SCHEMA_VERSION = /^1\.\d+\.\d+$/;

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

const listOf = <T>(value: unknown, item: (entry: unknown) => T | undefined): T[] | undefined | null => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return null;
  const items: T[] = [];
  for (const entry of value) {
    const parsed = item(entry);
    if (parsed === undefined) return null;
    items.push(parsed);
  }
  return items.length ? items : undefined;
};

const sourceOf = (value: unknown, version: string): OutputArtifactSource | undefined => {
  if (!isRecord(value) || typeof value.original_input !== "string") return undefined;
  const kind = SOURCE_KINDS.find((kind) => kind === value.kind);
  const tier = value.tier === undefined && Number(version.split(".")[1]) < 2 ? "tested" : value.tier;
  const live = value.live_status ?? undefined;
  const chapters = listOf(value.chapters, chapterOf);
  if (
    !kind ||
    (tier !== "tested" && tier !== "best_effort") ||
    (live !== undefined && !isLiveStatus(live)) ||
    chapters === null
  )
    return undefined;
  const links = Array.isArray(value.description_links)
    ? value.description_links.filter((link) => typeof link === "string")
    : [];
  return defined<OutputArtifactSource>({
    kind,
    source_key: text(value.source_key),
    tier,
    platform: text(value.platform),
    media_id: text(value.media_id),
    canonical_url: text(value.canonical_url),
    duration_seconds: num(value.duration_seconds),
    live_status: live,
    chapters,
    original_input: value.original_input,
    normalized_url: text(value.normalized_url),
    media_url: text(value.media_url),
    absolute_path: text(value.absolute_path),
    extension: text(value.extension),
    title: text(value.title),
    published_at: text(value.published_at),
    description: text(value.description),
    description_links: links.length ? links : undefined,
  });
};

/**
 * Reads a transcript the library saved (`renderJson` output, schema 1.x) back into an artifact;
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
  if (schemaVersion === undefined || !SCHEMA_VERSION.test(schemaVersion)) {
    return invalid(`Stored transcript has an unsupported \`schema_version\` (${schemaVersion ?? "none"}).`);
  }
  if (typeof payload.generated_at !== "string") return invalid("Stored transcript is missing `generated_at`.");
  const source = sourceOf(payload.source, schemaVersion);
  if (!source) return invalid("Stored transcript has an invalid `source`.");
  const transcription = payload.transcription;
  if (!isRecord(transcription) || typeof transcription.provider !== "string")
    return invalid("Stored transcript is missing `transcription.provider`.");
  const summary = payload.summary;
  if (!isRecord(summary) || typeof summary.paragraph !== "string")
    return invalid("Stored transcript is missing `summary.paragraph`.");
  const points = summary.key_points;
  if (!Array.isArray(points) || points.length !== 5 || !points.every((p) => typeof p === "string"))
    return invalid("Stored transcript has invalid `summary.key_points`.");
  const segments = listOf(transcript.segments, segmentOf);
  if (segments === null) return invalid("Stored transcript has invalid `transcript.segments`.");

  return ok(
    defined({
      schema_version: schemaVersion as OutputSchemaVersion,
      generated_at: payload.generated_at,
      transcript_id: text(payload.transcript_id),
      source,
      transcription: defined({
        provider: transcription.provider,
        model: text(transcription.model),
        requested_language: text(transcription.requested_language),
        detected_language: text(transcription.detected_language),
      }),
      summary: { paragraph: summary.paragraph, key_points: [points[0], points[1], points[2], points[3], points[4]] },
      transcript: defined({ full_text: fullText, segments }),
    }),
  );
};
