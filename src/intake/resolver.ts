import { classifyInput } from "./policy.ts";
import { resolveYouTubeSource } from "./adapters/youtube.ts";
import { resolveDirectUrlSource } from "./adapters/direct-url.ts";
import { resolveLocalFileSource } from "./adapters/local-file.ts";
import { CliError, createUnsupportedUrlNotDirectMediaError } from "../errors/cli-errors.ts";
import type { ResolvedSource, SourceClassification } from "./types.ts";

export function classifySourceInput(input: string): SourceClassification {
  return classifyInput(input.trim());
}

export async function resolveSource(input: string): Promise<ResolvedSource> {
  const normalizedInput = input.trim();
  if (normalizedInput.length === 0) {
    throw new CliError("Input cannot be empty.", {
      code: "CLI_CONTRACT_VIOLATION",
      exitCode: 2,
      guidance: ["Use `pi-tube <input>`.", "Run `pi-tube --help` for examples."],
    });
  }

  const classification = classifySourceInput(normalizedInput);

  switch (classification) {
    case "youtube":
      return resolveYouTubeSource(normalizedInput);
    case "direct_url":
      return resolveDirectUrlSource(normalizedInput);
    case "local_file":
      return resolveLocalFileSource(normalizedInput);
    case "unsupported_url":
      throw createUnsupportedUrlNotDirectMediaError(normalizedInput);
    default:
      throw new CliError("Unable to classify source input.", {
        code: "INTAKE_CLASSIFICATION_FAILED",
        exitCode: 2,
      });
  }
}
