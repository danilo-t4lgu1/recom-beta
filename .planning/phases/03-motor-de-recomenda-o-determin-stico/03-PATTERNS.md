# Phase 3: Motor de Recomendação Determinístico - Pattern Map

**Mapped:** 2026-07-11
**Files analyzed:** 4 (3 new, 1 modified)
**Analogs found:** 4 / 4

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `app-partners-recomendados/src/recommendation/recommendation-engine.js` (NEW) | pure domain module (service) | transform (snapshot in → ranked list out) | `app-partners-recomendados/src/ingestion/stock-availability.js` | exact (pure named-function domain module) |
| `app-partners-recomendados/src/recommendation/recommendation-engine.test.js` (NEW) | test | n/a | `app-partners-recomendados/src/ingestion/stock-availability.test.js` | exact |
| `app-partners-recomendados/src/recommendation/` fixtures (inline in test, NEW) | test fixtures | n/a | `makeVariant()` factory in `stock-availability.test.js` (lines 29-31) | exact |
| `app-partners-recomendados/src/db/catalog-store.js` (MODIFIED — add read query, e.g. `getEligibleCandidates` / `getLatestCatalogSnapshot`) | model / store wrapper | CRUD (read-only addition) | itself: `getCanonicalMap` (lines 76-78, 96-105) | exact |

**Notes on classification:**
- The engine is called product-by-product (D-17), returns rich objects (D-18), never touches the network — data-flow is pure transform, unlike the batch orchestrator `ingest-catalog.js`. Do NOT copy the orchestration shape of `runIngestion`; copy the domain-module shape of `stock-availability.js`.
- CONTEXT.md explicitly says catalog-store has no ready query for "candidates by color+fabric+stock" — it must be created following the existing prepared-statement + named-export pattern.

## Pattern Assignments

### `src/recommendation/recommendation-engine.js` (pure domain module, transform)

**Analog:** `app-partners-recomendados/src/ingestion/stock-availability.js` (whole file, 39 lines)

**Module header pattern** (lines 1-8) — every module opens with a comment block citing decision IDs and explaining why the rule is a named function:
```javascript
// Cálculo de disponibilidade de estoque via inventory_levels[] (D-04/DATA-01).
//
// ... A regra de negócio real da Talgui ("grade disponível" = 3 ou mais tamanhos
// com estoque > 0) é isolada como função nomeada e configurável (Pitfall A ...),
// nunca uma checagem inline `stock > 0` solta no orquestrador ...
```
Engine header should cite RULE-01/RULE-02, D-13/D-15/D-17/D-18.

**Pure exported function with JSDoc + defensive defaults, never throws on malformed input** (lines 19-39):
```javascript
export function getVariantStock(variant) {
  const levels = (variant && variant.inventory_levels) || [];
  return levels.reduce((total, level) => total + (level.stock || 0), 0);
}

export function hasAvailableGrade(product, { minSizesInStock = 3 } = {}) {
  const variants = (product && product.variants) || [];
  const sizesInStockCount = variants.filter((variant) => getVariantStock(variant) > 0).length;
  return sizesInStockCount >= minSizesInStock;
}
```
Note the options-object-with-defaults signature style (`{ minSizesInStock = 3 } = {}`) — use the same style for the engine entry point (e.g. `recommendForProduct(productId, catalog, { maxRecommendations = MAX_RECOMMENDATIONS } = {})`). Semantics per D-15/Claude's-Discretion: ineligible source product → return empty list, do not throw (matches the "malformed input never throws" convention above).

**Named business-rule constants pattern** — analog: `ingest-catalog.js` lines 17, 25-26:
```javascript
const MIN_SIZES_IN_STOCK = 3; // D-04: regra de negócio nomeada, nunca inline
const COLOR_ATTRIBUTE_NAMES = ['cor', 'color'];
const SIZE_ATTRIBUTE_NAMES = ['tamanho', 'size'];
```
Engine must declare (with decision-ID comments): `MAX_RECOMMENDATIONS = 8`, `CENTRAL_SIZES_LETTER = ['P', 'M', 'G']`, `CENTRAL_SIZES_NUMERIC = ['36', '38', '40']` (D-13 level-3 tiebreak; both grade conventions per Specifics).

**Reuse, don't reimplement** (per CONTEXT.md Reusable Assets):
```javascript
import { hasAvailableGrade, getVariantStock } from '../ingestion/stock-availability.js';
```
Fabric canonicalization is NOT recomputed — the engine consumes the already-persisted `fabric_tag_canonical` column (NULL → product out of engine, D-15).

**Small internal helpers stay unexported, case-insensitive string compare pattern** — analog `ingest-catalog.js` lines 37-43 (`findAttributeIndex`): private helper, `.trim().toLowerCase()` normalization, returns sentinel instead of throwing. Apply the same for size-name matching in the level-3 tiebreak.

