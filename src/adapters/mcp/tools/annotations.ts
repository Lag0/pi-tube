import type { ToolAnnotations } from "@modelcontextprotocol/server";

/** A tool that only reads local state: no change, no network. All four hints are explicit; clients assume the worst. */
export const LOCAL_READ_ONLY: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};
