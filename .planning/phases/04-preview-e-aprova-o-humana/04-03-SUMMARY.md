---
phase: 04-preview-e-aprova-o-humana
plan: 03
subsystem: api
tags: [approval-gate, dry-run, tdd, node, vitest]

# Dependency graph
requires:
  - phase: 04-preview-e-aprova-o-humana (04-01, 04-02)
    provides: getApprovalDecision shape (Plano 04-01) e computeDiff/recomputeAfterRemoval (Plano 04-02), consumidos indiretamente pelo shape de `decision` esperado por assertApproved
provides:
  - "ApprovalRequiredError (classe) — erro tipado com .name/.productId, distinguível de erros genéricos"
  - "assertApproved(productId, decision) — único ponto de decisão 'pode escrever?', retorna conjunto exato de ids aprovados (D-25)"
  - "executeApprovedWrite({productId, decision, dryRun}) — ponto único de entrada para escrita, gate primeiro, stub reutilizável pela Fase 5"
affects: [04-preview-e-aprova-o-humana (04-05, endpoint HTTP de escrita), Fase 5 (WRTE-01-05, substitui só o corpo do if(!dryRun))]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Função pura de autorização recebendo decision já lido (nunca abre conexão própria) — mesma disciplina de recommendation-engine.js/catalog-store.js"
    - "Gate chamado como primeira instrução do corpo da função de escrita, antes de qualquer efeito"
    - "dryRun sempre parâmetro explícito, nunca lido de process.env dentro do módulo de domínio"

key-files:
  created:
    - app-partners-recomendados/src/review/approval-gate.js
    - app-partners-recomendados/src/review/approval-gate.test.js
    - app-partners-recomendados/src/review/write-executor.js
    - app-partners-recomendados/src/review/write-executor.test.js
  modified: []

key-decisions:
  - "dryRun ausente (undefined) é normalizado para false via !!dryRun no retorno — comportamento falsy sem lançar erro de tipo (Test 11), decisão explícita já que ambos os ramos são idênticos nesta fase"

patterns-established:
  - "Pattern 3 do RESEARCH (approval-gate.js): função pura de gate, zero import, testável sem SQLite"
  - "Pattern 4 do RESEARCH (write-executor.js): stub reutilizável com dryRun explícito, gate primeiro"

requirements-completed: [APRV-03, APRV-04]

# Metrics
duration: 15min
completed: 2026-07-16
status: complete
---

# Phase 04 Plan 03: Approval Gate + Write Executor Summary

**Gate de aprovação (`assertApproved`) e executor de escrita stub (`executeApprovedWrite`) construídos via TDD, com o gate chamado como primeira operação de qualquer caminho de escrita — nenhum efeito acontece antes da decisão "pode escrever?".**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-07-16
- **Tasks:** 2 completed
- **Files modified:** 4 (todos novos)

## Accomplishments
- `approval-gate.js`: `ApprovalRequiredError` + `assertApproved(productId, decision)` — lança sempre que a decisão for null/undefined ou status diferente de `'approved'`; retorna o conjunto exato de ids aprovados (D-25) quando válida. Zero importações (função pura estrutural).
- `write-executor.js`: `executeApprovedWrite({productId, decision, dryRun})` — chama `assertApproved` como primeira instrução do corpo (gate nunca contornável); ambos os ramos `dryRun:true`/`dryRun:false` produzem o mesmo resultado stub nesta fase (Pitfall 5 do RESEARCH); prova comportamental via stub de `fetch` que lança confirma zero chamada de rede mesmo no ramo não-dry-run.
- 11 comportamentos novos, todos verdes; suíte completa do projeto passou de 86 para 97 testes, sem regressão.

## Task Commits

Cada task seguiu o ciclo RED→GREEN (TDD):

1. **Task 1: approval-gate.js** — `a508574` (test: RED, 6 testes) → `11c9971` (feat: GREEN)
2. **Task 2: write-executor.js** — `73e10c0` (test: RED, 5 testes) → `a35fda5` (feat: GREEN)

## Files Created/Modified
- `app-partners-recomendados/src/review/approval-gate.js` - `ApprovalRequiredError` + `assertApproved`, único ponto de decisão de autorização
- `app-partners-recomendados/src/review/approval-gate.test.js` - 6 testes cobrindo decisão ausente/rejected/pending/approved, shape do erro, ausência de I/O
- `app-partners-recomendados/src/review/write-executor.js` - `executeApprovedWrite`, gate primeiro, dry-run explícito
- `app-partners-recomendados/src/review/write-executor.test.js` - 5 testes cobrindo propagação do gate, paridade dry-run true/false, prova de zero rede, dryRun ausente

## Decisions Made
- `dryRun` ausente é normalizado para `false` no valor retornado (`dryRun: !!dryRun`) em vez de repassar `undefined` — evita que o shape de retorno vaze um `undefined` não documentado, mantendo o contrato de tipo (`boolean`) descrito na interface do plano; comportamento continua falsy/equivalente a `dryRun:false` conforme Test 11 exige.

## Deviations from Plan

None - plan executado exatamente como escrito.

## Issues Encountered

None.

## User Setup Required

None - nenhuma configuração de serviço externo necessária.

## TDD Gate Compliance

Sequência RED→GREEN confirmada em ambas as tasks via `git log`:
- Task 1: `test(04-03)` (a508574) antes de `feat(04-03)` (11c9971)
- Task 2: `test(04-03)` (73e10c0) antes de `feat(04-03)` (a35fda5)

Nenhum REFACTOR necessário (implementação seguiu Pattern 3/Pattern 4 do RESEARCH verbatim, sem duplicação a limpar).

## Next Phase Readiness

- APRV-03/APRV-04 têm forma de função pronta e testada para o Plano 04-05 (endpoint HTTP de escrita real, que chamará `executeApprovedWrite` e mapeará `ApprovalRequiredError` para um código de erro dedicado, ex. 409).
- Fase 5 (WRTE-01-05) pode substituir apenas o corpo do `if (!dryRun)` em `write-executor.js` sem redesenho de assinatura nem do gate.
- Nenhum bloqueio identificado.

---
*Phase: 04-preview-e-aprova-o-humana*
*Completed: 2026-07-16*

## Self-Check: PASSED

All 4 created files found on disk; all 4 task commit hashes (a508574, 11c9971, 73e10c0, a35fda5) found in `git log`.
