---
phase: 06-opera-o-di-ria-aut-noma-na-nuvem
plan: 02
subsystem: infra
tags: [github-actions, cron, ci-cd, git, commit-back]

# Dependency graph
requires:
  - phase: 06-opera-o-di-ria-aut-noma-na-nuvem
    provides: "scripts/run-daily-job.js (06-01) — orquestrador testável do job agendado, checkpointAndCloseDb()"
provides:
  - ".github/workflows/daily-recompute.yml — cron diário (06:00 UTC / 03:00 BRT) + workflow_dispatch, permissions mínimas (contents: write), commit-back sem mascaramento de falha (D-45/D-46), skip ci contra loop auto-infligido"
  - "Repositório local conectado a um GitHub remoto real (origin) — pré-requisito de infraestrutura para RULE-03 existir de fato"
affects: [operação contínua da fase 6, qualquer fase futura que dependa de execução agendada na nuvem]

# Tech tracking
tech-stack:
  added: [github-actions]
  patterns:
    - "defaults.run.working-directory no nível do job para evitar repetir cd em cada step"
    - "permissions explícito e mínimo (contents: write) no nível do job, nunca write-all nem herdado"
    - "[skip ci] na mensagem de commit-back para evitar loop de CI auto-infligido"
    - "git add -f para arquivo coberto por .gitignore de desenvolvimento (data/*.db) em contexto de CI"

key-files:
  created:
    - .github/workflows/daily-recompute.yml
  modified: []

key-decisions:
  - "Repositório GitHub criado vazio (sem README/gitignore/license) para não conflitar com o histórico local pré-existente das Fases 1-6"
  - "Push direto para master sem --force — remote vazio aceitou o histórico completo sem conflito"

patterns-established:
  - "Pattern: step de commit-back nunca usa continue-on-error — falha de git push derruba o job visivelmente (D-46)"

requirements-completed: [RULE-03]

# Metrics
duration: ~10min (Task 1 + Task 3; Task 2 foi checkpoint de ação humana externa)
completed: 2026-07-17
status: complete
---

# Phase 06 Plan 02: Workflow Agendado + Conexão do Repositório GitHub Summary

**Workflow do GitHub Actions (`daily-recompute.yml`) publicado com cron diário e disparo manual, e repositório local conectado a um GitHub remoto real (`origin`) com histórico completo enviado — fecha RULE-03 de ponta a ponta.**

## Performance

- **Duration:** ~10 min de trabalho automatizável (Task 1 + Task 3); Task 2 foi um checkpoint de ação humana externa (criação de repositório + cadastro de secrets no GitHub, fora do controle do executor)
- **Started:** 2026-07-17
- **Completed:** 2026-07-17
- **Tasks:** 3/3 (1 auto, 1 checkpoint human-action resolvido, 1 auto)
- **Files modified:** 1 (`.github/workflows/daily-recompute.yml`, arquivo novo)

