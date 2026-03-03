---
quick_task: 2
description: "No caso eu quero interativo por padrão, que é para humanos instalarem e eu quero não interativo com flag para AIs instalarem. E o não interativo deve ser junto com o global, deve ser para instalar o pacote de maneira global na máquina com o symlink. E alem disso ele deve executar o comando, não só enviar qual comando deve ser executado"
created_at: "2026-03-03T18:46:14.051Z"
---

# Quick Plan 2

## Task 1
files: [src/cli/setup.ts, src/cli/build-cli.ts]
action: Invert setup skills defaults to interactive mode and add explicit `--non-interactive` path that enforces global install behavior while executing installer commands.
verify: Dry-run command generation reflects new flag semantics and real execution path remains active.
done: [x]

## Task 2
files: [src/cli/command-contract.ts, README.md]
action: Update CLI help examples/notes and docs to match the new install-mode contract.
verify: Help and README describe interactive default + AI-oriented non-interactive global mode.
done: [x]

## Task 3
files: [test/cli/setup-cli.test.ts, test/cli/help.test.ts, test suite]
action: Update regression tests for the new flags and run full validation.
verify: Setup/help tests and full `bun test` pass.
done: [x]
