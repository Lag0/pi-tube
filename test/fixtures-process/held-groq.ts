import { mock } from "bun:test";
import { appendFileSync, existsSync } from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createFakeSttProvider } from "../helpers/fake-stt.ts";

const fake = createFakeSttProvider("groq");
const home = process.env.HOME;
if (!home) throw new Error("Missing fixture HOME");
mock.module("../../src/infrastructure/stt/groq.ts", () => ({
  createGroqProvider: () => ({
    ...fake,
    transcribe: async (...args: Parameters<typeof fake.transcribe>) => {
      appendFileSync(path.join(home, "dispatches"), `${process.pid}\n`);
      while (!existsSync(path.join(home, "release"))) await delay(20);
      return fake.transcribe(...args);
    },
  }),
}));
