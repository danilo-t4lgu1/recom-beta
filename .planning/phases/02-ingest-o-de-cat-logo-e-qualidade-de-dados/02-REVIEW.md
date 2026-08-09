---
phase: 02-ingest-o-de-cat-logo-e-qualidade-de-dados
reviewed: 2026-07-10T00:00:00Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - app-partners-recomendados/.gitignore
  - app-partners-recomendados/package.json
  - app-partners-recomendados/scripts/resolve-category.js
  - app-partners-recomendados/scripts/run-ingestion.js
  - app-partners-recomendados/src/db/catalog-store.js
  - app-partners-recomendados/src/db/schema.sql
  - app-partners-recomendados/src/ingestion/fabric-taxonomy.js
  - app-partners-recomendados/src/ingestion/fabric-taxonomy.test.js
  - app-partners-recomendados/src/ingestion/ingest-catalog.js
  - app-partners-recomendados/src/ingestion/stock-availability.js
  - app-partners-recomendados/src/ingestion/stock-availability.test.js
  - app-partners-recomendados/src/nuvemshop-client/client.js
  - app-partners-recomendados/src/rate-limit/adaptive-limiter.js
  - app-partners-recomendados/src/rate-limit/adaptive-limiter.test.js
findings:
  critical: 1
  warning: 6
  info: 3
  total: 10
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-07-10
**Depth:** standard
**Files Reviewed:** 13
**Status:** issues_found

## Summary

Reviewed the ingestion pipeline (Nuvemshop client, adaptive rate limiter, stock availability, fabric-tag audit, SQLite persistence, and the two CLI entry-point scripts). The core happy-path logic is solid and well-covered by unit tests for the pure functions (`getVariantStock`, `hasAvailableGrade`, `auditFabricTags`, `AdaptiveRateLimiter`). However, the orchestration layer (`ingest-catalog.js`) contains one data-integrity bug that silently corrupts the `catalog_snapshots.fabric_tag_raw` column, plus several robustness gaps around unbounded 429 retries, an unused/never-populated canonical-tag map, a cwd-relative SQLite path, and duplicated category-resolution logic between the script and the orchestrator module. None of the reviewed test files exercise the color/size variant-index assumption or the fabric-tag-selection logic, so these bugs would not be caught by `npm test`.

## Critical Issues

### CR-01: `fabric_tag_raw` snapshot picks an arbitrary tag, not the fabric tag

