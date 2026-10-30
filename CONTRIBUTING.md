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

All four checks must pass locally; CI runs the same commands on Linux, macOS and Windows.

```bash
bun run typecheck
bun run lint
bun run test
bun run verify:fixtures
```

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
