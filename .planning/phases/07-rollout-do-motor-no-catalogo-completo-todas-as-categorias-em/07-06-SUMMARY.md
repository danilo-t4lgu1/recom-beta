---
phase: 07-rollout-do-motor-no-catalogo-completo-todas-as-categorias-em
plan: 06
subsystem: report
tags: [coverage, diagnostic, read-only, D-59, D-60, D-57]
requires:
  - "recommendForProduct (src/recommendation/recommendation-engine.js)"
  - "getLatestSnapshotProducts (src/db/catalog-store.js)"
provides:
  - "buildCoverageReport(catalogProducts) puro: totais, cobertos, zeradas com motivo, reprocesso, byGroup, headlineCoveragePct"
  - "CLI read-only scripts/coverage-report.js (JSON + --csv)"
affects:
  - "Plano 07-07 (remove o protótipo _scope.js)"
  - "Plano 07-08 (1º rollout supervisionado usa este relatório na conferência, D-64)"
tech-stack:
  added: []
  patterns:
    - "Módulo de domínio puro (só importa o motor) + CLI ESM-guard read-only"
key-files:
  created:
    - app-partners-recomendados/src/report/coverage-report.js
    - app-partners-recomendados/src/report/coverage-report.test.js
    - app-partners-recomendados/scripts/coverage-report.js
  modified: []
decisions:
  - "Motivo das zeradas com precedência oculta > sem cor > sem par no grupo, espelhando as guardas fail-closed de recommendForProduct (D-58/D-57)"
  - "reprocess coletado independente de a fonte estar coberta por 2º peso — o objetivo é subir cobertura de 1º peso (D-60)"
  - "headlineCoveragePct informativo, 0 quando não há fontes (nunca divide por zero) — sem meta % fixa (D-59)"
metrics:
  duration_min: 3
  completed: 2026-07-22
  tasks: 2
  files: 3
status: complete
---

# Phase 07 Plan 06: Validação de cobertura (relatório diagnóstico) Summary

Relatório diagnóstico read-only que prova, sobre o catálogo inteiro, quantas fontes com estoque recebem recomendação e o motivo item-a-item das zeradas, mais um caminho de reprocesso — `buildCoverageReport` puro dirigindo `recommendForProduct` + CLI fino (D-59/D-60/D-57).

## O que foi construído

- **`src/report/coverage-report.js`** — `buildCoverageReport(catalogProducts)` puro e determinístico. Itera as fontes COM ESTOQUE (`hasAvailableGrade`), conta como COBERTA quando `recommendForProduct(id, catalog).length > 0` (1º ou 2º peso, D-59) e como ZERADA caso contrário, atribuindo o motivo por precedência: `oculta` (`published === false`) > `sem cor` (`colorValue == null`) > `sem par mesma-cor-em-estoque no grupo elegível` (D-60/D-57). Coleta o caminho de REPROCESSO (fontes com estoque e `fabricTagCanonical == null` → taguear e rerodar), agregados por grupo (`byGroup`) e `headlineCoveragePct` informativo. Único import de projeto: o motor (mesma disciplina de `diff.js`/`review-queue.js`). Nenhum I/O próprio, nenhuma escrita.
- **`scripts/coverage-report.js`** — CLI read-only: `getLatestSnapshotProducts()` → `buildCoverageReport` → saída JSON (default) ou CSV (`--csv`, tabelas de zeradas/reprocesso). Corpo atrás do guard ESM (`import.meta.url === pathToFileURL(process.argv[1]).href`); nunca dispara ao ser importado. Fecha a conexão via `checkpointAndCloseDb` ao final. Substitui o protótipo `_scope.js` (removido no Plano 07-07).
- **`src/report/coverage-report.test.js`** — 11 testes cobrindo cobertos vs. zeradas, cada motivo e sua precedência, reprocesso, seleção só de fontes com estoque, invariante `total == covered + zeroed.length`, `headlineCoveragePct` (3 de 4 → 75), agregados por grupo, catálogo vazio e entrada não-array.

## Como foi verificado

- `npx vitest run src/report/coverage-report.test.js` → 11/11 verde (RED antes da implementação, GREEN depois).
- `npm test` (suíte completa) → 19 arquivos, 235 testes, todos verdes.
- `node scripts/coverage-report.js` roda contra o `data/catalog.db` real e imprime `{ totalSourcesInStock, covered, zeroed, reprocess, byGroup, headlineCoveragePct }`; `--csv` produz as tabelas; importar o módulo não dispara o CLI (guard confirmado).

## Fluxo TDD (plan type=tdd na Task 1)

- RED: commit `92e9664` `test(07-06): add failing tests…` (módulo ausente).
- GREEN: commit `1cc057c` `feat(07-06): buildCoverageReport puro…`.
- REFACTOR: não necessário.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

Nenhum. O relatório deriva 100% de dados reais (`recommendForProduct` + snapshot); sem valores placeholder, sem dados mockados no caminho de produção.

## Self-Check: PASSED

- FOUND: app-partners-recomendados/src/report/coverage-report.js
- FOUND: app-partners-recomendados/src/report/coverage-report.test.js
- FOUND: app-partners-recomendados/scripts/coverage-report.js
- FOUND commit: 92e9664 (test RED)
- FOUND commit: 1cc057c (feat buildCoverageReport)
- FOUND commit: ff58256 (feat CLI)
