import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { OutputArtifact } from "../output/contract.ts";

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

function sanitizeLabel(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return normalized || "transcript";
}

function extractFilenameLabel(source: OutputArtifact["source"]): string | undefined {
  if (source.title && source.title.trim().length > 0) {
    return source.title.trim();
  }

  if (source.absolute_path && source.absolute_path.trim().length > 0) {
    return path.parse(source.absolute_path).name;
  }

  const urlCandidate = source.media_url ?? source.normalized_url ?? source.original_input;
  try {
    const parsed = new URL(urlCandidate);
    const base = path.basename(parsed.pathname);
    if (base && base !== "/") {
      return path.parse(base).name;
    }
    return parsed.hostname;
  } catch {
    return source.kind;
  }
}

function resolveOutputDir({
  env = process.env,
  cwd = process.cwd(),
}: Pick<PersistOutputArtifactOptions, "env" | "cwd">): string {
  const configuredPath = env.PI_TUBE_OUTPUT_DIR?.trim();
  if (configuredPath) {
    return path.isAbsolute(configuredPath) ? configuredPath : path.resolve(cwd, configuredPath);
  }

  const home = env.HOME?.trim() || os.homedir();
  if (home) {
    return path.join(home, ".pi-tube");
  }

  return path.resolve(cwd, ".pi-tube");
}

function formatDatePart(now: Date): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

  const label = sanitizeLabel(extractFilenameLabel(options.artifact.source) ?? "transcript");
  const datePart = formatDatePart(options.now ?? new Date());
  const extension = options.asJson ? "json" : "md";
  const targetPath = buildUniqueOutputPath(path.join(outputDir, `${datePart}-${label}.${extension}`));

  writeFileSync(targetPath, options.content, "utf8");

  return {
    outputPath: targetPath,
    outputUri: pathToFileURL(targetPath).href,
  };
}
