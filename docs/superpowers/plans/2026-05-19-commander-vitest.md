# Commander + Vitest Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hand-written CLI argument parser with Commander and migrate the test runner from `bun test` to Vitest without changing the public CLI contract.

**Architecture:** Keep existing command handlers (`src/cli/handlers.ts`) as the business-logic boundary and replace only `src/cli/build-cli.ts` argument parsing/routing with a Commander program. Keep Bun as the runtime/package manager for now; Vitest becomes the test runner and continues to execute TypeScript tests against the same source files.

**Tech Stack:** Bun, TypeScript ESM, Commander, Vitest, existing pi-tube provider/intake/output modules.

---

## Files and Responsibilities

- Modify `package.json`: add `commander` dependency, `vitest` devDependency, update `test` script to `vitest run`, add optional `test:watch`.
- Create `vitest.config.ts`: Vitest config for Bun/Node-compatible TypeScript tests with globals disabled and deterministic include patterns.
- Modify `src/cli/build-cli.ts`: replace custom parser with Commander program construction while preserving `runCli(argv): Promise<number>` and current stdout/stderr behavior.
- Modify `src/cli/command-contract.ts`: update examples/help text if Commander output or command descriptions need small alignment, while preserving tests' contract expectations where possible.
- Modify `test/cli/*.test.ts` and related tests only if they rely on Bun-test-specific APIs or exact help wording that must change.
- Modify `README.md` / `docs/release-checklist.md` only if they mention `bun test` as the canonical test command.

---

### Task 1: Add Commander and Vitest Dependencies

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Update dependencies and scripts**

Run:

```bash
bun add commander
bun add -d vitest
```

Then ensure `package.json` contains these script entries:

```json
{
  "scripts": {
    "pi-tube": "bun run --bun bin/pi-tube.ts",
    "start": "bun run --bun bin/pi-tube.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "verify:fixtures": "bun run --bun scripts/verify-fixtures.ts",
    "publish-beta": "npm publish --tag beta --access public",
    "publish-prod": "npm publish --access public"
  }
}
```

