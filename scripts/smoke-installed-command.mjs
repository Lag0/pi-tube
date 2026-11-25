import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repo = fileURLToPath(new URL("../", import.meta.url));
const root = mkdtempSync(path.join(tmpdir(), "pi-tube npm smoke "));
try {
  assert(!realpathSync(root).startsWith(realpathSync(repo) + path.sep), "temp directory must be outside checkout");
  const cwd = path.join(root, "working directory");
  const prefix = path.join(root, "prefix");
  const home = path.join(root, "home");
  for (const dir of [cwd, prefix, home]) mkdirSync(dir);
  const config = path.join(home, "config.json");
  const win = process.platform === "win32";
  const env = {
    PATH: process.env.PATH,
    ...(win && { SystemRoot: process.env.SystemRoot, ComSpec: process.env.ComSpec, PATHEXT: process.env.PATHEXT }),
    HOME: home,
    USERPROFILE: home,
    APPDATA: home,
    LOCALAPPDATA: home,
    TMP: root,
    TEMP: root,
    TMPDIR: root,
    XDG_CONFIG_HOME: home,
    XDG_CACHE_HOME: home,
    PI_TUBE_CONFIG_PATH: config,
    PI_TUBE_LIBRARY_DIR: path.join(home, "library"),
    npm_config_userconfig: path.join(home, "user.npmrc"),
    npm_config_globalconfig: path.join(home, "global.npmrc"),
    npm_config_cache: path.join(home, "npm-cache"),
    npm_config_registry: "https://registry.npmjs.org/",
  };
  function run(label, command, args, options = {}) {
    const result = spawnSync(command, args, { cwd, env, encoding: "utf8", timeout: 180000, ...options });
    if (result.error) throw new Error(`${label}: cannot run ${command}: ${result.error.message}`);
    assert.equal(
      result.status,
      0,
      `${label} exited ${result.status ?? result.signal}: ${result.stderr}\n${result.stdout}`,
    );
    return result.stdout.trim();
  }
  const bun = run("locate native Bun", "bun", ["--no-env-file", "--print", "process.execPath"]);
  env.PATH = [
    path.dirname(bun),
    path.dirname(process.execPath),
    ...(win ? [path.join(env.SystemRoot, "System32")] : ["/usr/bin", "/bin"]),
  ].join(path.delimiter);
  // npm run supplies the CLI module; invoke it with Node, never via an npm.cmd shell fallback.
  const npm = (label, ...args) => run(label, process.execPath, [process.env.npm_execpath, ...args, "--ignore-scripts"]);
  const [pack] = JSON.parse(npm("npm pack", "pack", repo, "--pack-destination", root, "--json"));
  const metadata = JSON.parse(readFileSync(path.join(repo, "package.json"), "utf8"));
  const files = new Set(pack.files.map(({ path }) => path));
  for (const file of [
    metadata.bin["pi-tube"],
    "bin/pi-tube.ts",
    "src/main.ts",
    "src/infrastructure/process/windows-binary-process.ts",
    "skills/pi-tube/SKILL.md",
    "skills/pi-tube/rules/install.md",
    "skills/pi-tube/rules/security.md",
  ])
    assert(files.has(file), `missing packed ${file}`);
  npm(
    "npm dependency install",
    "install",
    path.join(root, pack.filename),
    "--prefix",
    prefix,
    "--omit=dev",
    "--no-audit",
    "--no-fund",
  );
  const modules = path.join(prefix, "node_modules");
  const pkg = realpathSync(path.join(modules, metadata.name));
  assert(pkg.startsWith(realpathSync(prefix) + path.sep), "installed package outside prefix");
  const installed = JSON.parse(readFileSync(path.join(pkg, "package.json"), "utf8"));
  const launcher = path.join(modules, ".bin", win ? "pi-tube.cmd" : "pi-tube");
  // Only these fixed arguments reach cmd. Expand the quoted path once, with delayed expansion off.
  const invoke = (arg) =>
    win
      ? run(
          `installed ${arg}`,
          path.join(env.SystemRoot, "System32", "cmd.exe"),
          ["/d", "/v:off", "/s", "/c", `""%SMOKE_LAUNCHER%" ${arg}"`],
          { windowsVerbatimArguments: true, env: { ...env, SMOKE_LAUNCHER: launcher } },
        )
      : run(`installed ${arg}`, launcher, [arg]);
  assert(invoke("--help").includes("pi-tube download <url>"));
  assert.equal(invoke("--version"), `pi-tube ${installed.version}`);
  writeFileSync(path.join(cwd, ".env"), "GROQ_API_KEY=dotenv-probe\n");
  assert.deepEqual(invoke("providers").split(/\r?\n/), [
    "[PROVIDERS]",
    `config_path=${config}`,
    ...["deepgram", "groq", "elevenlabs"].map((id) => `${id} configured=false key_source=none`),
  ]);
  console.log(`Installed CLI parser smoke passed: ${installed.name}@${installed.version}`);
  const probe = path.join(cwd, "installed-page-audio.mjs");
  copyFileSync(path.join(repo, "test/fixtures-process/installed-page-audio.mjs"), probe);
  const entry = path.join(pkg, "src/infrastructure/media/page-audio.ts");
  for (const mode of ["intact", "abort", "timeout", "exit"]) {
    const output = run(
      `installed page audio ${mode}`,
      bun,
      ["--no-env-file", probe, entry, mode, path.join(repo, "test/fixtures-media")],
      { timeout: 9000 },
    );
    assert.match(output, new RegExp(`^${mode} passed `));
    console.log(`Installed page audio: ${output}`);
  }
  if (win) {
    const input = path.join(cwd, "synthetic.bin");
    const bytes = Buffer.from([0, 255, 13, 10]);
    writeFileSync(input, bytes);
    const runner = pathToFileURL(path.join(pkg, "src/infrastructure/process/run-process.ts"));
    const output = run("installed Windows native binary runner", bun, [
      "--no-env-file",
      "-e",
      `
        import { runProcess } from ${JSON.stringify(runner.href)};
        const chunks = [];
        const result = await runProcess({ command: ${JSON.stringify(process.execPath)},
          args: ["-e", "process.stdin.pipe(process.stdout)"], env: process.env, timeoutMs: 10000,
          windowsBinaryStdinPath: ${JSON.stringify(input)}, writeStdout: chunk => chunks.push(chunk) });
        if (result.outcome !== "exited" || result.exitCode !== 0) throw Error(JSON.stringify(result));
        console.log(Buffer.concat(chunks).toString("hex"));`,
    ]);
    assert.equal(output, bytes.toString("hex"));
    console.log("Installed Windows native binary stdin/stdout smoke passed");
  }
} finally {
  rmSync(root, { recursive: true, force: true });
}
