import { CliError, CliPlannedFeatureError } from "../errors/cli-errors.ts";

const SKILLS_NPX_PACKAGE = "skills@1.4.1";
const SKILL_SOURCE = "https://github.com/Lag0/pi-tube/tree/main";
const NPM_PACKAGE_NAME = "@syxs/pi-tube";

export interface SetupOptions {
  global?: boolean;
  nonInteractive?: boolean;
  agent?: string;
  env?: Record<string, string | undefined>;
}

function toCommandString(command: string, args: string[]): string {
  const parts = [command, ...args].map((part) =>
    part.includes(" ") || part.includes('"') ? JSON.stringify(part) : part
  );
  return parts.join(" ");
}

function runCommand(command: string, args: string[], options: SetupOptions): void {
  const commandString = toCommandString(command, args);
  const testDryRun = (options.env?.PI_TUBE_TEST_SETUP_DRY_RUN ?? process.env.PI_TUBE_TEST_SETUP_DRY_RUN) === "1";

  console.log(`Running: ${commandString}\n`);

  if (testDryRun) {
    return;
  }

  const result = Bun.spawnSync({
    cmd: [command, ...args],
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    env: options.env ?? process.env,
  });

  if (result.exitCode !== 0) {
    throw new CliError(`Failed to run setup command: \`${commandString}\`.`, {
      code: "SETUP_COMMAND_FAILED",
      guidance: [
        "Verify that Node.js and npx are available in your environment.",
      ],
    });
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

function getPlatform(options: SetupOptions): NodeJS.Platform | string {
  return options.env?.PI_TUBE_TEST_PLATFORM ?? process.env.PI_TUBE_TEST_PLATFORM ?? process.platform;
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
    if (getPlatform(options) !== "darwin") {
      throw new CliError("Automatic yt-dlp install is only supported on macOS with Homebrew.", {
        code: "SETUP_COMMAND_FAILED",
        guidance: [
          "Install yt-dlp manually for your platform.",
          "macOS/Homebrew: `brew install yt-dlp`.",
          "Python/pipx: `pipx install yt-dlp`.",
          "Then verify with `yt-dlp --version`.",
        ],
      });
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

export function handleSetupCommand(
  subcommand: string | undefined,
  options: SetupOptions = {},
): string | null {
  if (!subcommand) {
    throw new CliError("Missing or unsupported setup action.", {
      code: "CLI_CONTRACT_VIOLATION",
      guidance: ["Use one of: `pi-tube setup yt-dlp`, `pi-tube setup skills`, `pi-tube setup mcp`."],
    });
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
    throw new CliPlannedFeatureError("`setup mcp`", "a follow-up release", [
      "MCP installer bootstrap is not shipped in this package yet.",
      "Use `pi-tube setup skills` for skill installation.",
    ]);
  }

  throw new CliError(`Unsupported setup action: \`${subcommand}\`.`, {
    code: "CLI_CONTRACT_VIOLATION",
    guidance: ["Use one of: `pi-tube setup yt-dlp`, `pi-tube setup skills`, `pi-tube setup mcp`."],
  });
}
