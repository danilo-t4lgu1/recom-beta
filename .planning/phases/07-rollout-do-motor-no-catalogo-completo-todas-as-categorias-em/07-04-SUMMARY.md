---
phase: 07-rollout-do-motor-no-catalogo-completo-todas-as-categorias-em
plan: 04
subsystem: rollback
tags: [rollback, batch, write_log, CR-01, D-65, D-38, WRTE-03]
status: complete
requires:
  - "performRollback / RollbackConflictError (rollback.js, Fase 05-04)"
  - "listWriteLog / insertWriteLog / checkpointAndCloseDb (catalog-store.js)"
  - "createMetafield / findMetafield / updateMetafield / deleteMetafield (nuvemshop-client/client.js)"
provides:
  - "performRollback com guarda existing == null (CR-01 corrigido): recria via createMetafield ou no-op"
  - "performBatchRollback({ runId }) — rollback em lote que agrega falhas sem abortar"
  - "CLI scripts/rollback-batch.js com flag --run <id> e exit code refletindo erros"
affects:
  - "app-partners-recomendados/scripts/rollback.js"
  - "app-partners-recomendados/scripts/rollback-batch.js (novo)"
tech-stack:
  added: []
  patterns:
    - "Reuso por-produto de performRollback no lote (nunca reescreve a lógica de rollback, D-38)"
    - "Idioma ESM CLI-only: corpo do CLI atrás de import.meta.url === pathToFileURL(process.argv[1]).href; checkpointAndCloseDb/process.exit só no bloco CLI"
    - "Acumulador que nunca aborta: cada produto vira { outcome } (reverted/conflict/error/noop)"
key-files:
  created:
    - "app-partners-recomendados/scripts/rollback-batch.js"
    - "app-partners-recomendados/scripts/rollback-batch.test.js"
  modified:
    - "app-partners-recomendados/scripts/rollback.js"
    - "app-partners-recomendados/scripts/rollback.test.js"
decisions:
  - "CR-01 corrigido com guarda existing == null: recria via createMetafield quando há valor a restaurar, no-op quando ausente e nada a restaurar; metafieldId nunca dereferencia existing.id cru (usa result.id ou null)"
  - "Rollback em lote reusa performRollback por produto (D-38) e agrega { total, reverted, conflicts, errors, items } sem abortar no primeiro problema (T-07-12)"
  - "Alvos do lote = productId distintos das linhas write_log status='success' (linhas failed e duplicatas nunca geram alvos extras); --run restringe ao run_id"
metrics:
  duration: 5min
  completed: "2026-07-21"
  tasks: 2
  files: 4
  tests_added: 6
  tests_total: 193
---

# Phase 07 Plan 04: Rollback seguro em escala de catálogo (CR-01 + lote) Summary

Corrigido o bug **CR-01** (null-pointer no rollback duplo sobre Metafield já deletado) em `performRollback` via guarda `existing == null` — recria com `createMetafield` quando há valor a restaurar, ou registra no-op — e criado `scripts/rollback-batch.js` (`performBatchRollback`) que reusa `performRollback` por produto e agrega falhas/conflitos sem abortar o lote inteiro.

## O que foi construído

### Task 1 — Correção CR-01 em `performRollback` (D-65)
- `rollback.js` agora importa `createMetafield` e trata `existing == null` explicitamente, DEPOIS da guarda de conflito (que preserva `RollbackConflictError`, D-38, intacta):
  - `existing == null && restoredValue == null` → no-op (`{ noop: true }`), nenhuma chamada de rede.
  - `existing == null && restoredValue != null` → **recria** via `createMetafield({ ownerId: productId, value: restoredValue })` (não `updateMetafield`, que exigiria um id inexistente).
  - `existing != null` → caminho original preservado (delete se nada a restaurar, senão update).
- `insertWriteLog` usa `metafieldId: existing ? existing.id : (result && result.id) || null` — nunca `existing.id` cru.
- Testes: **Test 7** (rollback duplo → recria via `createMetafield`, prova que não lança) e **Test 8** (no-op → nenhuma rede, linha rollback com `metafieldId: null`). Ambos reproduziam o `TypeError: Cannot read properties of null (reading 'id')` antes da correção (RED confirmado).

### Task 2 — `rollback-batch.js` (D-65/D-38)
- `performBatchRollback({ runId } = {})`: determina os alvos a partir de `listWriteLog()` (dedupe por `productId` das linhas `status === 'success'`, filtrando por `runId` quando informado) e chama `performRollback({ productId })` por produto num acumulador que **nunca aborta**.
- Cada item vira `{ productId, outcome: 'reverted' | 'conflict' | 'error' | 'noop', message? }` (`conflict` = `RollbackConflictError`, `error` = qualquer outra exceção, `noop` = `performRollback` retornou `{ noop: true }`). Retorna `{ total, reverted, conflicts, errors, items }`.
- A função exportada nunca fecha a conexão nem chama `process.exit` — isso vive só no bloco CLI-only (`--run <id>` opcional, imprime resumo, `checkpointAndCloseDb()`, `process.exit(errors > 0 ? 1 : 0)`).

## Verification

- `npx vitest run scripts/rollback.test.js` → 8/8 (Tests 1-6 preservados + 7/8 novos).
- `npx vitest run scripts/rollback-batch.test.js` → 4/4 (agregação sem abortar, filtro `--run`, noop, guard ESM).
- Suíte completa: `npx vitest run` → **193/193** (187 anteriores + 6 novos), sem regressões.

## Threat model — dispositions cobertas

- **T-07-10** (batch travar por TypeError CR-01): mitigado — guarda `existing == null` + `createMetafield`; Test 7 prova rollback duplo não lança.
- **T-07-11** (sobrescrever edição manual mais recente): mitigado — `RollbackConflictError` (D-38) preservada; o lote agrega o conflito e segue.
- **T-07-12** (lote abortar deixando catálogo parcial): mitigado — acumulador nunca aborta; outcome por produto + exit code refletindo erros.
- **T-07-SC** (supply chain): accept — nenhuma dependência nova.

## Deviations from Plan

None - plano executado exatamente como escrito. Ordem TDD (RED→GREEN) seguida em ambas as tasks; RED confirmado reproduzindo o `TypeError` de CR-01 antes da correção.

## Known Stubs

Nenhum. `{ noop: true }` é um resultado legítimo de domínio (Metafield já ausente e nada a restaurar), não um stub — coberto por Test 8.

## Self-Check: PASSED

- FOUND: app-partners-recomendados/scripts/rollback.js
- FOUND: app-partners-recomendados/scripts/rollback.test.js
- FOUND: app-partners-recomendados/scripts/rollback-batch.js
- FOUND: app-partners-recomendados/scripts/rollback-batch.test.js
- FOUND commit: 8f29dbf (fix CR-01)
- FOUND commit: 6422ea9 (feat rollback em lote)
