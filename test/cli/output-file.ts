import { readFileSync } from "node:fs";

export function extractOutputPath(stdout: string): string {
  const line = stdout
    .split("\n")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith("[OUTPUT_FILE] "));

  if (!line) {
    throw new Error(`Missing [OUTPUT_FILE] line in stdout: ${stdout}`);
  }

  const outputPath = line.slice("[OUTPUT_FILE] ".length).trim();
  if (!outputPath) {
    throw new Error(`Empty [OUTPUT_FILE] path in stdout: ${stdout}`);
  }

  return outputPath;
}

export function readOutputFileFromStdout(stdout: string): string {
  return readFileSync(extractOutputPath(stdout), "utf8");
}
