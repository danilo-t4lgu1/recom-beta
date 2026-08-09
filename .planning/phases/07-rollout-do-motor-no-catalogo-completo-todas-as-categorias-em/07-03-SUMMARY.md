---
phase: 07-rollout-do-motor-no-catalogo-completo-todas-as-categorias-em
plan: 03
subsystem: write-path
tags: [escrita-automatica, scheduled, gate-aprovacao, defesa-2, integridade-referencial, triggered-by, tdd, vitest, seguranca]
status: complete

# Dependency graph
requires:
  - phase: 05 (plano 01/02)
    provides: "mecanica de escrita real validada em producao: findMetafield/updateMetafield/createMetafield, insertWriteLog (write_log), notifyWriteFailure"
  - phase: 04 (plano 03)
    provides: "assertApproved/ApprovalRequiredError (gate manual APRV-03) e executeApprovedWrite como ponto unico de escrita"
  - phase: 07 (plano 02)
    provides: "getLatestSnapshotProducts().published tri-estado + shape CatalogProductEntry (colorValue/hasAvailableGrade/published) usado no snapshotById da Defesa 2"
provides:
  - "executeScheduledWrite({ productId, recommendedIds, dryRun, runId, sourceEntry, snapshotById }) — caminho de escrita automatica SEM gate (D-61)"
  - "filterReferentiallyValid(sourceEntry, recommendedIds, snapshotById) — Defesa 2 referencial pura (D-67)"
  - "writeRecommendationMetafield({ productId, approvedIds, triggeredBy, runId }) — helper de escrita compartilhado, triggered_by parametrizado (manual|scheduled)"
  - "Convencao write_log.triggered_by='scheduled' para escritas do job automatico"
affects: [07-05, write-executor, run-daily-job, rollout]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dois caminhos de escrita distintos sobre um helper compartilhado: manual (com gate) e scheduled (sem gate), triggered_by parametrizado — nunca fabricar decisao approved para reusar o caminho manual (Anti-Pattern _batch-write.js)"
    - "Defesa em profundidade na escrita: portao referencial puro (filterReferentiallyValid) aplicado ANTES de qualquer I/O; conjunto vazio vira lacuna registrada (coverage-gap), nunca lixo gravado"
    - "Visibilidade estritamente ===false (null/undefined pre-migracao nunca oculto), coerente com o motor (D-58/A6)"

key-files:
  created: []
  modified:
    - path: app-partners-recomendados/src/review/write-executor.js
      why: "adiciona executeScheduledWrite (D-61) + filterReferentiallyValid (D-67) + helper writeRecommendationMetafield compartilhado; executeApprovedWrite refatorado para reusar o helper mantendo assertApproved como 1a operacao"
    - path: app-partners-recomendados/src/review/write-executor.test.js
      why: "cobertura do caminho scheduled, da Defesa 2 e regressao do gate manual"

decisions:
  - "D-61 implementado como caminho scheduled EXPLICITO (executeScheduledWrite), nunca reabrindo/condicionando o gate de executeApprovedWrite — os dois caminhos compartilham so a mecanica de I/O (writeRecommendationMetafield), nao a politica de autorizacao"
  - "normalizeColor reimplementada localmente (trim+minusculas) em vez de importar normalizeMatchValue do motor (nao exportada) — mantem write-executor sem dependencia do grafo de recomendacao, mesma convencao"
  - "Defesa 2 aplicada ANTES do early-return de dryRun: dry-run de um conjunto que ficaria vazio ja retorna coverage-gap (reflete a decisao real de escrita), preservando zero I/O em ambos os ramos"

metrics:
  duration: 20min
  tasks: 2
  files: 2
  completed: "2026-07-21"
---

# Phase 7 Plan 3: Caminho de escrita scheduled (D-61) + Defesa 2 referencial (D-67) Summary

Adiciona ao ponto unico de escrita (`write-executor.js`) um caminho `scheduled` que grava automaticamente sem o gate de aprovacao previa (D-61, aposenta APRV-03 so no modo automatico) e um portao final referencial (Defesa 2, D-67) que descarta ids invalidos antes de gravar — sem fabricar decisao `approved` e sem enfraquecer o gate do caminho manual.

