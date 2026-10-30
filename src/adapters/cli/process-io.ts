import type { CliIo } from "./io.ts";
import { createTtySecretPrompt } from "./tty-secret-prompt.ts";

const readAllStdin = async (): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
};

/** CLI IO bound to the current process: results to stdout; errors, progress and prompts to stderr. */
export const createProcessIo = (): CliIo => ({
  writeOut: (text) => console.log(text),
  writeErr: (text) => console.error(text),
  readStdin: readAllStdin,
  ...(process.stderr.isTTY ? { progressStream: process.stderr } : {}),
  ...(process.stdin.isTTY ? { promptSecret: createTtySecretPrompt(process.stdin, process.stderr) } : {}),
});