---

### `src/recommendation/recommendation-engine.test.js` (Vitest)

**Analog:** `app-partners-recomendados/src/ingestion/stock-availability.test.js` (whole file, 63 lines)

**Test file structure** (lines 1-10, 28-31):
```javascript
// Testes de src/ingestion/stock-availability.js (D-04/DATA-01).
//
// Cobre os 6 comportamentos do plano 02-02: ...

import { describe, it, expect } from 'vitest';
import { getVariantStock, hasAvailableGrade } from './stock-availability.js';

describe('hasAvailableGrade', () => {
  function makeVariant(stock) {
    return { inventory_levels: [{ location_id: 'A', stock }] };
  }
```
Conventions to copy: header comment mapping tests to plan behaviors; Portuguese `it()` descriptions ending with `(Test N)`; tiny in-file factory functions (`makeVariant`) instead of external fixture files; explicit tests that malformed/empty input returns the safe value without throwing (lines 58-62).

**Fixture implication from CONTEXT.md D-16:** fixtures must have `fabric_tag_canonical` filled manually (real catalog.db has 0/645) — build a `makeProduct({ color, fabric, stocks })`-style factory analogous to `makeVariant`. Tests should not read `data/catalog.db`.

---

### `src/db/catalog-store.js` (MODIFIED — add read function(s))

**Analog:** the file itself — read pattern `getCanonicalMap`.

**Prepared statement at module top** (lines 76-78):
```javascript
const selectCanonicalMap = db.prepare(
  `SELECT raw_tag, canonical_value FROM fabric_tag_canonical_map`
);
```

**Exported named read function mapping rows to a plain JS structure** (lines 96-105):
```javascript
/**
 * Lê o mapa de canonicalização ... Retorna um `Map` vazio se a tabela ainda não
 * tiver linhas (comportamento esperado ...).
 * @returns {Map<string, string>}
 */
export function getCanonicalMap() {
  return new Map(selectCanonicalMap.all().map((row) => [row.raw_tag, row.canonical_value]));
}
```
Rules encoded in the file header (lines 1-11) that the new function must respect: export only named functions, NEVER the raw `db` object; queries use `db.prepare(...)` with named `@params`, never string concatenation with product data (T-02-04).

**Schema columns available for the new query** — `src/db/schema.sql`: `variants(product_id, color_value, size_value, stock_total)` lines 32-40; `catalog_snapshots(run_id, product_id, has_available_grade, sizes_in_stock_count, fabric_tag_canonical, color_value)` lines 43-54 with index `idx_snapshots_product(product_id, snapshot_at)`. Snapshots are append-only per run — the read query must filter to the latest run (e.g. max `run_id` from `ingestion_runs` with `status='success'`, table at lines 14-22).

**Color-source caveat (Claude's Discretion / IN-03):** `catalog_snapshots.color_value` is first-variant-only (see `ingest-catalog.js` lines 200-208 comment); `variants.color_value` has correct per-variant granularity. Values are identical today (0 multi-color products) — planner picks the source; prefer `variants` if cost is equal.

## Shared Patterns

### Decision-ID traceability comments
**Source:** all Phase 2 files (e.g. `stock-availability.js` lines 1-8, `catalog-store.js` lines 1-11)
**Apply to:** every new file and function. Every business rule cites its decision (D-13, D-15, D-17, D-18, RULE-01/02) in the file header or JSDoc.

### Defensive, non-throwing domain functions
**Source:** `stock-availability.js` (T-02-06 convention)
**Apply to:** engine functions. Missing/empty input → safe empty result (`[]`, `0`, `false`), never an exception.
```javascript
const variants = (product && product.variants) || [];
```

### Named constants for business values
**Source:** `ingest-catalog.js` line 17
**Apply to:** engine (`MAX_RECOMMENDATIONS = 8`, central sizes) and any new store query limits.

### JSDoc on every exported function
**Source:** all exported functions in `catalog-store.js` and `stock-availability.js` — `@param` with inline object shapes, `@returns` with type; plain ESM JavaScript, no TypeScript.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| — (tiebreak cascade logic itself, D-13) | algorithm inside engine | transform | No existing sorting/ranking code in the codebase. Structure it as a comparator built from three named comparator functions (one per cascade level), keeping each level a named function per the "no inline business rule" convention. No external library needed — `Array.prototype.sort` with a composed comparator suffices for ≤ ~645 products. |

## Metadata

**Analog search scope:** `app-partners-recomendados/src/**` (12 JS files total: auth, server, api, rate-limit, ingestion, db, nuvemshop-client)
**Files scanned:** 12 globbed; 6 read in full (catalog-store.js, schema.sql, stock-availability.js + test, fabric-taxonomy.js, ingest-catalog.js)
**Pattern extraction date:** 2026-07-11
