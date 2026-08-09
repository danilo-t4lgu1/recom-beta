---
phase: 07-rollout-do-motor-no-catalogo-completo-todas-as-categorias-em
plan: 02
subsystem: data-layer
tags: [published, visibilidade, migracao-idempotente, disjuntor, defesa-1, category-counts, sqlite, vitest, tdd]

# Dependency graph
requires:
  - phase: 07 (plano 01)
    provides: "motor puro que consome CatalogProductEntry.published (D-58) e o modelo de 2 pesos"
  - phase: 03.1 (plano 03)
    provides: "padrao de migracao idempotente PRAGMA table_info + ALTER TABLE (category_raw/product_group_canonical) e seam CATALOG_DB_DIR/closeDbForTests"
provides:
  - "catalog_snapshots.published (INTEGER 0/1/NULL) persistido e migrado idempotentemente"
  - "getLatestSnapshotProducts().published tri-estado (true/false/null) — consumido pronto pelo motor (07-01)"
  - "getLastWrittenValuesForAllProducts(): Map<productId,string[]> — baseline de conjunto p/ o disjuntor (D-63, Plano 07-05)"
  - "getLastSuccessfulIngestionRunSummary(): { runId, productsRead, categoryCounts } — Defesa 1 de integridade (D-66, Plano 07-05)"
  - "ingestion_runs.category_counts (JSON) capturado por runIngestion antes do dedup"
  - "runIngestion le product.published e retorna categoryCounts"
affects: [07-05, 07-06, catalog-store, ingest-catalog, rollout]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Migracao idempotente por coluna: um guard PRAGMA table_info + ALTER TABLE independente por coluna nova (published, category_counts) — nao um guard unico compartilhado"
    - "Flag persistido tri-estado: NULL (pre-migracao/desconhecido) distinguido de 0 (oculto), nunca coagido, p/ nao zerar o catalogo antes da 1a re-ingestao (A6/Pitfall 2)"
    - "Baseline de conjunto lido de write_log.written_value (array completo), nunca de recommendation_baseline (singular/legado)"

key-files:
  created: []
  modified:
    - app-partners-recomendados/src/db/schema.sql
    - app-partners-recomendados/src/db/catalog-store.js
    - app-partners-recomendados/src/db/catalog-store.test.js
    - app-partners-recomendados/src/ingestion/ingest-catalog.js
    - app-partners-recomendados/src/ingestion/ingest-catalog.test.js

key-decisions:
  - "published na ingestao usa coercao defensiva product.published === true ? 1 : 0 (identica a hasAvailableGrade): produto sem o campo persiste 0 (oculto). O tri-estado NULL vale apenas para linhas PRE-migracao (nunca re-ingeridas), coerente com A6 — apos re-ingerir, toda linha e 1 ou 0."
  - "Ingere TODOS os produtos sem filtro ?published=true na query (Pitfall 5); o flag e persistido e o motor decide oculto tanto para candidato quanto para fonte."
  - "categoryCounts e a contagem BRUTA por categoria ANTES do merge/dedup (Open Question 1/D-66), capturada no loop de resolucao de categorias."
  - "Baseline do disjuntor vem de write_log (ultimo written_value success por produto), nao de recommendation_baseline singular (Anti-Pattern do 07-RESEARCH.md)."

patterns-established:
  - "Migracao idempotente independente por coluna, provada nao-destrutiva contra data/catalog.db real (4792 snapshots, 4 runs, 1724 produtos, 8769 variantes preservados)"
  - "Tri-estado de flag de visibilidade materializado na borda de leitura (row.published == null ? null : row.published === 1)"

requirements-completed: [RULE-01, RULE-02, PLAT-02]

# Metrics
duration: 20min
completed: 2026-07-21
status: complete
---

# Phase 07 Plan 02: Camada de dados (published tri-estado, disjuntor, Defesa 1) Summary

**Camada de dados que sustenta o rollout: flag `published` persistido e migrado idempotentemente com semantica tri-estado (D-58/A6), baseline de conjunto por produto lido de `write_log` para o disjuntor (D-63), e contagem por-categoria capturada na ingestao para a Defesa 1 de integridade (D-66) — mantendo a fronteira "leitura na borda, consumo puro no motor" (RULE-02).**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-07-21
- **Tasks:** 3 (todas TDD)
- **Files modified:** 5

## Accomplishments

