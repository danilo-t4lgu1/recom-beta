---
phase: 05-grava-o-segura-em-produ-o
reviewed: 2026-07-16T00:00:00Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - app-partners-recomendados/scripts/rollback.js
  - app-partners-recomendados/scripts/rollback.test.js
  - app-partners-recomendados/src/db/catalog-store.js
  - app-partners-recomendados/src/db/catalog-store.test.js
  - app-partners-recomendados/src/db/schema.sql
  - app-partners-recomendados/src/nuvemshop-client/client.js
  - app-partners-recomendados/src/nuvemshop-client/client.test.js
  - app-partners-recomendados/src/review-server.js
  - app-partners-recomendados/src/review-server.test.js
  - app-partners-recomendados/src/review/notify-failure.js
  - app-partners-recomendados/src/review/notify-failure.test.js
  - app-partners-recomendados/src/review/write-executor.js
  - app-partners-recomendados/src/review/write-executor.test.js
findings:
  critical: 1
  warning: 4
  info: 2
  total: 7
status: issues_found
---

# Phase 05: Code Review Report

**Reviewed:** 2026-07-16T00:00:00Z
**Depth:** standard
**Files Reviewed:** 12 (`.env.example` could not be accessed — the review environment's permission settings deny reads under this path; not evaluated)
**Status:** issues_found

## Summary

Reviewed the "gravação segura em produção" phase: real Metafield writes (`write-executor.js`), rollback CLI (`scripts/rollback.js`), failure notification (`notify-failure.js`), the `write_log` table/queries in `catalog-store.js`, and the new `GET /audit` route plus the approve/reject/write mutation routes in `review-server.js`.

Overall the security posture is solid: all SQL goes through parameterized `better-sqlite3` prepared statements, all dynamic values rendered into HTML pass through `escapeHtml` (verified by XSS regression tests), the request body has an explicit size cap, and `notifyWriteFailure` is genuinely non-throwing. However, `scripts/rollback.js` has a reachable crash/incorrect-behavior path when a rollback is itself rolled back (double-rollback) after the metafield was deleted, which undermines the file's own stated safety guarantee ("nunca sobrescreve... aborta com RollbackConflictError"). `write-executor.js` also silently drops the real `previousValue` from the audit log on a failed write when a metafield already existed, weakening the `write_log` audit trail the phase is explicitly designed to produce (D-41/D-42). See details below.

## Critical Issues

### CR-01: Rollback-of-a-rollback crashes (or performs the wrong operation) when the metafield was previously deleted

**File:** `app-partners-recomendados/scripts/rollback.js:57-83`

**Issue:** `performRollback` decides between `deleteMetafield`/`updateMetafield` using only `restoredValue == null`, and always passes `existing.id` to whichever call it makes:

```js
const existing = await findMetafield({ ownerId: productId });
const currentValue = existing ? existing.value : null;

if (currentValue !== lastWrite.writtenValue) {
  throw new RollbackConflictError(productId, lastWrite.writtenValue, currentValue);
}

const restoredValue = lastWrite.previousValue;
const result =
  restoredValue == null
    ? await deleteMetafield({ id: existing.id })
    : await updateMetafield({ id: existing.id, value: restoredValue });
```

`currentValue` is forced to `null` whenever `existing` is `null` (metafield genuinely absent from the store). The conflict check therefore only passes with `existing === null` when `lastWrite.writtenValue` is also `null`. That is exactly the shape of a write-log row created by a *previous* delete-type rollback (see the `insertWriteLog` call a few lines below: `writtenValue: restoredValue` is `null` whenever the rollback deleted the metafield).

Concrete repro:
1. Write A creates a metafield: `previousValue: null, writtenValue: 'X'` (status success).
2. Operator rolls it back: metafield genuinely doesn't exist yet at this earlier point is not required — assume instead write B *updates* it later: `previousValue: 'X', writtenValue: 'Y'`.
3. Operator rolls back B: current value is `'Y'` (matches), `restoredValue = 'X'` (write A's `previousValue`)... this itself is fine. But now consider rolling back a delete-type write: after any rollback whose `restoredValue` is `null` (i.e., the original write created the metafield from nothing, e.g. Test 3 in `rollback.test.js`), the CLI appends a new `write_log` row: `{ previousValue: currentValue, writtenValue: null, status: 'success', triggeredBy: 'rollback' }`. This new row is now `getLastSuccessfulWriteLog`'s answer for the product.
4. If the operator runs the rollback CLI **again** for the same product, `lastWrite.writtenValue` is `null`, the live metafield really was just deleted by step 3 (so `existing` is `null`, `currentValue` is `null`) — the conflict check passes (`null === null`). `restoredValue = lastWrite.previousValue`, which is **not** null (it's the value that existed before the delete-rollback). The code then calls `updateMetafield({ id: existing.id, value: restoredValue })` with `existing === null`, throwing `TypeError: Cannot read properties of null (reading 'id')` instead of restoring the value — and if `restoredValue` had instead been `null` too, it would call `deleteMetafield({ id: existing.id })` with the same crash.

This is a legitimate, reachable operational path (undoing a rollback, or simply running the rollback command twice by mistake) that the CLI does not guard against. The correct behavior when `existing` is `null` and a non-null value needs to be restored is to call `createMetafield`, not `updateMetafield`; when `existing` is `null` and nothing needs restoring, the delete should be a no-op, not a crash. None of the 6 tests in `rollback.test.js` exercise this path (all seed exactly one prior successful write, never a chain of two).

**Fix:**
```js
const restoredValue = lastWrite.previousValue;
let result;
if (restoredValue == null) {
  result = existing ? await deleteMetafield({ id: existing.id }) : { deleted: false, reason: 'already absent' };
} else if (existing) {
  result = await updateMetafield({ id: existing.id, value: restoredValue });
} else {
  result = await createMetafield({ ownerId: productId, value: restoredValue });
}

insertWriteLog({
  productId,
  runId: lastWrite.runId,
  metafieldId: existing ? existing.id : (result && result.id) || null,
  previousValue: currentValue,
  writtenValue: restoredValue,
  triggeredBy: 'rollback',
  status: 'success',
  errorMessage: null,
  writtenAt: new Date().toISOString(),
});
```
Add a test seeding two chained successful writes (a delete-type rollback followed by a second rollback attempt) to cover this branch.

## Warnings

### WR-01: Failed real write loses the actual `previousValue` in the audit log

**File:** `app-partners-recomendados/src/review/write-executor.js:45-77`

**Issue:** In the success path, `previousValue` is read from the live `findMetafield` call and correctly logged. In the `catch` block, `previousValue` is hardcoded to `null` regardless of whether a metafield actually existed before the failed write attempt:

```js
try {
  const existing = await findMetafield({ ownerId: productId });
  const previousValue = existing ? existing.value : null;   // scoped to try{}
  ...
} catch (err) {
  insertWriteLog({
    productId,
    runId,
    metafieldId: null,
    previousValue: null,        // always null, even if `existing` above was truthy
    writtenValue: newValue,
    triggeredBy: 'manual',
    status: 'failed',
    errorMessage: err.message,
    writtenAt: new Date().toISOString(),
  });
  await notifyWriteFailure({ productId, error: err, triggeredBy: 'manual' }).catch(() => {});
  throw err;
}
```
If `findMetafield` succeeds (metafield exists, e.g. `value: 'X'`) but the subsequent `updateMetafield` call fails (network error, 5xx, etc.), the failed `write_log` row records `previous_value: null` even though the real previous value (`'X'`) was already known. This contradicts the module's own stated invariant that `write_log` is "simultaneamente snapshot (previous_value/written_value)" (WRTE-02) — a human reviewing `GET /audit` after a failed write sees "Antes: (vazio)" when a value actually existed. It does not affect `rollback.js` (which only reads `status='success'` rows), but it does degrade the audit trail's accuracy, which is this phase's stated purpose. The existing test suite (`write-executor.test.js` Test 12) only covers the case where `findMetafield` resolves `null`, so it doesn't catch this.

**Fix:** Hoist the variable out of the `try` block so the catch handler can use whatever was actually observed:
```js
let previousValue = null;
try {
  const existing = await findMetafield({ ownerId: productId });
  previousValue = existing ? existing.value : null;
  const result = existing
    ? await updateMetafield({ id: existing.id, value: newValue })
    : await createMetafield({ ownerId: productId, value: newValue });
  insertWriteLog({ ..., previousValue, ... });
  return { productId, approvedIds, dryRun: false, written: true };
} catch (err) {
  insertWriteLog({ ..., previousValue, ... });
  ...
}
```

### WR-02: Top-level and route-level catch blocks in `review-server.js` swallow errors with no server-side logging

**File:** `app-partners-recomendados/src/review-server.js:591-596, 665-667`

**Issue:** Both the `/write` route's catch and the request handler's outer catch-all discard the caught error entirely:
```js
} catch (err) {
  if (err instanceof ApprovalRequiredError) { ... }
  sendJson(res, 500, { error: 'Internal error' });   // err never logged
}
...
} catch (err) {
  sendHtml(res, 500, renderPage('Erro interno', '<div>Erro interno ao processar a requisição.</div>'));  // err never logged
}
```
Any unexpected exception (programming error, a bug in `computeDiff`/`buildReviewQueue`, a database error not covered by more specific handling, etc.) results in a 500 with zero trace of what happened on the server side (no `console.error`), making production incidents very hard to diagnose. `notify-failure.js`/`write-executor.js` do log to `console.error`, but this HTTP layer does not.

**Fix:**
```js
} catch (err) {
  console.error('review-server: unhandled error', err);
  sendHtml(res, 500, renderPage('Erro interno', '<div>Erro interno ao processar a requisição.</div>'));
}
```
(same for the `/write` route's generic catch).

### WR-03: `readRawBody` has no timeout — a slow/incomplete client body can hang the request indefinitely

**File:** `app-partners-recomendados/src/review-server.js:118-154`

**Issue:** The promise returned by `readRawBody` only resolves/rejects on `req.on('end')` or `req.on('error')`. There is no timer to bound how long the server waits for the body to finish streaming. A client that opens a POST to `/review/:productId/approve` and never sends the terminating data (or trickles bytes slowly) keeps the request — and the connection — open forever, with no defensive timeout at this layer. This is an availability/robustness gap on a route that is otherwise carefully hardened against large bodies (`MAX_BODY_BYTES`).

**Fix:** Add a `setTimeout`/`req.setTimeout(...)` that rejects (and destroys the request) if the body doesn't complete within a bounded window, e.g.:
```js
function readRawBody(req, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      req.destroy();
      reject(new Error('Corpo da requisição excedeu o tempo limite'));
    }, timeoutMs);
    ...
    req.on('end', () => { clearTimeout(timer); ... });
    req.on('error', (err) => { clearTimeout(timer); reject(err); });
  });
}
```

### WR-04: Idempotent schema migration in `catalog-store.js` is not itself atomic/idempotent if interrupted between the two `ALTER TABLE` statements

**File:** `app-partners-recomendados/src/db/catalog-store.js:38-43`

**Issue:** (Pre-existing code from phase 03.1, included here because the file is in this phase's review scope and `write_log`'s new statements sit directly below it.)
```js
const hasGroupColumn = catalogSnapshotColumns.some((c) => c.name === 'product_group_canonical');
if (!hasGroupColumn) {
  db.exec('ALTER TABLE catalog_snapshots ADD COLUMN category_raw TEXT');
  db.exec('ALTER TABLE catalog_snapshots ADD COLUMN product_group_canonical TEXT');
}
```
The presence check only looks at `product_group_canonical`. If the process crashes/is killed after the first `ALTER TABLE` succeeds but before the second one runs (e.g. `category_raw` added, `product_group_canonical` not yet), every subsequent startup will still see `hasGroupColumn === false` and re-attempt `ALTER TABLE catalog_snapshots ADD COLUMN category_raw TEXT`, which throws `SQLiteError: duplicate column name: category_raw` — the module fails to load at all on next start, rather than completing the migration. Not directly introduced by this phase, but it sits in a file this phase modified and is worth fixing while touching the file.

**Fix:** Check each column independently and run each `ALTER TABLE` conditionally, or wrap both in a single `db.transaction()`.

## Info

### IN-01: `GET /review/:productId?removedIds=` does not trim whitespace around ids, unlike the POST body parser

**File:** `app-partners-recomendados/src/review-server.js:642-644`

**Issue:** `parseRemovedIds` (used by POST approve) trims each id: `raw.split(',').map((s) => s.trim())`. The GET handler for the diff page does not:
```js
const removedIds = (url.searchParams.get('removedIds') || '')
  .split(',')
  .filter(Boolean);
```
If a client (or the "Remover" form, which builds this query string itself so it's not user-facing today) ever produces `removedIds=a, b`, the GET path would treat `' b'` as a distinct id from `'b'`, while the POST path would not. Low impact today since the query string is always generated server-side, but worth aligning for consistency if the URL is ever bookmarked/shared/hand-edited.

**Fix:** `.split(',').map((s) => s.trim()).filter(Boolean)`.

### IN-02: `rollback.js`'s new `write_log` row on rollback reuses `lastWrite.runId` rather than the current successful run

**File:** `app-partners-recomendados/scripts/rollback.js:70-72`

**Issue:** `insertWriteLog({ productId, runId: lastWrite.runId, ... })` tags the rollback's audit row with the `run_id` of the original write being undone, not the ingestion run current at the time the rollback happened. This is a defensible design choice (ties the rollback to the write it undoes) but is undocumented — worth a one-line comment explaining the choice so a future reader doesn't "fix" it into a bug by swapping in `getLatestSuccessfulRunId()`.

**Fix:** Add a short comment next to the `insertWriteLog` call clarifying that `runId` intentionally mirrors the original write's run, not the current run.

---

_Reviewed: 2026-07-16T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