## Accomplishments
- `.github/workflows/daily-recompute.yml` criado do zero (primeiro workflow do repositório): `cron: '0 6 * * *'` (06:00 UTC / 03:00 BRT, D-52) + `workflow_dispatch: {}` para teste de idempotência sob demanda (SC#2)
- `permissions: contents: write` explícito e mínimo no nível do job — nunca `write-all`, nunca omitido
- Step de commit-back configura identidade do bot, `git add -f data/catalog.db` (contorna `.gitignore` de desenvolvimento), guarda de "nada staged" (idempotência do 06-01), e `git commit`/`git push` sem `continue-on-error` em nenhum nível — falha real de push derruba o job visivelmente (D-46)
- Mensagem de commit-back inclui `[skip ci]` para nunca disparar o próprio workflow de novo (T-06-07)
- Checkpoint humano (Task 2) resolvido: usuário criou repositório vazio em `github.com/danilo-t4lgu1/recom-beta`, cadastrou os secrets `NUVEMSHOP_ACCESS_TOKEN` e `NUVEMSHOP_STORE_ID` (nomes corrigidos durante a resolução do checkpoint em relação a uma tentativa anterior), confirmou ausência de branch protection bloqueante em `master`
- Repositório local conectado ao remote real e histórico completo (Fases 1-6, incluindo o próprio workflow) enviado com sucesso via `git push -u origin master`, sem `--force`

## Task Commits

Cada task foi commitada atomicamente:

1. **Task 1: .github/workflows/daily-recompute.yml — workflow agendado (RULE-03/D-45/D-46/D-52)** - `a314ea8` (feat)
2. **Task 2: Criar/conectar o repositório GitHub + cadastrar secrets** - N/A (checkpoint `human-action`, sem commit de código — ação externa do usuário no GitHub)
3. **Task 3: Conectar o remote e enviar o histórico local** - N/A (operação git de infraestrutura — `git remote add origin` + `git push -u origin master`; nenhum arquivo de código modificado, portanto nenhum novo commit gerado além dos já existentes que foram enviados)

**Plan metadata:** commit final de STATE/ROADMAP pulado (`commit_docs: false` em `.planning/config.json`) — mesmo comportamento intencional já documentado em `06-01-SUMMARY.md`.

## Files Created/Modified
- `.github/workflows/daily-recompute.yml` - workflow agendado do GitHub Actions: checkout, setup-node, `npm ci`, execução de `scripts/run-daily-job.js` (06-01) com secrets injetados via `env:`, e commit-back de `data/catalog.db` sem mascaramento de falha

## Decisions Made
- Repositório GitHub (`recom-beta`) criado **vazio** (sem README/gitignore/license), exatamente conforme instruído no checkpoint, para evitar conflito de histórico com os commits locais já existentes das Fases 1-6
- Push realizado sem `--force` — o remote vazio aceitou o histórico completo em fast-forward, confirmando que a orientação de criar um repositório vazio foi a escolha correta
- Nenhuma decisão arquitetural nova além do que já estava especificado no plano

## Deviations from Plan

None - plano executado exatamente como escrito. A Task 3 (conectar remote + push) foi verificada como completa pelo orquestrador antes desta etapa de fechamento (ver evidência abaixo), sem necessidade de reexecutar o push.

**Evidência de verificação da Task 3 (já confirmada pelo orquestrador, reproduzida aqui para o registro):**
```
$ git remote -v
origin  https://github.com/danilo-t4lgu1/recom-beta.git (fetch)
origin  https://github.com/danilo-t4lgu1/recom-beta.git (push)
$ git rev-parse --verify -q origin/master
a314ea88b2286ff4e73d6cad160c087c9c3488bc
$ git status
On branch master
Your branch is up to date with 'origin/master'.
```
Os 3 acceptance criteria da Task 3 (origin corretamente configurado, `origin/master` resolvendo, branch sincronizada sem push pendente) estão satisfeitos.

## Issues Encountered
None além do fluxo normal do checkpoint humano (Task 2), que exigiu correção dos nomes dos secrets em relação a uma tentativa anterior — resolvido durante a própria resolução do checkpoint, sem impacto no restante do plano.

## User Setup Required

Concluído nesta execução (não é mais pendente): repositório GitHub criado, secrets `NUVEMSHOP_ACCESS_TOKEN`/`NUVEMSHOP_STORE_ID` cadastrados, branch protection confirmada compatível com push direto do bot do workflow.

## Next Phase Readiness
- RULE-03 fechado de ponta a ponta: existe um repositório GitHub real (`danilo-t4lgu1/recom-beta`), com secrets configurados, executando `scripts/run-daily-job.js` (06-01) num agendamento diário via `.github/workflows/daily-recompute.yml`
- D-45/D-46 respeitados: commit-back nunca mascara falha (sem `continue-on-error`), nunca dispara loop de CI (`[skip ci]`)
- Painel de revisão (`review-server.js`, D-49) continua rodando localmente sem nenhuma mudança — o operador sincroniza via `git pull`
- Verificação manual pendente (D-51/SC#1, fora do escopo automatizável): disparar o workflow manualmente via `workflow_dispatch` na aba Actions do GitHub e confirmar visualmente que o job completa e o commit-back acontece — ver `06-VALIDATION.md` "Manual-Only Verifications"
- Fase 6 completa: 3/3 planos (06-01, 06-02, 06-03) entregues

---
*Phase: 06-opera-o-di-ria-aut-noma-na-nuvem*
*Completed: 2026-07-17*

## Self-Check: PASSED

- FOUND: .github/workflows/daily-recompute.yml
- FOUND commit: a314ea8
- FOUND: origin/master resolvido via `git rev-parse --verify -q origin/master` (evidência reproduzida acima, já confirmada pelo orquestrador antes desta etapa)
