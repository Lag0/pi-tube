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
    "pi-tube config set defaults.provider deepgram",
    "",
    "Then install the Codex skill bundle:",
    "pi-tube setup skills",
  ];

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
    throw new CliError("Missing `setup` subcommand. Use `install`, `skills`, or `mcp`.", {
      code: "CLI_CONTRACT_VIOLATION",
      guidance: [
        "Use `pi-tube setup install` for npm install commands.",
        "Use `pi-tube setup skills` to install skill files into your agent tooling.",
      ],
    });
  }

  if (subcommand === "install") {
    return handleSetupInstall();
  }

  if (subcommand === "skills") {
    return handleSetupSkills(options);
  }

  if (subcommand === "mcp") {
    throw new CliPlannedFeatureError("`setup mcp`", "a follow-up release", [
      "MCP installer bootstrap is not shipped in this package yet.",
      "Use `pi-tube setup skills` for skill installation.",
    ]);
  }

  throw new CliError(`Unsupported setup subcommand: \`${subcommand}\`.`, {
    code: "CLI_CONTRACT_VIOLATION",
    guidance: ["Use one of: install, skills, mcp."],
  });
}
