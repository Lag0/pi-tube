/** The `code` of a Node.js system error (`ENOENT`, `EACCES`, ...), or `unknown error` for anything else. */
export const errnoOf = (error: unknown): string =>
  error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : "unknown error";
