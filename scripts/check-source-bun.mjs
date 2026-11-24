import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const result = spawnSync("bun", ["--version"], { encoding: "utf8" });
if (result.error) throw new Error(`source PATH: cannot spawn native bun: ${result.error.message}`);
assert.equal(result.status, 0, `source bun exited ${result.status ?? result.signal}: ${result.stderr}`);
assert.equal(result.stdout.trim(), "1.3.3", "source CI needs pinned Bun 1.3.3");
