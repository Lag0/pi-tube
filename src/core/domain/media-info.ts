import type { MediaMetadata, ResolvedSource, SourceKind, SourceTier } from "./source.ts";
import { tierOf } from "./source-policy.ts";
import { toPersistedUrl, withoutCredentials } from "./transcript/build-artifact.ts";

/** What `info` reports about a source, with the same URL redaction as a saved transcript. */
export interface MediaInfo {
  readonly kind: SourceKind;
  readonly tier: SourceTier;
  /** Pages: the input URL without credentials; direct media: without credentials, query or fragment. */
  readonly url?: string;
  readonly path?: string;
  readonly sizeBytes?: number;
  readonly extension?: string;
  /** Pages only; `canonicalUrl` without credentials. */
  readonly metadata?: MediaMetadata;
}

/** Describes a resolved source for `info`; a live stream is described, never refused. */
export const describeSource = (source: ResolvedSource): MediaInfo => {
  const tier = tierOf(source.kind);
  switch (source.kind) {
    case "youtube":
    case "instagram":
    case "site": {
      const { canonicalUrl, ...metadata } = source.metadata;
      return {
        kind: source.kind,
        tier,
        url: withoutCredentials(source.normalizedUrl),
        metadata:
          canonicalUrl === undefined ? metadata : { ...metadata, canonicalUrl: withoutCredentials(canonicalUrl) },
      };
    }
    case "direct_url":
      return { kind: source.kind, tier, url: toPersistedUrl(source.normalizedUrl), extension: source.extension };
    case "local_file":
      return {
        kind: source.kind,
        tier,
        path: source.absolutePath,
        sizeBytes: source.sizeBytes,
        extension: source.extension,
      };
  }
};
