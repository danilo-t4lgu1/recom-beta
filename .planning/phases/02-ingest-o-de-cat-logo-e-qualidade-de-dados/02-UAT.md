---
status: resolved
phase: 02-ingest-o-de-cat-logo-e-qualidade-de-dados
source: [02-VERIFICATION.md]
started: 2026-07-11T04:07:46Z
updated: 2026-07-11T04:20:00Z
---

## Current Test

None — all tests complete.

## Tests

### 1. Mapeamento de cor/tamanho por nome de atributo (WR-06)
expected: |
  Inspecionar a resposta real da API para um produto da categoria Vestidos (ex: via
  `GET /2025-03/{store_id}/products/{id}`) e confirmar que `product.attributes` contém
  entradas cujo nome corresponde a "Cor" e "Tamanho" (ou variações em inglês), validando
  que a correção WR-06 resolve os valores pelo nome do atributo, não pela posição fixa.
result: |
  PASSOU. Consultado ao vivo via `listProducts` contra 3 produtos reais da categoria
  Vestidos (321418512, 321418534, 321418552): `product.attributes` retorna
  `[{"pt":"Cor"},{"pt":"Tamanho"}]` nos 3 casos. `findAttributeIndex` (case-insensitive,
  compara contra `COLOR_ATTRIBUTE_NAMES=['cor','color']`/`SIZE_ATTRIBUTE_NAMES=['tamanho','size']`)
  resolve corretamente pelo nome do atributo — confirmado, não é coincidência posicional.
  Usuário também confirmou que SKU segue padronização própria (fora do escopo de WR-06).

## Summary

total: 1
passed: 1
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
