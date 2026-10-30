import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import type { SttProvider, SttRequest } from "../../../src/core/ports/stt-provider.ts";
import { createDeepgramProvider } from "../../../src/infrastructure/stt/deepgram.ts";
import { createElevenLabsProvider } from "../../../src/infrastructure/stt/elevenlabs.ts";
import { createGroqProvider } from "../../../src/infrastructure/stt/groq.ts";

const API_KEY = "sk-provider-secret";
const workDir = mkdtempSync(path.join(os.tmpdir(), "pi-tube-stt-"));
const audioFile = path.join(workDir, "clip.mp3");
writeFileSync(audioFile, "fake-audio");

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

type Behavior = { kind: "resolve"; payload: unknown } | { kind: "reject"; error: unknown } | { kind: "hang" };

interface Recorded {
  readonly keys: string[];
  readonly calls: Array<{ payload: unknown; options: unknown; source?: unknown }>;
}

const settle = (behavior: Behavior): Promise<unknown> => {
  if (behavior.kind === "resolve") return Promise.resolve(behavior.payload);
  if (behavior.kind === "reject") return Promise.reject(behavior.error);
  return new Promise(() => {});
};

interface Harness {
  readonly id: string;
  readonly success: unknown;
  readonly receivesSignal: boolean;
  readonly build: (behavior: Behavior, recorded: Recorded, timeoutMs?: number) => SttProvider;
}

const HARNESSES: readonly Harness[] = [
  {
    id: "deepgram",
    success: {
      results: {
        channels: [
          {
            detected_language: "en",
            alternatives: [{ transcript: "hello world", words: [{ start: 0, end: 0.5, word: "hello" }] }],
          },
        ],
      },
    },
    receivesSignal: false,
    build: (behavior, recorded, timeoutMs) =>
      createDeepgramProvider({
        timeoutMs,
        createClient: (apiKey) => {
          recorded.keys.push(apiKey);
          const answer = (payload: unknown, options: unknown) => {
            recorded.calls.push({ payload, options });
            return settle(behavior).then((result) => ({ result, error: null }));
          };
          return { transcribeUrl: answer, transcribeFile: answer };
        },
      }),
  },
  {
    id: "groq",
    success: { text: "hello world", language: "en", segments: [{ start: 0, end: 0.5, text: "hello world" }] },
    receivesSignal: true,
    build: (behavior, recorded, timeoutMs) =>
      createGroqProvider({
        timeoutMs,
        createClient: (apiKey) => {
          recorded.keys.push(apiKey);
          return {
            create: (payload, options) => {
              recorded.calls.push({ payload, options });
              return settle(behavior);
            },
          };
        },
      }),
  },
  {
    id: "elevenlabs",
    success: { text: "hello world", language_code: "en", words: [{ start: 0, end: 0.5, text: "hello", type: "word" }] },
    receivesSignal: true,
    build: (behavior, recorded, timeoutMs) =>
      createElevenLabsProvider({
        timeoutMs,
        createClient: (apiKey) => {
          recorded.keys.push(apiKey);
          return {
            convert: (payload, options) => {
              recorded.calls.push({ payload, options });
              return settle(behavior);
            },
          };
        },
      }),
  },
];

const urlRequest: SttRequest = { audio: { kind: "url", url: "https://cdn.example.com/a.mp3" }, apiKey: API_KEY };
const fileRequest: SttRequest = { audio: { kind: "file", path: audioFile }, language: "pt", apiKey: API_KEY };
const recorder = (): Recorded => ({ keys: [], calls: [] });

describe.each(HARNESSES)("$id provider", (harness) => {
  test("maps a successful response to text, language and segments", async () => {
    const recorded = recorder();
    const provider = harness.build({ kind: "resolve", payload: harness.success }, recorded);

    const result = await provider.transcribe(urlRequest);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.text).toBe("hello world");
    expect(result.data.detectedLanguage).toBe("en");
    expect(result.data.segments.length).toBeGreaterThan(0);
    expect(recorded.keys).toEqual([API_KEY]);
  });

  test("sends a local file as file content, never as a URL", async () => {
    const recorded = recorder();
    const provider = harness.build({ kind: "resolve", payload: harness.success }, recorded);

    const result = await provider.transcribe(fileRequest);

    expect(result.success).toBe(true);
    expect(JSON.stringify(recorded.calls[0]?.payload ?? {})).not.toContain("https://");
  });

  test("an already aborted signal is CANCELLED and never calls the provider", async () => {
    const recorded = recorder();
    const controller = new AbortController();
    controller.abort();

    const result = await harness
      .build({ kind: "hang" }, recorded)
      .transcribe(urlRequest, { signal: controller.signal });

    expect(result.success ? undefined : result.error.code).toBe("CANCELLED");
    expect(recorded.calls).toHaveLength(0);
  });

  test("a request past the timeout is PROVIDER_UNAVAILABLE", async () => {
    const startedAt = Date.now();

    const result = await harness.build({ kind: "hang" }, recorder(), 20).transcribe(urlRequest);

    expect(result.success ? undefined : result.error.code).toBe("PROVIDER_UNAVAILABLE");
    expect(Date.now() - startedAt).toBeLessThan(1000);
  });

  test("an HTTP 429 is PROVIDER_RATE_LIMIT and the key never shows", async () => {
    const result = await harness
      .build({ kind: "reject", error: Object.assign(new Error("Too many requests"), { status: 429 }) }, recorder())
      .transcribe(urlRequest);

    expect(result.success ? undefined : result.error.code).toBe("PROVIDER_RATE_LIMIT");
    expect(JSON.stringify(result)).not.toContain(API_KEY);
  });

  test("a response without text is PROVIDER_INVALID_RESPONSE", async () => {
    const result = await harness.build({ kind: "resolve", payload: {} }, recorder()).transcribe(urlRequest);

    expect(result.success ? undefined : result.error.code).toBe("PROVIDER_INVALID_RESPONSE");
  });

  test.runIf(harness.receivesSignal)("passes an AbortSignal to the SDK request", async () => {
    const recorded = recorder();
    await harness.build({ kind: "resolve", payload: harness.success }, recorded).transcribe(urlRequest);

    const options = recorded.calls[0]?.options as { signal?: unknown; abortSignal?: unknown } | undefined;
    expect(options?.signal ?? options?.abortSignal).toBeInstanceOf(AbortSignal);
  });
});

describe("registry", () => {
  test("has one provider per descriptor", async () => {
    const { createSttProviders, PROVIDER_DESCRIPTORS } = await import("../../../src/infrastructure/stt/registry.ts");

    expect(Object.keys(createSttProviders())).toEqual(PROVIDER_DESCRIPTORS.map((descriptor) => descriptor.id));
  });
});
