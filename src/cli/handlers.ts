import { CliError, CliPlannedFeatureError } from "../errors/cli-errors.ts";

const DEFERRED_COMMAND_PHASE: Record<string, string> = {
  youtube: "Phase 2",
  instagram: "Phase 3",
  deepgram: "Phase 4",
  groq: "Phase 4",
  providers: "Phase 5",
  config: "Phase 6",
  dl: "Phase 2",
};

export interface BaselineInput {
  input: string;
  json: boolean;
  extraPositionals: string[];
}

export function isDeferredCommand(command: string): boolean {
  return command in DEFERRED_COMMAND_PHASE;
}

export function handleDeferredCommand(command: string, json: boolean): never {
  const phase = DEFERRED_COMMAND_PHASE[command] ?? "a future phase";
  const guidance = [
    "Current implemented contract: `pi-tube <input>`.",
    "Use `pi-tube --help` for the latest command roadmap.",
  ];

  if (json) {
    guidance.push("`--json` output mode is planned for Phase 5.");
  }

  throw new CliPlannedFeatureError(`\`${command}\` command`, phase, guidance);
}

export function handleBaselineInput({ input, json, extraPositionals }: BaselineInput): never {
  if (extraPositionals.length > 0) {
    throw new CliError("Only one positional input is supported in Phase 1.", {
      code: "CLI_CONTRACT_VIOLATION",
      exitCode: 2,
      guidance: [
        "Use exactly one positional input: `pi-tube <input>`.",
        "Run `pi-tube --help` for examples.",
      ],
    });
  }

  const guidance = [
    "Core source intake is planned for Phase 2.",
    "Provider execution is planned for Phase 4.",
    "Use `pi-tube --help` for roadmap-aligned examples.",
  ];

  if (json) {
    guidance.push("`--json` output mode is planned for Phase 5.");
  }

  throw new CliPlannedFeatureError(`Input execution for \`${input}\``, "Phase 2", guidance);
}
