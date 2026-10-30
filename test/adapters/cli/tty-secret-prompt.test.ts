import { EventEmitter } from "node:events";
import { describe, expect, test } from "vitest";
import { createTtySecretPrompt } from "../../../src/adapters/cli/tty-secret-prompt.ts";

const QUESTION = "Paste groq API key (input hidden): ";

const createFakeTerminal = () => {
  const input = Object.assign(new EventEmitter(), {
    rawModes: [] as boolean[],
    setRawMode(mode: boolean) {
      this.rawModes.push(mode);
    },
    resume() {},
    pause() {},
  });
  let written = "";
  const output = {
    write: (text: string) => {
      written += text;
    },
  };
  return { input, output, written: () => written };
};

const answer = async (keystrokes: string) => {
  const terminal = createFakeTerminal();
  const pending = createTtySecretPrompt(terminal.input, terminal.output)(QUESTION);
  terminal.input.emit("data", Buffer.from(keystrokes));
  return { value: await pending, terminal };
};

describe("tty secret prompt", () => {
  test("resolves the typed text on enter", async () => {
    expect((await answer("sk-1\r")).value).toBe("sk-1");
  });

  test("backspace removes the previous character", async () => {
    expect((await answer("sk-12\u007f\r")).value).toBe("sk-1");
  });

  test("ctrl-c cancels", async () => {
    expect((await answer("\u0003")).value).toBeUndefined();
  });

  test("ctrl-d on an empty line cancels", async () => {
    expect((await answer("\u0004")).value).toBeUndefined();
  });

  test("enters raw mode, then restores it and stops listening", async () => {
    const { terminal } = await answer("sk-1\r");

    expect(terminal.input.rawModes).toEqual([true, false]);
    expect(terminal.input.listenerCount("data")).toBe(0);
  });

  test("writes only the question and a newline, never the key", async () => {
    const { terminal } = await answer("sk-secret\r");

    expect(terminal.written()).toBe(`${QUESTION}\n`);
  });
});
