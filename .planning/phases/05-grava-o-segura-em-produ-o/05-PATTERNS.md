# Phase 5: Gravação Segura em Produção - Pattern Map

**Mapped:** 2026-07-16
**Files analyzed:** 10 (new/modified)
**Analogs found:** 10 / 10

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|-----------------|---------------|
| `src/nuvemshop-client/client.js` (+`findMetafield`, `updateMetafield`, `deleteMetafield`; extend `createMetafield` with `limiter`) | service | request-response (external API) | same file, `getMetafields`/`listProducts` (existing functions) | exact |
| `src/nuvemshop-client/client.test.js` (NEW) | test | request-response | `src/review/write-executor.test.js` (fetch-mock pattern, Test 10) | role-match |
| `src/review/write-executor.js` (modify stub) | service/controller-adjacent | request-response + CRUD | same file (existing stub) + `client.js` | exact |
| `src/review/write-executor.test.js` (extend) | test | request-response | same file (existing) | exact |
| `src/review/notify-failure.js` (NEW) | service | event-driven (webhook side-effect) | `nuvemshop-auth.js` (env-var read pattern) + `client.js` (fetch pattern) | role-match |
| `src/review/notify-failure.test.js` (NEW) | test | event-driven | `write-executor.test.js` | role-match |
| `src/db/schema.sql` (+`write_log` table) | model/migration | CRUD | same file, `approval_queue` table definition | exact |
| `src/db/catalog-store.js` (+`insertWriteLog`, `getLastSuccessfulWriteLog`, `listWriteLog`) | model | CRUD | same file, `upsertApprovalDecision`/`getApprovalDecision`/`listApprovalQueueChanges` | exact |
| `src/db/catalog-store.test.js` (extend) | test | CRUD | same file (existing) | exact |
| `src/review-server.js` (+`GET /audit` route) | controller | request-response (SSR HTML) | same file, `QUEUE_PATH`/`renderQueuePage` GET handler | exact |
| `src/review-server.test.js` (extend) | test | request-response | same file (existing, fetch() integration tests) | exact |
| `scripts/rollback.js` (NEW) | utility/CLI | CRUD + request-response (external API) | `src/review/approval-gate.js` (typed-error pattern) + `client.js` | role-match |
| `scripts/rollback.test.js` (NEW) | test | CRUD | `write-executor.test.js` | role-match |
| `.env.example` (NEW, if not present) | config | — | `nuvemshop-auth.js` (`getAccessToken` env var names) | role-match |

## Pattern Assignments

### `src/nuvemshop-client/client.js` (service, request-response)

**Analog:** same file — `getMetafields`, `listProducts` (lines 83-95, 137-156)

**Imports pattern** (lines 1-9):
```javascript
import { getAccessToken } from '../auth/nuvemshop-auth.js';
import { fetchWithRateLimit } from '../rate-limit/adaptive-limiter.js';

const API_BASE = 'https://api.tiendanube.com/v1';
const USER_AGENT = 'TalguiRecomendados (danilopradosilva20@gmail.com)';
```

**Shared helpers already defined in this file** (lines 11-26) — reuse, never duplicate:
```javascript
function buildHeaders(accessToken) { ... }
async function assertOk(response, context) { ... }
```

**Core pattern — rate-limited request with URL built from storeId** (lines 83-95, `getMetafields`):
```javascript
export async function getMetafields({ ownerId, limiter }) {
  const { accessToken, storeId } = getAccessToken();
  const url = `${API_BASE}/${storeId}/metafields/products?owner_id=${encodeURIComponent(ownerId)}&namespace=recomendados`;

  const response = await fetchWithRateLimit(
    url,
    { method: 'GET', headers: buildHeaders(accessToken) },
    limiter
  );

  await assertOk(response, `GET ${url}`);
  return response.json();
}
```

**New functions to add — follow this exact shape** (per RESEARCH.md Pattern 1 / Code Examples):
```javascript
export async function findMetafield({ ownerId, namespace = 'recomendados', key = 'produto_sugerido', limiter }) {
  const metafields = await getMetafields({ ownerId, limiter });
  return metafields.find((m) => m.namespace === namespace && m.key === key) || null;
}

export async function updateMetafield({ id, value, limiter }) {
  const { accessToken, storeId } = getAccessToken();
  const url = `${API_BASE}/${storeId}/metafields/${encodeURIComponent(id)}`;

  const response = await fetchWithRateLimit(
    url,
    { method: 'PUT', headers: buildHeaders(accessToken), body: JSON.stringify({ value }) },
    limiter
  );

  await assertOk(response, `PUT ${url}`);
  return response.json();
}

export async function deleteMetafield({ id, limiter }) {
  const { accessToken, storeId } = getAccessToken();
  const url = `${API_BASE}/${storeId}/metafields/${encodeURIComponent(id)}`;

  const response = await fetchWithRateLimit(
    url,
    { method: 'DELETE', headers: buildHeaders(accessToken) },
    limiter
  );

  await assertOk(response, `DELETE ${url}`);
  return response.json().catch(() => ({}));
}
```

