---
phase: 03-motor-de-recomenda-o-determin-stico
plan: 02

subsystem: recommendation-engine
tags: [sqlite, better-sqlite3, cli, deterministic, read-only]

# Dependency graph
requires:
  - phase: 03-motor-de-recomenda-o-determin-stico (plan 01)
    provides: "recommendForProduct(productId, catalogProducts, {maxRecommendations}) e o shape CatalogProductEntry consumido por ele"
  - phase: 02-ingest-o-de-cat-logo-e-qualidade-de-dados
    provides: "schema SQLite (ingestion_runs/products/variants/catalog_snapshots) e o wrapper catalog-store.js já populado com o catálogo real (data/catalog.db, 645 produtos)"
provides:
  - "getLatestSnapshotProducts() — leitura do último run de ingestão success materializando CatalogProductEntry[] via prepared statements, sem expor o objeto db"
  - "src/recommendation/recommend-cli.js — CLI somente-leitura: node recommend-cli.js <productId> imprime JSON determinístico das recomendações reais"
  - "Fatia vertical de ponta a ponta operável: data/catalog.db real -> motor puro -> saída JSON, por um único comando"
affects: ["phase 04 (preview/aprovação vai reaproveitar getLatestSnapshotProducts() e o padrão de chamada produto a produto do CLI)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Leitura em single-pass: variantsByProduct e firstColorByProduct montados no mesmo loop sobre selectVariantsForRun (ordenado por product_id, id), evitando um segundo find() O(n) por produto"
    - "CLI de preview com exatamente duas importações locais (motor + store), zero lógica de elegibilidade própria — delega 100% ao motor da fase anterior"

key-files:
  created:
    - app-partners-recomendados/src/recommendation/recommend-cli.js
  modified:
    - app-partners-recomendados/src/db/catalog-store.js

key-decisions:
  - "colorValue lido de variants.color_value (primeira variante na ordem determinística do statement), não de catalog_snapshots.color_value — per IN-03/Claude's Discretion do 03-CONTEXT.md, granularidade correta por variante mesmo hoje com 0 produtos multi-cor"
  - "getLatestSnapshotProducts() não filtra elegibilidade (fabricTagCanonical nulo, hasAvailableGrade falso continuam no retorno) — D-15 permanece responsabilidade exclusiva do motor, esta função só materializa o snapshot"
  - "Nenhum modo de fallback por cor+estoque foi adicionado ao CLI ou à leitura, mesmo o catálogo real tendo 0/645 produtos com tecido canônico hoje — D-16 reafirmado, saída [] documentada como comportamento correto desta janela"

patterns-established:
  - "Consumo produto-a-produto do motor puro por um CLI fino, sem lógica de negócio própria — padrão que a Fase 4 deve repetir ao construir o preview"

requirements-completed: [RULE-01, RULE-02]

# Metrics
duration: 20min
completed: 2026-07-14
status: complete
---

# Phase 3 Plan 2: Motor de Recomendação Determinístico Summary

**getLatestSnapshotProducts() materializa o snapshot real do último run success no shape do motor (cor via variants.color_value per IN-03), e recommend-cli.js expõe um preview somente-leitura determinístico rodando o motor produto a produto sobre os 645 produtos reais de data/catalog.db.**

## Performance

- **Duration:** ~20 min (execução retomada após interrupção por limite de sessão de uma tentativa anterior, que já deixara os três prepared statements da Task 1 escritos mas não commitados)
- **Started:** 2026-07-14T14:30:00Z (retomada)
- **Completed:** 2026-07-14T15:48:00Z
- **Tasks:** 2
- **Files modified:** 2 (1 novo, 1 modificado)

## Accomplishments
- `getLatestSnapshotProducts()` implementada em `catalog-store.js`: resolve o último `run_id` com `status = 'success'`, junta `catalog_snapshots` + `products` + `variants` filtrando pelo mesmo run/`last_seen_run_id`, e devolve `CatalogProductEntry[]` exatamente no shape consumido por `recommendForProduct` — verificado contra o `data/catalog.db` real (645 produtos, shape completo, nenhuma escrita)
- Contrato de `catalog-store.js` preservado: nenhuma função da Fase 2 (`startIngestionRun`, `persistIngestionBatch`, `finishIngestionRun`, `getCanonicalMap`) foi alterada, e o objeto `db` cru continua não exportado
- `src/recommendation/recommend-cli.js` criado: script Node ESM com exatamente 2 imports locais (`recommendForProduct` + `getLatestSnapshotProducts`), sem nenhuma referência a rede/`fetch`/`nuvemshop-client` (grep confirma), sai com código 1 e mensagem de uso em stderr quando chamado sem argumento, e código 0 + JSON em stdout caso contrário
- Determinismo comprovado sobre o snapshot real: duas execuções consecutivas de `node recommend-cli.js 349886153` produzem stdout byte a byte idêntico (diff vazio)
- Comportamento hoje confirmado como esperado: `349886153` (produto real, Vestido Elaine Preto) retorna `[]` porque 0/645 produtos têm `fabric_tag_canonical` preenchido (planilha ainda não importada, D-16) — CORRETO, não bug
- Suíte completa do projeto permanece verde: `npx vitest run` → 4 arquivos, 32/32 testes passando (nenhuma regressão nas Fases 2 e no plano 03-01)

## Task Commits

Each task was committed atomically:

1. **Task 1: getLatestSnapshotProducts() — snapshot real no shape do motor** - `d2a05f4` (feat)
2. **Task 2: recommend-cli.js — preview determinístico do motor sobre o snapshot real** - `196b70b` (feat)

_Nenhuma tarefa era TDD (`tdd="false"` em ambas per o plano); commits diretos feat._

## Files Created/Modified
- `app-partners-recomendados/src/db/catalog-store.js` - adiciona `export function getLatestSnapshotProducts()` e os três prepared statements de leitura (`selectLatestSuccessfulRun`, `selectSnapshotsForRun`, `selectVariantsForRun`), que já existiam sem commit de uma tentativa anterior interrompida
- `app-partners-recomendados/src/recommendation/recommend-cli.js` - CLI novo, somente-leitura, delega 100% da regra ao motor de `recommendation-engine.js`

## Decisions Made
- Cor representativa lida de `variants.color_value` (primeira variante, ordem `ORDER BY product_id, id`), não de `catalog_snapshots.color_value` — exercício explícito da discretion IN-03/03-CONTEXT.md, documentado em JSDoc
- `getLatestSnapshotProducts()` devolve o snapshot completo sem qualquer filtro de elegibilidade — decisão de manter D-15 como responsabilidade exclusiva do motor (03-01), nunca duplicada na camada de leitura
- Single-pass ao montar `variantsByProduct`/`firstColorByProduct` no mesmo loop (em vez de um segundo `.find()` por produto) — otimização direta sobre o rascunho inicial encontrado no arquivo, sem mudança de comportamento

## Deviations from Plan

**Nenhuma deviation de regra de negócio ou escopo.** Uma tarefa anterior (sessão interrompida por limite) já havia deixado os três prepared statements da Task 1 escritos no arquivo, sem commit. Esta execução:
- Verificou que os três statements já presentes (`selectLatestSuccessfulRun`, `selectSnapshotsForRun`, `selectVariantsForRun`) correspondiam exatamente ao `<action>` da Task 1 do plano — reaproveitados sem duplicação
- Implementou a função `getLatestSnapshotProducts()` que ainda faltava, usando esses statements
- Task 2 (CLI) foi implementada do zero, como especificado no plano

Nenhum dos dois `git status --short` extras (`.planning/PROJECT.md` modificado, `.gitignore`/`.graphifyignore`/`.graphifyinclude` não rastreados) pertence a este plano — fora de escopo, não tocados, não commitados por este executor.

## Issues Encountered

Nenhum. Ambas as verificações automatizadas do plano passaram na primeira tentativa após a implementação (`node -e` de shape para a Task 1; execução dupla + diff + grep para a Task 2).

## User Setup Required

Nenhum. O CLI opera 100% sobre `data/catalog.db` já ingerido pela Fase 2 — nenhuma variável de ambiente ou instalação nova.

## Next Phase Readiness

- Fatia vertical completa da Fase 3: `data/catalog.db` real → `getLatestSnapshotProducts()` → `recommendForProduct()` → JSON, operável por `node src/recommendation/recommend-cli.js <productId>`
- Quando a planilha de tecidos for importada (D-16, fora desta fase), o mesmo CLI passa a devolver recomendações reais sem nenhuma mudança de código — nenhum bloqueio técnico pendente
- Fase 4 (preview/aprovação) pode reaproveitar diretamente `getLatestSnapshotProducts()` e o padrão de chamada produto a produto estabelecido pelo CLI

## Self-Check: PASSED

- FOUND: app-partners-recomendados/src/db/catalog-store.js (getLatestSnapshotProducts exportada, verificado por import dinâmico)
- FOUND: app-partners-recomendados/src/recommendation/recommend-cli.js
- FOUND: d2a05f4 (feat, Task 1)
- FOUND: 196b70b (feat, Task 2)
