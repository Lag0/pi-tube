import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test, vi } from "vitest";
import {
  resolveWindowsExecutable,
  windowsExecutableCandidates,
} from "../../../src/infrastructure/process/windows-executable.ts";

test.skipIf(process.platform !== "win32")(
  "resolves inert files only in configured directories or explicit paths",
  async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "resolver "));
    try {
      const tools = path.join(cwd, "tools");
      mkdirSync(tools);
      for (const dir of [cwd, tools]) writeFileSync(path.join(dir, "item.exe"), "placeholder");
      const resolve = (command: string, searchPath?: string) =>
        resolveWindowsExecutable(windowsExecutableCandidates(command, cwd, searchPath), performance.now() + 5000);
      expect(await resolve("item", `;"";"${tools}";`)).toEqual({ exe: path.join(tools, "item.exe") });
      expect(await resolve("ITEM.EXE", "tools")).toEqual({ exe: path.join(tools, "ITEM.EXE") });
      for (const empty of [undefined, "", ";;", '""'])
        expect(await resolve("item", empty)).toEqual({ outcome: "not_found" });
      expect(await resolve(".\\item")).toEqual({ exe: path.join(cwd, "item.exe") });
      expect(await resolve(path.join(tools, "item.exe"))).toEqual({ exe: path.join(tools, "item.exe") });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  },
);

test.each(["aborted", "timed_out"] as const)("a pending probe loses to %s without probing again", async (outcome) => {
  const controller = new AbortController();
  let finish!: (found: boolean) => void;
  const probe = vi.fn(
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve;
      }),
  );
  const pending = resolveWindowsExecutable(
    ["C:\\one\\sample.exe", "C:\\two\\sample.exe"],
    performance.now() + (outcome === "aborted" ? 5000 : 50),
    controller.signal,
    probe,
  );
  if (outcome === "aborted") controller.abort();
  expect(await pending).toEqual({ outcome });
  finish(false);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(probe).toHaveBeenCalledTimes(1);
});
