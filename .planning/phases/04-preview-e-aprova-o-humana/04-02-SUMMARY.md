---
phase: 04-preview-e-aprova-o-humana
plan: 02
subsystem: domain
tags: [vitest, review-queue, diff, backfill, pure-functions]

# Dependency graph
requires:
  - phase: 03-recomendacao
    provides: recommendForProduct (motor determinístico, único ponto de acesso para calcular o "depois" de um produto)
  - phase: 03.1-grupo-de-produtos
    provides: cota fixa 4+4 (composeGroupQuota/GROUP_QUOTA_PER_SIDE) e comportamento de backfill simétrico que review-queue/diff precisam respeitar sem duplicar
provides:
  - "hasChanged(beforeIds, afterIds) — comparação por conjunto, ignora ordem (D-23)"
  - "buildReviewQueue(catalogProducts, baselineMap) — filtra o catálogo completo para só os produtos com diff real (D-22)"
  - "computeDiff(productId, catalogProducts, beforeIds, {removedIds}) — diff antes/depois com status added/removed/kept (D-19/D-21)"
  - "recomputeAfterRemoval(productId, catalogProducts, removedIds) — backfill via recomputação com catálogo filtrado (D-20, Pitfall 1)"
affects: [04-04-rotas-http, 04-05-aprovacao-e-persistencia]

# Tech tracking
tech-stack:
  added: []
  patterns: [pure-domain-module-zero-io, catalog-filter-backfill-not-cap-increase]

key-files:
  created:
    - app-partners-recomendados/src/review/review-queue.js
    - app-partners-recomendados/src/review/review-queue.test.js
    - app-partners-recomendados/src/review/diff.js
    - app-partners-recomendados/src/review/diff.test.js
  modified: []

key-decisions:
  - "recomputeAfterRemoval filtra o CATÁLOGO de entrada (removendo removedIds do array catalogProducts antes de chamar recommendForProduct de novo) em vez de aumentar maxRecommendations — única abordagem que funciona para Partes de Cima/Baixo, pois composeGroupQuota tem cota 4+4 fixa independente do parâmetro (Pitfall 1 do 04-RESEARCH.md)"
  - "computeDiff sempre calcula engineComputedIds (pré-curadoria) além de afterIds (pós-curadoria) — os dois campos divergem intencionalmente após remoção, dando auditoria sem exigir uma segunda chamada"
  - "afterIds nunca é aceito como valor de confiança de um chamador externo — sempre derivado de recommendForProduct/recomputeAfterRemoval; removedIds só pode ENCOLHER o pool (T-04-04)"

patterns-established:
  - "Módulo de domínio puro (zero I/O) que importa SOMENTE recommendForProduct do motor — nunca duplica composeGroupQuota/buildSortedPool/cascata D-13, com gate estrutural via grep no acceptance criteria para impedir reintrodução futura"
  - "Backfill por filtro de catálogo de entrada, não por aumento do parâmetro de corte do motor — generaliza para qualquer regra de cota fixa que o motor venha a ter no futuro"

requirements-completed: [APRV-01]

# Metrics
duration: 5min
completed: 2026-07-16
status: complete
---

# Phase 04 Plan 02: Camada de Domínio de Diff e Fila de Revisão Summary

**review-queue.js decide quais produtos entram na fila de revisão (D-22/D-23, comparação por conjunto ignorando ordem); diff.js expõe o diff antes/depois por produto com status added/removed/kept e implementa o backfill de remoção filtrando o catálogo de entrada (D-19/D-20/D-21), nunca aumentando o parâmetro de corte do motor — prova ao vivo do Pitfall 1 do 04-RESEARCH.md para Partes de Cima/Baixo**

## Performance

- **Duration:** 5min
- **Started:** 2026-07-16T13:18:11Z
- **Completed:** 2026-07-16T13:23:15Z
- **Tasks:** 2
- **Files modified:** 4 (todos novos)

## Accomplishments
- `review-queue.js`: `hasChanged` (comparação por Set, ignora ordem, tipos mistos number/string não geram falso-positivo) e `buildReviewQueue` (filtra o catálogo completo para só os produtos com diff real, baseline ausente tratado como lista vazia)
- `diff.js`: `recomputeAfterRemoval` reproduz o backfill do motor filtrando o array de entrada — comprovado por teste não-trivial (Test 10) que remove 1 de 4 candidatos na cota de Partes de Cima e confirma que o 5º elegível (antes fora da cota) aparece no lugar, sem tocar `composeGroupQuota`
- `diff.js`: `computeDiff` expõe `items` com status explícito (`added`/`removed`/`kept`), `afterIds` curado e `engineComputedIds` pré-curadoria distintos — nunca lança para entradas malformadas
- Zero duplicação estrutural do motor comprovada por gate de grep (`composeGroupQuota`/`buildSortedPool`/`GROUP_QUOTA_PER_SIDE` ausentes de código executável em `diff.js`)
- Suíte completa do projeto permanece 86/86 testes verdes (14 novos + 72 pré-existentes)

## Task Commits

Each task was committed atomically (TDD RED→GREEN):

