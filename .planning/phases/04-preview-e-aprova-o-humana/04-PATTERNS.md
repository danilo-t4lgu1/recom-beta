# Phase 4: Preview e Aprovação Humana - Pattern Map

**Mapped:** 2026-07-15
**Files analyzed:** 11 (new)
**Analogs found:** 11 / 11

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|-----------------|----------------|
| `src/review/review-queue.js` | service (domain, pure) | transform | `src/recommendation/recommendation-engine.js` | role-match (pure domain module) |
| `src/review/review-queue.test.js` | test | transform | `src/db/catalog-store.test.js` (structure) + `recommendation-engine.test.js` (pure-fn assertions) | role-match |
| `src/review/diff.js` | service (domain, pure) | transform | `src/recommendation/recommendation-engine.js` | exact (reuses same module, same purity contract) |
| `src/review/diff.test.js` | test | transform | `src/recommendation/recommendation-engine.test.js` | role-match |
| `src/review/approval-gate.js` | service (domain, pure) | request-response (authorization check) | `src/api/recommendations.js` (thin domain fn) + custom Error class convention | partial (no existing gate; closest is domain fn w/ typed outcome) |
| `src/review/approval-gate.test.js` | test | request-response | `recommendation-engine.test.js` | role-match |
| `src/review/write-executor.js` | service (domain) | event-driven (stubbed side-effect) | `src/api/recommendations.js` | partial (only existing "action" module) |
| `src/review/write-executor.test.js` | test | event-driven | `recommendation-engine.test.js` | role-match |
| `src/db/catalog-store.js` (MODIFIED — add approval_queue functions) | model/data-access | CRUD | itself (existing file, extend in place) | exact |
| `src/db/schema.sql` (MODIFIED — add `approval_queue` table) | migration/config | CRUD | itself (existing file, extend in place) | exact |
| `src/review-server.js` | controller (HTTP server) | request-response | `src/server.js` | exact |
| `src/review-server.test.js` | test (integration) | request-response | none exists yet for `server.js`; pattern taken from RESEARCH.md `fetch()` example + `catalog-store.test.js` (temp-dir isolation idiom) | role-match |

## Pattern Assignments

### `src/review/review-queue.js` and `src/review/diff.js` (service, pure domain, transform)

**Analog:** `app-partners-recomendados/src/recommendation/recommendation-engine.js`

