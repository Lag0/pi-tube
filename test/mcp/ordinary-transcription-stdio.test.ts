import { execFile } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { expect, test, vi } from "vitest";
import { HERMETIC_ENV } from "../helpers/spawn-cli.ts";

test("stdio MCP waits for the independent CLI producer and reuses its paid result", async () => {
  const home = mkdtempSync(path.join(os.tmpdir(), "ordinary-stdio-"));
  const env = {
    ...HERMETIC_ENV,
    HOME: home,
    PI_TUBE_CONFIG_PATH: path.join(home, "config.json"),
    PI_TUBE_LIBRARY_DIR: path.join(home, "library"),
    GROQ_API_KEY: "fake",
  };
  const args = [
    "run",
    "--bun",
    "--no-env-file",
    "--preload",
    path.resolve("test/fixtures-process/held-groq.ts"),
    path.resolve("bin/pi-tube.ts"),
  ];
  const input = path.join(home, "audio.mp3");
  writeFileSync(input, "fake audio");
  const alias = path.join(home, "same-bytes.mp3");
  writeFileSync(alias, "fake audio");
  const client = new Client({ name: "ordinary-test", version: "0" }, { versionNegotiation: { mode: "legacy" } });
  const deadline = Date.now() + 55_000;
  const remaining = () => Math.max(1, deadline - Date.now());
  const cli = promisify(execFile)("bun", [...args, "transcribe", input, "--language", "EN", "--json"], {
    env: { ...process.env, ...env },
    timeout: remaining(),
  });
  const release = () => writeFileSync(path.join(home, "release"), "");
  const dispatches = () => readFileSync(path.join(home, "dispatches"), "utf8").trim().split("\n");
  try {
    await Promise.race([
      vi.waitFor(() => expect(dispatches()).toHaveLength(1), { timeout: remaining() }),
      cli.then(() => {
        throw Error("CLI exited before release");
      }),
    ]);
    await client.connect(new StdioClientTransport({ command: "bun", args: [...args, "mcp"], env }), {
      timeout: remaining(),
    });
    let waited = false;
    const result = await client.callTool(
      { name: "transcribe", arguments: { input: alias, language: "en" } },
      {
        timeout: remaining(),
        onprogress: ({ message }) => {
          if (message === "Waiting for transcription...") {
            waited = true;
            release();
          }
        },
      },
    );
    expect(waited).toBe(true);
    expect(result.isError).not.toBe(true);
    const { stdout } = await cli;
    const producer = JSON.parse(stdout);
    expect(producer).toMatchObject({ cache_hit: false, transcript_id: expect.any(String) });
    const saved = readdirSync(path.dirname(producer.output_path)).filter((name) =>
      /^[a-f0-9]{20}(?:-\d+)?\.json$/.test(name),
    );
    expect(saved).toEqual([`${producer.transcript_id}.json`]);
    const block = result.content[0];
    if (block?.type !== "text") throw new Error("Expected MCP text result");
    expect(JSON.parse(block.text)).toMatchObject({
      transcript_id: producer.transcript_id,
      cache_hit: true,
      cost: { estimate: 0 },
    });
    expect(dispatches()).toHaveLength(1);
  } finally {
    release();
    await client.close();
    await cli.catch(() => {});
    rmSync(home, { recursive: true, force: true });
  }
}, 60_000);
