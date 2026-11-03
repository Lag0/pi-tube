import { createError } from "../errors.ts";
import { err, ok, type Result } from "../result.ts";
import type { OutputArtifact, OutputArtifactChapter, OutputArtifactSegment } from "./contract.ts";

/** Most characters one text page may hold: under the size an agent app takes inline. */
export const MAX_TEXT_PAGE_CHARS = 40_000;
/** Most segments one page may hold. */
export const MAX_SEGMENT_PAGE = 250;

/** How to read a saved transcript: a page of text or of segments, optionally by time range or chapter. */
export interface TranscriptReadRequest {
  readonly format: "text" | "segments";
  /** Characters (text) or segments (segments) to skip. */
  readonly offset: number;
  /** Characters (1..MAX_TEXT_PAGE_CHARS) or segments (1..MAX_SEGMENT_PAGE); ignored with `full`. */
  readonly limit: number;
  /** Keeps segments that overlap [fromMs, toMs). */
  readonly fromMs?: number;
  readonly toMs?: number;
  /** Keeps the segments of this chapter (index into the source's chapters). */
  readonly chapter?: number;
  /** Everything after `offset` (filtered) in one page, up to `maxFullChars` characters of text. */
  readonly full?: boolean;
}

/** One page of a transcript. */
export interface TranscriptPage {
  readonly format: "text" | "segments";
  readonly offset: number;
  /** Characters (text) or segments (segments) after the filters. */
  readonly total: number;
  readonly nextOffset?: number;
  /** True only when `full` stopped at `maxFullChars`. */
  readonly truncated: boolean;
  readonly text?: string;
  readonly segments?: readonly OutputArtifactSegment[];
  readonly chapters: readonly OutputArtifactChapter[];
}

const invalid = (message: string): Result<never> => err(createError("INPUT_INVALID", message));

const isWhole = (value: number | undefined, min: number): boolean =>
  value === undefined || (Number.isInteger(value) && value >= min);

const checkRequest = (request: TranscriptReadRequest): Result<void> => {
  if (!isWhole(request.offset, 0)) return invalid("`offset` must be a whole number of 0 or more.");
  if (!request.full) {
    const max = request.format === "text" ? MAX_TEXT_PAGE_CHARS : MAX_SEGMENT_PAGE;
    if (!Number.isInteger(request.limit) || request.limit < 1 || request.limit > max) {
      return invalid(`\`limit\` must be a whole number from 1 to ${max} for format ${request.format}.`);
    }
  }
  if (!isWhole(request.fromMs, 0)) return invalid("`from_ms` must be a whole number of 0 or more.");
  if (!isWhole(request.toMs, 0)) return invalid("`to_ms` must be a whole number of 0 or more.");
  if (request.fromMs !== undefined && request.toMs !== undefined && request.fromMs >= request.toMs) {
    return invalid("`from_ms` must be before `to_ms`.");
  }
  if (!isWhole(request.chapter, 0)) return invalid("`chapter` must be a whole number of 0 or more.");
  return ok(undefined);
};

const isFiltered = (request: TranscriptReadRequest): boolean =>
  request.fromMs !== undefined || request.toMs !== undefined || request.chapter !== undefined;

/** The segments a time range or chapter keeps; called only when the request filters. */
const filterSegments = (
  artifact: OutputArtifact,
  request: TranscriptReadRequest,
): Result<readonly OutputArtifactSegment[]> => {
  const segments = artifact.transcript.segments;
  if (segments === undefined || segments.length === 0) {
    return invalid("This transcript has no timed segments, so it cannot be filtered by time or chapter.");
  }
  const chapters = artifact.source.chapters ?? [];
  if (request.chapter !== undefined && request.chapter >= chapters.length) {
    const has = chapters.length === 0 ? "no chapters" : `${chapters.length} chapters (0 to ${chapters.length - 1})`;
    return invalid(`Chapter ${request.chapter} does not exist; this transcript has ${has}.`);
  }
  const { fromMs, toMs, chapter } = request;
  return ok(
    segments.filter(
      (segment) =>
        (fromMs === undefined || segment.end_ms > fromMs) &&
        (toMs === undefined || segment.start_ms < toMs) &&
        (chapter === undefined || segment.chapter === chapter),
    ),
  );
};

const nextOf = (end: number, total: number): { readonly nextOffset?: number } =>
  end < total ? { nextOffset: end } : {};

/**
 * One page of `artifact`: text sliced by UTF-16 unit, so pages concatenate to the original, or whole segments.
 * A time range or chapter keeps the segments it covers; their text is joined by spaces. `full` returns the rest in
 * one page, cut at `maxFullChars` characters (`truncated`, with `nextOffset`); a segment page always holds at least
 * one segment, so paging advances.
 */
export const pageTranscript = (
  artifact: OutputArtifact,
  request: TranscriptReadRequest,
  maxFullChars: number,
): Result<TranscriptPage> => {
  const checked = checkRequest(request);
  if (!checked.success) return checked;
  const filtered = isFiltered(request);
  const kept = filtered ? filterSegments(artifact, request) : ok(artifact.transcript.segments ?? []);
  if (!kept.success) return kept;
  const chapters = artifact.source.chapters ?? [];
  const { offset } = request;

  if (request.format === "segments") {
    if (!filtered && kept.data.length === 0) {
      return invalid("This transcript has no timed segments; read it with format text.");
    }
    const all = kept.data;
    let end = Math.min(offset + request.limit, all.length);
    let truncated = false;
    if (request.full) {
      let characters = 0;
      end = offset;
      while (end < all.length) {
        const length = all[end]?.text.length ?? 0;
        if (end > offset && characters + length > maxFullChars) break;
        characters += length;
        end += 1;
      }
      truncated = end < all.length;
    }
    const page = all.slice(offset, Math.max(offset, end));
    return ok({
      format: "segments",
      offset,
      total: all.length,
      ...nextOf(offset + page.length, all.length),
      truncated,
      segments: page,
      chapters,
    });
  }

  const text = filtered ? kept.data.map((segment) => segment.text).join(" ") : artifact.transcript.full_text;
  const size = request.full ? maxFullChars : request.limit;
  const page = text.slice(offset, offset + size);
  const end = offset + page.length;
  return ok({
    format: "text",
    offset,
    total: text.length,
    ...nextOf(end, text.length),
    truncated: request.full === true && end < text.length,
    text: page,
    chapters,
  });
};