1. **Task 1: review-queue.js — hasChanged (D-23) e buildReviewQueue (D-22)**
   - RED: `f442208` (test)
   - GREEN: `bf5c174` (feat)
2. **Task 2: diff.js — computeDiff (D-19/D-21) e recomputeAfterRemoval (D-20, Pitfall 1)**
   - RED: `7daeb0d` (test)
   - GREEN: `105bdb5` (feat)

**Plan metadata:** commit pendente (docs: complete plan)

## Files Created/Modified
- `app-partners-recomendados/src/review/review-queue.js` - `hasChanged`/`buildReviewQueue`, módulo de domínio puro, zero I/O
- `app-partners-recomendados/src/review/review-queue.test.js` - 7 comportamentos (D-22/D-23)
- `app-partners-recomendados/src/review/diff.js` - `computeDiff`/`recomputeAfterRemoval`, módulo de domínio puro, zero I/O
- `app-partners-recomendados/src/review/diff.test.js` - 7 comportamentos (D-19/D-20/D-21, Pitfall 1)

## Decisions Made
- Filtro de catálogo (não aumento de `maxRecommendations`) é a única abordagem correta para o backfill de Partes de Cima/Baixo — confirmado por teste, não só por leitura de código (Test 10)
- `computeDiff` sempre calcula `engineComputedIds` mesmo quando `removedIds` está vazio, garantindo que o campo de auditoria pré-curadoria esteja sempre disponível para o Plano 04-04/04-05, sem custo extra relevante (mesma chamada ao motor que já seria feita)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixture do Test 6 (review-queue) causava cross-matching indesejado entre pares fonte/candidato**
- **Found during:** Task 1, verificação GREEN
- **Issue:** A fixture original do Test 6 usava `colorValue`/`fabricTagCanonical`/`productGroupCanonical` padrão (idênticos) para todos os produtos do catálogo de teste, fazendo com que produtos de pares diferentes (A/B/C) se recomendassem mutuamente via `recommendForProduct` — o resultado real incluía todos os 6 produtos na fila, não só B e C como o teste esperava
- **Fix:** Cada par fonte/candidato passou a usar uma `colorValue` exclusiva (evita cross-matching entre pares); baseline dos candidatos (`A-cand`, `B-cand`, `C-cand`) foi definido para bater exatamente com seu próprio cálculo do motor, mantendo o foco da asserção só no diff de A/B/C
- **Files modified:** `app-partners-recomendados/src/review/review-queue.test.js`
- **Verification:** `npx vitest run src/review/review-queue.test.js` — 7/7 verdes
- **Committed in:** `bf5c174` (parte do commit GREEN da Task 1)

**2. [Rule 1 - Bug] Menção a `composeGroupQuota`/`buildSortedPool`/`GROUP_QUOTA_PER_SIDE` dentro de bloco JSDoc (` * `) escapava do filtro de comentário `//` do gate de grep**
- **Found during:** Task 2, verificação do acceptance criteria estrutural
- **Issue:** O acceptance criteria usa `grep -v '^\s*//'` para ignorar comentários de linha antes de checar duplicação estrutural do motor; uma linha de JSDoc contínuo (` * \`composeGroupQuota\`/cascata D-13.`) não começa com `//`, então não era filtrada e o gate falhava mesmo com o código correto (a menção era só documentação, nunca código executável)
- **Fix:** Reescrita da JSDoc de `recomputeAfterRemoval` para mover a menção aos internos do motor para um comentário de linha (`//`) acima da função, mantendo a explicação mas dentro do escopo que o gate já sabe ignorar
- **Files modified:** `app-partners-recomendados/src/review/diff.js`
- **Verification:** `! grep -v '^\s*//' src/review/diff.js | grep -Eq "composeGroupQuota|buildSortedPool|GROUP_QUOTA_PER_SIDE"` sai com código 0; `npx vitest run src/review/diff.test.js` — 7/7 verdes
- **Committed in:** `105bdb5` (parte do commit GREEN da Task 2)

---

**Total deviations:** 2 auto-fixed (2 bugs de teste/documentação, ambos Rule 1)
**Impact on plan:** Nenhum impacto de escopo — ambos os ajustes foram correções de fixture/comentário necessárias para os testes/gates realmente provarem o comportamento pretendido pelo plano. Zero mudança na lógica de negócio implementada.

## Issues Encountered
None além dos dois itens documentados em "Deviations from Plan".

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `buildReviewQueue`, `computeDiff` e `recomputeAfterRemoval` estão prontos para o Plano 04-04 compor as rotas HTTP (`GET /review`, `GET /review/:id`, `POST /review/:id/approve`) sem reimplementar nenhuma regra de negócio
- Nenhum bloqueio conhecido para os planos 04-04/04-05

---
*Phase: 04-preview-e-aprova-o-humana*
*Completed: 2026-07-16*

## Self-Check: PASSED

All created files confirmed present on disk (review-queue.js, review-queue.test.js, diff.js, diff.test.js, this SUMMARY.md); all 4 task commit hashes (f442208, bf5c174, 7daeb0d, 105bdb5) confirmed present in `git log --oneline --all`.
