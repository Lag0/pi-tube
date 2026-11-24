# Contributing to pi-tube

Thanks for helping. This guide covers the local setup and what a pull request needs before review.

## Setup

pi-tube uses [Bun](https://bun.sh) (version pinned in `package.json` under `packageManager`). Tests run on Node 22 through Vitest.

```bash
bun install
```

Run the CLI from source:

```bash
bun run pi-tube --help
```

## Before opening a pull request

These checks must pass locally; CI runs the same commands on Linux, macOS and Windows.

```bash
node scripts/check-source-bun.mjs
bun run typecheck
bun run lint
bun run test
bun run verify:fixtures
npm run smoke:installed
```

The preflight checks that Node can spawn native Bun 1.3.3 on the source-test PATH. The separate npm smoke packs this checkout once, installs its tarball and real production dependencies into a disposable local prefix with scripts disabled, then runs npm’s launcher from outside the checkout. It checks help, version and credential-free providers (including ignoring `.env`). Installation may fetch public dependencies; npm does not use `bun.lock`. This does not test registry publication, global PATH setup, npx fetching, paid services or other runtime versions.

`bun run format` applies the formatter and safe lint fixes.

## Guidelines

- One topic per pull request. Unrelated cleanups go in a separate PR.
- Tests come with the code they cover. Bug fixes include a test that fails without the fix.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`, `ci:`).
- Code, comments and documentation are in English.
- Never commit API keys, cookies or real transcripts of private media.

## Reporting bugs and requesting features

Use the issue forms on GitHub. For security problems, do not open an issue: follow [SECURITY.md](SECURITY.md).

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).
