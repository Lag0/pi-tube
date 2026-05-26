import { classifyInput } from "./policy.ts";
import { resolveYouTubeSource } from "./adapters/youtube.ts";
import { resolveInstagramSource } from "./adapters/instagram.ts";
import { resolveDirectUrlSource } from "./adapters/direct-url.ts";
import { resolveLocalFileSource } from "./adapters/local-file.ts";
import { CliError, createUnsupportedUrlNotDirectMediaError } from "../errors/cli-errors.ts";
import type { ResolvedSource, SourceClassification } from "./types.ts";

interface ResolverDeps {
  resolveYouTube?: typeof resolveYouTubeSource;
  resolveInstagram?: typeof resolveInstagramSource;
  resolveDirectUrl?: typeof resolveDirectUrlSource;
  resolveLocalFile?: typeof resolveLocalFileSource;
}

export function classifySourceInput(input: string): SourceClassification {
  return classifyInput(input.trim());
}

export async function resolveSource(input: string, deps: ResolverDeps = {}): Promise<ResolvedSource> {
  const normalizedInput = input.trim();
  if (normalizedInput.length === 0) {
    throw new CliError("Input cannot be empty.", {
      code: "CLI_CONTRACT_VIOLATION",
      exitCode: 2,
      guidance: ["Use `pi-tube transcribe <input>`.", "Run `pi-tube --help` for examples."],
    });
  }

  const classification = classifySourceInput(normalizedInput);
  const resolveYouTube = deps.resolveYouTube ?? resolveYouTubeSource;
  const resolveInstagram = deps.resolveInstagram ?? resolveInstagramSource;
  const resolveDirectUrl = deps.resolveDirectUrl ?? resolveDirectUrlSource;
  const resolveLocalFile = deps.resolveLocalFile ?? resolveLocalFileSource;

  switch (classification) {
    case "youtube":
      return resolveYouTube(normalizedInput);
    case "instagram":
      return resolveInstagram(normalizedInput);
    case "direct_url":
      return resolveDirectUrl(normalizedInput);
    case "local_file":
      return resolveLocalFile(normalizedInput);
    case "unsupported_url":
      throw createUnsupportedUrlNotDirectMediaError(normalizedInput);
    default:
      throw new CliError("Unable to classify source input.", {
        code: "INTAKE_CLASSIFICATION_FAILED",
        exitCode: 2,
      });
  }
}
