import { createError, type PiTubeError } from "../../src/core/domain/errors.ts";
import type { OperationOptions } from "../../src/core/domain/operation.ts";
import { err, ok } from "../../src/core/domain/result.ts";
import type { SttProvider, SttRequest, SttTranscript } from "../../src/core/ports/stt-provider.ts";

/** Resolves once `signal` aborts; a missing signal never resolves. */
export const waitForAbort = (signal: AbortSignal | undefined): Promise<void> =>
  new Promise((resolve) => {
    if (signal?.aborted) resolve();
    signal?.addEventListener("abort", () => resolve(), { once: true });
  });

export const TRANSCRIPT_HELLO: SttTranscript = {
  text: "hello world",
  detectedLanguage: "en",
  segments: [{ startMs: 0, endMs: 500, text: "hello world" }],
};

/** An `SttProvider` that answers `outcome` and records every request (including the key it received). */
export const createFakeSttProvider = (
  id: string,
  outcome: SttTranscript | PiTubeError = TRANSCRIPT_HELLO,
  options: { readonly waitForAbort?: boolean } = {},
): SttProvider & { readonly requests: SttRequest[] } => {
  const requests: SttRequest[] = [];
  return {
    id,
    model: `${id}-fake-model`,
    capabilities: { timestamps: true, languageDetection: true, requiresLanguage: false, offline: false },
    requests,
    transcribe: async (request: SttRequest, operation?: OperationOptions) => {
      requests.push(request);
      if (options.waitForAbort) {
        await waitForAbort(operation?.signal);
        return err(createError("CANCELLED", "Operation cancelled."));
      }
      return "code" in outcome ? err(outcome) : ok(outcome);
    },
  };
};
