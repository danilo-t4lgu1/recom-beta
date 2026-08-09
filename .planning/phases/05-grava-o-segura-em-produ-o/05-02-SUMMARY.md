---
phase: 05-grava-o-segura-em-produ-o
plan: 02
subsystem: database
tags: [sqlite, better-sqlite3, write-log, audit, snapshot, tdd]

# Dependency graph
requires:
  - phase: 04-fila-de-aprova-o-manual
    provides: approval_queue (D-25) — conjunto exato de ids aprovados que o Plano 05-03 vai gravar via write_log
provides:
  - "Tabela write_log (D-41): snapshot (previous_value/written_value) + auditoria (triggered_by/status/error_message/written_at) numa unica linha por tentativa de escrita real"
  - "insertWriteLog(params): insere exatamente 1 linha nova, append-only"
  - "getLastSuccessfulWriteLog({ productId }): base do rollback (D-38), so status='success' conta"
  - "listWriteLog(): todas as linhas, written_at DESC, sem filtro (D-42), base de GET /audit"
affects: [05-03 (escrita real de Metafields), 05-04 (rollback), 05-05 (tela de auditoria)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Tabela append-only com dupla responsabilidade (snapshot + auditoria) numa unica linha, evitando duas tabelas separadas para o mesmo evento"
    - "Traducao snake_case -> camelCase isolada em uma funcao auxiliar (mapWriteLogRow) reutilizada por getLastSuccessfulWriteLog e listWriteLog"

key-files:
  created: []
  modified:
    - app-partners-recomendados/src/db/schema.sql
    - app-partners-recomendados/src/db/catalog-store.js
    - app-partners-recomendados/src/db/catalog-store.test.js

key-decisions:
  - "write_log criada via CREATE TABLE IF NOT EXISTS (nunca ALTER TABLE) - tabela inteiramente nova, sem conflito com data/catalog.db real ja existente"
  - "getLastSuccessfulWriteLog filtra status='success' ANTES do ORDER BY/LIMIT - garante que uma linha failed mais recente nunca mascara o ultimo sucesso real"
  - "better-sqlite3 habilita PRAGMA foreign_keys=ON por padrao (confirmado em runtime) - testes de write_log precisam seedar o produto real via persistIngestionBatch antes de inserir na tabela, ja que product_id e NOT NULL REFERENCES products(id)"

patterns-established:
  - "Pattern: tabela dupla-proposito (snapshot+auditoria) para eventos de escrita real, seguindo a mesma disciplina append-only de catalog_snapshots"

requirements-completed: [WRTE-02, WRTE-04]

# Metrics
duration: 15min
completed: 2026-07-16
status: complete
---

# Phase 05 Plan 02: write_log — schema + persistência Summary

**Tabela write_log (D-41) unindo snapshot (previous_value/written_value) e auditoria (triggered_by/status/error_message/written_at) numa única linha, com insertWriteLog/getLastSuccessfulWriteLog/listWriteLog testados via TDD**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-16T16:36:00Z
- **Completed:** 2026-07-16T16:41:39Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 3

## Accomplishments
- `write_log` adicionada a `schema.sql` via `CREATE TABLE IF NOT EXISTS` (tabela nova, sem `ALTER TABLE`, sem risco contra `data/catalog.db` real) + índice `idx_write_log_product`
- `insertWriteLog`, `getLastSuccessfulWriteLog`, `listWriteLog` implementadas em `catalog-store.js`, seguindo a mesma convenção de tradução snake_case→camelCase já usada por `getApprovalDecision`/`listApprovalQueueChanges`
- `getLastSuccessfulWriteLog` comprovadamente nunca confunde uma linha `failed` mais recente com o último `success` do mesmo produto (Test 14)
- 4 testes novos (Tests 13-16) cobrindo os 4 comportamentos do plano; 16/16 no arquivo, 131/131 na suíte completa

## Task Commits

Cada fase do ciclo TDD foi commitada atomicamente:

1. **Task 1 — RED (testes falhando)** - `80bc1f6` (test)
2. **Task 1 — GREEN (implementação)** - `f4dad1e` (feat)

_Nota: fase REFACTOR não foi necessária — nenhuma limpeza pendente após o GREEN._

## Files Created/Modified
- `app-partners-recomendados/src/db/schema.sql` - tabela `write_log` (9 colunas: id, product_id, run_id, metafield_id, previous_value, written_value, triggered_by, status, error_message, written_at) + `idx_write_log_product`
- `app-partners-recomendados/src/db/catalog-store.js` - 3 `db.prepare(...)` novos (`insertWriteLogStmt`, `selectLastSuccessfulWriteLogStmt`, `selectAllWriteLogStmt`) + `mapWriteLogRow` (tradução) + 3 funções exportadas (`insertWriteLog`, `getLastSuccessfulWriteLog`, `listWriteLog`)
- `app-partners-recomendados/src/db/catalog-store.test.js` - describe `write_log (Fase 5, D-41/D-42)` com 4 testes (Tests 13-16) e helper `seedProduct`

## Decisions Made
- `write_log` combina snapshot e auditoria numa única tabela/linha (D-41), evitando o design alternativo de duas tabelas separadas — decisão já tomada no plano, confirmada como correta na implementação
- Filtro `status = 'success'` aplicado dentro da própria query SQL (`WHERE ... AND status = 'success' ORDER BY written_at DESC LIMIT 1`), não em JavaScript pós-leitura — garante a semântica correta mesmo com muitas linhas
- `runId`/`metafieldId`/`previousValue`/`writtenValue`/`errorMessage` normalizados para `null` (nunca `undefined`) antes de `db.prepare(...).run()`, pois better-sqlite3 lança erro ao receber `undefined` como parâmetro nomeado

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Testes de write_log precisaram seedar o produto real antes de inserir**
- **Found during:** Task 1, primeira execução dos testes (fase GREEN)
- **Issue:** `write_log.product_id` é `NOT NULL REFERENCES products(id)`; better-sqlite3 habilita `PRAGMA foreign_keys = ON` por padrão (confirmado via `node -e` em runtime), então inserir uma linha `write_log` para um `productId` inexistente em `products` lança `SqliteError: FOREIGN KEY constraint failed` — bloqueava 3 dos 4 testes novos de rodar
- **Fix:** Adicionado helper `seedProduct(store, productId)` no arquivo de teste que grava o produto real via `persistIngestionBatch` (mesmo caminho já usado por `seedRunWithBaseline`) antes de cada `insertWriteLog`; `runId` retornado por `seedProduct` reutilizado nas chamadas de `insertWriteLog` em vez de um valor hardcoded arbitrário
- **Files modified:** app-partners-recomendados/src/db/catalog-store.test.js
- **Verification:** `npx vitest run src/db/catalog-store.test.js` — 16/16 verdes; `npx vitest run` (suíte completa) — 131/131 verdes
- **Committed in:** f4dad1e (Task 1 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Ajuste restrito ao arquivo de teste (nenhuma mudança de comportamento em `catalog-store.js`/`schema.sql`); necessário para os testes rodarem sob a configuração real de foreign keys do better-sqlite3. Sem escopo adicional.

## Issues Encountered
None além do deviation documentado acima.

## User Setup Required

None - nenhuma configuração de serviço externo necessária.

## Next Phase Readiness
- `write_log` e as 3 funções de persistência estão prontas para o Plano 05-03 (escrita real de Metafields) gravar snapshot+auditoria a cada tentativa de escrita, o Plano 05-04 (rollback) consumir `getLastSuccessfulWriteLog`, e o Plano 05-05 (tela de auditoria) consumir `listWriteLog` sem lógica adicional de filtro
- Nenhum bloqueio identificado

---
*Phase: 05-grava-o-segura-em-produ-o*
*Completed: 2026-07-16*

## Self-Check: PASSED

- FOUND: app-partners-recomendados/src/db/schema.sql
- FOUND: app-partners-recomendados/src/db/catalog-store.js
- FOUND: app-partners-recomendados/src/db/catalog-store.test.js
- FOUND commit: 80bc1f6
- FOUND commit: f4dad1e
