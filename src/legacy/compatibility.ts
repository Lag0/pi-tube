import { CliError } from "../errors/cli-errors.ts";

const LEGACY_COMMAND_GUIDANCE: Record<string, string[]> = {
  deepgram: [
    "Legacy command detected: `pi-tube deepgram <input>`.",
    "Use `pi-tube transcribe <input> --provider deepgram`.",
  ],
  groq: [
    "Legacy command detected: `pi-tube groq <input>`.",
    "Use `pi-tube transcribe <input> --provider groq`.",
  ],
  dl: [
    "Legacy command detected: `pi-tube dl <url>`.",
    "Use `pi-tube download <url>`.",
  ],
  providers: [
    "Legacy command detected: `pi-tube providers`.",
    "Use `pi-tube auth status`.",
  ],
};

export function isLegacyCommand(command: string): boolean {
  return command in LEGACY_COMMAND_GUIDANCE;
}

export function throwLegacyCommandGuidance(command: string, includeJsonNote: boolean): never {
  const guidance = LEGACY_COMMAND_GUIDANCE[command] ?? [
    "Legacy command detected.",
    "Use `pi-tube transcribe <input>`.",
  ];

  if (includeJsonNote) {
    guidance.push("Use `pi-tube transcribe <input> --json` for deterministic JSON output.");
  }

  throw new CliError(`\`${command}\` maps to legacy CLI behavior and is not active in the v2 command surface.`, {
    code: "CLI_LEGACY_COMPAT",
    exitCode: 2,
    guidance,
  });
}
