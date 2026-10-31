import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createGetMediaInfo } from "../../../src/core/application/get-media-info.ts";
import { DEFAULT_CONFIG } from "../../../src/core/domain/config.ts";
import type { ResolvedSource } from "../../../src/core/domain/source.ts";
import { createMediaFetcher } from "../../../src/infrastructure/media/media-fetcher.ts";
import { createFakeMediaFetcher } from "../../helpers/fake-media.ts";
import { createInMemoryConfigStore } from "../../helpers/in-memory-config-store.ts";

let root: string;

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), "pi-tube-info-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const infoWith = (source: ResolvedSource) =>
  createGetMediaInfo({
    configStore: createInMemoryConfigStore(DEFAULT_CONFIG),
    env: {},
    media: createFakeMediaFetcher({ source }).fetcher,
  });

describe("getMediaInfo", () => {
  test("a page source loses URL credentials in url and canonicalUrl", async () => {
    const getInfo = infoWith({
      kind: "site",
      originalInput: "https://u:p@vimeo.com/1",
      normalizedUrl: "https://u:p@vimeo.com/1",
      metadata: { platform: "Vimeo", canonicalUrl: "https://u:p@vimeo.com/1", title: "V" },
    });

    const result = await getInfo({ input: "https://u:p@vimeo.com/1" });

    expect(result.success ? result.data : undefined).toEqual({
      kind: "site",
      tier: "best_effort",
      url: "https://vimeo.com/1",
      metadata: { platform: "Vimeo", canonicalUrl: "https://vimeo.com/1", title: "V" },
    });
  });

  test("a live stream in progress is described, not refused", async () => {
    const getInfo = infoWith({
      kind: "youtube",
      originalInput: "https://www.youtube.com/watch?v=live",
      normalizedUrl: "https://www.youtube.com/watch?v=live",
      metadata: { platform: "Youtube", liveStatus: "is_live" },
    });

    const result = await getInfo({ input: "https://www.youtube.com/watch?v=live" });

    expect(result.success ? result.data.metadata?.liveStatus : undefined).toBe("is_live");
  });

  test("a local file has its path, size and the tested tier", async () => {
    const file = path.join(root, "a.mp3");
    writeFileSync(file, "12345");
    const getInfo = createGetMediaInfo({
      configStore: createInMemoryConfigStore(DEFAULT_CONFIG),
      env: {},
      media: createMediaFetcher({ env: {}, cwd: root, tmpDir: path.join(root, "tmp") }),
    });

    const result = await getInfo({ input: "a.mp3" });

    expect(result.success ? result.data : undefined).toEqual({
      kind: "local_file",
      tier: "tested",
      path: file,
      sizeBytes: 5,
      extension: "mp3",
    });
  });
});
