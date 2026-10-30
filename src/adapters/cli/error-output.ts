import { type ErrorCategory, type ErrorCode, getErrorCategory, type PiTubeError } from "../../core/index.ts";

/** Thrown inside the CLI adapter to stop a command with a `PiTubeError`; `runCli` prints it and exits. */
export class CliFailure extends Error {
  public readonly code: ErrorCode;
  public readonly hint: string;

  constructor(error: PiTubeError) {
    super(error.message);
    this.name = "CliFailure";
    this.code = error.code;
    this.hint = error.hint;
  }
}

/** Process exit code for each error category. */
export const EXIT_CODE_BY_CATEGORY: Readonly<Record<ErrorCategory, number>> = {
  usage: 2,
  dependency: 3,
  provider: 4,
  source: 5,
  config: 6,
  cancelled: 130,
  unexpected: 1,
};

export const exitCodeFor = (error: PiTubeError): number => EXIT_CODE_BY_CATEGORY[getErrorCategory(error.code)];

export const formatErrorForCli = (error: PiTubeError): string =>
  `[${error.code}] ${error.message}\nhint: ${error.hint}`;