## What Was Built

- **`filterReferentiallyValid(sourceEntry, recommendedIds, snapshotById)`** (exportada, pura, sem I/O): reconfere cada id contra o snapshot atual — descarta ids ausentes, ocultos (`published === false`), sem estoque (`!hasAvailableGrade`) ou com cor normalizada diferente da fonte. Preserva a ordem dos ids validos. `published` `null`/`undefined` (pre-migracao) NAO conta como oculto (D-58/A6).
- **`executeScheduledWrite({ productId, recommendedIds, dryRun, runId, sourceEntry, snapshotById })`** (exportada): NAO chama `assertApproved` (D-61); aplica a Defesa 2 primeiro; conjunto vazio → `{ approvedIds: [], written: false, reason: 'coverage-gap' }` (lacuna registrada, zero escrita); `dryRun:true` retorna cedo com zero I/O (base do kill switch D-62); modo real grava via helper compartilhado com `triggered_by: 'scheduled'`.
- **`writeRecommendationMetafield({ productId, approvedIds, triggeredBy, runId })`** (helper interno): extrai a mecanica comum (findMetafield → update/createMetafield → insertWriteLog de sucesso; no catch, insertWriteLog failed + `notifyWriteFailure(...).catch(()=>{})` + relançar o erro original), com `triggeredBy` parametrizado.
- **`executeApprovedWrite`** refatorado para reusar o helper com `triggeredBy: 'manual'`, mantendo `assertApproved` como PRIMEIRA operacao e o early-return de `dryRun` INALTERADOS (APRV-03 preservado).

## Security Posture (plano security-sensitive)

- **Sem decisao fabricada:** `executeScheduledWrite` nunca constroi `{ status: 'approved' }` nem chama `assertApproved` — provado por teste SC2/SC3 (grava sem qualquer objeto de decisao).
- **Gate manual intacto:** `executeApprovedWrite` continua lançando `ApprovalRequiredError` quando a decisao nao e approved — os 7 testes pre-existentes seguem verdes + teste de regressao dedicado adicionado.
- **Defesa 2 pre-escrita (D-67):** ids invalidos/danglings descartados ANTES do `JSON.stringify`/I/O; conjunto vazio vira `coverage-gap`, comprovado que update/create/insertWriteLog de sucesso NAO sao chamados.

## Threat Model Coverage

| Threat ID | Mitigation entregue |
|-----------|---------------------|
| T-07-07 (Integrity/Info Disclosure — id oculto/404) | `filterReferentiallyValid` descarta antes de gravar; vazio vira lacuna |
| T-07-08 (EoP — burlar gate fabricando approved) | caminho scheduled explicito, `triggered_by:'scheduled'`; gate manual mantido |
| T-07-09 (Repudiation — escrita sem rastro) | toda tentativa (sucesso/falha) grava 1 linha em write_log; falha dispara notifyWriteFailure sem mascarar erro |

## Verification

- `cd app-partners-recomendados && npx vitest run src/review/write-executor.test.js` → 19/19 verdes (7 pre-existentes + 12 novos).
- `npm test` (suite completa) → 16 arquivos, 187/187 testes verdes. Zero regressao.
- RED/GREEN comprovado: commit `test(07-03)` deixou 11 testes falhando (funcoes inexistentes); commit `feat(07-03)` levou a 19/19.

## Deviations from Plan

None - plano executado exatamente como escrito.

## TDD Gate Compliance

- RED gate: commit `30a2f05` (`test(07-03)`) — testes falhando antes da implementacao.
- GREEN gate: commit `1a3d666` (`feat(07-03)`) — implementacao minima leva a verde.

## Self-Check: PASSED

- FOUND: app-partners-recomendados/src/review/write-executor.js (exports filterReferentiallyValid + executeScheduledWrite verificados via grep)
- FOUND: app-partners-recomendados/src/review/write-executor.test.js
- FOUND commit: 30a2f05 (test RED)
- FOUND commit: 1a3d666 (feat GREEN)
