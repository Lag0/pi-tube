import type { CliIo } from "./io.ts";

/** CLI IO bound to the current process: results to stdout, errors and progress to stderr. */
export const createProcessIo = (): CliIo => ({
  writeOut: (text) => console.log(text),
  writeErr: (text) => console.error(text),
  ...(process.stderr.isTTY ? { progressStream: process.stderr } : {}),
});