- `schema.sql`: coluna `catalog_snapshots.published INTEGER` (D-58, 0/1, NULL = pre-migracao) e `ingestion_runs.category_counts TEXT` (JSON por-categoria, D-66), ambas com comentario citando a decisao e a migracao idempotente.
- `catalog-store.js`: dois guards de migracao idempotente independentes (`PRAGMA table_info` + `ALTER TABLE`) para `published` e `category_counts`, seguindo o padrao ja validado de `product_group_canonical`. `insertSnapshot` ganhou `@published`; `selectSnapshotsForRun` seleciona `s.published`; `getLatestSnapshotProducts` materializa `published` tri-estado (`null`/`true`/`false`), nunca coagindo `null` para `false` (A6).
- `getLastWrittenValuesForAllProducts()`: `Map<productId, string[]>` do array completo realmente gravado na ultima linha `status='success'` por produto — filtro de status dentro da subquery de agregacao garante que uma linha `failed` posterior nunca substitui a `success` (T-07-06). `written_value` nulo/invalido vira `[]` sem lancar.
- `getLastSuccessfulIngestionRunSummary()`: `{ runId, productsRead, categoryCounts }` do ultimo run success, com `categoryCounts` desserializado (objeto vazio se coluna nula, `null` se nao houver run success).
- `finishIngestionRun` estendida com `categoryCounts` (persistido como JSON via `updateIngestionRun`), retrocompativel (ausente = NULL).
- `ingest-catalog.js`: `snapshots.push` grava `published: product.published === true ? 1 : 0` (coercao defensiva, sem filtro `?published=true` na query — Pitfall 5); `categoryCounts` acumulado por categoria ANTES do merge/dedup e passado a `finishIngestionRun` no ramo success + retornado por `runIngestion`. Comportamento multi-categoria sob `run_id` unico (D-33) intacto.

## Task Commits

Cada task foi commitada atomicamente, agrupadas por fronteira de arquivo (Tasks 1 e 2 compartilham `schema.sql`/`catalog-store.js`/`catalog-store.test.js`; ver Deviations):

1. **Tasks 1+2: published tri-estado + baseline de conjunto e resumo por-categoria (D-58/D-63/D-66)** — `c4eb807` (feat, TDD)
2. **Task 3: ingestao le published e captura categoryCounts (D-58/D-66)** — `7db56d4` (feat, TDD)

**Plan metadata:** commit de docs pulado (`skipped_commit_docs_false` — `commit_docs: false` no config; SUMMARY/STATE/ROADMAP gravados em disco).

## Files Created/Modified

- `app-partners-recomendados/src/db/schema.sql` — colunas `catalog_snapshots.published` e `ingestion_runs.category_counts`.
- `app-partners-recomendados/src/db/catalog-store.js` — migracao idempotente por coluna; `insertSnapshot`/`selectSnapshotsForRun`/`getLatestSnapshotProducts` com `published` tri-estado; `getLastWrittenValuesForAllProducts`; `getLastSuccessfulIngestionRunSummary`; `finishIngestionRun`/`updateIngestionRun` com `categoryCounts`; `persistIngestionBatch` default `published=null`.
- `app-partners-recomendados/src/db/catalog-store.test.js` — 8 testes novos (Tests 23-30): published tri-estado (1->true, 0->false, ausente->null/A6), migracao idempotente sobre banco legado, disjuntor (ultima success por produto, failed nao substitui, written_value invalido->[]), resumo do run (categoryCounts desserializado, null sem run success).
- `app-partners-recomendados/src/ingestion/ingest-catalog.js` — leitura de `product.published`; `categoryCounts` bruto por categoria; retorno estendido.
- `app-partners-recomendados/src/ingestion/ingest-catalog.test.js` — `makeProduct` aceita `published` opcional; 3 testes novos (Tests 6-8): published:false ingerido/persistido 0, true->1 e ausente->0, categoryCounts por categoria + persistido em ingestion_runs.

## Decisions Made

- **Coercao defensiva na ingestao vs. tri-estado na leitura:** a ingestao sempre grava 1 ou 0 (`=== true ? 1 : 0`), consistente com `hasAvailableGrade`. O `null` tri-estado existe SO para linhas pre-migracao nunca re-ingeridas (A6) — apos a 1a re-ingestao do rollout, toda linha carrega 1/0 explicito. Isso resolve a tensao entre "coercao defensiva" (plano Task 3) e "null nunca e oculto" (motor 07-01): o motor trata `=== false` como oculto e `null` como visivel, o que e correto para o periodo de transicao.
- **Baseline do disjuntor de `write_log`, nao de `recommendation_baseline`** (D-63): a fonte correta de churn de conjunto e o array JSON completo realmente gravado (`written_value`), nao o id singular legado.