**`createMetafield` extension (Pitfall 3)** — existing function at lines 52-71 uses raw `fetch`, not `fetchWithRateLimit`. Add an *optional* `limiter` param, retro-compatible (all existing callers pass no `limiter`, behavior unchanged):
```javascript
export async function createMetafield({ ownerId, value, limiter }) {
  const { accessToken, storeId } = getAccessToken();
  const url = `${API_BASE}/${storeId}/metafields`;

  const response = await fetchWithRateLimit(
    url,
    {
      method: 'POST',
      headers: buildHeaders(accessToken),
      body: JSON.stringify({
        namespace: 'recomendados',
        key: 'produto_sugerido',
        value,
        owner_resource: 'Product',
        owner_id: ownerId,
        description: 'ID do produto recomendado - spike de viabilidade Fase 1',
      }),
    },
    limiter
  );

  await assertOk(response, `POST ${url}`);
  return response.json();
}
```

**Error handling pattern:** all functions reuse `assertOk(response, context)` (lines 19-26) — never a duplicated `if (!response.ok) throw ...`.

---

### `src/nuvemshop-client/client.test.js` (test, NEW — Wave 0 gap)

**Analog:** `src/review/write-executor.test.js` (fetch-mock pattern used at Test 10 — read relevant section directly when implementing; not reproduced here to avoid duplicate context).

**Pattern to follow:** stub `globalThis.fetch` (or intercept `fetchWithRateLimit` dependency) per test, assert the exact URL/verb/headers/body sent. Mirror the module's own JSDoc examples for expected shapes (`findMetafield`/`updateMetafield`/`deleteMetafield`).

---

### `src/review/write-executor.js` (service, request-response + CRUD)

**Analog:** same file (existing stub, lines 1-38) + new `client.js` functions above.

**Current stub shape to preserve (D-25/gate-first discipline)**:
```javascript
import { assertApproved } from './approval-gate.js';

export function executeApprovedWrite({ productId, decision, dryRun }) {
  const approvedIds = assertApproved(productId, decision);

  if (!dryRun) {
    // Fase 5 substitui esta linha por uma chamada real (ex: updateMetafield).
  }

  return { productId, approvedIds, dryRun: !!dryRun, written: false, reason: 'stub — escrita real é Fase 5' };
}
```

**New real-write pattern (RESEARCH.md Pattern 1)** — note function becomes `async`, gains `runId` param (Pitfall 4), and the value written is `JSON.stringify(approvedIds)` (D-43):
```javascript
export async function executeApprovedWrite({ productId, decision, dryRun, runId }) {
  const approvedIds = assertApproved(productId, decision);

  if (dryRun) {
    return { productId, approvedIds, dryRun: true, written: false, reason: 'dry run' };
  }

  const newValue = JSON.stringify(approvedIds);

  try {
    const existing = await findMetafield({ ownerId: productId });
    const previousValue = existing ? existing.value : null;

    const result = existing
      ? await updateMetafield({ id: existing.id, value: newValue })
      : await createMetafield({ ownerId: productId, value: newValue });

    insertWriteLog({
      productId, runId, metafieldId: result.id,
      previousValue, writtenValue: newValue,
      triggeredBy: 'manual', status: 'success', errorMessage: null,
      writtenAt: new Date().toISOString(),
    });

    return { productId, approvedIds, dryRun: false, written: true };
  } catch (err) {
    insertWriteLog({
      productId, runId, metafieldId: null,
      previousValue: null, writtenValue: newValue,
      triggeredBy: 'manual', status: 'failed', errorMessage: err.message,
      writtenAt: new Date().toISOString(),
    });
    await notifyWriteFailure({ productId, error: err, triggeredBy: 'manual' }).catch(() => {});
    throw err;
  }
}
```

**Gate discipline (must not change):** `assertApproved(productId, decision)` remains the FIRST operation — see `src/review/approval-gate.js` lines 33-38 (`assertApproved`/`ApprovalRequiredError`). Never call `findMetafield`/`updateMetafield` before the gate.

