# Release Checklist

Run this checklist before tagging a release.

## 1. Full Automated Suite

```bash
bun run test
```

## 2. Golden Fixture Gate

```bash
bun run verify:fixtures
```

## 3. Command-Contract Smoke Runs

```bash
pi-tube --help
pi-tube provider-status
pi-tube --json provider-status
pi-tube --provider deepgram "https://cdn.example.com/audio/demo.wav"
```

## 4. Error-Contract Sanity Checks

```bash
bun run test -- test/errors/error-taxonomy.test.ts
bun run test -- test/cli/error-exit-codes.test.ts
```

## 5. Docs and Script Alignment

- Confirm `.github/workflows/ci.yml` runs `bun run test` and `bun run verify:fixtures`.
- Confirm `.github/workflows/publish.yml` runs npm provenance publish with version-exists guard.
- Confirm `package.json` contains `verify:fixtures`.
- Confirm README references this checklist and fixture verification command.
