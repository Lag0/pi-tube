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
