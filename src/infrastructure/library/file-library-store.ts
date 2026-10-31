import { createHash, randomUUID } from "node:crypto";
import { constants, createReadStream } from "node:fs";
import { access, link, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createError, type PiTubeError } from "../../core/domain/errors.ts";
import { type SourceKey, siteSourceKey, type TranscriptKey, transcriptKeyText } from "../../core/domain/library.ts";
import { err, ok, type Result } from "../../core/domain/result.ts";
import { isSiteSource, type ResolvedSource } from "../../core/domain/source.ts";
import { tierOf } from "../../core/domain/source-policy.ts";
import { toPersistedUrl, withoutCredentials } from "../../core/domain/transcript/build-artifact.ts";
import type { OutputArtifact } from "../../core/domain/transcript/contract.ts";
import { parseStoredArtifact } from "../../core/domain/transcript/parse-stored.ts";
import { renderJson } from "../../core/domain/transcript/render-json.ts";
import { renderMarkdown } from "../../core/domain/transcript/render-markdown.ts";
import type { LibraryEntry, LibraryStore, StoredTranscript } from "../../core/ports/library-store.ts";
import { errnoOf } from "../errno.ts";

const MAX_FRESH_COPIES = 999;
const SOURCE_FILE = "source.json";
const TRANSCRIPT_ID = /^[0-9a-f]{20}(-\d+)?$/;
const HINT =
  "Check that your user can read and write the library directory, or set PI_TUBE_LIBRARY_DIR to another directory.";

const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

const ioError = (action: "read" | "write", target: string, error: unknown): PiTubeError =>
  createError("STORAGE_IO_FAILED", `Cannot ${action} \`${target}\` (${errnoOf(error)}).`, { hint: HINT });

/** The first 20 hex characters of the SHA-256 of `transcriptKeyText(key)`. */
export const transcriptIdOf = (key: TranscriptKey): string => sha256(transcriptKeyText(key)).slice(0, 20);

/**
 * `<slug of the key, at most 60 characters>-<first 10 hex of its SHA-256>`. The hash keeps apart ids that differ
 * only in case, which case-insensitive file systems (macOS and Windows by default) would merge.
 */
export const sourceDirName = (sourceKey: SourceKey): string => {
  const slug =
    sourceKey
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+/, "")
      .slice(0, 60)
      .replace(/-+$/, "") || "source";
  return `${slug}-${sha256(sourceKey).slice(0, 10)}`;
};

const hashFile = (file: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(file)
      .on("data", (chunk) => hash.update(chunk))
      .on("error", reject)
      .on("end", () => resolve(hash.digest("hex")));
  });

