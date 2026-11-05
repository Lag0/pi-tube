import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const WORKFLOWS = path.resolve(".github", "workflows");

const workflowFiles = (): string[] =>
  readdirSync(WORKFLOWS)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .map((name) => path.join(WORKFLOWS, name));

/** A marked block of publish.yml's version step, as a shell script. */
const block = (name: string): string => {
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

const runBash = (script: string): { status: number; stdout: string } => {
  try {
    return { status: 0, stdout: execFileSync("bash", ["-c", script], { encoding: "utf8", stdio: "pipe" }).trim() };
  } catch (error) {
    const status = typeof error === "object" && error !== null && "status" in error ? Number(error.status) : -1;
    return { status, stdout: "" };
  }
};

const distTagFor = (version: string): string =>
  runBash(`VERSION=${JSON.stringify(version)}\n${block("dist-tag")}\necho "$DIST_TAG"`).stdout;

describe("GitHub workflows", () => {
  test("every action is pinned to a full commit SHA", () => {
    const unpinned = workflowFiles().flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .filter((line) => /^\s*(-\s*)?uses:/.test(line))
        .filter((line) => !/uses:\s*[\w.-]+\/[\w.-]+(\/[\w./-]+)?@[0-9a-f]{40}(\s|$)/.test(line))
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

  test.skipIf(process.platform === "win32").each([
    ["v3.0.0", "3.0.0", 0],
    ["", "3.0.0", 0],
    ["v3.0.0", "3.0.1", 1],
    ["3.0.0", "3.0.0", 1],
  ])("release tag %j with version %s exits %i", (tag, version, status) => {
    const script = `RELEASE_TAG=${JSON.stringify(tag)}\nVERSION=${JSON.stringify(version)}\n${block("tag-guard")}`;

    expect(runBash(script).status).toBe(status);
  });
});