**File:** `app-partners-recomendados/src/ingestion/ingest-catalog.js:142-143`
**Issue:** `product.tags` is a single comma-separated string shared by marketing/SEO tags and (once the user imports the D-07 spreadsheet) fabric-type tags — this is explicitly confirmed in `02-02-SUMMARY.md` ("compartilhada com outras tags de marketing/SEO já existentes"). The code takes `rawTags[0]` — the *first* tag in whatever order the API returns the string — and stores it unconditionally as `fabric_tag_raw` in `catalog_snapshots`:
```js
const rawTags = ((product.tags || '').split(',').map((t) => t.trim()).filter(Boolean));
const fabricTagRaw = rawTags.length > 0 ? rawTags[0] : null;
```
There is no logic anywhere in the codebase that identifies which of the mixed tags is actually a fabric tag (that's exactly what `auditFabricTags`/`canonicalMap` exist to eventually determine, per the DATA-03 design). Today, with 366 real marketing tags and zero fabric tags (D-06), `fabric_tag_raw` is being populated with an arbitrary marketing tag (e.g., "moda fashion", "vestido") for every product in `catalog_snapshots`, silently, with no error and no warning. Once the user imports the real fabric-tag spreadsheet (D-07) and those tags get appended to the same `tags` string, this bug will continue to store whichever tag happens to be listed first — which has no guaranteed relationship to the actual fabric type — corrupting the one column (`fabric_tag_raw`/`fabric_tag_canonical`) that DATA-03 was built to produce correctly. This is silent data corruption with no error signal, and nothing in `02-RESEARCH.md`/`02-02-PLAN.md`/`02-02-SUMMARY.md` documents "first tag in the list = fabric tag" as an accepted rule.
**Fix:** Either (a) do not populate `fabric_tag_raw` per-snapshot until there is a documented rule for identifying the fabric tag among mixed tags (store `null` until DATA-03's audit/mapping logic can reliably select it), or (b) select the tag using `canonicalMap.keys()` intersection with `rawTags` (i.e., only treat a tag as "the fabric tag" if it's already a known key in the canonical map), falling back to `null` otherwise:
```js
const fabricTagRaw = rawTags.find((tag) => canonicalMap.has(tag)) || null;
```
Flag this decision explicitly to the user/product owner rather than silently picking index 0.

## Warnings

### WR-01: `fabric_tag_canonical_map` table is never read — canonical mapping is permanently dead code

**File:** `app-partners-recomendados/src/ingestion/ingest-catalog.js:105`
**Issue:** `runIngestion` hardcodes `const canonicalMap = new Map();` on every run instead of loading it from the `fabric_tag_canonical_map` table created in `schema.sql:56-60`. There is no function anywhere in `src/db/catalog-store.js` (or elsewhere) that reads this table. Even after the user populates `fabric_tag_canonical_map` (per the D-07 spreadsheet-import plan referenced in comments), `runIngestion` will keep passing an empty map to `auditFabricTags`, so every tag will always be reported as "unmapped" and `fabric_tag_canonical` will always be `null` — the intended "audit continuously as taxonomy is added" workflow (DATA-03) cannot ever succeed with the current wiring, regardless of what data the user adds to the table.
**Fix:** Add a `getCanonicalMap()` export in `catalog-store.js` that runs `SELECT raw_tag, canonical_value FROM fabric_tag_canonical_map` and builds a `Map`, then call it in `runIngestion` before `auditFabricTags`:
```js
// catalog-store.js
const selectCanonicalMap = db.prepare('SELECT raw_tag, canonical_value FROM fabric_tag_canonical_map');
export function getCanonicalMap() {
  return new Map(selectCanonicalMap.all().map((row) => [row.raw_tag, row.canonical_value]));
}
```
```js
// ingest-catalog.js
const canonicalMap = getCanonicalMap();
```

### WR-02: Unbounded recursive retry on persistent HTTP 429

**File:** `app-partners-recomendados/src/rate-limit/adaptive-limiter.js:65-69`
**Issue:** `fetchWithRateLimit` recurses on every 429 response with no retry cap:
```js
if (response.status === 429) {
  const resetMs = Number(response.headers.get('x-rate-limit-reset')) || 2000;
  await new Promise((resolve) => setTimeout(resolve, resetMs));
  return fetchWithRateLimit(url, options, limiter);
}
```
If the API keeps returning 429 (misconfiguration, quota exhaustion, an incident on the Nuvemshop side, or a bug causing `resetMs` to resolve to a very small number), this recurses indefinitely — the ingestion job (used in a future daily cron per `02-03-SUMMARY.md`) would hang forever or, in the worst case, blow the call stack. There's no maximum retry count or elapsed-time ceiling.
**Fix:** Add a bounded retry count (or total elapsed-time budget) and throw once exceeded:
```js
export async function fetchWithRateLimit(url, options, limiter = new AdaptiveRateLimiter(), attempt = 0) {
  const MAX_RETRIES = 5;
  await limiter.waitIfNeeded();
  const response = await fetch(url, options);
  limiter.updateFromHeaders(response.headers);

  if (response.status === 429) {
    if (attempt >= MAX_RETRIES) {
      throw new Error(`fetchWithRateLimit: excedeu ${MAX_RETRIES} tentativas de 429 para ${url}`);
    }
    const resetMs = Number(response.headers.get('x-rate-limit-reset')) || 2000;
    await new Promise((resolve) => setTimeout(resolve, resetMs));
    return fetchWithRateLimit(url, options, limiter, attempt + 1);
  }

  return response;
}
```

### WR-03: `productsRead: 0` hardcoded on failure even when the real count is already known

**File:** `app-partners-recomendados/src/ingestion/ingest-catalog.js:194-197`
**Issue:** `allProducts` (and thus `allProducts.length`) is available before the `try` block even starts (line 98), but the `catch` block always records `productsRead: 0`:
```js
} catch (error) {
  finishIngestionRun({ runId, status: 'failed', productsRead: 0 });
  throw error;
}
```
This throws away useful diagnostic information — operators reviewing `ingestion_runs` after a failure cannot tell whether the failure happened before any products were fetched or after 644 of 645 had already been processed (e.g., the DATA-02 Metafield loop failing on the last product).
**Fix:**
```js
} catch (error) {
  finishIngestionRun({ runId, status: 'failed', productsRead: allProducts.length });
  throw error;
}
```

### WR-04: SQLite database path is relative to `process.cwd()`, not to the module file

**File:** `app-partners-recomendados/src/db/catalog-store.js:21`
**Issue:**
```js
const db = new Database('data/catalog.db');
```
uses a bare relative path, while `SCHEMA_PATH` two lines above correctly resolves relative to the module (`__dirname`/`fileURLToPath`). If `run-ingestion.js` is ever invoked with a different working directory than `app-partners-recomendados/` (e.g., a cron/systemd unit, a CI job, or a future Fase 6 scheduler that doesn't `cd` first), `better-sqlite3` will either create a `data/catalog.db` in the wrong location or throw `SQLITE_CANTOPEN` if the `data/` directory doesn't exist there (better-sqlite3 does not auto-create parent directories). This matches `02-RESEARCH.md`'s example code, but the example was never hardened for cwd-independence.
**Fix:** Resolve relative to the module directory (consistent with `SCHEMA_PATH`) and ensure the directory exists:
```js
import { mkdirSync } from 'node:fs';
const DB_DIR = join(__dirname, '..', '..', 'data');
mkdirSync(DB_DIR, { recursive: true });
const db = new Database(join(DB_DIR, 'catalog.db'));
```

### WR-05: Category-resolution logic duplicated between script and orchestrator

**File:** `app-partners-recomendados/scripts/resolve-category.js:19-28` and `app-partners-recomendados/src/ingestion/ingest-catalog.js:28-42`
**Issue:** Both files independently implement the identical "normalize name, find by `name.pt`, throw if not found" logic against `listCategories()`. `resolve-category.js` inlines it in `main()`; `ingest-catalog.js` wraps it in `resolveCategoryIdByName`. Any future change to the matching rule (e.g., accent-insensitive matching, matching by `name.es`/`name.en` as a fallback) would need to be made in two places, and it's easy to update one and forget the other.
**Fix:** Export `resolveCategoryIdByName` from `ingest-catalog.js` (or move it to a shared module, e.g. `src/ingestion/resolve-category.js`) and have `scripts/resolve-category.js` import and call it instead of reimplementing the match logic.

### WR-06: Unverified assumption that `variant.values[0]` is always color and `values[1]` is always size

**File:** `app-partners-recomendados/src/ingestion/ingest-catalog.js:136-137, 154-156`
**Issue:**
```js
colorValue: variant.values && variant.values[0] ? variant.values[0].pt : null,
sizeValue: variant.values && variant.values[1] ? variant.values[1].pt : null,
```
This assumes the Nuvemshop API always returns variant attribute values in a fixed order (color first, size second). Nothing in `02-RESEARCH.md`, the plan docs, or the test suite confirms this ordering is guaranteed by the API rather than being an artifact of how attributes happen to be configured for the currently-inspected products. If any product in the Vestidos category (or a future category) is configured with only one attribute (e.g., size-only, or color-only), or with attributes in reverse order, `colorValue`/`sizeValue` would be silently swapped or wrong with no error raised. No test in `ingest-catalog.js`'s test coverage (there isn't a dedicated test file for `ingest-catalog.js` at all) exercises this mapping.
**Fix:** Confirm with a real product sample whether `product.attributes` (which typically names each position, e.g., `["Cor", "Tamanho"]`) is available and use it to map by attribute name instead of positional index; at minimum add a code comment documenting that this ordering was manually verified against real API responses, and add a unit test covering a variant with only one attribute value.

## Info

### IN-01: Duplicate `.vercel` entry and stray blank line in `.gitignore`

**File:** `app-partners-recomendados/.gitignore:3-5`
**Issue:**
```
.env
node_modules/
.vercel

.vercel
data/*.db
```
`.vercel` is listed twice (lines 3 and 5) with a blank line between them — likely a merge artifact.
**Fix:** Remove the duplicate line and the stray blank line:
```
.env
node_modules/
.vercel
data/*.db
data/*.db-wal
data/*.db-shm
```

### IN-02: `listCategories` "more than 200 categories" warning is unreachable in practice but silently truncates data if it ever fires

**File:** `app-partners-recomendados/src/nuvemshop-client/client.js:106-127`
**Issue:** `listCategories` logs a `console.warn` when the `link` header indicates `rel="next"`, but still returns only the first page — the caller (`resolveCategoryIdByName` in both `ingest-catalog.js` and `resolve-category.js`) has no way to detect this warning happened and will silently fail to find a category that exists only on page 2, throwing the generic "categoria não encontrada" error instead of a clear "categories list was truncated" error.
**Fix:** Since this is explicitly called out as unlikely in the code comment, this is low priority, but consider having `listCategories` paginate fully (mirroring `listProducts`) for correctness parity, or at least surface the truncation as part of the thrown error message in `resolveCategoryIdByName` when a match isn't found and truncation was detected.

### IN-03: `snapshots[].colorValue` derived from `product.variants[0]` regardless of how many colors the product has

**File:** `app-partners-recomendados/src/ingestion/ingest-catalog.js:154-156`
**Issue:** The per-run `catalog_snapshots` row stores a single `color_value` taken from the first variant in `product.variants` (API-returned order), even though a product can have many variants across multiple colors. This silently picks an arbitrary "representative" color with no documented selection rule, which will look misleading in any historical/reporting use of `catalog_snapshots` (D-11) for multi-color products.
**Fix:** Either document explicitly that `color_value` in `catalog_snapshots` is "first variant returned by the API, not necessarily representative," or omit the column at the snapshot level (it's already captured correctly per-variant in the `variants` table) if it isn't actually needed for reporting.

---

_Reviewed: 2026-07-10_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
