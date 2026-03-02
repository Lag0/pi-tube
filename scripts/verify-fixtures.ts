const cmd = [
  "bun",
  "test",
  "test/output/golden-fixture.test.ts",
  "test/output/output-parity.test.ts",
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
