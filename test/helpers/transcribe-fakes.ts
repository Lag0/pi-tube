import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { PiTubeError } from "../../src/core/domain/errors.ts";
import type { TranscriptionSegment } from "../../src/core/domain/transcript/types.ts";
import type { SttProvider, SttTranscript } from "../../src/core/ports/stt-provider.ts";
import type { ProcessRequest, ProcessResult } from "../../src/infrastructure/process/run-process.ts";
import { createFakeSttProvider } from "./fake-stt.ts";

/** A key for every provider, so selection never fails for lack of credentials. */
export const PROVIDER_KEYS = {
  DEEPGRAM_API_KEY: "dg-test-key",
  GROQ_API_KEY: "gq-test-key",
  ELEVENLABS_API_KEY: "el-test-key",
} as const;

export const transcript = (
  text: string,
  detectedLanguage?: string,
  segments: readonly TranscriptionSegment[] = [],
): SttTranscript => ({ text, ...(detectedLanguage ? { detectedLanguage } : {}), segments });

type ProviderOutcome = SttTranscript | PiTubeError | SttProvider;

const isProvider = (outcome: ProviderOutcome): outcome is SttProvider => "transcribe" in outcome;

/** The three providers as fakes; each answers `hello <id>` unless an outcome is given. */
export const fakeProviders = (
  outcomes: Partial<Record<"deepgram" | "groq" | "elevenlabs", ProviderOutcome>> = {},
): Readonly<Record<string, SttProvider>> =>
  Object.fromEntries(
    (["deepgram", "groq", "elevenlabs"] as const).map((id) => {
      const outcome = outcomes[id] ?? transcript(`hello ${id}`);
      return [id, isProvider(outcome) ? outcome : createFakeSttProvider(id, outcome)];
    }),
  );

const exited = (stdout: string, exitCode = 0, stderr = ""): ProcessResult => ({
  outcome: "exited",
  exitCode,
  stdout,
  stderr,
});

/**
 * A process runner standing in for yt-dlp: `--dump-single-json` answers `metadata` (or `metadataFailure`),
 * and an audio download writes a small file where `-o` points and prints its path.
 */
export const fakeYtDlp =
  (options: { readonly metadata?: Record<string, unknown>; readonly metadataFailure?: Partial<ProcessResult> } = {}) =>
  async (request: ProcessRequest): Promise<ProcessResult> => {
    if (request.args.includes("--dump-single-json")) {
      if (options.metadataFailure) return { ...exited("", 1), ...options.metadataFailure };
      return exited(JSON.stringify(options.metadata ?? { url: "https://media.example.com/a.m4a" }));
    }
    const template = request.args[request.args.indexOf("-o") + 1] ?? "";
    const file = template.replace("%(id)s.%(ext)s", "media.m4a");
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, "audio");
    return exited(`${file}\n`);
  };
