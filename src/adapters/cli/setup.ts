import { createError } from "../../core/index.ts";
import { CliFailure } from "./error-output.ts";
import type { CliIo, CliSystem } from "./io.ts";

const SKILLS_NPX_PACKAGE = "skills@1.4.1";
const SKILL_SOURCE = "https://github.com/Lag0/pi-tube/tree/main";
const NPM_PACKAGE_NAME = "@syxs/pi-tube";
const SETUP_USAGE_HINT = "Use one of: `pi-tube setup yt-dlp`, `pi-tube setup skills`, `pi-tube setup mcp`.";

export interface SetupOptions {
  global?: boolean;
  nonInteractive?: boolean;
  agent?: string;
  platform: CliSystem["platform"];
  runInteractive: CliSystem["runInteractive"];
  writeOut: CliIo["writeOut"];
}

function toCommandString(command: string, args: readonly string[]): string {
  const parts = [command, ...args].map((part) =>
    part.includes(" ") || part.includes('"') ? JSON.stringify(part) : part,
  );
  return parts.join(" ");
}

function runCommand(command: string, args: readonly string[], options: SetupOptions): void {
  const commandString = toCommandString(command, args);
  options.writeOut(`Running: ${commandString}\n`);

  if (options.runInteractive(command, args) !== 0) {
    throw new CliFailure(
      createError("SETUP_COMMAND_FAILED", `Failed to run setup command: \`${commandString}\`.`, {
        hint: "Verify that Node.js and npx are available in your environment.",
      }),
    );
  }
}

function handleSetupInstall(): string {
  const lines = [
    "[SETUP_INSTALL]",
    "Install globally with npm:",
    `npm install -g ${NPM_PACKAGE_NAME}`,
    "",
    "Or run without global install:",
    `npx -y ${NPM_PACKAGE_NAME} --help`,
    "",
    "After install, configure defaults:",
    "pi-tube defaults provider deepgram",
    "",
    "Then install the Codex skill bundle:",
    "pi-tube setup skills",
  ];

  return lines.join("\n");
}

function createYtDlpSetupLines(): string[] {
  return [
    "[SETUP_YTDLP]",
    "yt-dlp is required for YouTube/Instagram download and transcription intake.",
    "",
    "Recommended macOS install:",
    "brew install yt-dlp",
    "",
    "Python/pipx alternative:",
    "pipx install yt-dlp",
    "",
    "Verify installation:",
    "yt-dlp --version",
    "",
    "To run the Homebrew install command from pi-tube on macOS:",
    "pi-tube setup yt-dlp --yes",
  ];
}

function handleSetupYtDlp(options: SetupOptions): string | null {
  if (options.nonInteractive) {
    if (options.platform !== "darwin") {
      throw new CliFailure(
        createError("SETUP_COMMAND_FAILED", "Automatic yt-dlp install is only supported on macOS with Homebrew.", {
          hint: "Install yt-dlp manually for your platform. macOS/Homebrew: `brew install yt-dlp`. Python/pipx: `pipx install yt-dlp`. Then verify with `yt-dlp --version`.",
        }),
      );
    }

    runCommand("brew", ["install", "yt-dlp"], options);
    return null;
  }

  const lines = createYtDlpSetupLines();

  return lines.join("\n");
}

function handleSetupSkills(options: SetupOptions): null {
  const args = ["-y", SKILLS_NPX_PACKAGE, "add", SKILL_SOURCE];
  if (options.nonInteractive) {
    args.push("--yes");
  }
  if (options.global) {
    args.push("--global");
  }
  if (options.agent) {
    args.push("--agent", options.agent);
  }

  runCommand("npx", args, options);
  return null;
}

export function handleSetupCommand(subcommand: string | undefined, options: SetupOptions): string | null {
  if (!subcommand) {
    throw new CliFailure(
      createError("INPUT_INVALID", "Missing or unsupported setup action.", { hint: SETUP_USAGE_HINT }),
    );
  }

  if (subcommand === "install") {
    return handleSetupInstall();
  }

  if (subcommand === "skills") {
    return handleSetupSkills(options);
  }

  if (subcommand === "yt-dlp") {
    return handleSetupYtDlp(options);
  }

  if (subcommand === "mcp") {
    throw new CliFailure(
      createError("NOT_IMPLEMENTED", "`setup mcp` is coming soon in a follow-up release.", {
        hint: "MCP installer bootstrap is not shipped in this package yet. Use `pi-tube setup skills` for skill installation.",
      }),
    );
  }

  throw new CliFailure(
    createError("INPUT_INVALID", `Unsupported setup action: \`${subcommand}\`.`, { hint: SETUP_USAGE_HINT }),
  );
}
