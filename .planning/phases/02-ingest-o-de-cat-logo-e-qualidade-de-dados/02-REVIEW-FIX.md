---
phase: 02-ingest-o-de-cat-logo-e-qualidade-de-dados
fixed_at: 2026-07-11T03:56:33Z
review_path: .planning/phases/02-ingest-o-de-cat-logo-e-qualidade-de-dados/02-REVIEW.md
iteration: 1
findings_in_scope: 7
fixed: 7
skipped: 0
status: all_fixed
---

# Phase 02: Code Review Fix Report

**Fixed at:** 2026-07-11T03:56:33Z
**Source review:** .planning/phases/02-ingest-o-de-cat-logo-e-qualidade-de-dados/02-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 7 (1 critical, 6 warnings — fix_scope: critical_warning, Info findings excluded)
- Fixed: 7
- Skipped: 0

## Fixed Issues

### CR-01: `fabric_tag_raw` snapshot picks an arbitrary tag, not the fabric tag

**Files modified:** `app-partners-recomendados/src/ingestion/ingest-catalog.js`
**Commit:** `02bb7cc`
**Applied fix:** Replaced the unconditional `rawTags[0]` selection with
`rawTags.find((tag) => canonicalMap.has(tag)) || null` — a tag is only treated as
"the fabric tag" if it is already a known key in `canonicalMap`. Combined with the
WR-01 fix (canonicalMap now actually loaded from the DB), this stops
`catalog_snapshots.fabric_tag_raw` from being silently populated with an arbitrary
marketing tag.

### WR-01: `fabric_tag_canonical_map` table is never read — canonical mapping is permanently dead code

**Files modified:** `app-partners-recomendados/src/db/catalog-store.js`, `app-partners-recomendados/src/ingestion/ingest-catalog.js`
**Commit:** `d40f9e0`
**Applied fix:** Added `getCanonicalMap()` export in `catalog-store.js` (new
prepared statement `SELECT raw_tag, canonical_value FROM fabric_tag_canonical_map`
built into a `Map`), and replaced the hardcoded `const canonicalMap = new Map();`
in `runIngestion` with a call to `getCanonicalMap()`. Tags imported via the D-07
spreadsheet will now actually be used for mapping instead of the map always being
empty.

### WR-02: Unbounded recursive retry on persistent HTTP 429

**Files modified:** `app-partners-recomendados/src/rate-limit/adaptive-limiter.js`
**Commit:** `7313d3e`
**Applied fix:** Added `MAX_429_RETRIES = 5` and an `attempt` parameter (default 0)
to `fetchWithRateLimit`. Once `attempt >= MAX_429_RETRIES` on a 429 response, the
function throws instead of recursing again, preventing indefinite hangs or stack
overflow during a prolonged 429 incident.

### WR-03: `productsRead: 0` hardcoded on failure even when the real count is already known

**Files modified:** `app-partners-recomendados/src/ingestion/ingest-catalog.js`
**Commit:** `7cbc68e`
**Applied fix:** Changed the `catch` block's `finishIngestionRun` call to use
`productsRead: allProducts.length` instead of the hardcoded `0`, since
`allProducts` is populated before the `try` block begins.

### WR-04: SQLite database path is relative to `process.cwd()`, not to the module file

**Files modified:** `app-partners-recomendados/src/db/catalog-store.js`
**Commit:** `476578a`
**Applied fix:** Resolved `DB_DIR` relative to `__dirname` (consistent with the
existing `SCHEMA_PATH` pattern), added `mkdirSync(DB_DIR, { recursive: true })`
before opening the database, and changed `new Database('data/catalog.db')` to
`new Database(join(DB_DIR, 'catalog.db'))`.

### WR-05: Category-resolution logic duplicated between script and orchestrator

**Files modified:** `app-partners-recomendados/src/ingestion/ingest-catalog.js`, `app-partners-recomendados/scripts/resolve-category.js`
**Commit:** `7699eb4`
**Applied fix:** Exported `resolveCategoryIdByName` from `ingest-catalog.js` and
rewrote `scripts/resolve-category.js` to import and call it instead of
reimplementing the identical normalize/find/throw match logic inline.

### WR-06: Unverified assumption that `variant.values[0]` is always color and `values[1]` is always size

**Files modified:** `app-partners-recomendados/src/ingestion/ingest-catalog.js`
**Commit:** `fbce969`
**Applied fix:** Added `findAttributeIndex()` and
`extractVariantValueByAttributeName()` helpers that look up the color/size position
via `product.attributes` (matching `"Cor"`/`"Color"` and `"Tamanho"`/`"Size"`
case-insensitively) and fall back to the previous fixed index (0 for color, 1 for
size) only when the attribute name cannot be identified. Applied to both the
per-variant `colorValue`/`sizeValue` mapping and the per-snapshot `colorValue`
(which still represents "first variant returned by the API," per IN-03 — that
separate, lower-priority concern was not in scope for this fix pass since IN-03 is
an Info-level finding excluded by `fix_scope: critical_warning`).

**Note:** This fix changes runtime matching behavior (name-based lookup with
positional fallback) that could not be validated against a real Nuvemshop API
response in this environment — no test fixtures or `02-RESEARCH.md` sample data
document the exact `product.attributes` shape returned by the live API. Syntax
verification (tier 2) passed, but this finding is flagged as **fixed: requires
human verification** — confirm against a real product sample (or existing
`ingest-catalog.js` manual test run) that `product.attributes` values match
`"Cor"`/`"Tamanho"` (or `"Color"`/`"Size"`) as expected before relying on this in
production, particularly for any product with only one attribute or non-standard
attribute names.

## Skipped Issues

None — all in-scope findings were fixed.

---

_Fixed: 2026-07-11T03:56:33Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
