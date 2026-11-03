import { createError, type DoctorCheck, toSafeLine } from "../../../core/index.ts";
import { CliFailure, unwrapOrFail } from "../error-output.ts";
import type { CliDeps } from "../io.ts";
import { hintForCommand } from "../usage-hints.ts";

export interface DoctorCommand {
  readonly args: readonly string[];
  readonly json: boolean;
}

const checkLines = (check: DoctorCheck): readonly string[] => [
  toSafeLine(`${check.status} ${check.id} ${check.summary}`),
  ...(check.fix === undefined ? [] : [`  fix: ${toSafeLine(check.fix)}`]),
];

/** `pi-tube doctor [--json]`: checks the installation; exits 0 even when a check is an error (the report says so). */
export const runDoctor = async (deps: CliDeps, command: DoctorCommand): Promise<number> => {
  if (command.args.length > 0) {
    throw new CliFailure(
      createError("INPUT_INVALID", "`doctor` takes no arguments.", { hint: hintForCommand("doctor") }),
    );
  }
  const report = unwrapOrFail(await deps.app.runDoctor({}));
  if (command.json) {
    const body = {
      ok: report.ok,
      checks: report.checks.map((check) => ({ ...check, fix: check.fix ?? null })),
    };
    deps.io.writeOut(JSON.stringify(body, null, 2));
    return 0;
  }
  const errors = report.checks.filter((check) => check.status === "error").length;
  const warnings = report.checks.filter((check) => check.status === "warn").length;
  deps.io.writeOut(
    [`[DOCTOR] ok=${report.ok} errors=${errors} warnings=${warnings}`, ...report.checks.flatMap(checkLines)].join("\n"),
  );
  return 0;
};
