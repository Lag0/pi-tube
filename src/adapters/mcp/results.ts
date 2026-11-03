import type { CallToolResult, ServerContext } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  ERROR_CODES,
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

/** Output schema of a `NextAction`; the tests check every result against its tool's strict schema. */
export const NextActionOutput = z.strictObject({
  tool: z.string(),
  arguments: z.record(z.string(), z.unknown()),
  reason: z.string(),
});

/** Output schema of every tool error. */
export const ToolErrorOutput = z.strictObject({
  error: z.strictObject({ code: z.enum(ERROR_CODES), message: z.string(), hint: z.string() }),
});

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
  deps: {
    readonly log: McpLogger;
    readonly shutdown: AbortSignal;
    readonly track?: <R>(call: Promise<R>) => Promise<R>;
  },
  run: (options: OperationOptions) => Promise<Result<T>>,
  format: (data: T) => object,
): Promise<CallToolResult> => {
  const token = ctx.mcpReq._meta?.progressToken;
  // After a client cancel the token is dead (no response will follow), and the SDK does not check it.
  const cancelled = ctx.mcpReq.signal;
  let sent = Promise.resolve();
  let count = 0;
  const onProgress =
    token === undefined
      ? undefined
      : (event: ProgressEvent): void => {
          if (cancelled.aborted) return;
          count += 1;
          const progress = count;
          sent = sent
            .then(() =>
              cancelled.aborted
                ? undefined
                : ctx.mcpReq.notify({
                    method: "notifications/progress",
                    params: { progressToken: token, progress, message: progressMessage(event) },
                  }),
            )
            .catch((error: unknown) => deps.log.debug("Progress not sent", { message: toPiTubeError(error).message }));
        };
  const signal = AbortSignal.any([cancelled, deps.shutdown]);

  let response: CallToolResult;
  try {
    const running = run({ signal, ...(onProgress ? { onProgress } : {}) });
    const result = await (deps.track ? deps.track(running) : running);
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
