---
phase: 04-preview-e-aprova-o-humana
reviewed: 2026-07-16T14:50:31Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - app-partners-recomendados/src/db/catalog-store.js
  - app-partners-recomendados/src/db/catalog-store.test.js
  - app-partners-recomendados/src/db/schema.sql
  - app-partners-recomendados/src/review-server.js
  - app-partners-recomendados/src/review-server.test.js
  - app-partners-recomendados/src/review/approval-gate.js
  - app-partners-recomendados/src/review/approval-gate.test.js
  - app-partners-recomendados/src/review/diff.js
  - app-partners-recomendados/src/review/diff.test.js
  - app-partners-recomendados/src/review/review-queue.js
  - app-partners-recomendados/src/review/review-queue.test.js
  - app-partners-recomendados/src/review/write-executor.js
  - app-partners-recomendados/src/review/write-executor.test.js
findings:
  critical: 1
  warning: 4
  info: 2
  total: 7
status: fixed_partial
---

## Resolution (post-review, applied manually by orchestrator — not via --fix)

- **CR-01: FIXED** (commit `260d11d`) — added explicit `runId == null` guard in the
  `reject` handler returning 409, plus a regression test (Test 18 in
  `review-server.test.js`). Full suite: 115/115 green.
- **WR-02: NOT FIXED, by design** — the reviewer's suggested fix (add a catalog
  existence check to `reject`, mirroring `approve`) was deliberately NOT applied.
  `04-05-PLAN.md` explicitly documents that rejecting a product no longer in the
  latest catalog snapshot is a valid operation, not an error condition. Adding the
  existence check would reverse that documented design decision. Only the crash
  (CR-01) was a genuine defect; accepting ids absent from the latest snapshot is
  intentional.
- **WR-01 (TOCTOU race), WR-03 (FK pragma not enabled), WR-04 (partially addressed
  by Test 18), IN-01, IN-02: NOT FIXED** — left as documented follow-ups. WR-01 and
  WR-03 touch shared `catalog-store.js` behavior used since Phase 2/3 and warrant
  explicit review before changing, rather than a same-session drive-by fix.

# Phase 04: Code Review Report

**Reviewed:** 2026-07-16T14:50:31Z
**Depth:** standard
**Files Reviewed:** 13
**Status:** issues_found

## Summary

Reviewed the approval/preview pipeline for Phase 4 (`review-server.js`, `review/diff.js`,
`review/review-queue.js`, `review/approval-gate.js`, `review/write-executor.js`, and the
`db/catalog-store.js` additions that back them). The pure domain modules
(`diff.js`, `review-queue.js`, `approval-gate.js`, `write-executor.js`) are solid: zero-import
discipline is genuinely honored, edge cases (empty catalogs, missing baseline, mixed
string/number ids) are handled and are backed by targeted tests, and the SQL layer
consistently uses parameterized `better-sqlite3` statements (no injection surface).

