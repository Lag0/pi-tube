import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { McpServer } from "@modelcontextprotocol/server";
import { afterEach, describe, expect, test } from "vitest";
import { createMcpLogger } from "../../../src/adapters/mcp/log.ts";
import { runTool, toolError, toolResult } from "../../../src/adapters/mcp/results.ts";
import { createError, ERROR_CODES, err, type OperationOptions, ok, type Result } from "../../../src/core/index.ts";
import { waitForAbort } from "../../helpers/fake-stt.ts";

const textOf = (result: { content?: unknown }): string => {
  const [block] = Array.isArray(result.content) ? result.content : [];
  if (typeof block !== "object" || block === null || !("text" in block) || typeof block.text !== "string") {
    throw new Error("no text block");
  }
  return block.text;
};

describe("toolResult and toolError", () => {
  test("a result is one text block of compact JSON", () => {
    expect(toolResult({ a: 1, b: [true] })).toEqual({ content: [{ type: "text", text: '{"a":1,"b":[true]}' }] });
  });

  test("every catalog code becomes isError with its code, message and hint", () => {
    for (const code of ERROR_CODES) {
      const error = createError(code, `message of ${code}`);
      const result = toolError(error);

      expect(result.isError).toBe(true);
      expect(JSON.parse(textOf(result))).toEqual({ error: { code, message: `message of ${code}`, hint: error.hint } });
      expect(error.hint.length).toBeGreaterThan(0);
    }
  });
});

interface Running {
  readonly client: Client;
  readonly logs: string[];
  /** Notifications the server sent, by method, and its responses, as `response:<id>`. */
  readonly sent: string[];
  readonly seen: { signal?: AbortSignal };
  readonly shutdown: AbortController;
  readonly close: () => Promise<void>;
}

const running: Running[] = [];

afterEach(async () => {
  for (const item of running.splice(0)) await item.close();
});

