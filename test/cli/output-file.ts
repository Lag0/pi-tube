import { readFileSync } from "node:fs";

/** The saved file path: from `[OUTPUT_FILE]` in human output, or `output_path` in `--json` output. */
export function extractOutputPath(stdout: string): string {
  if (stdout.trimStart().startsWith("{")) {
    const payload = JSON.parse(stdout) as { output_path?: unknown };
    if (typeof payload.output_path === "string" && payload.output_path.length > 0) return payload.output_path;
    throw new Error(`Missing output_path in JSON stdout: ${stdout}`);
  }

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
