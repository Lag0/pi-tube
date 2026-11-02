import { createError } from "../errors.ts";
import { sourceKeyFromInput } from "../library.ts";
import type { ProviderId } from "../providers.ts";
import { err, ok, type Result } from "../result.ts";
import type { ResolvedSource } from "../source.ts";
import type { TranscriptionSegment } from "./types.ts";

/** The source kinds pi-tube v2 saved. */
export type V2SourceKind = "youtube" | "instagram" | "direct_url" | "local_file";

/** A transcript pi-tube v2 saved in `~/.pi-tube`, as JSON or Markdown. */
export interface V2Transcript {
  readonly generatedAt: string;
  readonly kind: V2SourceKind;
  readonly provider: ProviderId;
  readonly originalInput?: string;
  readonly normalizedUrl?: string;
  /** What v2's Markdown calls `source_reference`: the media URL, else the path, else the page URL. */
  readonly reference?: string;
  readonly absolutePath?: string;
  readonly requestedLanguage?: string;
  /** As the provider wrote it; v2 Groq wrote language names such as `Portuguese`. */
  readonly detectedLanguage?: string;
  readonly title?: string;
  readonly publishedAt?: string;
  readonly description?: string;
  readonly descriptionLinks: readonly string[];
  readonly fullText: string;
  readonly segments: readonly TranscriptionSegment[];
}

/** The source a v2 transcript is imported under; `keyFromSource` is false when it cannot be identified. */
export interface V2Source {
  readonly source: ResolvedSource;
  readonly keyFromSource: boolean;
}

/** What `pi-tube library import` found and did. Originals are never touched. */
export interface ImportSummary {
  /** True when the automatic import had already run, so nothing was read. */
  readonly ranBefore: boolean;
  readonly found: number;
  readonly imported: number;
  /** Already in the library under the same key. */
  readonly already: number;
  readonly skipped: readonly { readonly file: string; readonly reason: string }[];
}

/** The names v2 gave its files: `YYYY-MM-DD-<slug>.md|json`. */
export const V2_FILE_NAME = /^\d{4}-\d{2}-\d{2}-.+\.(md|json)$/;

/** The model each provider called in v2.2.1: the same as in v3, so an identified import is a cache hit. */
export const V2_MODELS: Readonly<Record<ProviderId, string>> = {
  deepgram: "nova-3",
  groq: "whisper-large-v3",
  elevenlabs: "scribe_v2",
};

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;
const num = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;
/** Omits `undefined` values, so optional fields are absent rather than `undefined`. */
const defined = <T extends object>(value: T): T =>
  Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as T;

const notV2 = (reason: string): Result<never> =>
  err(createError("STORAGE_IO_FAILED", `Not a pi-tube v2 transcript: ${reason}.`));

/** v2 wrote 1.0.x and, from 2.2.0, 1.1.x. */
const V2_SCHEMA = /^1\.[01]\.\d+$/;
const V2_KINDS: readonly V2SourceKind[] = ["youtube", "instagram", "direct_url", "local_file"];

interface V2Head {
  readonly schemaVersion?: string;
  readonly generatedAt?: string;
  readonly kind?: string;
  readonly provider?: string;
}

const checkHead = (head: V2Head): Result<Pick<V2Transcript, "generatedAt" | "kind" | "provider">> => {
  if (head.schemaVersion === undefined || !V2_SCHEMA.test(head.schemaVersion)) {
    return notV2(`schema ${head.schemaVersion ?? "(none)"} is not a v2 schema`);
  }
  if (head.generatedAt === undefined || Number.isNaN(Date.parse(head.generatedAt))) {
    return notV2("no generated_at date");
  }
  const kind = V2_KINDS.find((candidate) => candidate === head.kind);
  if (!kind) return notV2(`unknown source kind \`${head.kind ?? "(none)"}\``);
  if (head.provider === undefined || !Object.hasOwn(V2_MODELS, head.provider)) {
    return notV2(`unknown provider \`${head.provider ?? "(none)"}\``);
  }
  return ok({ generatedAt: head.generatedAt, kind, provider: head.provider });
};

const segmentOf = (value: unknown): TranscriptionSegment | undefined => {
  if (!isRecord(value)) return undefined;
  const startMs = num(value.start_ms);
  const endMs = num(value.end_ms);
  return startMs === undefined || endMs === undefined || typeof value.text !== "string"
    ? undefined
    : { startMs, endMs, text: value.text };
};

