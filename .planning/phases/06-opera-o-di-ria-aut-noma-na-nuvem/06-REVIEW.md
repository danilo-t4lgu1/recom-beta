---
phase: 06-opera-o-di-ria-aut-noma-na-nuvem
reviewed: 2026-07-17T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - .github/workflows/daily-recompute.yml
  - app-partners-recomendados/scripts/run-daily-job.js
  - app-partners-recomendados/scripts/run-daily-job.test.js
  - app-partners-recomendados/src/db/catalog-store.js
  - app-partners-recomendados/src/db/catalog-store.test.js
  - storefront-script/main.js
  - storefront-script/main.test.js
findings:
  critical: 1
  warning: 5
  info: 1
  total: 7
status: issues_found
---

# Phase 06: Code Review Report

**Reviewed:** 2026-07-17T00:00:00Z
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Reviewed the daily-recompute GitHub Actions workflow, the `run-daily-job` orchestrator (and its tests), `catalog-store.js`'s new Phase 6 read/write helpers (and its tests), and the storefront script's caching layer (and its tests). The idempotency guard (D-48/SC#2), the WAL-checkpoint discipline, and the `DO NOTHING` seeding logic in `catalog-store.js` are all implemented as documented and covered by tests. However, `storefront-script/main.js` renders a `data-recommended-product-id` DOM attribute populated with the recommended product's **name** instead of its ID — a real data-correctness bug with zero test coverage protecting it. There is also an unhandled-promise-rejection risk in the CLI failure path of `run-daily-job.js`, a partial-migration edge case in `catalog-store.js`, and a missing `concurrency:` guard in the workflow that could let two overlapping runs both pass the "already ran today" check.

## Critical Issues

### CR-01: `data-recommended-product-id` attribute is populated with the product **name**, not its ID

**File:** `storefront-script/main.js:207-209`
**Issue:** `renderRecommendationBlock(recommendedProduct)` only receives the `recommendedProduct` object, whose shape (confirmed in `app-partners-recomendados/src/api/recommendations.js`) is `{ url, name, image, price }` — it has no `id` field at all. The actual recommended product ID lives in the sibling field `data.recommendedProductId` returned by the backend, but that value is never passed into `renderRecommendationBlock`. Instead, the code does:

```js
'data-recommended-product-id="' + encodeURIComponent(recommendedProduct.name) + '" ' +
```

So the DOM attribute literally named "recommended-product-id" contains the URI-encoded product **name**, not an ID. Any downstream analytics/tracking logic that reads this attribute to identify which product was recommended (e.g. to correlate clicks with a specific `productId` for the approval/recommendation feedback loop this whole phase is built around) will receive the wrong value. This is untested — `main.test.js` only covers the cache helpers, not `renderRecommendationBlock`.

**Fix:** Thread the real ID through to the render function and use it:
```js
function renderRecommendationBlock(recommendedProductId, recommendedProduct) {
  var safeUrl = escapeHtml(recommendedProduct.url);
  var safeName = escapeHtml(recommendedProduct.name);
  ...
  'data-recommended-product-id="' + encodeURIComponent(recommendedProductId) + '" ' +
  ...
}
```
and update both call sites:
```js
renderRecommendationBlock(cached.recommendedProductId, cached.recommendedProduct);
...
renderRecommendationBlock(data.recommendedProductId, data.recommendedProduct);
```
Add a unit test asserting the rendered HTML's `data-recommended-product-id` equals the recommended product's ID, not its name.

## Warnings

### WR-01: Unhandled promise rejection risk if `notifyWriteFailure` itself throws

**File:** `app-partners-recomendados/scripts/run-daily-job.js:97-101`
**Issue:**
```js
.catch(async (err) => {
  console.error('\nERRO durante o job diário:', err.message);
  await notifyWriteFailure({ productId: 'daily-job', error: err, triggeredBy: 'scheduled' });
  process.exit(1);
});
```
If `notifyWriteFailure` rejects (e.g. the webhook URL is unreachable, DNS failure, etc.), this async `.catch` handler's returned promise itself rejects with no further `.catch` attached — an unhandled rejection. `process.exit(1)` is never reached, and the process's actual exit behavior/exit code is left to Node's default unhandled-rejection handling rather than the intended, logged failure path. This is exactly the scenario this script is designed to be resilient to (a failing external call during an already-failing run).

**Fix:**
```js
.catch(async (err) => {
  console.error('\nERRO durante o job diário:', err.message);
  try {
    await notifyWriteFailure({ productId: 'daily-job', error: err, triggeredBy: 'scheduled' });
  } catch (notifyErr) {
    console.error('Falha adicional ao notificar erro:', notifyErr.message);
  }
  process.exit(1);
});
```

### WR-02: Idempotent migration check doesn't detect a crash between the two `ALTER TABLE` statements

**File:** `app-partners-recomendados/src/db/catalog-store.js:38-43`
**Issue:**
```js
const hasGroupColumn = catalogSnapshotColumns.some((c) => c.name === 'product_group_canonical');
if (!hasGroupColumn) {
  db.exec('ALTER TABLE catalog_snapshots ADD COLUMN category_raw TEXT');
  db.exec('ALTER TABLE catalog_snapshots ADD COLUMN product_group_canonical TEXT');
}
```
The guard only checks for `product_group_canonical`. If the Node process is killed (e.g. an ephemeral CI runner terminated mid-job — the exact failure mode this codebase's comments elsewhere worry about for WAL checkpointing) after the first `ALTER TABLE` succeeds but before the second runs, the database is left with `category_raw` present but `product_group_canonical` absent. On the next module load, `hasGroupColumn` is still `false`, so the code re-attempts `ALTER TABLE catalog_snapshots ADD COLUMN category_raw TEXT`, which throws `SQLITE_ERROR: duplicate column name: category_raw` — module load fails entirely.

**Fix:** Check/add each column independently, or wrap both statements so they can't apply partially:
```js
const columnNames = catalogSnapshotColumns.map((c) => c.name);
if (!columnNames.includes('category_raw')) {
  db.exec('ALTER TABLE catalog_snapshots ADD COLUMN category_raw TEXT');
}
if (!columnNames.includes('product_group_canonical')) {
  db.exec('ALTER TABLE catalog_snapshots ADD COLUMN product_group_canonical TEXT');
}
```

### WR-03: Workflow has no `concurrency:` guard despite supporting manual re-dispatch alongside the daily schedule

**File:** `.github/workflows/daily-recompute.yml:4-8`
**Issue:** The workflow enables both `schedule` and `workflow_dispatch` (explicitly for "SC#2: rodar 2x no mesmo dia"). The idempotency protection against a second successful run the same day lives entirely in `getSuccessfulRunForToday()`, which is only checked by whichever run's `git checkout` happens to see the previous run's committed `data/catalog.db`. If a manual dispatch is fired while a scheduled run is still in progress (or vice versa), both jobs check out the repo before either commits, both see "no successful run today", and both proceed to call the live Nuvemshop API and seed the approval queue — then race on `git push`, where the second push either fails (non-fast-forward) or, worse, silently succeeds with a duplicate ingestion run's data overwriting the first.
**Fix:** Add a `concurrency` group so overlapping runs queue instead of racing:
```yaml
concurrency:
  group: daily-recompute
  cancel-in-progress: false
```

### WR-04: Corrupted-but-valid-JSON cache entry with a missing `cachedAt` is treated as fresh forever

**File:** `storefront-script/main.js:139-143`
**Issue:**
```js
if (now - parsed.cachedAt > CACHE_TTL_MS) {
  return null;
}
return parsed.data;
```
If `parsed.cachedAt` is missing/undefined (valid JSON, e.g. written by a future/different version of this script, or a manually edited storage entry), `now - undefined` is `NaN`, and `NaN > CACHE_TTL_MS` evaluates to `false` — so the entry is treated as within-TTL and returned indefinitely, rather than degrading to a cache miss the way the JSON-parse-failure branch above it already does deliberately.
**Fix:**
```js
if (typeof parsed.cachedAt !== 'number' || now - parsed.cachedAt > CACHE_TTL_MS) {
  return null;
}
```

### WR-05: `renderRecommendationBlock` (and the rest of the DOM-rendering path) has zero test coverage

**File:** `storefront-script/main.test.js` (whole file)
**Issue:** The test file only covers `getCachedRecommendation`/`setCachedRecommendation`. `renderRecommendationBlock`, `escapeHtml`, `getCurrentProductId`, and `init()` are not exported for testing and have no tests at all. This is precisely why CR-01 (name used in place of ID) shipped undetected — the function that builds the HTML string, including the escaping logic explicitly called out in the file's own comments as a prior code-review fix (CR-01 from Phase 1), has no regression protection.
**Fix:** Export `renderRecommendationBlock` and `escapeHtml` behind the same `module.exports` test guard already used for the cache functions, and add tests asserting: (a) the rendered anchor's `href`/`data-recommended-product-id`/image `alt` are HTML-escaped for a product name containing `"`, `<`, `>`; (b) `data-recommended-product-id` equals the product ID, not the name.

## Info

### IN-01: No `timeout-minutes` set on the recompute job

**File:** `.github/workflows/daily-recompute.yml:14-15`
**Issue:** The `recompute` job has no `timeout-minutes`. If `runIngestion` hangs on a slow/unresponsive Nuvemshop API call, the job can run for the GitHub Actions default timeout (360 minutes), burning CI minutes on a daily scheduled job before it ever fails.
**Fix:** Add a bounded timeout appropriate to expected ingestion duration, e.g.:
```yaml
jobs:
  recompute:
    runs-on: ubuntu-latest
    timeout-minutes: 20
```

---

_Reviewed: 2026-07-17T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
