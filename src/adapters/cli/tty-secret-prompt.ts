/** The part of a TTY input stream the prompt needs; `process.stdin` satisfies it. */
export interface SecretInput {
  setRawMode(mode: boolean): unknown;
  on(event: "data", listener: (chunk: Buffer | string) => void): unknown;
  off(event: "data", listener: (chunk: Buffer | string) => void): unknown;
  resume(): unknown;
  pause(): unknown;
}

const ENTER = new Set(["\r", "\n"]);
const BACKSPACE = new Set(["\u007f", "\b"]);
const CTRL_C = "\u0003";
const CTRL_D = "\u0004";

/**
 * Asks a question on `output` and reads the answer from a TTY in raw mode, so nothing is echoed.
 * Resolves `undefined` on Ctrl-C, or on Ctrl-D with an empty line.
 */
export const createTtySecretPrompt =
  (input: SecretInput, output: { write(text: string): void }) =>
  (question: string): Promise<string | undefined> =>
    new Promise((resolve) => {
      let typed = "";
      const finish = (value: string | undefined): void => {
        input.setRawMode(false);
        input.pause();
        input.off("data", onData);
        output.write("\n");
        resolve(value);
      };
      const onData = (chunk: Buffer | string): void => {
        for (const char of typeof chunk === "string" ? chunk : chunk.toString("utf8")) {
          if (ENTER.has(char)) {
            finish(typed);
            return;
          }
          if (char === CTRL_C || (char === CTRL_D && typed.length === 0)) {
            finish(undefined);
            return;
          }
          if (BACKSPACE.has(char)) typed = typed.slice(0, -1);
          else if (char >= " ") typed += char;
        }
      };

      output.write(question);
      input.setRawMode(true);
      input.resume();
      input.on("data", onData);
    });