**Error handling pattern:** typed error class already established in `approval-gate.js`:
```javascript
export class ApprovalRequiredError extends Error {
  constructor(productId) {
    super(`Produto ${productId} não tem aprovação registrada — escrita recusada.`);
    this.name = 'ApprovalRequiredError';
    this.productId = productId;
  }
}
```
Use this exact same shape for `RollbackConflictError` in `scripts/rollback.js` (see below).

---

### `src/review/notify-failure.js` (service, event-driven webhook — NEW)

**Analog:** `src/auth/nuvemshop-auth.js` (env-var read + validation, lines 19-35) for the "read from `process.env`" convention; `client.js` for the fetch discipline.

**Env-var read pattern** (mirrors `getAccessToken`, lines 19-35):
```javascript
export function getAccessToken() {
  const accessToken = process.env.NUVEMSHOP_ACCESS_TOKEN;
  ...
  if (!accessToken) {
    throw new Error('NUVEMSHOP_ACCESS_TOKEN ausente ou vazio em .env — ...');
  }
  ...
}
```
`notifyWriteFailure` follows the same "read env once, explicit guard" style, but degrades gracefully (`console.warn` + return, never throw) instead of throwing — per D-40/Pitfall 5:
```javascript
export async function notifyWriteFailure({ productId, error, triggeredBy }) {
  const webhookUrl = process.env.WRITE_FAILURE_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn(`WRITE_FAILURE_WEBHOOK_URL ausente — falha em ${productId} não notificada via webhook.`);
    return { notified: false, reason: 'webhook not configured' };
  }

  try {
    const message = `Falha ao gravar recomendação (produto ${productId}, gatilho ${triggeredBy}): ${error.message}`;
    const payload = {
      text: message,
      content: message,
      productId, triggeredBy,
      error: error.message,
      timestamp: new Date().toISOString(),
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error(`notifyWriteFailure: webhook respondeu status ${response.status} — falha não foi comunicada.`);
      return { notified: false, reason: `webhook status ${response.status}` };
    }
    return { notified: true };
  } catch (err) {
    console.error(`notifyWriteFailure: erro ao chamar o webhook — ${err.message}`);
    return { notified: false, reason: err.message };
  }
}
```

**Critical constraint (Pitfall 5):** this module must NEVER throw — the caller (`write-executor.js`) already wraps the call in `.catch(() => {})` as a second line of defense, but the module itself must be self-contained per this pattern.

---

### `src/db/schema.sql` (model, CRUD — append `write_log` table)

**Analog:** same file, `approval_queue` table (lines 87-96) — explicit column names, `INTEGER` 0/1 comment convention, `TEXT` for JSON-serialized fields, header comment block explaining the table's role.

```sql
-- write_log: uma linha por tentativa de escrita real (sucesso, falha, ou
-- rollback), nunca sobrescrita (append-only, WRTE-02/WRTE-04). Serve
-- simultaneamente de snapshot (previous_value/written_value) e de log de
-- auditoria (D-41/D-42) — GET /audit lê esta tabela ordenada por written_at DESC.
CREATE TABLE IF NOT EXISTS write_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id TEXT NOT NULL REFERENCES products(id),
  run_id INTEGER REFERENCES ingestion_runs(id),
  metafield_id TEXT,
  previous_value TEXT,
  written_value TEXT,
  triggered_by TEXT NOT NULL,  -- 'manual' | 'scheduled' | 'rollback'
  status TEXT NOT NULL,        -- 'success' | 'failed'
  error_message TEXT,
  written_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_write_log_product ON write_log(product_id, written_at);
```

---

### `src/db/catalog-store.js` (model, CRUD)

**Analog:** same file — `upsertApprovalDecision`/`getApprovalDecision`/`listApprovalQueueChanges` (lines 130-151, 279-327 area).

**Prepared-statement declaration pattern** (module-level, top of file, mirrors lines 130-151):
```javascript
const insertWriteLogStmt = db.prepare(
  `INSERT INTO write_log
     (product_id, run_id, metafield_id, previous_value, written_value, triggered_by, status, error_message, written_at)
   VALUES (@productId, @runId, @metafieldId, @previousValue, @writtenValue, @triggeredBy, @status, @errorMessage, @writtenAt)`
);

const selectLastSuccessfulWriteLogStmt = db.prepare(
  `SELECT * FROM write_log
   WHERE product_id = @productId AND status = 'success'
   ORDER BY written_at DESC LIMIT 1`
);

const selectAllWriteLogStmt = db.prepare(
  `SELECT * FROM write_log ORDER BY written_at DESC`
);
```