**Module-header comment convention** (lines 1-16, paraphrased pattern to copy):
```javascript
// <Domain purpose>, determinístico (<REQ-IDs>, <D-IDs>).
//
// Módulo de domínio puro, no formato de `stock-availability.js`: funções nomeadas,
// sem estado, sem I/O. Não importa nenhum outro módulo do projeto [ou: importa
// apenas recommendForProduct, nunca duplica sua lógica] ...
```
Every new pure module under `src/review/` must open with this kind of header: cites which REQ/D-decisions it satisfies, states purity contract (no I/O, named exports only), and explicitly states what it does NOT reimplement (per RESEARCH.md Don't-Hand-Roll table).

**Named export + JSDoc pattern** (lines 344-350, `recommendForProduct` signature style):
```javascript
export function recommendForProduct(
  productId,
  catalogProducts,
  { maxRecommendations = MAX_RECOMMENDATIONS } = {}
)
```
Apply the same style to `computeDiff(productId, catalogProducts, baseline)`, `recomputeAfterRemoval(productId, catalogProducts, removedIds)`, `hasChanged(beforeIds, afterIds)`, `buildReviewQueue(catalogProducts, baselines)` — named params object with defaults where optional, JSDoc `@param`/`@returns` above each export (see full JSDoc block above `getLatestSnapshotProducts` in catalog-store.js for the documentation density expected).

**Core pattern — recompute via filtered catalog, never duplicate engine logic** (RESEARCH.md Pattern 1, verified against real source):
```javascript
import { recommendForProduct } from '../recommendation/recommendation-engine.js';

export function recomputeAfterRemoval(productId, catalogProducts, removedIds) {
  const removed = new Set(removedIds.map(String));
  const filteredCatalog = catalogProducts.filter((p) => !removed.has(String(p.productId)));
  return recommendForProduct(productId, filteredCatalog);
}
```

**Set-based change comparison** (RESEARCH.md Pattern 2 — D-23, ignore ordering):
```javascript
export function hasChanged(beforeIds, afterIds) {
  const before = new Set(beforeIds.map(String));
  const after = new Set(afterIds.map(String));
  if (before.size !== after.size) return true;
  for (const id of before) {
    if (!after.has(id)) return true;
  }
  return false;
}
```

---

### `src/review/approval-gate.js` (service, pure, request-response/authorization)

**Analog:** No exact analog exists in the codebase (first authorization-gate module). Closest structural precedent is the typed-error + thin-return-value style already used implicitly by the domain layer. Follow RESEARCH.md Pattern 3 verbatim (already source-verified against project conventions):

```javascript
export class ApprovalRequiredError extends Error {
  constructor(productId) {
    super(`Produto ${productId} não tem aprovação registrada — escrita recusada.`);
    this.name = 'ApprovalRequiredError';
    this.productId = productId;
  }
}

export function assertApproved(productId, decision) {
  if (!decision || decision.status !== 'approved') {
    throw new ApprovalRequiredError(productId);
  }
  return decision.approvedRecommendationIds;
}
```
Key constraint: this function takes the DB read result as a parameter (`decision`) rather than opening its own connection — mirrors the project-wide rule that domain modules never do their own I/O (same separation `recommendation-engine.js` keeps from `catalog-store.js`).

---

### `src/review/write-executor.js` (service, event-driven/stubbed)

**Analog:** `app-partners-recomendados/src/api/recommendations.js` (closest existing "action" module wrapping an external side effect behind a narrow contract)

**Imports pattern** (recommendations.js lines 1-7):
```javascript
import { getMetafields, getProduct } from '../nuvemshop-client/client.js';
```
For write-executor.js: `import { assertApproved } from './approval-gate.js';`

**Core pattern — explicit dryRun param, never env-read inside the function** (RESEARCH.md Pattern 4):
```javascript
export function executeApprovedWrite({ productId, decision, dryRun }) {
  const approvedIds = assertApproved(productId, decision); // lança se não aprovado

  if (!dryRun) {
    // Fase 5 substitui esta linha por uma chamada real (ex: updateMetafield).
  }

  return { productId, approvedIds, dryRun, written: false, reason: 'stub — escrita real é Fase 5' };
}
```
Return-shape convention matches `getRecommendations`'s minimal, explicit object literal (recommendations.js lines 47-51) — no leaking of internal state, only fields the caller needs.

---

### `src/db/catalog-store.js` (MODIFIED — add approval_queue read/write functions)

**Analog:** itself — extend in place following existing conventions exactly.

**Prepared-statement + upsert pattern** (lines 75-81, `insertRecommendationBaseline`, closest precedent for upsert-by-composite-key which RESEARCH.md Open Question #2 recommends reusing):
```javascript
const insertRecommendationBaseline = db.prepare(
  `INSERT INTO recommendation_baseline (product_id, run_id, current_recommended_product_id, read_at)
   VALUES (@productId, @runId, @currentRecommendedProductId, @readAt)
   ON CONFLICT(product_id, run_id) DO UPDATE SET
     current_recommended_product_id=excluded.current_recommended_product_id,
     read_at=excluded.read_at`
);
```
Apply identical shape for `upsertApprovalDecision` against `approval_queue(product_id, run_id)`.

**Idempotent migration pattern** (lines 34-43 — Pitfall 2 precedent, MUST be replicated for the new `approval_queue` table on existing DBs):
```javascript
const catalogSnapshotColumns = db.prepare('PRAGMA table_info(catalog_snapshots)').all();
const hasGroupColumn = catalogSnapshotColumns.some((c) => c.name === 'product_group_canonical');
if (!hasGroupColumn) {
  db.exec('ALTER TABLE catalog_snapshots ADD COLUMN category_raw TEXT');
  db.exec('ALTER TABLE catalog_snapshots ADD COLUMN product_group_canonical TEXT');
}
```
Since `approval_queue` is a brand NEW table (not new columns on an existing table), the `CREATE TABLE IF NOT EXISTS` in `schema.sql` alone is sufficient — no PRAGMA-based column migration needed, unless a future phase adds columns to it.

**Read-function documentation density pattern** (lines 119-165, `getLatestSnapshotProducts` JSDoc) — new functions `getApprovalDecision`, `listApprovalQueueChanges` must carry equally detailed JSDoc: explain what "run" scoping means, what happens when no rows exist (return `null`/`[]`, never throw), and cross-reference the D-IDs that shaped the shape decision.

**Testing seam pattern** — `CATALOG_DB_DIR` env var override (lines 23-28) + `closeDbForTests()` (lines 287-298) must be reused unchanged; no new seam needed since it already isolates any table in the same DB file.

---

### `src/db/schema.sql` (MODIFIED — add `approval_queue` table)

**Analog:** itself — follow existing table conventions (lines 76-82, `recommendation_baseline`, closest shape: product_id + run_id keyed row).

```sql
CREATE TABLE IF NOT EXISTS approval_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id TEXT NOT NULL REFERENCES products(id),
  run_id INTEGER NOT NULL REFERENCES ingestion_runs(id),
  status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  approved_recommendation_ids TEXT,       -- JSON array de productId, NULL se rejected/pending
  decided_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_approval_queue_product ON approval_queue(product_id, run_id);
```
Comment-header convention: add a paragraph to the file's top-of-file comment block (lines 1-16 today) describing `approval_queue`'s purpose and D-25/APRV-03 traceability, matching how `recommendation_baseline`'s purpose is described in that same block (lines 11-12).

---

### `src/review-server.js` (controller, HTTP, request-response)

**Analog:** `app-partners-recomendados/src/server.js`

**Full structural pattern to copy** (server.js, lines 1-51 in full):
```javascript
import { createServer } from 'node:http';
import { getRecommendations } from './api/recommendations.js';

const PORT = process.env.PORT || 3000;

const RECOMMENDATIONS_PATH = /^\/recommendations\/([^/]+)\/?$/;

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const match = url.pathname.match(RECOMMENDATIONS_PATH);

  if (!match) {
    sendJson(res, 404, { error: 'Not found' });
    return;
  }

  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method Not Allowed' });
    return;
  }
  // ... handler logic, try/catch -> sendJson(res, 500, ...)
});

server.listen(PORT, () => { console.log(`... listening on port ${PORT}`); });

export default server;
```

**Deviations required for review-server.js (per CONTEXT.md/RESEARCH.md):**
1. Must export a `createServer()` **factory function** (not a server started as a side effect of import) so `review-server.test.js` can `listen(0, ...)` on an ephemeral port — see RESEARCH.md Code Examples "Teste de integração HTTP com fetch() nativo".
2. Must bind explicitly to `127.0.0.1` (Assumption A1) — `server.js` today binds to all interfaces implicitly via bare `PORT`; the new file should pass `'127.0.0.1'` as the second arg to `.listen()`.
3. Needs a `sendHtml` counterpart to `sendJson` (SSR pages) plus the `readJsonBody` POST-body-with-limit helper (RESEARCH.md Code Examples, `MAX_BODY_BYTES`).
4. Route matching must extend to 5 routes (`GET /review`, `GET /review/:productId`, `POST /review/:productId/approve`, `POST /review/:productId/reject`, `POST /review/:productId/write`) — same `RegExp` + `switch`/`if` chain style, just more branches.
5. Runs on its **own port**, separate process/module from `server.js` (Anti-Pattern explicitly called out in RESEARCH.md) — never import or merge into `server.js`.

**Error-handling pattern** (lines 38-43, try/catch → 500 JSON):
```javascript
try {
  const result = await getRecommendations(productId);
  sendJson(res, 200, result);
} catch (err) {
  sendJson(res, 500, { error: 'Internal error fetching recommendations' });
}
```
Apply identically for POST handlers, but the `/write` route's catch must special-case `ApprovalRequiredError` to return 409 (RESEARCH.md Open Question #1 recommendation), e.g.:
```javascript
try {
  const result = executeApprovedWrite({ productId, decision, dryRun });
  sendJson(res, 200, result);
} catch (err) {
  if (err instanceof ApprovalRequiredError) {
    sendJson(res, 409, { error: err.message });
    return;
  }
  sendJson(res, 500, { error: 'Internal error' });
}
```

---

### `src/review-server.test.js` (integration test)

**Analog:** RESEARCH.md's own verified Code Example (no existing HTTP integration test in repo yet, so this is the canonical shape) + `src/db/catalog-store.test.js` for the temp-DB isolation idiom.

```javascript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from './review-server.js';

let server;
let baseUrl;

beforeAll(async () => {
  server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://localhost:${server.address().port}`;
});

