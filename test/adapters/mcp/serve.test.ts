import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { runMcpServer } from "../../../src/adapters/mcp/serve.ts";
import { createApp } from "../../../src/bootstrap.ts";
import { createFakeMediaFetcher } from "../../helpers/fake-media.ts";
import { createFakeSttProvider } from "../../helpers/fake-stt.ts";
import { fakeProviders, PROVIDER_KEYS } from "../../helpers/transcribe-fakes.ts";

let home: string;

beforeEach(() => {
  home = mkdtempSync(path.join(os.tmpdir(), "pi-tube-serve-"));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

const start = (stt = fakeProviders()) => {
  const env = { HOME: home, PI_TUBE_CONFIG_PATH: path.join(home, "config.json"), ...PROVIDER_KEYS };
  const app = createApp(
    { env, cwd: home, homedir: () => home, adapter: "mcp" },
    { media: createFakeMediaFetcher().fetcher, stt },
  );
  const stdin = new PassThrough();
  const controller = new AbortController();
  const logs: string[] = [];
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const running = runMcpServer({
    app,
    env: { ...env, PI_TUBE_LOG_LEVEL: "info" },
    version: "9.9.9",
    writeErr: (line) => logs.push(line),
    signal: controller.signal,
    stdin,
    transport: serverTransport,
  });
  return { app, stdin, controller, logs, clientTransport, running };
};

describe("runMcpServer", () => {
  test("ending stdin resolves 0, after logging the start line", async () => {
    const { stdin, logs, clientTransport, running } = start();
    const client = new Client({ name: "t", version: "0" }, { capabilities: {} });
    await client.connect(clientTransport);
    expect((await client.listTools()).tools.length).toBe(9);

    // In production the SDK reads stdin; here nothing does, so let it flow to its end.
    stdin.resume();
    stdin.end();

    await expect(running).resolves.toBe(0);
    expect(logs.join("")).toContain("pi-tube 9.9.9 MCP server on stdio");
  });

  test("aborting the signal with a call in flight resolves 0, and the use case sees the abort", async () => {
    const deepgram = createFakeSttProvider("deepgram", undefined, { waitForAbort: true });
    const { app, controller, clientTransport, running } = start(fakeProviders({ deepgram }));
    const client = new Client({ name: "t", version: "0" }, { capabilities: {} });
    await client.connect(clientTransport);

    const pending = client
      .callTool({ name: "transcribe", arguments: { input: "https://cdn.example.com/a.mp3", provider: "deepgram" } })
      .catch((error: unknown) => error);
    for (let tries = 0; deepgram.requests.length === 0 && tries < 1000; tries += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    controller.abort();

    await expect(running).resolves.toBe(0);
    await pending;
    const audit = await app.queryAudit({ limit: 10, offset: 0 });
    expect(audit.success && audit.data.records[0]?.errorCode).toBe("CANCELLED");
  });
});