**Exported function pattern** (mirrors `upsertApprovalDecision`, existing code around line 279):
```javascript
export function upsertApprovalDecision({ productId, runId, status, approvedRecommendationIds, decidedAt }) {
  upsertApprovalDecisionStmt.run({
    productId, runId, status,
    approvedRecommendationIds: approvedRecommendationIds ? JSON.stringify(approvedRecommendationIds) : null,
    decidedAt,
    createdAt: new Date().toISOString(),
  });
}
```
New functions `insertWriteLog`, `getLastSuccessfulWriteLog`, `listWriteLog` follow this exact shape: named export, object-destructured params, `.run(params)`/`.get(params)`/`.all()` on the prepared statement — never string concatenation, never the raw `db` object exposed to callers (module convention, see file header comment lines 1-9).

**Never expose `db` directly** — same discipline as `getLatestSnapshotProducts`/`getBaselineForRun` (lines 200-274): only named functions are exported.

---

### `src/review-server.js` (controller, request-response SSR)

**Analog:** same file — `QUEUE_PATH` GET handler (lines 555-567) for a read-only listing page; `renderQueuePage`/`renderPage` (lines 272-327) for HTML structure.

**Route regex pattern** (add alongside existing regexes, lines 38-42):
```javascript
const AUDIT_PATH = /^\/audit\/?$/;
```

**GET handler pattern** (mirrors lines 555-567 — `QUEUE_PATH` handling inside `createServer`):
```javascript
if (AUDIT_PATH.test(url.pathname)) {
  if (req.method !== 'GET') {
    sendHtml(res, 405, renderPage('Método não permitido', '<div>Método não permitido.</div>'));
    return;
  }

  const entries = listWriteLog();
  sendHtml(res, 200, renderAuditPage(entries));
  return;
}
```

**Rendering pattern (chronological read-only list, D-42 no filter)** — mirrors `renderQueuePage`'s empty-state + table structure (lines 299-327), reusing `escapeHtml` (lines 71-74) for every dynamic value:
```javascript
function renderAuditPage(entries) {
  if (!entries || entries.length === 0) {
    return renderPage('Auditoria de Escritas', `<div class="empty-state">
      <div class="display">Nenhuma escrita real registrada ainda</div>
    </div>`);
  }

  const rows = entries.map((e) => `<tr>
    <td>${escapeHtml(e.product_id)}</td>
    <td>${escapeHtml(e.written_at)}</td>
    <td>${escapeHtml(e.previous_value)}</td>
    <td>${escapeHtml(e.written_value)}</td>
    <td>${escapeHtml(e.triggered_by)}</td>
    <td>${escapeHtml(e.status)}</td>
  </tr>`).join('');

  return renderPage('Auditoria de Escritas', `<div class="display">Auditoria de Escritas</div>
    <table class="queue-table">
      <thead><tr><th>Produto</th><th>Quando</th><th>Antes</th><th>Depois</th><th>Gatilho</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`);
}
```

**WRITE_PATH handler modification (Pitfall 4 — pass `runId`)** — existing code at lines 523-553 calls `executeApprovedWrite({ productId, decision, dryRun })` synchronously; must become `await` and pass `runId` (already computed at line 539):
```javascript
const runId = getLatestSuccessfulRunId();
const decision = runId != null ? getApprovalDecision({ productId, runId }) : null;

try {
  const result = await executeApprovedWrite({ productId, decision, dryRun, runId });
  sendJson(res, 200, result);
} catch (err) {
  if (err instanceof ApprovalRequiredError) {
    sendJson(res, 409, { error: err.message });
    return;
  }
  sendJson(res, 500, { error: 'Internal error' });
}
```

**Import addition** (mirrors lines 17-27):
```javascript
import { listWriteLog } from './db/catalog-store.js';
```

---

### `scripts/rollback.js` (utility/CLI, CRUD + request-response — NEW)

**Analog:** `src/review/approval-gate.js` for the typed-error pattern (lines 15-21); `client.js` for `findMetafield`/`updateMetafield`/`deleteMetafield` reuse.

**Typed error pattern** (mirrors `ApprovalRequiredError`, lines 15-21 of `approval-gate.js`):
```javascript
export class RollbackConflictError extends Error {
  constructor(productId, expected, actual) {
    super(`Produto ${productId}: valor atual ("${actual}") diverge do esperado ("${expected}") — rollback abortado.`);
    this.name = 'RollbackConflictError';
    this.productId = productId;
  }
}
```