const parseJson = (raw: string): Result<V2Transcript> => {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return notV2("not valid JSON");
  }
  if (!isRecord(value)) return notV2("not a JSON object");
  const source = isRecord(value.source) ? value.source : {};
  const transcription = isRecord(value.transcription) ? value.transcription : {};
  const transcript = isRecord(value.transcript) ? value.transcript : {};
  const head = checkHead({
    schemaVersion: text(value.schema_version),
    generatedAt: text(value.generated_at),
    kind: text(source.kind),
    provider: text(transcription.provider),
  });
  if (!head.success) return head;
  if (typeof transcript.full_text !== "string") return notV2("no transcript.full_text");
  const mediaUrl = text(source.media_url);
  const absolutePath = text(source.absolute_path);
  const normalizedUrl = text(source.normalized_url);
  const originalInput = text(source.original_input);
  const rawSegments = Array.isArray(transcript.segments) ? transcript.segments : [];
  const links = Array.isArray(source.description_links) ? source.description_links : [];
  return ok(
    defined({
      ...head.data,
      originalInput,
      normalizedUrl,
      reference: mediaUrl ?? absolutePath ?? normalizedUrl ?? originalInput,
      absolutePath,
      requestedLanguage: text(transcription.requested_language),
      detectedLanguage: text(transcription.detected_language),
      title: text(source.title),
      publishedAt: text(source.published_at),
      description: text(source.description),
      descriptionLinks: links.filter((link): link is string => typeof link === "string"),
      fullText: transcript.full_text.trim(),
      segments: rawSegments.map(segmentOf).filter((segment) => segment !== undefined),
    }),
  );
};

const TIMESTAMP = String.raw`(\d{2}):(\d{2}):(\d{2})\.(\d{3})`;
const SEGMENT_LINE = new RegExp(`^- \\[${TIMESTAMP} - ${TIMESTAMP}\\] (.*)$`);

const msOf = (hours: string, minutes: string, seconds: string, millis: string): number =>
  ((Number(hours) * 60 + Number(minutes)) * 60 + Number(seconds)) * 1000 + Number(millis);

const frontmatterValue = (value: string): string | undefined => {
  try {
    const parsed: unknown = JSON.parse(value);
    return text(parsed);
  } catch {
    return undefined;
  }
};

/** The lines after `heading`, up to the first line `isEnd` accepts. */
const linesAfter = (lines: readonly string[], heading: string, isEnd: (line: string) => boolean): readonly string[] => {
  const start = lines.indexOf(heading);
  if (start < 0) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex(isEnd);
  return end < 0 ? rest : rest.slice(0, end);
};

const parseMarkdown = (raw: string): Result<V2Transcript> => {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const close = lines.indexOf("---", 1);
  if (lines[0] !== "---" || close < 0) return notV2("no frontmatter");
  const front = new Map<string, string | undefined>();
  for (const line of lines.slice(1, close)) {
    const separator = line.indexOf(": ");
    if (separator > 0) front.set(line.slice(0, separator), frontmatterValue(line.slice(separator + 2)));
  }
  const head = checkHead({
    schemaVersion: front.get("schema_version"),
    generatedAt: front.get("generated_at"),
    kind: front.get("source_kind"),
    provider: front.get("provider"),
  });
  if (!head.success) return head;

  const body = lines.slice(close + 1);
  // Full Text is searched after the Key Points, so a heading inside the page description cannot start it.
  const keyPoints = body.indexOf("### Key Points");
  const summaryEnd = Math.max(keyPoints, 0);
  const fullTextAt = body.indexOf("### Full Text", summaryEnd);
  if (fullTextAt < 0) return notV2("no `### Full Text` section");

  // Source Metadata comes before the Summary; a heading inside the transcript text is never read as metadata.
  const beforeSummary = keyPoints < 0 ? body : body.slice(0, keyPoints);
  const metadata = linesAfter(beforeSummary, "## Source Metadata", (line) => line === "## Summary");
  const fieldOf = (prefix: string): string | undefined =>
    text(
      metadata
        .find((line) => line.startsWith(prefix))
        ?.slice(prefix.length)
        .trim(),
    );
  const description = linesAfter(metadata, "### Description", (line) => line === "### Description Links")
    .join("\n")
    .trim();
  const links = linesAfter(metadata, "### Description Links", () => false)
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim());
  const segments: TranscriptionSegment[] = [];
  for (const line of body.slice(summaryEnd, fullTextAt)) {
    const match = SEGMENT_LINE.exec(line);
    if (!match) continue;
    const [, h1 = "", m1 = "", s1 = "", ms1 = "", h2 = "", m2 = "", s2 = "", ms2 = "", segmentText = ""] = match;
    segments.push({ startMs: msOf(h1, m1, s1, ms1), endMs: msOf(h2, m2, s2, ms2), text: segmentText });
  }
  const reference = front.get("source_reference");
  return ok(
    defined({
      ...head.data,
      reference,
      absolutePath: head.data.kind === "local_file" ? reference : undefined,
      requestedLanguage: front.get("requested_language"),
      detectedLanguage: front.get("detected_language"),
      title: fieldOf("- Title: "),
      publishedAt: fieldOf("- Published at: "),
      description: text(description),
      descriptionLinks: links,
      fullText: body
        .slice(fullTextAt + 1)
        .join("\n")
        .trim(),
      segments,
    }),
  );
};

