import {
  type ErrorCategory,
  type ErrorCode,
  getErrorCategory,
  type PiTubeError,
  type Result,
  toSafeLine,
} from "../../core/index.ts";

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

/** Returns the data of a successful result; a failed one stops the command with its error. */
export const unwrapOrFail = <T>(result: Result<T>): T => {
  if (!result.success) throw new CliFailure(result.error);
  return result.data;
};

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

/**
 * Two lines, `[CODE] message` and `hint: ...`. Messages can carry page titles and yt-dlp stderr, so both lines go
 * through `toSafeLine`: a page cannot drive the terminal or add lines.
 */
export const formatErrorForCli = (error: PiTubeError): string =>
  `[${error.code}] ${toSafeLine(error.message)}\nhint: ${toSafeLine(error.hint)}`;