**Core rollback function (D-38 divergence check, RESEARCH.md Pattern 2)** — extracted as a testable function, never embedded only in the CLI entrypoint:
```javascript
export async function performRollback({ productId }) {
  const lastWrite = getLastSuccessfulWriteLog({ productId });
  if (!lastWrite) throw new Error(`Nenhuma escrita real registrada para o produto ${productId}.`);

  const existing = await findMetafield({ ownerId: productId });
  const currentValue = existing ? existing.value : null;

  if (currentValue !== lastWrite.writtenValue) {
    throw new RollbackConflictError(productId, lastWrite.writtenValue, currentValue);
  }

  const restoredValue = lastWrite.previousValue;
  const result = restoredValue == null
    ? await deleteMetafield({ id: existing.id })
    : await updateMetafield({ id: existing.id, value: restoredValue });

  insertWriteLog({
    productId, runId: lastWrite.runId, metafieldId: existing.id,
    previousValue: currentValue, writtenValue: restoredValue,
    triggeredBy: 'rollback', status: 'success', errorMessage: null,
    writtenAt: new Date().toISOString(),
  });

  return result;
}
```

**CLI entrypoint pattern** — mirror `review-server.js`'s `if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)` guard (lines 617-622) so importing the module in tests never executes the CLI body:
```javascript
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const productId = process.argv[2];
  if (!productId) {
    console.error('Uso: node scripts/rollback.js <productId>');
    process.exit(1);
  }
  performRollback({ productId })
    .then(() => console.log(`Rollback concluído para o produto ${productId}.`))
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
```

---

### `.env.example` (config — NEW, if not present)

**Analog:** `nuvemshop-auth.js`'s env var naming convention (`NUVEMSHOP_ACCESS_TOKEN`, `NUVEMSHOP_STORE_ID`, lines 20-21).

```
NUVEMSHOP_ACCESS_TOKEN=
NUVEMSHOP_STORE_ID=
WRITE_FAILURE_WEBHOOK_URL=
```

---

## Shared Patterns

### Authentication / API base
**Source:** `src/auth/nuvemshop-auth.js` `getAccessToken()` (lines 19-35)
**Apply to:** all new `client.js` functions (`findMetafield`, `updateMetafield`, `deleteMetafield`), `scripts/rollback.js`.

### Rate limiting
**Source:** `src/rate-limit/adaptive-limiter.js` `fetchWithRateLimit` — already used by `getMetafields`/`listCategories`/`listProducts` in `client.js` (lines 83-156).
**Apply to:** ALL new network calls in this phase (`updateMetafield`, `deleteMetafield`, `createMetafield` extension). Anti-pattern per RESEARCH.md: never use raw `fetch` for these — only the webhook call in `notify-failure.js` is exempt (external, not rate-limited by Nuvemshop).

### Error handling (HTTP assertion)
**Source:** `src/nuvemshop-client/client.js` `assertOk(response, context)` (lines 19-26)
**Apply to:** all new client.js functions.

### Typed error classes
**Source:** `src/review/approval-gate.js` `ApprovalRequiredError` (lines 15-21)
**Apply to:** `scripts/rollback.js` (`RollbackConflictError`) — always `class X extends Error` with a `name` and identifying property (`productId`), never a generic `throw new Error(...)`.

### SQL parameterization
**Source:** `src/db/catalog-store.js` header comment (lines 1-9) + `upsertApprovalDecisionStmt` (lines 130-138)
**Apply to:** `insertWriteLog`/`getLastSuccessfulWriteLog`/`listWriteLog` — always `db.prepare(...).run(namedParams)`, never string concatenation.

### HTML escaping
**Source:** `src/review-server.js` `escapeHtml` (lines 71-74)
**Apply to:** `renderAuditPage` — every interpolated dynamic value (product_id, previous_value, written_value, error_message potentially containing arbitrary API error text).

### Module-level guard for CLI/server entrypoints
**Source:** `src/review-server.js` bottom guard (lines 617-622): `if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)`
**Apply to:** `scripts/rollback.js` — ensures importing the module in tests never triggers the CLI side effect.

## No Analog Found

None — every new file in this phase has a direct or role-match analog already in the codebase (per RESEARCH.md's own conclusion: "a implementação real desta fase é 100% composição de padrões já provados").

## Metadata

**Analog search scope:** `app-partners-recomendados/src/` (nuvemshop-client, review, db, auth, rate-limit), `app-partners-recomendados/scripts/` (does not yet exist), root `.env`/`.env.example`.
**Files scanned:** `client.js`, `write-executor.js`, `approval-gate.js`, `review-server.js`, `schema.sql`, `catalog-store.js`, `nuvemshop-auth.js` (7 read directly; RESEARCH.md already read `adaptive-limiter.js`, `diff.js`, `review-queue.js`, `api/recommendations.js` and is cited above).
**Pattern extraction date:** 2026-07-16
