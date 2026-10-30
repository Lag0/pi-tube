import { expect } from "vitest";
import type { ResolvedSource } from "../../src/core/domain/source.ts";

/** Asserts the resolved source kind and narrows the union so kind-specific fields type-check. */
export function expectSourceKind<K extends ResolvedSource["kind"]>(
  source: ResolvedSource,
  kind: K,
): asserts source is Extract<ResolvedSource, { kind: K }> {
  expect(source.kind).toBe(kind);
  if (source.kind !== kind) {
    throw new Error(`Expected source kind "${kind}", received "${source.kind}".`);
  }
}