/** Reads one v2 transcript file; the extension of `fileName` says which format. */
export const parseV2Transcript = (fileName: string, raw: string): Result<V2Transcript> =>
  fileName.toLowerCase().endsWith(".json") ? parseJson(raw) : parseMarkdown(raw);

const extensionOf = (location: string): string => {
  const name = location.split(/[\\/]/).pop() ?? "";
  const dot = name.lastIndexOf(".");
  return dot > 0 && dot < name.length - 1 ? name.slice(dot + 1).toLowerCase() : "bin";
};

const pathnameOf = (value: string): string => {
  try {
    return new URL(value).pathname;
  } catch {
    return value;
  }
};

/** Origin and path of a URL, without its query or fragment, where a signed CDN URL keeps its signature. */
const withoutQuery = (value: string | undefined): string => {
  if (value === undefined) return "";
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return "";
  }
};

/**
 * The source a v2 transcript is imported under. A page is keyed by its URL when v2 kept it (JSON); v2's Markdown
 * kept only the signed media URL, which is cut to origin and path and cannot key the page.
 */
export const v2SourceOf = (transcript: V2Transcript): V2Source => {
  if (transcript.kind === "youtube" || transcript.kind === "instagram") {
    const pageUrl = transcript.originalInput ?? transcript.normalizedUrl;
    const key = pageUrl === undefined ? undefined : sourceKeyFromInput(pageUrl);
    const metadata = defined({
      platform: transcript.kind === "youtube" ? "Youtube" : "Instagram",
      mediaId: key?.slice(key.indexOf(":") + 1),
      title: transcript.title,
      publishedAt: transcript.publishedAt,
      description: transcript.description,
      descriptionLinks: transcript.descriptionLinks.length > 0 ? transcript.descriptionLinks : undefined,
    });
    if (key !== undefined && pageUrl !== undefined) {
      const source = {
        kind: transcript.kind,
        originalInput: pageUrl,
        normalizedUrl: transcript.normalizedUrl ?? pageUrl,
        metadata,
      };
      return { source, keyFromSource: true };
    }
    const reference = withoutQuery(transcript.reference);
    return {
      source: { kind: transcript.kind, originalInput: reference, normalizedUrl: reference, metadata },
      keyFromSource: false,
    };
  }
  if (transcript.kind === "direct_url") {
    const url = transcript.normalizedUrl ?? transcript.reference ?? transcript.originalInput ?? "";
    const source = {
      kind: "direct_url" as const,
      originalInput: transcript.originalInput ?? url,
      normalizedUrl: url,
      mediaUrl: url,
      extension: extensionOf(pathnameOf(url)),
    };
    return { source, keyFromSource: true };
  }
  const absolutePath = transcript.absolutePath ?? transcript.reference ?? "";
  const source = {
    kind: "local_file" as const,
    originalInput: transcript.originalInput ?? absolutePath,
    absolutePath,
    extension: extensionOf(absolutePath),
    sizeBytes: 0,
  };
  return { source, keyFromSource: true };
};
