export interface BaselineInput {
  input: string;
  json: boolean;
}

export interface HandlerResult {
  exitCode: number;
  stdout?: string;
  stderr?: string;
}

export function handleBaselineInput({ input, json }: BaselineInput): HandlerResult {
  const jsonSuffix = json ? " JSON output is planned for Phase 5." : "";

  return {
    exitCode: 2,
    stderr:
      `NOT_IMPLEMENTED: input processing for \`${input}\` is not available yet.` +
      " Core source intake lands in Phase 2 and provider execution lands in Phase 4." +
      jsonSuffix +
      "",
  };
}