- [ ] **Step 2: Create Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globals: false,
    testTimeout: 10_000,
    hookTimeout: 10_000,
    restoreMocks: true,
    clearMocks: true,
  },
});
```

- [ ] **Step 3: Run tests and record baseline failures**

Run:

```bash
bun run test
```

Expected: some tests may fail because existing tests import from `bun:test`; record exact failures before changing test code.

- [ ] **Step 4: Commit dependency migration checkpoint**

```bash
git add package.json bun.lock vitest.config.ts
git commit -m "chore: add commander and vitest"
```

---

### Task 2: Make Tests Vitest-Compatible

**Files:**
- Modify: `test/**/*.test.ts` as needed

- [ ] **Step 1: Replace Bun test imports**

Find imports:

```bash
rg 'from "bun:test"|from '\''bun:test'\''' test
```

Replace each:

```ts
import { describe, expect, test } from "bun:test";
```

with:

```ts
import { describe, expect, test } from "vitest";
```

If a file imports `beforeEach`, `afterEach`, `mock`, or `spyOn`, import the Vitest equivalent:

```ts
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
```

Then translate Bun-specific mocking APIs to `vi` APIs only where failures require it.

- [ ] **Step 2: Run Vitest**

Run:

```bash
bun run test
```

Expected: test runner starts under Vitest. Remaining failures should be real CLI-contract/help-output differences or Bun-specific helper usage.

- [ ] **Step 3: Fix Bun-specific assumptions**

For tests spawning the CLI, keep using Bun to execute the CLI runtime. Do not switch the application runtime to Node in this PR. The expected command shape remains:

```ts
Bun.spawnSync(["bun", "run", "--bun", "bin/pi-tube.ts", ...args], options);
```

- [ ] **Step 4: Commit test migration**

```bash
git add test package.json bun.lock vitest.config.ts
git commit -m "test: migrate suite to vitest"
```

---

### Task 3: Replace Manual CLI Parser with Commander

**Files:**
- Modify: `src/cli/build-cli.ts`
- Potentially modify: `src/cli/command-contract.ts`
- Test: `test/cli/help.test.ts`, `test/cli/error-exit-codes.test.ts`, `test/cli/config-cli.test.ts`, `test/cli/transcription-cli.test.ts`

- [ ] **Step 1: Preserve public entrypoint contract**

Keep this exported API unchanged:

```ts
export async function runCli(argv: string[]): Promise<number> {
  // returns 0 on success, non-zero on formatted CliError
}
```

Do not change `src/index.ts` or `bin/pi-tube.ts` unless tests prove it is required.

- [ ] **Step 2: Implement a Commander program factory**

In `src/cli/build-cli.ts`, import Commander:

```ts
import { Command, CommanderError, InvalidArgumentError } from "commander";
```

Create a local helper:

```ts
function createProgram(): Command {
  const program = new Command();

  program
    .name(COMMAND_IDENTITY)
    .description("Deterministic media transcription workflows for humans and automation.")
    .exitOverride()
    .allowExcessArguments(false)
    .allowUnknownOption(false)
    .helpOption("-h, --help", "Show help.")
    .version(APP_VERSION, "-v, --version", "Show version.");

  program
    .option("--json", "Output deterministic JSON format.")
    .option("--provider <provider>", "Select transcription provider (deepgram or groq).")
    .option("--language <code>", "Optional language preference.")
    .option("--timestamps", "Include timestamp blocks in transcript output.")
    .option("--no-color", "Disable ANSI colors in help output.");

  return program;
}
```

Then add explicit subcommands for `setup`, `config`, and `provider-status`. Route subcommand actions to existing handlers; do not duplicate business logic.

- [ ] **Step 3: Preserve custom help output if necessary**

The current tests assert a deterministic help contract rendered by `renderHelpDocument`. Prefer keeping this output by handling help before Commander's default formatter when argv is one of:

```ts
[]
["--help"]
["-h"]
["help"]
["help", "config"]
["help", "setup"]
["help", "provider-status"]
```

Use existing:

```ts
console.log(renderHelp(topic, color));
return 0;
```

This gives Commander routing without forcing a large help-output rewrite.

- [ ] **Step 4: Preserve error formatting**

Wrap Commander parsing in the existing `try/catch`. Convert `CommanderError` into `CliError` with current stable codes when possible:

```ts
if (error instanceof CommanderError) {
  throw new CliError(error.message, {
    code: "CLI_CONTRACT_VIOLATION",
    exitCode: error.exitCode === 0 ? 0 : 2,
    guidance: [`Run \`${COMMAND_IDENTITY} --help\` to view supported options.`],
  });
}
```

The final catch must still call:

```ts
const formatted = formatCliError(error);
console.error(formatted.message);
return formatted.exitCode;
```

- [ ] **Step 5: Route baseline transcription through Commander operands**

For the default command, collect one positional input and route to existing code:

```ts
const result = await handleBaselineInput({
  input: first,
  json: Boolean(options.json),
  extraPositionals: rest,
  provider: options.provider,
  language: options.language,
  timestamps: Boolean(options.timestamps),
  onProgress: (step) => progress.update(step),
});
```

Keep the progress reporter and persisted output behavior unchanged.

- [ ] **Step 6: Run CLI contract tests**

Run:

```bash
bun run test -- test/cli/help.test.ts test/cli/error-exit-codes.test.ts test/cli/config-cli.test.ts test/cli/transcription-cli.test.ts
```

Expected: all pass. If help wording changes, update tests only when the new wording is intentional and still deterministic.

- [ ] **Step 7: Commit Commander migration**

```bash
git add src/cli test/cli package.json bun.lock
git commit -m "refactor: route cli through commander"
```

---

### Task 4: Update Documentation and Release Gates

**Files:**
- Modify: `README.md`
- Modify: `docs/release-checklist.md`
- Potentially modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Find stale test command references**

Run:

```bash
rg "bun test|bun run test|vitest|verify:fixtures" README.md docs .github package.json
```

- [ ] **Step 2: Update canonical test command**

Where documentation says `bun test`, replace with:

```bash
bun run test
```

Keep fixture verification as:

```bash
bun run verify:fixtures
```

- [ ] **Step 3: Update CI only if needed**

If `.github/workflows/ci.yml` directly runs `bun test`, change it to:

```yaml
- run: bun run test
```

- [ ] **Step 4: Commit docs/CI updates**

```bash
git add README.md docs/release-checklist.md .github/workflows/ci.yml
git commit -m "docs: document vitest test command"
```

---

### Task 5: Final Verification

**Files:**
- No new files unless failures reveal necessary fixes.

- [ ] **Step 1: Run full automated verification**

```bash
bun run test
bun run verify:fixtures
bun run pi-tube --help
bun run pi-tube config --help
bun run pi-tube provider-status
```

Expected:
- Vitest suite passes.
- Fixture verification passes.
- Help commands print deterministic help and exit 0.
- `provider-status` prints provider readiness without crashing.

- [ ] **Step 2: Verify package contents still include runtime files**

Run:

```bash
bun pm pack --dry-run
```

Expected: package includes `bin`, `src`, `skills`, and `README.md` as before.

- [ ] **Step 3: Final commit if any verification fixes were needed**

```bash
git status --short
git add <changed-files>
git commit -m "fix: stabilize commander vitest migration"
```

Only commit if files changed after Task 4.

---

## Self-Review

- Spec coverage: covers Step 1 Commander migration and Step 2 Vitest migration; tsup is intentionally excluded.
- Placeholder scan: no TBD/TODO placeholders; each task has concrete files, commands, expected outcomes, and commit points.
- Type consistency: existing `runCli(argv): Promise<number>` contract and handler function names match current source files.