/** A server with one tool, `run`, whose use case is `useCase`. */
const serve = async (
  useCase: (options: OperationOptions) => Promise<Result<{ readonly value: number }>>,
  env: Record<string, string> = {},
): Promise<Running> => {
  const logs: string[] = [];
  const log = createMcpLogger({ env, writeErr: (line) => logs.push(line) });
  const shutdown = new AbortController();
  const seen: { signal?: AbortSignal } = {};
  const server = new McpServer({ name: "test", version: "0" });
  server.registerTool("run", { description: "test tool" }, (ctx) =>
    runTool(
      ctx,
      { log, shutdown: shutdown.signal },
      (options) => {
        seen.signal = options.signal;
        return useCase(options);
      },
      (data) => ({ doubled: data.value * 2 }),
    ),
  );
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const sent: string[] = [];
  const send = serverTransport.send.bind(serverTransport);
  serverTransport.send = async (message, options) => {
    if ("method" in message && !("id" in message)) sent.push(message.method);
    if ("id" in message && ("result" in message || "error" in message)) sent.push(`response:${message.id}`);
    return send(message, options);
  };
  await server.connect(serverTransport);
  const client = new Client({ name: "test-client", version: "0" }, { capabilities: {} });
  await client.connect(clientTransport);
  const item: Running = {
    client,
    logs,
    sent,
    seen,
    shutdown,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
  running.push(item);
  return item;
};

const threeSteps = async (options: OperationOptions) => {
  options.onProgress?.({ label: "Resolving source..." });
  options.onProgress?.({ label: "Transcribing audio...", detail: "(youtube)" });
  options.onProgress?.({ label: "Saving output..." });
  return ok({ value: 21 });
};

describe("runTool", () => {
  test("a success is the formatted data", async () => {
    const { client } = await serve(async () => ok({ value: 2 }));

    const result = await client.callTool({ name: "run", arguments: {} });

    expect(result.isError).toBeFalsy();
    expect(JSON.parse(textOf(result))).toEqual({ doubled: 4 });
  });

  test("a domain error is isError with its code, message and hint", async () => {
    const { client } = await serve(async () => err(createError("PROVIDER_AUTH", "Key refused.")));

    const result = await client.callTool({ name: "run", arguments: {} });

    expect(result.isError).toBe(true);
    expect(JSON.parse(textOf(result))).toEqual({
      error: { code: "PROVIDER_AUTH", message: "Key refused.", hint: createError("PROVIDER_AUTH", "x").hint },
    });
  });

  test("a thrown error becomes UNEXPECTED without its stack, and the stack is logged only at debug", async () => {
    const boom = async (): Promise<Result<{ readonly value: number }>> => {
      throw new SyntaxError("Unexpected token < in JSON");
    };
    const quiet = await serve(boom);
    const verbose = await serve(boom, { PI_TUBE_LOG_LEVEL: "debug" });

    const result = await quiet.client.callTool({ name: "run", arguments: {} });
    await verbose.client.callTool({ name: "run", arguments: {} });

    expect(result.isError).toBe(true);
    expect(JSON.parse(textOf(result)).error.code).toBe("UNEXPECTED");
    expect(textOf(result)).not.toContain("results.test.ts");
    expect(quiet.logs.join("")).toContain("Unexpected token < in JSON");
    expect(quiet.logs.join("")).not.toContain("results.test.ts");
    expect(verbose.logs.join("")).toContain("results.test.ts");
  });

  test("progress goes out before the result and only with a token", async () => {
    const withToken = await serve(threeSteps);
    const without = await serve(threeSteps);
    const events: Array<{ progress: number; message?: string }> = [];
    let resolved = false;

    const pending = withToken.client
      .callTool(
        { name: "run", arguments: {} },
        {
          onprogress: (progress) => {
            expect(resolved).toBe(false);
            events.push({ progress: progress.progress, message: progress.message });
          },
        },
      )
      .then((result) => {
        resolved = true;
        return result;
      });
    await pending;
    await without.client.callTool({ name: "run", arguments: {} });

    expect(events).toEqual([
      { progress: 1, message: "Resolving source..." },
      { progress: 2, message: "Transcribing audio... (youtube)" },
      { progress: 3, message: "Saving output..." },
    ]);
    expect(withToken.sent.filter((method) => method === "notifications/progress")).toHaveLength(3);
    expect(without.sent.filter((method) => method === "notifications/progress")).toHaveLength(0);
  });

  test("a client abort reaches the use case signal", async () => {
    let aborted = false;
    const { client } = await serve(async (options) => {
      await waitForAbort(options.signal);
      aborted = options.signal?.aborted === true;
      return err(createError("CANCELLED", "Operation cancelled."));
    });
    const controller = new AbortController();

    const pending = client.callTool({ name: "run", arguments: {} }, { signal: controller.signal });
    setTimeout(() => controller.abort(), 20);

    await expect(pending).rejects.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(aborted).toBe(true);
  });

  test("after a client cancel, no progress and no response go out for that call", async () => {
    let finished = false;
    const item = await serve(async (options) => {
      await waitForAbort(options.signal);
      // The audit's "Audit log not written", or a step that ignored the signal, reports after the cancel.
      options.onProgress?.({ label: "Audit log not written", detail: "STORAGE_IO_FAILED" });
      finished = true;
      return err(createError("CANCELLED", "Operation cancelled."));
    });
    const controller = new AbortController();
    item.sent.splice(0); // the initialize response

    const pending = item.client.callTool(
      { name: "run", arguments: {} },
      { signal: controller.signal, onprogress: () => undefined },
    );
    setTimeout(() => controller.abort(), 20);
    await expect(pending).rejects.toThrow();
    for (let tries = 0; !finished && tries < 200; tries += 1) await new Promise((resolve) => setTimeout(resolve, 5));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(finished).toBe(true);
    expect(item.sent.filter((entry) => entry === "notifications/progress" || entry.startsWith("response:"))).toEqual([]);
  });

  test("shutdown aborts a call in flight", async () => {
    const item = await serve(async (options) => {
      await waitForAbort(options.signal);
      return err(createError("CANCELLED", "Operation cancelled."));
    });

    const pending = item.client.callTool({ name: "run", arguments: {} });
    setTimeout(() => item.shutdown.abort(), 20);
    const result = await pending;

    expect(item.seen.signal?.aborted).toBe(true);
    expect(JSON.parse(textOf(result)).error.code).toBe("CANCELLED");
  });
});