## Deviations from Plan

### Agrupamento de commit (fronteira de arquivo, nao de codigo)

- **Tasks 1 e 2 commitadas juntas (`c4eb807`).** Ambas modificam exatamente os mesmos tres arquivos (`schema.sql`, `catalog-store.js`, `catalog-store.test.js`) — a coluna `category_counts` (Task 2/D-66) e a coluna `published` (Task 1/D-58) coexistem em `schema.sql`, e as funcoes das duas tasks vivem entrelacadas em `catalog-store.js`. Como o `git add` opera por arquivo (staging interativo `-p` nao disponivel no ambiente) e nao ha stash permitido, separar em dois commits produziria uma arvore intermediaria que nao compila/testa de forma limpa. Optei por um unico commit atomico coeso da camada de store, mantendo Task 3 (ingestao, arquivos distintos) num segundo commit. Nenhum desvio de codigo-fonte: todo o conteudo planejado das Tasks 1, 2 e 3 foi implementado exatamente como especificado.

Nenhuma outra deviation. Regras 1-4 nao acionadas.

## Threat Mitigations Applied

- **T-07-04 (Tampering, migracao corromper o catalog.db real):** migracao idempotente por coluna provada nao-destrutiva contra uma copia do `data/catalog.db` real (integrity_check ok, 4792 snapshots / 4 runs / 1724 produtos / 8769 variantes preservados; 2o ALTER guardado sem lancar). Teste unitario (Test 25) prova ADD COLUMN sobre schema pre-migracao.
- **T-07-05 (SQL injection):** todas as escritas novas via `db.prepare(...).run(params)` com params nomeados; zero concatenacao de string.
- **T-07-06 (baseline da fonte errada):** `getLastWrittenValuesForAllProducts` le o array completo de `write_log.written_value`; Test 27 garante que uma linha failed posterior nunca substitui a success.

## Issues Encountered

- Durante a suite completa de testes, um teste que importa `catalog-store.js` sem `CATALOG_DB_DIR` abriu o `data/catalog.db` real e aplicou a migracao nele — comportamento de producao esperado e nao-destrutivo. Verificado: `integrity_check = ok`, todas as 4792 linhas pre-migracao com `published IS NULL` (nunca 0), row counts intactos. Nao e um bug; e a migracao fazendo exatamente o que deve.

## User Setup Required

None — nenhuma configuracao de servico externo necessaria.

## Next Phase Readiness

- O motor (07-01) agora recebe `published` tri-estado materializado por `getLatestSnapshotProducts` — o key_link declarado no plano esta satisfeito.
- Disjuntor (07-05) tem `getLastWrittenValuesForAllProducts` (baseline de conjunto) pronto; Defesa 1 (07-05) tem `getLastSuccessfulIngestionRunSummary` (banda de total vs. run anterior) pronto.
- O flag `published` so tera efeito real em producao apos a 1a re-ingestao do rollout popular a coluna (hoje 4792 linhas = NULL, tratadas como visiveis — correto e intencional, D-58/A6).

## Verification

- `npx vitest run src/db/catalog-store.test.js src/ingestion/ingest-catalog.test.js`: verde.
- Suite completa: **175/175 testes verdes em 16 arquivos** (era 164 em 07-01; +11 testes novos).
- Migracao idempotente + nao-destrutiva confirmada contra copia do `data/catalog.db` real (sem perda de dados) e contra schema legado (Test 25).

## Self-Check: PASSED

- `app-partners-recomendados/src/db/schema.sql` — FOUND
- `app-partners-recomendados/src/db/catalog-store.js` — FOUND
- `app-partners-recomendados/src/db/catalog-store.test.js` — FOUND
- `app-partners-recomendados/src/ingestion/ingest-catalog.js` — FOUND
- `app-partners-recomendados/src/ingestion/ingest-catalog.test.js` — FOUND
- Commit `c4eb807` — FOUND
- Commit `7db56d4` — FOUND
- Suite vitest: 175/175 verdes
- Migracao real (data/catalog.db): integrity_check ok, 0 linhas com published=0 (todas NULL), row counts preservados

---
*Phase: 07-rollout-do-motor-no-catalogo-completo-todas-as-categorias-em*
*Completed: 2026-07-21*
