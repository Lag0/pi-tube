import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { type NextAction, runTool } from "../results.ts";
import type { McpDeps } from "../server.ts";
import { LOCAL_READ_ONLY } from "./annotations.ts";

const TRANSCRIBE_NEXT: NextAction = {
  tool: "transcribe",
  arguments: {},
  reason: "Everything needed is in place: transcribe a URL or a local file with input.",
};

/** `doctor`: the installation report, the same as `pi-tube doctor --json`. */
export const registerDoctorTool = (server: McpServer, deps: McpDeps): void => {
  server.registerTool(
    "doctor",
    {
      title: "Check the installation",
      description:
        "Checks the pi-tube installation without network calls: config, each provider's key, yt-dlp and ffmpeg, the cookies file (never its path) and the library. Each check is ok, warn or error with a fix for the user. Call it when another tool fails or before the first transcription.",
      inputSchema: z.object({}),
      annotations: LOCAL_READ_ONLY,
    },
    (_args, ctx) =>
      runTool(
        ctx,
        deps,
        (options) => deps.app.runDoctor({}, options),
        (report) => ({
          ok: report.ok,
          checks: report.checks.map((check) => ({
            id: check.id,
            status: check.status,
            summary: check.summary,
            fix: check.fix ?? null,
          })),
          next_actions: report.ok ? [TRANSCRIBE_NEXT] : [],
        }),
      ),
  );
};
