import { describe, expect, test } from "vitest";
import type { ResolvedSource } from "../../../../src/core/domain/source.ts";
import { buildOutputArtifact } from "../../../../src/core/domain/transcript/build-artifact.ts";
import { MAX_SLUG_LENGTH, markdownFileName } from "../../../../src/core/domain/transcript/file-name.ts";

const ID = "b5a4802866d93190c21f";

const artifactOf = (source: ResolvedSource, generatedAt = "2026-10-31T17:28:33.808Z") =>
  buildOutputArtifact({ source, provider: "groq", transcript: "x" }, { generatedAt });

const page = (title?: string): ResolvedSource => ({
  kind: "youtube",
  originalInput: "https://www.youtube.com/watch?v=jNQXAC9IVRw",
  normalizedUrl: "https://www.youtube.com/watch?v=jNQXAC9IVRw",
  metadata: { platform: "Youtube", ...(title ? { title } : {}) },
});

describe("markdownFileName", () => {
  test("is <date>-<title slug>-<first 8 of the id>.md", () => {
    expect(markdownFileName(artifactOf(page("Me at the zoo")), ID)).toBe("2026-10-31-me-at-the-zoo-b5a48028.md");
  });

  test("keeps the copy number of a --force transcript", () => {
    expect(markdownFileName(artifactOf(page("Me at the zoo")), `${ID}-2`)).toBe(
      "2026-10-31-me-at-the-zoo-b5a48028-2.md",
    );
  });

  test("uses the UTC date of generated_at, so it is the same on every machine", () => {
    expect(markdownFileName(artifactOf(page("Late"), "2026-10-31T23:59:59.000-03:00"), ID)).toBe(
      "2026-11-01-late-b5a48028.md",
    );
  });

  test("drops accents and caps the slug, without a trailing hyphen", () => {
    const name = markdownFileName(artifactOf(page(`Ação ${"a".repeat(200)} fim`)), ID);

    expect(name.startsWith("2026-10-31-acao-")).toBe(true);
    const slug = name.slice("2026-10-31-".length, -"-b5a48028.md".length);
    expect(slug.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
    expect(slug.endsWith("-")).toBe(false);
  });

  test("without a title, falls back to the local file name, then the URL", () => {
    const local: ResolvedSource = {
      kind: "local_file",
      originalInput: "Entrevista Final.mp3",
      absolutePath: "/media/Entrevista Final.mp3",
      extension: "mp3",
      sizeBytes: 1,
    };

    expect(markdownFileName(artifactOf(local), ID)).toBe("2026-10-31-entrevista-final-b5a48028.md");
    expect(markdownFileName(artifactOf(page()), ID)).toBe("2026-10-31-watch-b5a48028.md");
  });
});
