import path from "node:path";
import type { ResolvedSource } from "../types.ts";
import { getLocalFileExtension } from "../policy.ts";

export async function resolveLocalFileSource(input: string): Promise<ResolvedSource> {
  const absolutePath = path.resolve(input);
  const extension = getLocalFileExtension(absolutePath) ?? "unknown";

  return {
    kind: "local_file",
    originalInput: input,
    absolutePath,
    extension,
  };
}
