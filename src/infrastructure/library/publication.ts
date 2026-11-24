import { randomUUID } from "node:crypto";
import { lstat, mkdir, rm, rmdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { errnoOf } from "../errno.ts";
import { readUnlinkedFile } from "./transcript-cleanup.ts";

export const publicationDeadline = () => performance.now() + 2000;
async function retry(deadline: number) {
  const remaining = deadline - performance.now();
  if (remaining <= 0) throw Error("Publication has not settled");
  await delay(Math.min(10, remaining));
}

export const publicationRecord = (target: string) => `${target}.publication`;

async function generation(target: string) {
  let bytes: Buffer;
  try {
    bytes = await readUnlinkedFile(publicationRecord(target));
  } catch (error) {
    if (errnoOf(error) === "ENOENT" || errnoOf(error) === "ENOTDIR") return undefined;
    throw error;
  }
  const record = bytes.toString();
  const [magic, name, state] = record.split("\n");
  if (
    magic !== "pi-tube-publication-v1" ||
    name !== path.basename(target) ||
    !state ||
    record !== `${magic}\n${name}\n${state}` ||
    !/^(pending|committed):[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/.test(state)
  )
    throw Error("Unrecognized publication record");
  return state;
}

export async function readPublication<T>(
  target: string,
  deadline: number,
  read: (bytes: Buffer) => T | Promise<T>,
): Promise<T | undefined> {
  let readFailed = false;
  for (;;) {
    const before = await generation(target);
    if (!before?.startsWith("pending:")) {
      try {
        const value = await read(await readUnlinkedFile(target));
        if (before === (await generation(target))) return value;
      } catch (error) {
        if (!before && ["ENOENT", "ENOTDIR"].includes(errnoOf(error)) && (await generation(target)) === undefined)
          return undefined;
        // A hard link is temporarily shared with the publisher's private temp until cleanup.
        if (readFailed && !(await present(`${target}.publishing`)) && before === (await generation(target)))
          throw error;
        readFailed = true;
      }
    }
    await retry(deadline);
  }
}

export async function present(target: string) {
  try {
    await lstat(target);
    return true;
  } catch (error) {
    if (["ENOENT", "ENOTDIR"].includes(errnoOf(error))) return false;
    throw error;
  }
}

export async function withPublication<T>(target: string, deadline: number, write: (enrolled: boolean) => Promise<T>) {
  const claim = `${target}.publishing`;
  for (;;) {
    try {
      await mkdir(claim, { mode: 0o700 });
      break;
    } catch (error) {
      if (errnoOf(error) !== "EEXIST") throw error;
      await retry(deadline);
    }
  }
  try {
    return await write((await generation(target)) !== undefined);
  } finally {
    await rmdir(claim);
  }
}

/** Pending survives both copy and certification failures: absence must never become admissible again. */
export async function enrollCopy(
  target: string,
  enrolled: boolean,
  rename: (from: string, to: string) => Promise<void>,
) {
  const token = randomUUID();
  const state = publicationRecord(target);
  const prefix = `pi-tube-publication-v1\n${path.basename(target)}\n`;
  const replace = async (phase: string) => {
    const tmp = `${state}.${token}.${phase}.tmp`;
    await writeFile(tmp, `${prefix}${phase}:${token}`, { flag: "wx", mode: 0o600 });
    try {
      await rename(tmp, state);
    } finally {
      await rm(tmp, { force: true });
    }
  };
  if (enrolled) await replace("pending");
  else await writeFile(state, `${prefix}pending:${token}`, { flag: "wx", mode: 0o600 });
  return () => replace("committed");
}
