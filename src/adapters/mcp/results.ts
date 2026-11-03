import type { CallToolResult, ServerContext } from "@modelcontextprotocol/server";
import {
  type OperationOptions,
  type PiTubeError,
  type ProgressEvent,
  type Result,
  toPiTubeError,
} from "../../core/index.ts";
import type { McpLogger } from "./log.ts";

/** A call to one of this server's tools that the agent can make next; never carries external content. */
export interface NextAction {
  readonly tool: string;
  readonly arguments: Readonly<Record<string, unknown>>;
  readonly reason: string;
}

/** One text block of compact JSON: every client reads it the same way (no `structuredContent`, no `resource_link`). */
export const toolResult = (value: object): CallToolResult => ({
  content: [{ type: "text", text: JSON.stringify(value) }],
});

/** A domain error as `isError`, with the same code, message and hint the CLI prints. */
export const toolError = (error: PiTubeError): CallToolResult => ({
  isError: true,
  content: [
    { type: "text", text: JSON.stringify({ error: { code: error.code, message: error.message, hint: error.hint } }) },
  ],
});

const progressMessage = (event: ProgressEvent): string =>
  event.detail ? `${event.label} ${event.detail}` : event.label;

/**
 * Runs a use case for a tool call: signal = any(client cancel, shutdown); progress only with a token, flushed before
 * returning (a progress after the response has an unknown token, which some clients treat as fatal); throws become
 * UNEXPECTED (stack logged at debug).
 */
export const runTool = async <T>(
  ctx: ServerContext,
  deps: { readonly log: McpLogger; readonly shutdown: AbortSignal },
  run: (options: OperationOptions) => Promise<Result<T>>,
  format: (data: T) => object,
): Promise<CallToolResult> => {
  const token = ctx.mcpReq._meta?.progressToken;
  let sent = Promise.resolve();
  let count = 0;
  const onProgress =
    token === undefined
      ? undefined
      : (event: ProgressEvent): void => {
          count += 1;
          const progress = count;
          sent = sent
            .then(() =>
              ctx.mcpReq.notify({
                method: "notifications/progress",
                params: { progressToken: token, progress, message: progressMessage(event) },
              }),
            )
            .catch((error: unknown) => deps.log.debug("Progress not sent", { message: toPiTubeError(error).message }));
        };
  const signal = AbortSignal.any([ctx.mcpReq.signal, deps.shutdown]);

  let response: CallToolResult;
  try {
    const result = await run({ signal, ...(onProgress ? { onProgress } : {}) });
    response = result.success ? toolResult(format(result.data)) : toolError(result.error);
  } catch (caught) {
    const error = toPiTubeError(caught);
    deps.log.error("Tool failed unexpectedly", { message: error.message });
    if (caught instanceof Error && caught.stack) deps.log.debug("Stack", { stack: caught.stack });
    response = toolError(error);
  } finally {
    await sent;
  }
  return response;
};
