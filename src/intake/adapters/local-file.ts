import { existsSync, statSync } from "node:fs";
import path from "node:path";
import {
  createLocalFileNotFoundError,
  createUnsupportedLocalFileExtensionError,
} from "../../errors/cli-errors.ts";
import type { ResolvedSource } from "../types.ts";
import { getLocalFileExtension } from "../policy.ts";

export async function resolveLocalFileSource(input: string): Promise<ResolvedSource> {
  const absolutePath = path.resolve(input);

  if (!existsSync(absolutePath)) {
    throw createLocalFileNotFoundError(absolutePath);
  }

  let isFile = false;
  try {
    isFile = statSync(absolutePath).isFile();
  } catch {
    throw createLocalFileNotFoundError(absolutePath);
  }

  if (!isFile) {
    throw createLocalFileNotFoundError(absolutePath);
  }

  const extension = getLocalFileExtension(absolutePath);
  if (!extension) {
    throw createUnsupportedLocalFileExtensionError(absolutePath);
  }

  return {
    kind: "local_file",
    originalInput: input,
    absolutePath,
    extension,
  };
}
