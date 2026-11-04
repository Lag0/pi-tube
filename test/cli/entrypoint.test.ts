import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { spawnCli } from "../helpers/spawn-cli.ts";

function runCli(args: string[]) {
  return spawnCli(args);
}

describe("CLI entrypoint", () => {
  test("bin/pi-tube.ts exists and is runnable", () => {
    expect(existsSync("bin/pi-tube.ts")).toBe(true);

    // Windows has no POSIX execute bits; the spawn below still proves the entrypoint runs there.
    if (process.platform !== "win32") {
      const mode = statSync("bin/pi-tube.ts").mode;
      expect((mode & 0o111) > 0).toBe(true);
    }

    const result = runCli(["--help"]);
    expect(result.exitCode).toBe(0);

    const helpCommand = runCli(["help"]);
    expect(helpCommand.exitCode).toBe(0);
    expect(helpCommand.stdout.toString()).toContain("pi-tube CLI");
  });

  test("DEBUG=true is dropped: groq-sdk would print request headers, the API key included", () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), "pi-tube-debug-"));
    try {
      // A preload reports what the process saw once pi-tube has run.
      writeFileSync(path.join(cwd, "bunfig.toml"), 'preload = ["./report.ts"]\n');
      writeFileSync(
        path.join(cwd, "report.ts"),
        // biome-ignore lint/suspicious/noTemplateCurlyInString: this is the preload's source code, written to a file
        'process.on("exit", () => process.stderr.write(`debug=${process.env.DEBUG ?? "unset"}\\n`));\n',
      );

      const result = spawnCli(["--version"], { DEBUG: "true" }, { cwd });

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toContain("debug=unset");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
