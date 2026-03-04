---
quick_task: 3
description: "gostaria que o output padrão da resposta fosse na ~/.pi-tube/YYYY-MM-DD-(titulo do video, nome do arquivo). e no stdout do terminal linkasse esse arquivo para poder clicar e abri-lo"
created_at: "2026-03-04T13:00:41.334Z"
---

# Quick Plan 3

## Task 1
files: [src/output/persist.ts, src/cli/handlers.ts, src/cli/build-cli.ts]
action: Add default artifact persistence to ~/.pi-tube using date+title/filename naming and print clickable path/URI in stdout.
verify: Baseline CLI runs write artifact files and stdout includes [OUTPUT_FILE] + [OUTPUT_FILE_URI].
done: [x]

## Task 2
files: [README.md, src/cli/command-contract.ts]
action: Update docs/help notes to reflect file-first output behavior.
verify: Help/readme mention output file location and stdout link behavior.
done: [x]

## Task 3
files: [test/cli/output-file.ts, test/cli/output-cli.test.ts, test/cli/transcription-cli.test.ts, test/cli/intake-cli.test.ts, test/cli/config-cli.test.ts]
action: Update CLI tests to read generated files from [OUTPUT_FILE] and validate content/path contract.
verify: Focused CLI tests and full bun test pass.
done: [x]
