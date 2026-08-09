---
phase: 03-motor-de-recomenda-o-determin-stico
plan: 01

subsystem: recommendation-engine
tags: [pure-function, vitest, tdd, deterministic, no-ml]

# Dependency graph
requires:
  - phase: 02-ingest-o-de-cat-logo-e-qualidade-de-dados
    provides: "hasAvailableGrade (D-04) persistido no snapshot, fabric_tag_canonical column, schema products/variants/catalog_snapshots"
provides:
  - "recommendForProduct(productId, catalogProducts, {maxRecommendations}) — motor puro de recomendação produto a produto (D-17)"
  - "Shape Recommendation (D-18) rico: productId, colorValue, fabricTagCanonical, stockTotal, sizesWithStock, centralSizesStock, stockBySize — interface de dados consumida pela Fase 4"
  - "Elegibilidade estrita: mesma cor + mesmo tecido canônico (D-15, sem fallback D-16) + hasAvailableGrade"
  - "Cascata de desempate D-13 completa (estoque total → distribuição por tamanho → estoque em tamanhos centrais P/M/G ou 36/38/40) + guarda de determinismo por productId (RULE-02, não é critério de negócio, D-14)"
affects: ["03-02 (materialização do shape CatalogProductEntry a partir do SQLite)", "phase 04 (preview/aprovação consome Recommendation[])", "phase 05 (escrita usa productId das recomendações)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Módulo de domínio 100% puro sem nenhuma linha de import (verificado por grep), seguindo o formato exato de stock-availability.js"
    - "Comparator composto de funções nomeadas por nível (compareByTotalStock, compareBySizesWithStock, compareByCentralSizesStock, compareByProductIdAsc) combinadas via curto-circuito ||"
    - "Ordenação sobre cópia do array (spread + sort) para nunca mutar catalogProducts/variants de entrada; slice(0, max) aplicado após a ordenação completa"

key-files:
  created:
    - app-partners-recomendados/src/recommendation/recommendation-engine.js
    - app-partners-recomendados/src/recommendation/recommendation-engine.test.js
  modified: []

key-decisions:
  - "D-15/D-16 reafirmados no código: motor estrito, tecido canônico obrigatório para fonte E candidatos, sem nenhum modo de fallback por cor+estoque"
  - "D-14 documentado explicitamente no comentário do comparator composto: desempate final por productId é guarda de determinismo (RULE-02), não critério de negócio"
  - "Nenhum campo textual de 'motivo do desempate' incluído (discretion do 03-CONTEXT.md exercida a favor de simplicidade — os 3 números D-18 já tornam o ranking auditável)"

patterns-established:
  - "Consumir hasAvailableGrade já persistido no snapshot em vez de reimportar/recalcular a lógica de stock-availability.js — preserva zero-import e evita duplicar a regra D-04"

requirements-completed: [RULE-01, RULE-02]

# Metrics
duration: 15min
completed: 2026-07-13
status: complete
---

# Phase 3 Plan 1: Motor de Recomendação Determinístico Summary

**Motor puro `recommendForProduct` com elegibilidade estrita (cor + tecido canônico + estoque), objetos ricos D-18 e cascata de desempate D-13 completa em três comparadores nomeados, zero imports, 16/16 testes vitest verdes.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-13T23:50:00Z
- **Completed:** 2026-07-13T23:57:44Z
- **Tasks:** 2
- **Files modified:** 2 (both new)

## Accomplishments
- `recommendForProduct(productId, catalogProducts, { maxRecommendations })` implementado como função 100% pura (zero imports, sem rede/relógio/aleatoriedade) — comprovado estruturalmente (grep) e comportamentalmente (stub de `fetch` que lança se chamado, Test 10)
- Elegibilidade estrita per D-15/D-16: fonte e candidatos exigem `fabricTagCanonical` não-nulo, sem nenhum caminho alternativo por cor+estoque
- Objetos ricos D-18 (`productId`, `colorValue`, `fabricTagCanonical`, `stockTotal`, `sizesWithStock`, `centralSizesStock`, `stockBySize`) montados por `buildRecommendation`
- Cascata de desempate D-13 completa: `compareByTotalStock` → `compareBySizesWithStock` → `compareByCentralSizesStock`, com `compareByProductIdAsc` como guarda de determinismo final (RULE-02, não critério de negócio per D-14)
- Corte em `MAX_RECOMMENDATIONS = 8` aplicado após a ordenação completa, sobre uma cópia do array (nunca muta `catalogProducts` nem `variants` de entrada)
- 16 comportamentos cobertos em vitest, incluindo determinismo sob reexecução e sob inversão da ordem de entrada

## Task Commits

Each task was committed atomically (TDD RED→GREEN):

1. **Task 1: Fatia feliz do motor — elegibilidade estrita, objetos ricos, determinismo e pureza**
   - `61d6984` test(03-01): add failing tests for recommendation engine eligibility (Tests 1-10) — RED
   - `88123d5` feat(03-01): implement recommendation engine strict eligibility and rich objects — GREEN (10/10)
2. **Task 2: Cascata de desempate D-13 + limite de 8**
   - `90e75a3` test(03-01): add failing tests for D-13 tie-break cascade and 8-cap (Tests 11-16) — RED
   - `54adc83` feat(03-01): implement D-13 tie-break cascade and 8-recommendation cap — GREEN (16/16)

_TDD plan: RED commits contain only new failing tests; GREEN commits contain the implementation that makes them (and all prior tests) pass._

## Files Created/Modified
- `app-partners-recomendados/src/recommendation/recommendation-engine.js` - motor puro: `recommendForProduct`, constantes nomeadas (`MAX_RECOMMENDATIONS`, `CENTRAL_SIZES_LETTER`, `CENTRAL_SIZES_NUMERIC`), helpers privados (`normalizeMatchValue`, `isEligibleCandidate`, `buildRecommendation`), comparadores nomeados da cascata D-13
- `app-partners-recomendados/src/recommendation/recommendation-engine.test.js` - 16 testes vitest com factories in-file `makeVariant`/`makeProduct`, fixtures de tecido preenchido manualmente (D-16), nunca lê o dump SQLite real

## Decisions Made
- Reaproveitar o flag `hasAvailableGrade` já persistido no snapshot em vez de reimportar `stock-availability.js` — motor opera no shape persistido (`stockTotal` por variante), não no shape da API (`inventory_levels[]`); reimportar quebraria a pureza estrutural de zero-imports exigida por RULE-02/Success Criteria #4 e duplicaria a regra D-04 sem necessidade
- Ordenar os objetos `Recommendation` já montados (não os produtos crus), para que os comparadores usem exatamente os mesmos números expostos no objeto de saída (ranking auditável pelos próprios campos D-18)
- Nenhum campo textual de "motivo do desempate" incluído — decisão de discretion do 03-CONTEXT.md exercida a favor de simplicidade

## Deviations from Plan

None - plan executed exactly as written. Tanto o comportamento (10 testes na Task 1 + 6 na Task 2) quanto os nomes de função/constantes especificados no plano (`recommendForProduct`, `MAX_RECOMMENDATIONS`, `CENTRAL_SIZES_LETTER`, `CENTRAL_SIZES_NUMERIC`, `compareByTotalStock`, `compareBySizesWithStock`, `compareByCentralSizesStock`, `compareByProductIdAsc`) foram implementados literalmente como descrito no `<action>` de cada task.

## Issues Encountered
- Um ajuste pequeno de fraseado no comentário-header do arquivo de teste: a primeira versão mencionava literalmente o caminho `data/catalog.db`, o que violava a acceptance criteria de "nenhuma referência a `data/catalog.db`" no arquivo de teste (checagem grep exata). Reescrito para descrever o mesmo fato ("nunca lê o dump SQLite real do catálogo") sem o caminho literal. Não é uma deviation de código/comportamento — apenas texto de comentário, corrigido antes do commit GREEN da Task 1.

## User Setup Required

None - no external service configuration required. Módulo é uma função pura sem dependências externas, sem variáveis de ambiente, sem instalação de pacotes novos.

## Next Phase Readiness
- Plano 03-02 (mesma fase, Wave seguinte) pode agora materializar `CatalogProductEntry[]` a partir do SQLite (`products`/`variants`/`catalog_snapshots`) e chamar `recommendForProduct` — o shape de entrada já está travado no bloco `<interfaces>` deste plano e implementado exatamente como especificado
- Fase 4 (preview/aprovação) tem a interface de dados `Recommendation` (D-18) pronta para consumir, com todos os números do desempate expostos para renderizar o "antes vs. depois"
- Nenhum bloqueio: motor 100% testável com fixtures, não depende da planilha de tecidos (D-16) ser importada para funcionar corretamente quando os dados reais chegarem

## Self-Check: PASSED

- FOUND: app-partners-recomendados/src/recommendation/recommendation-engine.js
- FOUND: app-partners-recomendados/src/recommendation/recommendation-engine.test.js
- FOUND: 61d6984 (test RED, Tests 1-10)
- FOUND: 88123d5 (feat GREEN, Task 1)
- FOUND: 90e75a3 (test RED, Tests 11-16)
- FOUND: 54adc83 (feat GREEN, Task 2)
