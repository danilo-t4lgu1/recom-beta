---
phase: 07-rollout-do-motor-no-catalogo-completo-todas-as-categorias-em
plan: 01
subsystem: recommendation-engine
tags: [motor-puro, ranking, 2-pesos, visibilidade, published, vitest, zero-import]

# Dependency graph
requires:
  - phase: 03.1
    provides: "motor puro com Grupo de Produtos, cota 4+4 e backfill simétrico (D-26 a D-35)"
  - phase: 03
    provides: "cascata de desempate D-13 e formato de objeto rico D-18"
provides:
  - "candidateWeight(source, candidate, considerFabric): modelo de 2 pesos (E+C+T=1 / E+C=2, D-55/D-56)"
  - "isEligibleCandidateInGroup refatorada: piso E+C, tecido nunca exclui (D-57), guarda published===false (D-58)"
  - "buildSortedPool ordena por (peso ASC, cascata D-13) — peso 1 sempre acima de peso 2"
  - "recommendForProduct: guarda de fonte oculta (source.published===false -> [], D-58)"
  - "CatalogProductEntry.published (boolean) consumido pronto, zero I/O"
affects: [07-02, 07-03, catalog-store, ingest-catalog, rollout]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Partição por peso como chave de ordenação primária ACIMA da cascata D-13, DENTRO de cada lado da cota"
    - "Flag de visibilidade persistido consumido pelo motor puro (mesmo padrão de hasAvailableGrade), comparação estritamente === false"

key-files:
  created: []
  modified:
    - app-partners-recomendados/src/recommendation/recommendation-engine.js
    - app-partners-recomendados/src/recommendation/recommendation-engine.test.js

key-decisions:
  - "Override de 2026-07-17 (tecido diferente excluído) substituído pelo modelo de 2 pesos D-55/D-56/D-57: tecido diferente vira peso 2, elegível, elevando cobertura sem perder ranking por qualidade de match"
  - "published tratado estritamente como === false para oculto; null/undefined (pré-migração) nunca oculto (Pitfall 2/A6) para não zerar o catálogo antes da 1ª re-ingestão"
  - "Testes existentes Test 1 e o de tecido (~l.170) atualizados para o novo comportamento correto (tecido diferente incluído como peso 2), pois codificavam a regra antiga de exclusão"

patterns-established:
  - "Modelo de 2 pesos: candidateWeight decide ORDEM (não elegibilidade); piso de elegibilidade fica em isEligibleCandidateInGroup"
  - "Visibilidade fail-closed no motor: candidato oculto excluído, fonte oculta retorna [] — sempre === false"

requirements-completed: [RULE-01, RULE-02]

# Metrics
duration: 8min
completed: 2026-07-21
status: complete
---

# Phase 07 Plan 01: Modelo de 2 pesos + flag published no motor puro Summary

**Motor de recomendação com modelo de 2 pesos (E+C+T acima de E+C, D-55/D-56/D-57) e consumo do flag de visibilidade `published` (D-58), mantendo pureza zero-import/zero-I/O (RULE-02) e a lógica de Grupo/cota 4+4/backfill da Fase 03.1 intacta.**

## Performance

- **Duration:** ~8 min
- **Completed:** 2026-07-21
- **Tasks:** 2 (ambas TDD)
- **Files modified:** 2

## Accomplishments
- `candidateWeight(source, candidate, considerFabric)` introduzida: peso 1 quando bloco considera tecido e ambos os lados têm tecido canônico batendo (E+C+T); peso 2 em qualquer outro caso elegível (tecido ausente/diferente, ou bloco cruzado).
- `isEligibleCandidateInGroup` refatorada: piso de elegibilidade passa a ser Estoque + Cor + mesmo grupo; o bloco de exclusão por tecido do override de 2026-07-17 foi removido (D-57).
- `buildSortedPool` reordenado para chave primária de peso (ASC) e secundária pela cascata D-13 dentro de cada peso (D-56) — peso 1 sempre acima de peso 2 mesmo com estoque total menor.
- `published` adicionado ao typedef `CatalogProductEntry`; guarda de candidato oculto (`candidate.published === false`) e guarda de fonte oculta (`source.published === false -> []`) adicionadas (D-58), com comparação estritamente `=== false`.
- `composeGroupQuota`, `compareRecommendations`, `GROUP_QUOTA_PER_SIDE` e o backfill simétrico permaneceram intocados; motor continua zero-import.

