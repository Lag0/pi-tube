import { afterEach, describe, expect, test } from "vitest";
import { SERVER_INSTRUCTIONS } from "../../../src/adapters/mcp/instructions.ts";
import { OUTPUT_SCHEMAS } from "../../../src/adapters/mcp/server.ts";
import { connectMcp, type McpHarness } from "../../helpers/mcp-harness.ts";

const TOOLS = [
  "doctor",
  "download_media",
  "get_media_info",
  "get_transcript",
  "get_usage",
  "list_providers",
  "list_transcripts",
  "search_transcripts",
  "transcribe",
];

let harness: McpHarness | undefined;

afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

describe("MCP server", () => {
  test.each(["modern", "legacy"] as const)(
    "tools/list (%s) lists every tool with all four annotations",
    async (era) => {
      harness = await connectMcp({ era });

      const { tools } = await harness.client.listTools();

      expect(tools.map((tool) => tool.name).sort()).toEqual(TOOLS);
      for (const tool of tools) {
        expect(tool.description?.length ?? 0).toBeGreaterThan(40);
        expect(Object.keys(tool.annotations ?? {}).sort()).toEqual(
          ["destructiveHint", "idempotentHint", "openWorldHint", "readOnlyHint"].sort(),
        );
      }
    },
  );

  test("each tool's annotations have the plan's values, and get_transcript asks for 500000 characters inline", async () => {
    harness = await connectMcp();
    const local = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
    const expected: Record<string, typeof local> = {
      doctor: local,
      get_transcript: local,
      get_usage: local,
      list_providers: local,
      list_transcripts: local,
      search_transcripts: local,
      transcribe: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      get_media_info: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      download_media: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    };

    const { tools } = await harness.client.listTools();

    expect(Object.fromEntries(tools.map((tool) => [tool.name, tool.annotations]))).toEqual(expected);
    expect(tools.find((tool) => tool.name === "get_transcript")?._meta).toEqual({
      "anthropic/maxResultSizeChars": 500_000,
    });
    expect(tools.filter((tool) => tool._meta !== undefined).map((tool) => tool.name)).toEqual(["get_transcript"]);
  });

  test("every tool has a strict output schema", () => {
    expect(Object.keys(OUTPUT_SCHEMAS).sort()).toEqual(TOOLS);
  });

  test("the instructions fit Claude Code's 4096 characters and name the untrusted rule", async () => {
    harness = await connectMcp();

    expect(SERVER_INSTRUCTIONS.length).toBeLessThanOrEqual(4096);
    expect(SERVER_INSTRUCTIONS).toContain("untrusted");
    expect(SERVER_INSTRUCTIONS).toContain("next_offset is not null");
    expect(harness.client.getInstructions()).toBe(SERVER_INSTRUCTIONS);
    expect(harness.client.getServerVersion()).toMatchObject({ name: "pi-tube", version: "0.0.0-test" });
  });
});
