export class CliError extends Error {
  public readonly code: string;
  public readonly exitCode: number;
  public readonly guidance: string[];

  constructor(message: string, options: { code: string; exitCode?: number; guidance?: string[] }) {
    super(message);
    this.name = "CliError";
    this.code = options.code;
    this.exitCode = options.exitCode ?? 2;
    this.guidance = options.guidance ?? [];
  }
}

export class CliPlannedFeatureError extends CliError {
  constructor(feature: string, phase: string, guidance: string[] = []) {
    super(`${feature} is coming soon in ${phase}.`, {
      code: "CLI_NOT_IMPLEMENTED",
      exitCode: 2,
      guidance,
    });
    this.name = "CliPlannedFeatureError";
  }
}

export function formatCliError(error: unknown): { message: string; exitCode: number } {
  if (error instanceof CliError) {
    const lines = [`[${error.code}] ${error.message}`];
    for (const tip of error.guidance) {
      lines.push(`- ${tip}`);
    }
    return { message: lines.join("\n"), exitCode: error.exitCode };
  }

  const fallback = error instanceof Error ? error.message : "Unexpected CLI failure";
  return { message: `[CLI_UNEXPECTED] ${fallback}`, exitCode: 1 };
}