## Task Commits

Cada task foi commitada atomicamente:

1. **Task 1: Modelo de 2 pesos (D-55/D-56/D-57)** - `f01c3ba` (feat, TDD test+feat no mesmo commit)
2. **Task 2: Consumo do flag published (D-58)** - `7a9a4ea` (feat, TDD test+feat no mesmo commit)

**Plan metadata:** commit de docs pulado (`skipped_commit_docs_false` — `commit_docs: false` no config; SUMMARY/STATE/ROADMAP gravados em disco).

_Nota: as duas tasks são TDD; RED e GREEN foram executados e verificados em sequência, agrupados em um commit `feat` por task (o RED usa fixtures in-file no mesmo arquivo de teste)._

## Files Created/Modified
- `app-partners-recomendados/src/recommendation/recommendation-engine.js` - modelo de 2 pesos (`candidateWeight`), piso E+C em `isEligibleCandidateInGroup`, ordenação por peso em `buildSortedPool`, guardas de visibilidade `published` em candidato e fonte, `published` no typedef, comentários/JSDoc reescritos para D-55/D-56/D-57/D-58.
- `app-partners-recomendados/src/recommendation/recommendation-engine.test.js` - factory `makeProduct` aceita `published` (default `true`); teste da invariante D-56 (peso 1 acima de peso 2 com estoque menor); Test 1 e o teste de tecido atualizados para tecido diferente como peso 2; describe novo de visibilidade (candidato oculto, fonte oculta, `published:null`/`undefined` não-oculto).

## Decisions Made
- Substituição do override de 2026-07-17 pelo modelo de 2 pesos: tecido diferente deixa de ser excluído e passa a ser peso 2 (D-55/D-57), com peso 1 (mesmo tecido) sempre ranqueado acima (D-56). A cor permanece sempre obrigatória.
- `published` estritamente `=== false` para oculto; `null`/`undefined` (produto pré-migração) nunca oculto, evitando zerar o catálogo antes da primeira re-ingestão (D-58/Pitfall 2/A6).

## Deviations from Plan

Nenhuma deviation de código-fonte de produção. Ajuste de escopo de testes documentado abaixo:

- **Interpretação do acceptance criterion #5 da Task 1** ("Tests 1-16 continuam verdes, sem regressão"): dois testes existentes — o Test 1 (`wrongFabric` id6 Algodão) e o teste de tecido (~l.170, `diffFabric` id4 Algodão) — codificavam a regra antiga de EXCLUSÃO por tecido diferente. Como o objetivo explícito do plano (D-55/D-57) é justamente tornar tecido diferente elegível como peso 2, ambos os testes foram atualizados para asserir a inclusão do candidato de tecido diferente (dois ids -> três/quatro ids, com o de tecido diferente por último no empate de peso 2). A LÓGICA de grupo/cascata/backfill (Tests 17-28) não sofreu regressão. Isto está alinhado com o próprio critério #3 do plano.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Motor pronto para consumir `published` materializado por `getLatestSnapshotProducts` (Plano 07-02, key_link declarado no plano).
- A propriedade `published` precisa ser persistida em `catalog_snapshots` e exposta pela leitura (Plano 07-02) e re-ingerida (rollout) para ter efeito real em produção; até lá `published` será `null` para produtos pré-migração e o motor os trata como visíveis (comportamento correto e intencional, D-58).

## Self-Check: PASSED

- `app-partners-recomendados/src/recommendation/recommendation-engine.js` — FOUND
- `app-partners-recomendados/src/recommendation/recommendation-engine.test.js` — FOUND
- Commit `f01c3ba` — FOUND
- Commit `7a9a4ea` — FOUND
- `npm test` (vitest run): 164/164 testes verdes em 16 arquivos
- `grep -cE '^import '` no motor: 0 (RULE-02 preservada)

---
*Phase: 07-rollout-do-motor-no-catalogo-completo-todas-as-categorias-em*
*Completed: 2026-07-21*