afterAll(() => server.close());

it('SC#3: recusa escrita sem aprovação prévia via chamada HTTP direta', async () => {
  const res = await fetch(`${baseUrl}/review/999999/write`, { method: 'POST' });
  expect(res.status).toBe(409);
});
```
Combine with `catalog-store.test.js`'s `CATALOG_DB_DIR` + `mkdtempSync`/`rmSync` + `closeDbForTests()` pattern (lines 1-40 of that file) to isolate SQLite state per test run, since `review-server.js` will transitively open `catalog-store.js`'s DB connection.

---

### `src/review/*.test.js` (unit tests for pure domain modules)

**Analog:** `app-partners-recomendados/src/recommendation/recommendation-engine.test.js` (pure-function assertion style: construct in-memory `catalogProducts` fixtures, call the exported function directly, assert on returned shape — no mocking, no DB).

## Shared Patterns

### SQLite wrapper discipline (applies to all DB-touching files)
**Source:** `app-partners-recomendados/src/db/catalog-store.js` (module header, lines 1-11)
**Apply to:** `catalog-store.js` additions, any new query in `review-server.js`'s handlers that reads approval state
```javascript
// Abre `data/catalog.db` ... exporta apenas funções nomeadas — NUNCA o objeto `db`/`Database` cru
// toda escrita usa exclusivamente `db.prepare(...).run(params)` com parâmetros nomeados —
// nunca concatenação de string SQL
```
Never import the raw `db`/`Database` object from `catalog-store.js` into `review/` or `review-server.js` — always add and export a new named function.

### Never trust client payload — recompute and validate server-side
**Source:** RESEARCH.md "Don't Hand-Roll" table + Pitfall 2 (backed by project-wide V5 discipline already seen in `catalog-store.js` parameterized-SQL convention)
**Apply to:** `POST /review/:productId/approve` handler in `review-server.js`
```javascript
// No handler: recalcular recommendForProduct (ou reusar computeDiff já feito na
// mesma request) e validar approvedIds ⊆ computedIds ANTES de chamar
// upsertApprovalDecision. Nunca persistir literalmente o array recebido no body.
```

### Approval gate called before any effect (APRV-03)
**Source:** RESEARCH.md Pattern 3 (`approval-gate.js`)
**Apply to:** `write-executor.js`, and directly by `review-server.js`'s `/write` route handler — `assertApproved` must be the FIRST statement in both, never gated only by UI/HTML rendering logic.

### Method-based access control (GET-only vs guarded mutation routes)
**Source:** `app-partners-recomendados/src/server.js` lines 31-34 (405 for non-GET on read routes)
**Apply to:** `review-server.js` — `GET /review` and `GET /review/:productId` reject non-GET with 405; `POST` routes reject non-POST with 405, mirroring the exact status-code convention already established.

### Body-size-limited JSON parsing
**Source:** RESEARCH.md Code Examples (verified pattern, not yet in codebase — first POST-body parser in the project)
**Apply to:** all three POST routes in `review-server.js`
```javascript
const MAX_BODY_BYTES = 10_000;
function readJsonBody(req) { /* accumulate with byte-limit guard, reject on overflow */ }
```

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/review/approval-gate.js` | service | request-response (authz) | No prior authorization-gate module exists in the codebase; built fresh per RESEARCH.md Pattern 3 (source-verified design, not copied from an existing file) |
| `src/review-server.js` (factory-function requirement, 127.0.0.1 binding) | controller | request-response | `server.js` starts itself as a side effect and binds to all interfaces; the new testability/security requirements (factory export, explicit loopback bind) have no existing precedent to copy — apply RESEARCH.md guidance directly |

## Metadata

**Analog search scope:** `app-partners-recomendados/src/` (db, recommendation, api, server.js), `app-partners-recomendados/src/db/catalog-store.test.js`, `app-partners-recomendados/src/recommendation/recommendation-engine.test.js`, `.planning/phases/04-preview-e-aprova-o-humana/04-RESEARCH.md` (verified code examples used where no in-repo analog exists yet)
**Files scanned:** 6 source files + 1 schema file + 1 test file read directly; RESEARCH.md's already-source-verified excerpts reused for net-new patterns (approval gate, dry-run executor, HTTP body parsing) rather than re-deriving from scratch
**Pattern extraction date:** 2026-07-15
