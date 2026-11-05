import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const WORKFLOWS = path.resolve(".github", "workflows");

// `uses: owner/repo[/path]@<40-hex SHA>`, optionally followed by a `# vX.Y.Z` comment.
const PINNED_USES = /uses:\s*[\w.-]+\/[\w.-]+(\/[\w./-]+)?@[0-9a-f]{40}(\s|$)/;

interface BashRun {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

const workflowFiles = (): string[] =>
  readdirSync(WORKFLOWS)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .map((name) => path.join(WORKFLOWS, name));

/** A block of publish.yml's version step between `# <name>:start` and `# <name>:end`, as a shell script. */
const publishScriptBlock = (name: string): string => {
  const workflow = readFileSync(path.join(WORKFLOWS, "publish.yml"), "utf8");
  const start = workflow.indexOf(`# ${name}:start`);
  const end = workflow.indexOf(`# ${name}:end`);
  if (start < 0 || end < 0) throw new Error(`publish.yml has no ${name} block`);
  return workflow
    .slice(start, end)
    .split("\n")
    .map((line) => line.trim())
    .join("\n");
};

const runBash = (script: string): BashRun => {
  try {
    const stdout = execFileSync("bash", ["-c", script], { encoding: "utf8", stdio: "pipe" });
    return { status: 0, stdout: stdout.trim(), stderr: "" };
  } catch (error) {
    // A script killed by a signal has `status: null`: never read that as success.
    const failed = typeof error === "object" && error !== null ? error : {};
    const status = "status" in failed && typeof failed.status === "number" ? failed.status : -1;
    const stderr = "stderr" in failed ? String(failed.stderr) : "";
    return { status, stdout: "", stderr };
  }
};

const distTagFor = (version: string): string =>
  runBash(`VERSION=${JSON.stringify(version)}\n${publishScriptBlock("dist-tag")}\necho "$DIST_TAG"`).stdout;

describe("GitHub workflows", () => {
  test("every action is pinned to a full commit SHA", () => {
    const unpinned = workflowFiles().flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .filter((line) => /^\s*(-\s*)?uses:/.test(line))
        .filter((line) => !PINNED_USES.test(line))
        .map((line) => `${path.basename(file)}: ${line.trim()}`),
    );

    expect(unpinned).toEqual([]);
  });

  test("publish runs from a published release or by hand, never on a push to main", () => {
    const workflow = readFileSync(path.join(WORKFLOWS, "publish.yml"), "utf8");
    const triggers = workflow.slice(workflow.indexOf("on:"), workflow.indexOf("permissions:"));

    expect(triggers).toContain("release:");
    expect(triggers).toContain("types: [published]");
    expect(triggers).toContain("workflow_dispatch:");
    expect(triggers).not.toContain("push:");
  });

  // `bash` on a Windows runner may resolve to WSL, which is not installed there.
  test.skipIf(process.platform === "win32").each([
    ["3.0.0", "latest"],
    ["3.0.0-next.1", "next"],
    ["3.0.0-rc.2", "next"],
    ["3.0.0-beta.1", "next"],
  ])("version %s publishes to the %s dist-tag", (version, tag) => {
    expect(distTagFor(version)).toBe(tag);
  });

  test.skipIf(process.platform === "win32")("a script killed by a signal never reads as success", () => {
    expect(runBash("kill -KILL $$").status).not.toBe(0);
  });

  // Same Windows limit as above.
  test.skipIf(process.platform === "win32").each([
    // A published release: its tag must be v<version>.
    ["v3.0.0", "tag", "v3.0.0", "3.0.0", 0],
    ["v3.0.0", "tag", "v3.0.0", "3.0.1", 1],
    ["3.0.0", "tag", "3.0.0", "3.0.0", 1],
    // A manual run: only on its version tag; never on a branch, even one named like a tag.
    ["", "tag", "v3.0.0", "3.0.0", 0],
    ["", "tag", "v3.0.1", "3.0.0", 1],
    ["", "branch", "main", "3.0.0", 1],
    ["", "branch", "v3.0.0", "3.0.0", 1],
  ])("release tag %j, ref %s %s, version %s exits %i", (tag, refType, refName, version, status) => {
    const script = [
      `RELEASE_TAG=${JSON.stringify(tag)}`,
      `REF_TYPE=${JSON.stringify(refType)}`,
      `REF_NAME=${JSON.stringify(refName)}`,
      `VERSION=${JSON.stringify(version)}`,
      publishScriptBlock("tag-guard"),
    ].join("\n");
    const run = runBash(script);

    expect(run.status, run.stderr).toBe(status);
  });
});