/** What source.json keeps about a source: no credentials, no signed query, no media URL. */
const describeForLibrary = (sourceKey: SourceKey, source: ResolvedSource): Record<string, unknown> => {
  const base = { schema_version: 1, source_key: sourceKey, kind: source.kind, tier: tierOf(source.kind) };
  if (source.kind === "local_file") return { ...base, absolute_path: source.absolutePath, extension: source.extension };
  if (source.kind === "direct_url") {
    return { ...base, normalized_url: toPersistedUrl(source.normalizedUrl), extension: source.extension };
  }
  const { metadata } = source;
  return {
    ...base,
    normalized_url: withoutCredentials(source.normalizedUrl),
    metadata: {
      platform: metadata.platform,
      media_id: metadata.mediaId,
      canonical_url: metadata.canonicalUrl === undefined ? undefined : withoutCredentials(metadata.canonicalUrl),
      title: metadata.title,
      published_at: metadata.publishedAt,
      description: metadata.description,
      description_links: metadata.descriptionLinks,
      duration_seconds: metadata.durationSeconds,
      live_status: metadata.liveStatus,
      chapters: metadata.chapters?.map((chapter) => ({
        title: chapter.title,
        start_ms: chapter.startMs,
        end_ms: chapter.endMs,
      })),
    },
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Library on files: `<libraryDir>/<source dir>/{source.json, <TranscriptId>.json, <TranscriptId>.md}`. */
export const createFileLibraryStore = (deps: {
  readonly libraryDir: string;
  readonly now?: () => Date;
}): LibraryStore => {
  const now = deps.now ?? (() => new Date());
  const dirOf = (sourceKey: SourceKey): string => path.join(deps.libraryDir, sourceDirName(sourceKey));

  const readTranscript = async (file: string): Promise<Result<StoredTranscript | undefined>> => {
    let text: string;
    try {
      text = await readFile(file, "utf8");
    } catch (error) {
      return errnoOf(error) === "ENOENT" ? ok(undefined) : err(ioError("read", file, error));
    }
    const artifact = parseStoredArtifact(text);
    if (!artifact.success) return artifact;
    const transcriptId = path.basename(file, ".json");
    return ok({
      transcriptId,
      sourceKey: artifact.data.source.source_key ?? "",
      paths: { json: file, markdown: path.join(path.dirname(file), `${transcriptId}.md`) },
      artifact: artifact.data,
    });
  };

  /** Merges the source description into source.json atomically (temp file + rename), keeping other fields. */
  const writeSourceFile = async (dir: string, sourceKey: SourceKey, source: ResolvedSource): Promise<Result<void>> => {
    const file = path.join(dir, SOURCE_FILE);
    let existing: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(await readFile(file, "utf8"));
      if (isRecord(parsed)) existing = parsed;
    } catch {
      // A missing or unreadable source.json is rewritten from the source.
    }
    const content = { ...existing, ...describeForLibrary(sourceKey, source), updated_at: now().toISOString() };
    const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(temp, `${JSON.stringify(content, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
      await rename(temp, file);
      return ok(undefined);
    } catch (error) {
      await rm(temp, { force: true }).catch(() => undefined);
      return err(ioError("write", file, error));
    }
  };

  /** Publishes `content` at `target` only if nothing is there: a complete temp file, hard-linked in place. */
  const publish = async (target: string, content: string): Promise<Result<boolean>> => {
    const temp = `${target}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(temp, content, { encoding: "utf8", mode: 0o600, flag: "wx" });
      await link(temp, target);
      return ok(true);
    } catch (error) {
      return errnoOf(error) === "EEXIST" ? ok(false) : err(ioError("write", target, error));
    } finally {
      await rm(temp, { force: true }).catch(() => undefined);
    }
  };

  const stamp = (artifact: OutputArtifact, transcriptId: string, sourceKey: SourceKey): OutputArtifact => ({
    ...artifact,
    transcript_id: transcriptId,
    source: { ...artifact.source, source_key: sourceKey },
  });

  return {
    prepare: async () => {
      try {
        await mkdir(deps.libraryDir, { recursive: true, mode: 0o700 });
        await access(deps.libraryDir, constants.W_OK);
        return ok(undefined);
      } catch (error) {
        return err(ioError("write", deps.libraryDir, error));
      }
    },

    sourceKeyOf: async (source) => {
      if (isSiteSource(source)) {
        const { platform, mediaId, canonicalUrl } = source.metadata;
        if (mediaId) return ok(siteSourceKey(platform, mediaId));
        return ok(`url:${sha256(withoutCredentials(canonicalUrl ?? source.normalizedUrl))}`);
      }
      if (source.kind === "direct_url") return ok(`url:${sha256(toPersistedUrl(source.normalizedUrl))}`);
      try {
        return ok(`file:${await hashFile(source.absolutePath)}`);
      } catch (error) {
        return err(ioError("read", source.absolutePath, error));
      }
    },

    find: async (key) => {
      const dir = dirOf(key.sourceKey);
      const exact = await readTranscript(path.join(dir, `${transcriptIdOf(key)}.json`));
      if (!exact.success || exact.data || key.language === undefined) return exact;
      const auto = await readTranscript(path.join(dir, `${transcriptIdOf({ ...key, language: undefined })}.json`));
      if (!auto.success) return auto;
      return ok(auto.data?.artifact.transcription.detected_language === key.language ? auto.data : undefined);
    },

    save: async ({ key, source, artifact, fresh = false }) => {
      const dir = dirOf(key.sourceKey);
      try {
        await mkdir(dir, { recursive: true, mode: 0o700 });
      } catch (error) {
        return err(ioError("write", dir, error));
      }
      const sourceWritten = await writeSourceFile(dir, key.sourceKey, source);
      if (!sourceWritten.success) return sourceWritten;

      const baseId = transcriptIdOf(key);
      for (let copy = 1; copy <= MAX_FRESH_COPIES; copy += 1) {
        const transcriptId = copy === 1 ? baseId : `${baseId}-${copy}`;
        const stamped = stamp(artifact, transcriptId, key.sourceKey);
        const jsonPath = path.join(dir, `${transcriptId}.json`);
        const claimed = await publish(jsonPath, renderJson(stamped));
        if (!claimed.success) return claimed;
        if (!claimed.data) {
          if (fresh) continue;
          const existing = await readTranscript(jsonPath);
          if (!existing.success) return existing;
          if (existing.data) return ok(existing.data);
          continue;
        }
        const markdownPath = path.join(dir, `${transcriptId}.md`);
        try {
          await writeFile(markdownPath, renderMarkdown(stamped), { encoding: "utf8", mode: 0o600 });
        } catch (error) {
          return err(ioError("write", markdownPath, error));
        }
        return ok({
          transcriptId,
          sourceKey: key.sourceKey,
          paths: { json: jsonPath, markdown: markdownPath },
          artifact: stamped,
        });
      }
      return err(ioError("write", path.join(dir, `${baseId}.json`), new Error("too many copies of this transcript")));
    },

    get: async (transcriptId) => {
      if (!TRANSCRIPT_ID.test(transcriptId)) return ok(undefined);
      let dirs: string[];
      try {
        dirs = await readdir(deps.libraryDir);
      } catch (error) {
        return errnoOf(error) === "ENOENT" ? ok(undefined) : err(ioError("read", deps.libraryDir, error));
      }
      for (const dir of dirs) {
        const found = await readTranscript(path.join(deps.libraryDir, dir, `${transcriptId}.json`));
        if (!found.success || found.data) return found;
      }
      return ok(undefined);
    },

    entries: async () => {
      let dirs: string[];
      try {
        dirs = await readdir(deps.libraryDir);
      } catch (error) {
        return errnoOf(error) === "ENOENT" ? ok([]) : err(ioError("read", deps.libraryDir, error));
      }
      const files = (
        await Promise.all(
          dirs.map(async (dir) => {
            const names = await readdir(path.join(deps.libraryDir, dir)).catch(() => [] as string[]);
            return names
              .filter((name) => name.endsWith(".json") && name !== SOURCE_FILE)
              .map((name) => path.join(deps.libraryDir, dir, name));
          }),
        )
      ).flat();
      const stored = await Promise.all(files.map((file) => readTranscript(file)));
      const entries = stored
        .map((result) => (result.success ? result.data : undefined))
        .filter((entry): entry is StoredTranscript => entry !== undefined)
        .map(toEntry)
        .sort((left, right) => right.generatedAt.localeCompare(left.generatedAt));
      return ok(entries);
    },
  };
};

const toEntry = ({ transcriptId, sourceKey, artifact }: StoredTranscript): LibraryEntry => {
  const { source, transcription } = artifact;
  const sourceName =
    source.absolute_path !== undefined
      ? path.basename(source.absolute_path)
      : (source.normalized_url ?? source.original_input);
  return {
    transcriptId,
    sourceKey,
    kind: source.kind,
    ...(source.title === undefined ? {} : { title: source.title }),
    ...(source.platform === undefined ? {} : { platform: source.platform }),
    sourceName,
    provider: transcription.provider,
    ...(transcription.model === undefined ? {} : { model: transcription.model }),
    ...(transcription.requested_language === undefined ? {} : { requestedLanguage: transcription.requested_language }),
    ...(transcription.detected_language === undefined ? {} : { detectedLanguage: transcription.detected_language }),
    generatedAt: artifact.generated_at,
    characters: artifact.transcript.full_text.length,
  };
};