The defect is concentrated in `review-server.js`'s `POST /review/:productId/reject` route,
which — unlike its `approve` sibling — skips product-existence and run-id validation before
writing to the database. This was empirically reproduced during this review: calling
`POST /review/<any-id>/reject` before the very first successful ingestion run completes
returns an HTTP 500 (an uncaught `NOT NULL` constraint violation on `approval_queue.run_id`
surfaces through the router's generic catch-all), instead of a meaningful 404/409. The same
gap also lets `reject` silently create `approval_queue` rows for product ids that don't exist
in the catalog at all, which the schema's (unenforced) `REFERENCES` comments imply should
never happen. A handful of lower-severity robustness/consistency issues are also noted below.

## Critical Issues

### CR-01: `POST /review/:productId/reject` throws an uncaught SQL constraint error (500) instead of validating the request

**File:** `app-partners-recomendados/src/review-server.js:487-512`
**Issue:**
Unlike the `approve` handler (which loads `catalogProducts`, does
`catalogProducts.find(...)`, and returns 404 if the product doesn't exist — lines 459-465),
the `reject` handler does none of that:

```js
const rejectMatch = url.pathname.match(REJECT_PATH);
if (rejectMatch) {
  ...
  const productId = decodeURIComponent(rejectMatch[1]);
  await readRawBody(req).catch(() => {});

  const runId = getLatestSuccessfulRunId();          // may be null
  upsertApprovalDecision({
    productId,                                        // never checked against the catalog
    runId,                                             // never checked for null
    status: 'rejected',
    approvedRecommendationIds: null,
    decidedAt: new Date().toISOString(),
  });

  res.writeHead(303, { Location: '/review' });
  res.end();
  return;
}
```

`approval_queue.run_id` is declared `NOT NULL` in `schema.sql:90`. When no ingestion run has
ever completed successfully (`getLatestSuccessfulRunId()` returns `null` —
`catalog-store.js:248-251`), `upsertApprovalDecisionStmt.run({ ..., runId: null, ... })`
throws a `better-sqlite3` `SqliteError: NOT NULL constraint failed: approval_queue.run_id`.
This is not caught locally, so it propagates to the router's blanket `catch` in
`createServer()` (`review-server.js:599-601`) and is returned as a generic, unhelpful
`500 Erro interno` page.

I reproduced this directly against a fresh temp DB (mirroring the test harness in
`review-server.test.js`):

```
POST /review/some-nonexistent-product/reject  (no ingestion run has ever succeeded)
→ 500  "Erro interno ao processar a requisição."
```

Separately, even when a successful run *does* exist, `reject` still never checks that
`productId` corresponds to a real catalog entry, so `POST /review/<garbage-id>/reject`
against a live run silently succeeds (303) and writes a row to `approval_queue` for a
product that was never part of the catalog — inconsistent with `approve`'s explicit 404
guard for the exact same situation, and with the intent documented in `schema.sql:89`
(`product_id TEXT NOT NULL REFERENCES products(id)`).

**Fix:** Mirror the `approve` handler's validation before writing the decision:

```js
const productId = decodeURIComponent(rejectMatch[1]);
await readRawBody(req).catch(() => {});

const catalogProducts = getLatestSnapshotProducts();
const product = catalogProducts.find((p) => String(p.productId) === productId);
if (!product) {
  sendHtml(res, 404, renderProductNotFoundPage(productId));
  return;
}

const runId = getLatestSuccessfulRunId();
upsertApprovalDecision({ productId, runId, status: 'rejected', approvedRecommendationIds: null, decidedAt: new Date().toISOString() });
```
(Note that once the existence check above is added, `runId` is guaranteed non-null in
practice — `getLatestSnapshotProducts()` only returns rows when a successful run exists —
but it's still worth having `catalog-store.js#upsertApprovalDecision` reject/normalize a
`null` runId defensively; see WR-03.)

## Warnings

### WR-01: TOCTOU race between "latest snapshot" and "latest successful run" reads violates the documented "nunca mistura runs" invariant

**File:** `app-partners-recomendados/src/review-server.js:459-469` (approve), `:552-555` (queue), `:568-583` (product diff)
**Issue:** Three separate handlers independently call `getLatestSnapshotProducts()` and then,
moments later, `getLatestSuccessfulRunId()` again to resolve the baseline:

```js
const catalogProducts = getLatestSnapshotProducts();   // internally resolves "latest successful run" #1
...
const runId = getLatestSuccessfulRunId();               // resolves "latest successful run" #2 — could differ
const baselineMap = getBaselineForRun({ runId });
```

`getLatestSnapshotProducts()` resolves its own "latest successful run" internally
(`catalog-store.js:200-206`) and its docstring explicitly states the invariant
"Nunca mistura runs" (never mixes runs). If a new ingestion run finishes successfully
between the two calls in the same request (plausible if ingestion is cron-driven while the
review panel is open), `catalogProducts` would reflect run N while `baselineMap`/`runId`
reflect run N+1, silently mixing runs within a single response — the exact failure mode the
module's own documentation says must never happen.
**Fix:** Resolve `runId` once via `getLatestSuccessfulRunId()` first, and thread it into a
`getLatestSnapshotProducts({ runId })`-style call (or add such a parameter) so both reads are
pinned to the same run id within a single request.

### WR-02: Missing input validation lets `reject` write rows for product ids that don't exist in the catalog

**File:** `app-partners-recomendados/src/review-server.js:487-512`
**Issue:** See CR-01 — this is the "no crash, just wrong data" half of the same gap. Even
once a successful run exists, `reject` accepts any `productId` value without checking it
against `getLatestSnapshotProducts()`, unlike `approve`. This is a data-integrity gap
distinct from the crash: it allows `approval_queue` to accumulate rows referencing product
ids that were never ingested (e.g. typos in a manually-constructed request, or a stale
bookmark to a product that has since disappeared from the catalog).
**Fix:** Same fix as CR-01 (add the existence check before calling `upsertApprovalDecision`).

### WR-03: Foreign key constraints in `schema.sql` are declared but never enforced

**File:** `app-partners-recomendados/src/db/catalog-store.js:30-32`, `app-partners-recomendados/src/db/schema.sql:36,41,46,52-53,73,81,89-90`
**Issue:** `schema.sql` declares several `REFERENCES` clauses (`approval_queue.product_id
REFERENCES products(id)`, `approval_queue.run_id REFERENCES ingestion_runs(id)`, etc.) and the
file's own header comment describes `approval_queue` as "base do gate de escrita... que a
Fase 5 consome," implying these references matter. However, `catalog-store.js` never runs
`PRAGMA foreign_keys = ON` (only `journal_mode = WAL` is set at line 31), and SQLite disables
FK enforcement by default. This means the `REFERENCES` declarations are purely documentation
— invalid references (such as the one enabled by CR-01/WR-02) are silently accepted rather
than raising a constraint violation that could be turned into a clean 400/404 at the call
site.
**Fix:** Add `db.pragma('foreign_keys = ON');` alongside the existing `journal_mode = WAL`
pragma, and audit call sites (like `reject`) that currently rely on the database *not*
enforcing integrity.

### WR-04: `review-server.test.js` has no coverage for the exact path where CR-01 lives

**File:** `app-partners-recomendados/src/review-server.test.js`
**Issue:** The 17 documented behaviors cover `reject` only against a seeded, valid product
with a completed successful run (Test 13). There is no test for (a) `POST
/review/:productId/reject` before any ingestion run has ever succeeded, or (b) `POST
/review/:productId/reject` for a `productId` absent from the catalog. Both are exactly the
gaps that produce CR-01/WR-02, and neither is exercised anywhere in the suite (compare with
`GET /review/999999999` → 404, which *is* tested at Test 6, but has no `reject`/`approve`
equivalent).
**Fix:** Add a test asserting `POST /review/<nonexistent>/reject` returns 404 (once CR-01 is
fixed), and a test asserting it does not 500 when no successful run exists yet.

## Info

### IN-01: `readRawBody` has no explicit per-request timeout

**File:** `app-partners-recomendados/src/review-server.js:116-152`
**Issue:** The body-size cap (`MAX_BODY_BYTES`) bounds memory correctly, but a client that
sends data slower than the cap (or never sends the terminating chunk) can hold the
`req.on('end', ...)` promise pending indefinitely, since `req.destroy()` is deliberately never
called (per the comment at lines 128-133) and no `server.timeout`/`req.setTimeout()` is
configured. Risk is low in practice since the server binds to `127.0.0.1` only
(`review-server.js:610`), but it's worth calling out since there is no defense beyond Node's
implicit default request timeout.
**Fix:** Consider `req.setTimeout(ms, () => req.destroy())` scoped to routes that read a
body, if this tool is ever exposed beyond loopback.

### IN-02: Product ids are HTML-escaped but not URI-encoded when building `href`/`action` URLs

**File:** `app-partners-recomendados/src/review-server.js:314,391,411,415`
**Issue:** `href="/review/${escapeHtml(entry.productId)}"` and similar `action="..."`
attributes only apply `escapeHtml`, not `encodeURIComponent`, before interpolating the id
into a URL path. This is safe today because Nuvemshop product ids are numeric, but if a
non-numeric/reserved-character id ever reached this code path, the generated link would be
malformed rather than merely unsafe (HTML escaping alone doesn't protect URL semantics).
**Fix:** Use `encodeURIComponent(entry.productId)` (still followed by `escapeHtml` for the
attribute-value context) when building path segments.

---

_Reviewed: 2026-07-16T14:50:31Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
