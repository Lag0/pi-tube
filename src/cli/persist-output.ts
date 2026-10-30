import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { OutputArtifact } from "../core/domain/transcript/contract.ts";
import { transcriptFileName } from "../core/domain/transcript/file-name.ts";
import { resolvePiTubePaths } from "../infrastructure/paths.ts";

interface PersistOutputArtifactOptions {
  asJson: boolean;
  content: string;
  artifact: OutputArtifact;
  env?: Record<string, string | undefined>;
  cwd?: string;
  now?: Date;
}

export interface PersistedOutputArtifact {
  outputPath: string;
  outputUri: string;
}

function resolveOutputDir({
  env = process.env,
  cwd = process.cwd(),
}: Pick<PersistOutputArtifactOptions, "env" | "cwd">): string {
  return resolvePiTubePaths({ env, cwd, homedir: os.homedir }).outputDir;
}

function buildUniqueOutputPath(basePath: string): string {
  if (!existsSync(basePath)) {
    return basePath;
  }

  const parsed = path.parse(basePath);
  for (let index = 2; index < 1000; index += 1) {
    const candidate = path.join(parsed.dir, `${parsed.name}-${index}${parsed.ext}`);
    if (!existsSync(candidate)) {
      return candidate;
    }
  }

  return path.join(parsed.dir, `${parsed.name}-${Date.now()}${parsed.ext}`);
}

export function persistOutputArtifact(options: PersistOutputArtifactOptions): PersistedOutputArtifact {
  const outputDir = resolveOutputDir(options);
  mkdirSync(outputDir, { recursive: true });

  const fileName = transcriptFileName({
    artifact: options.artifact,
    now: options.now ?? new Date(),
    format: options.asJson ? "json" : "markdown",
  });
  const targetPath = buildUniqueOutputPath(path.join(outputDir, fileName));

  writeFileSync(targetPath, options.content, "utf8");

  return {
    outputPath: targetPath,
    outputUri: pathToFileURL(targetPath).href,
  };
}
