---
quick_task: 4
description: "Atualizar skill para novos padrões de comandos e implementar early exit + fallback de providers quando credenciais/configuração estiverem ausentes ou falharem"
created_at: "2026-03-04T23:27:14.537Z"
---

# Quick Plan 4

## Task 1
files: [skills/pi-tube/SKILL.md, skills/pi-tube/rules/install.md]
action: Atualizar a skill e instruções de instalação para refletirem os comandos atuais (help por subcomando, aliases de config e setup não interativo).
verify: Skill e install docs exibem comandos atuais e fluxos recomendados de configuração.
done: [ ]

## Task 2
files: [src/transcription/service.ts, src/errors/cli-errors.ts, src/errors/catalog.ts]
action: Adicionar preflight de credenciais com early-exit determinístico quando nenhum provider estiver configurado e fallback automático deepgram↔groq para falhas recuperáveis.
verify: Fluxos sem API key falham rápido com guidance claro; quando provider selecionado falha e fallback está configurado, transcrição continua com fallback.
done: [ ]

## Task 3
files: [test/transcription/transcription-service.test.ts, test/cli/transcription-cli.test.ts, test/cli/error-exit-codes.test.ts, .planning/quick/4-percebi-dois-problemas-primeiro-a-skill-/4-SUMMARY.md]
action: Cobrir comportamento com testes de serviço/CLI e registrar resultados no summary.
verify: Testes focados verdes e sem regressão dos contratos de erro.
done: [ ]
