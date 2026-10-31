const cmd = [
  "bun",
  "test",
  "test/core/domain/transcript/golden-fixture.test.ts",
  "test/core/domain/transcript/output-parity.test.ts",
];

const result = Bun.spawnSync({
  cmd,
  stdout: "inherit",
  stderr: "inherit",
});

if (result.exitCode !== 0) {
  console.error(`[VERIFY_FIXTURES_FAILED] exit=${result.exitCode}`);
  process.exit(result.exitCode);
}

console.log("[VERIFY_FIXTURES_OK] output fixtures match canonical renderers");
