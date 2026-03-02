import { CliError } from "../errors/cli-errors.ts";

const LEGACY_COMMAND_GUIDANCE: Record<string, string[]> = {
  deepgram: [
    "Legacy command detected: `pi-tube deepgram <input>`.",
    "Use the canonical Phase 1 contract now: `pi-tube <input>`.",
    "Provider-specific command routing will return in Phase 4.",
  ],
  groq: [
    "Legacy command detected: `pi-tube groq <input>`.",
    "Use the canonical Phase 1 contract now: `pi-tube <input>`.",
    "Provider-specific command routing will return in Phase 4.",
  ],
  dl: [
    "Legacy command detected: `pi-tube dl <url>`.",
    "Use the canonical Phase 1 contract now: `pi-tube <input>`.",
    "Source-specific download behavior is planned for Phase 2.",
  ],
  providers: [
    "Legacy command detected: `pi-tube providers`.",
    "Provider status command is planned for Phase 5.",
    "Use `pi-tube --help` for current contract and roadmap labeling.",
  ],
};

export function isLegacyCommand(command: string): boolean {
  return command in LEGACY_COMMAND_GUIDANCE;
}

export function throwLegacyCommandGuidance(command: string, includeJsonNote: boolean): never {
  const guidance = LEGACY_COMMAND_GUIDANCE[command] ?? [
    "Legacy command detected.",
    "Use `pi-tube <input>` for the current Phase 1 contract.",
  ];

  if (includeJsonNote) {
    guidance.push("`--json` output mode is planned for Phase 5.");
  }

  throw new CliError(`\`${command}\` maps to legacy CLI behavior and is not active in the Bun v1 path.`, {
    code: "CLI_LEGACY_COMPAT",
    exitCode: 2,
    guidance,
  });
}
