import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { expect, test } from "vitest";

const original = "fake-original-token";
const replacement = "fake-replacement-token";
const language = ["defaults", "language", "pt-BR"];
const provider = ["config", "set", "defaults.provider", "groq"];
const setEnv = ["config", "set", "providers.groq.api_key_env", "TEST_KEY"];
const logout = ["auth", "logout", "groq"];
const login = ["auth", "login", "groq", "--stdin"];

async function overlap(a: string[], b: string[]) {
  const home = mkdtempSync(path.join(os.tmpdir(), "pi-tube-overlap-"));
  const file = path.join(home, "config.json");
  writeFileSync(file, JSON.stringify({ future: true, providers: { groq: { extra: 1, api_key: original } } }));
  const run = (role: string, args: string[]) => {
    const child = spawn(
      "bun",
      ["--no-env-file", "--preload", "./test/helpers/config-overlap-preload.cjs", "bin/pi-tube.ts", ...args],
      {
        timeout: 45000,
        env: {
          PATH: process.env.PATH,
          SystemRoot: process.env.SystemRoot,
          HOME: home,
          USERPROFILE: home,
          PI_TUBE_CONFIG_PATH: file,
          TEST_WRITER: role,
        },
      },
    );
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    const done = new Promise<number | null>((resolve, reject) => {
      child.on("error", reject);
      child.on("close", resolve);
    });
    child.stdin.end(args === login ? `${replacement}\n` : undefined);
    return { child, done, output: () => output };
  };
  const children: ReturnType<typeof run>[] = [];
  const until = async (predicate: () => boolean) => {
    const end = Date.now() + 20000;
    while (!predicate()) {
      if (Date.now() > end) throw new Error("Writer handshake timed out");
      await delay(10);
    }
  };
  try {
    children.push(run("A", a));
    await until(() => existsSync(`${file}.paused`));
    const second = run("B", b);
    children.push(second);
    await until(() => second.child.exitCode !== null || existsSync(`${file}.contended`));
    writeFileSync(`${file}.release`, "");
    for (const writer of children) {
      expect(await writer.done).toBe(0);
      expect(writer.output()).not.toContain(original);
      expect(writer.output()).not.toContain(replacement);
    }
    const config = JSON.parse(readFileSync(file, "utf8"));
    expect(config.future).toBe(true);
    expect(config.providers.groq.extra).toBe(1);
    return config;
  } finally {
    for (const writer of children) writer.child.kill();
    await Promise.allSettled(children.map((writer) => writer.done));
    rmSync(home, { recursive: true, force: true });
  }
}

test("overlapping defaults and config set preserve both edits and the unrelated credential", async () => {
  const config = await overlap(language, provider);
  expect(config.defaults).toEqual({ language: "pt-br", provider: "groq" });
  expect(config.providers.groq.api_key).toBe(original);
}, 60000);

test("overlapping logout and defaults do not restore the credential", async () => {
  const config = await overlap(language, logout);
  expect(config.defaults.language).toBe("pt-br");
  expect(config.providers.groq).toEqual({ extra: 1 });
}, 60000);

test("overlapping login and env binding match one complete serial order", async () => {
  const config = await overlap(setEnv, login);
  expect([
    { extra: 1, api_key: replacement },
    { extra: 1, api_key: replacement, api_key_env: "TEST_KEY" },
  ]).toContainEqual(config.providers.groq);
}, 60000);
