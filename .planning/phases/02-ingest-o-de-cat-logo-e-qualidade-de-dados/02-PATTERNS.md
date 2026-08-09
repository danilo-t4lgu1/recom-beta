# Phase 2: Ingestão de Catálogo e Qualidade de Dados - Pattern Map

**Mapped:** 2026-07-10
**Files analyzed:** 8
**Analogs found:** 8 / 8 (all role-match or exact via extension of existing Phase 1 code)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `app-partners-recomendados/src/nuvemshop-client/client.js` (EXTEND: `listCategories()`, `listProducts()`) | service (API client) | request-response, batch/paginated | `app-partners-recomendados/src/nuvemshop-client/client.js` (existing `getProduct`/`getMetafields`) | exact (same file, extend in place) |
| `app-partners-recomendados/src/rate-limit/adaptive-limiter.js` | utility (HTTP middleware-like wrapper) | request-response, stateful throttling | `app-partners-recomendados/src/nuvemshop-client/client.js` (`assertOk`, header handling, `fetch` wrapper conventions) | role-match |
| `app-partners-recomendados/src/ingestion/ingest-catalog.js` | service (orchestrator/job) | batch, event-driven (single-run job) | `app-partners-recomendados/src/api/recommendations.js` (orchestrates client calls + shapes output) | role-match |
| `app-partners-recomendados/src/ingestion/fabric-taxonomy.js` | utility (pure transform/validation) | transform | none in repo — pure function, no analog needed; follow research Pattern 3 | no analog (pure new logic) |
| `app-partners-recomendados/src/ingestion/stock-availability.js` | utility (pure transform/validation) | transform | none in repo — pure function, no analog needed; follow research Pattern 1 | no analog (pure new logic) |
| `app-partners-recomendados/src/db/schema.sql` | migration/config (DDL) | batch (schema definition) | none in repo — first SQLite artifact in project | no analog |
| `app-partners-recomendados/src/db/catalog-store.js` | model/service (DB wrapper) | CRUD, batch (transactional writes) | `app-partners-recomendados/src/nuvemshop-client/client.js` (single-responsibility wrapper module pattern: exported functions, JSDoc, no framework) | role-match (structural convention only, not data-layer) |
| `app-partners-recomendados/src/auth/nuvemshop-auth.js` (REUSE, no changes) | service (credential provider) | request-response | itself | exact (reused unmodified) |

## Pattern Assignments

### `app-partners-recomendados/src/nuvemshop-client/client.js` (EXTEND)

**Analog:** itself, existing functions in the same file (lines 1-90)

**Imports pattern** (lines 1-8):
```javascript
// Wrapper mínimo da API pública da Nuvemshop (Tiendanube) para a loja Talgui.
// Usa o access_token do App Partners privado (via getAccessToken()) em toda chamada.
// Sem dependências externas — usa fetch global do Node.

import { getAccessToken } from '../auth/nuvemshop-auth.js';

const API_BASE = 'https://api.tiendanube.com/v1';
const USER_AGENT = 'TalguiRecomendados (danilopradosilva20@gmail.com)';
```
New functions (`listCategories`, `listProducts`) must import from the same `../auth/nuvemshop-auth.js` and reuse `API_BASE`/`USER_AGENT`/`buildHeaders` already defined at module scope — do not redefine them.

**Header + auth pattern** (lines 10-16):
```javascript
function buildHeaders(accessToken) {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'User-Agent': USER_AGENT,
  };
}
```
Reuse as-is for new paginated calls.

**Error handling pattern** (lines 18-25):
```javascript
async function assertOk(response, context) {
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `${context} falhou (status ${response.status}): ${body || '(corpo vazio)'}`
    );
  }
}
```
Reuse `assertOk` for every new request (including paginated `listProducts`/`listCategories`) — do not write a second error-check function.

**Core request pattern** (lines 32-43, `getProduct` as template for new functions):
```javascript
export async function getProduct(productId) {
  const { accessToken, storeId } = getAccessToken();
  const url = `${API_BASE}/${storeId}/products/${encodeURIComponent(productId)}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: buildHeaders(accessToken),
  });

  await assertOk(response, `GET ${url}`);
  return response.json();
}
```
`listCategories()` and `listProducts({ categoryId, page, perPage })` should follow this exact shape: destructure `{ accessToken, storeId }` from `getAccessToken()`, build URL with `encodeURIComponent` on any interpolated ID, call `assertOk`, return parsed JSON. For pagination, wrap the per-page fetch in a loop as shown in RESEARCH.md `## Code Examples > Paginação de categoria/produtos`, reading `response.headers.get('link')` for `rel="next"` — do not introduce a new HTTP client.

**JSDoc convention** (lines 27-31, 45-50, 72-77): every exported function has a `/** ... @param ... @returns ... */` block above it, including which requirement/decision motivated it. New functions should cite `PLAT-02`/`DATA-01`/`D-04` etc. the same way `createMetafield` cites `WRTE-01`.

---

### `app-partners-recomendados/src/rate-limit/adaptive-limiter.js` (NEW)

**Analog:** structural conventions from `client.js` (`assertOk`, header reads) — no existing rate-limit code in repo, so implementation content should follow RESEARCH.md Pattern 2 verbatim (already vetted against official docs):

```javascript
class AdaptiveRateLimiter {
  constructor() {
    this.remaining = null;
    this.resetMs = null;
  }

  updateFromHeaders(headers) {
    const remaining = headers.get('x-rate-limit-remaining');
    const reset = headers.get('x-rate-limit-reset');
    if (remaining !== null) this.remaining = Number(remaining);
    if (reset !== null) this.resetMs = Number(reset);
  }

  async waitIfNeeded() {
    if (this.remaining === null) return;
    if (this.remaining <= 2 && this.resetMs) {
      await new Promise((resolve) => setTimeout(resolve, this.resetMs));
    }
  }
}
```

**Integration point:** the limiter must be threaded through `client.js`'s `fetch` calls the same way `assertOk` is called today — i.e. a shared `fetchWithRateLimit(url, options, limiter)` helper that all new paginated functions call, mirroring how `getProduct`/`getMetafields` all call the shared `assertOk`. Keep the limiter stateful and instantiated once per ingestion run (passed into `ingest-catalog.js`, not a module-level singleton, so tests can create isolated instances).

**Error/retry pattern** (429 handling, from RESEARCH.md Pattern 2):
```javascript
if (response.status === 429) {
  const resetMs = Number(response.headers.get('x-rate-limit-reset')) || 2000;
  await new Promise((resolve) => setTimeout(resolve, resetMs));
  return fetchWithRateLimit(url, options, limiter);
}
```

---

### `app-partners-recomendados/src/ingestion/ingest-catalog.js` (NEW)

**Analog:** `app-partners-recomendados/src/api/recommendations.js` (lines 1-52) — closest existing example of an orchestrator that imports from `client.js`, calls multiple client functions, and shapes a return value.

**Imports pattern** (lines 1-10 of `recommendations.js`):
```javascript
import { getMetafields, getProduct } from '../nuvemshop-client/client.js';

const NAMESPACE = 'recomendados';
const KEY = 'produto_sugerido';
```
`ingest-catalog.js` should follow the same pattern: import only the specific named functions needed from `client.js` (`listCategories`, `listProducts`, `getMetafields`), plus new imports from `./fabric-taxonomy.js`, `./stock-availability.js`, `../rate-limit/adaptive-limiter.js`, and `../db/catalog-store.js`. Module-level constants (like `NAMESPACE`/`KEY` here) should hold fixed values such as the target category name `"Vestidos"` and the `minSizesInStock: 3` constant (per D-04/Pitfall A — must be named, not inline).

**Orchestration + shaping pattern** (lines 27-52):
```javascript
export async function getRecommendations(productId) {
  const metafields = await getMetafields({ ownerId: productId });
  const match = Array.isArray(metafields)
    ? metafields.find((m) => m.namespace === NAMESPACE && m.key === KEY)
    : null;
  const recommendedProductId = match ? match.value : null;
  // ... conditional enrichment ...
  return { productId, recommendedProductId, recommendedProduct };
}
```
`ingest-catalog.js`'s top-level exported function (e.g. `runIngestion()`) should follow this same "await client calls → transform/validate → return/persist plain object" shape, but as a batch orchestrator: resolve category id → paginate products → for each product compute stock availability (`stock-availability.js`) and audit fabric tags (`fabric-taxonomy.js`) → read Metafield baseline (reusing `getMetafields`, same call as above) → persist via `catalog-store.js` in one transaction (see RESEARCH.md `## Code Examples > Transação de persistência em lote`).

**Category resolution pattern** (RESEARCH.md Pitfall C / Code Examples):
```javascript
async function resolveCategoryIdByName(targetName) {
  const categories = await listCategories();
  const match = categories.find(
    (c) => (c.name?.pt || '').trim().toLowerCase() === targetName.trim().toLowerCase()
  );
  if (!match) {
    throw new Error(`Categoria "${targetName}" não encontrada via GET /categories — confirme o nome exato no admin antes de prosseguir.`);
  }
  return match.id;
}
```
Note: the existing codebase's error-throwing style (`throw new Error(...)` with a descriptive Portuguese message referencing what to check) matches `nuvemshop-auth.js` lines 23-32 and `client.js` lines 18-25 — reuse this voice/style consistently, do not introduce a custom error class.

---

### `app-partners-recomendados/src/ingestion/stock-availability.js` (NEW, pure logic)

**No direct analog** — first pure-function module in the project. Follow RESEARCH.md Pattern 1 content directly:

```javascript
function getVariantStock(variant) {
  const levels = variant.inventory_levels || [];
  return levels.reduce((total, level) => total + (level.stock || 0), 0);
}
```

Plus the named, configurable business rule per Pitfall A / `<specifics>` in CONTEXT.md (D-04) — must NOT be an inline `stock > 0` check:
```javascript
function hasAvailableGrade(product, { minSizesInStock = 3 } = {}) {
  // count variants where getVariantStock(variant) > 0, compare to minSizesInStock
}
```
**Style convention to copy:** JSDoc header per exported function (see `client.js` lines 27-31 style), named constants instead of magic numbers (see `NAMESPACE`/`KEY` convention in `recommendations.js`).

---

### `app-partners-recomendados/src/ingestion/fabric-taxonomy.js` (NEW, pure logic)

**No direct analog** — follow RESEARCH.md Pattern 3 content directly:
```javascript
function auditFabricTags(products, canonicalMap) {
  const frequency = new Map();
  const unmapped = new Set();
  for (const product of products) {
    const fabricTags = (product.tags || '').split(',').map((t) => t.trim()).filter(Boolean);
    for (const rawTag of fabricTags) {
      frequency.set(rawTag, (frequency.get(rawTag) || 0) + 1);
      if (!canonicalMap.has(rawTag)) unmapped.add(rawTag);
    }
  }
  return { frequency, unmapped };
}
```
**Important open question carried from RESEARCH.md (Open Question #2):** confirm whether fabric tags live in the native `tags` field or a separate Metafield before implementing — this changes whether this module reads `product.tags` directly or calls `getMetafields()` (same pattern as `recommendations.js` lines 27-33) for a custom namespace.

---

### `app-partners-recomendados/src/db/schema.sql` (NEW)

**No analog** — first SQL artifact in the project. Use RESEARCH.md `## Code Examples > Schema SQLite (D-10/D-11)` as the starting DDL (tables: `ingestion_runs`, `products`, `variants`, `catalog_snapshots`, `fabric_tag_canonical_map`, `fabric_tag_audit`, `recommendation_baseline`) — already reviewed against D-10/D-11 requirements in this repo's own research, no external analog needed.

---

### `app-partners-recomendados/src/db/catalog-store.js` (NEW)

**Analog (structural only):** `client.js`'s module pattern — a set of named exported functions wrapping a single external resource (there: HTTP/fetch; here: `better-sqlite3` `Database` instance), with setup constants at module scope (`API_BASE`/`USER_AGENT` there → `DB_PATH`/pragma setup here).

**Transaction pattern** (from RESEARCH.md `## Code Examples > Transação de persistência em lote`):
```javascript
import Database from 'better-sqlite3';

const db = new Database('data/catalog.db');
db.pragma('journal_mode = WAL');

const insertProduct = db.prepare(
  `INSERT INTO products (id, name, handle, canonical_url, last_seen_run_id)
   VALUES (@id, @name, @handle, @canonicalUrl, @runId)
   ON CONFLICT(id) DO UPDATE SET name=excluded.name, handle=excluded.handle,
     canonical_url=excluded.canonical_url, last_seen_run_id=excluded.last_seen_run_id`
);

const persistIngestion = db.transaction((records) => {
  for (const record of records) {
    insertProduct.run(record.product);
    // ... other inserts
  }
});
```
**Security requirement (carried from RESEARCH.md Security Domain, V5/Tampering):** always use `db.prepare(...).run(params)` with named/positional parameters — never string-concatenate product data (name, tags) into SQL, since it originates from an external API.

**Export style:** match `client.js`'s convention of exporting focused functions (`getProduct`, `createMetafield`, `getMetafields`) rather than exposing the raw `db` object — e.g. export `persistIngestionRun(records)`, `getLatestSnapshot(productId)`, etc.

---

### `app-partners-recomendados/src/auth/nuvemshop-auth.js` (REUSE, unmodified)

No changes needed. `getAccessToken()` (lines 19-35) is called by every new `client.js` function exactly as it already is by `getProduct`/`createMetafield`/`getMetafields` — no new pattern to extract, just continue importing `{ getAccessToken } from '../auth/nuvemshop-auth.js'`.

---

## Shared Patterns

### Error handling
**Source:** `app-partners-recomendados/src/nuvemshop-client/client.js` lines 18-25 (`assertOk`), and `src/auth/nuvemshop-auth.js` lines 23-32 (descriptive `throw new Error(...)` with actionable Portuguese message)
**Apply to:** all new files that make HTTP calls (`client.js` extensions, `adaptive-limiter.js`) or validate data before persisting (`catalog-store.js`, `stock-availability.js`, `fabric-taxonomy.js`). Never swallow errors silently — the existing codebase always throws with context (`${context} falhou (status ${response.status})`), and `server.js` (lines 38-43) is the only place that catches and converts to an HTTP response.

### Module structure / no framework
**Source:** whole `app-partners-recomendados/src/` tree — plain Node ESM (`"type": "module"` in `package.json`), no Express/Fastify, no DI container, no class-based services (except the one small `AdaptiveRateLimiter` class recommended in RESEARCH.md, which is an acceptable exception for stateful throttling).
**Apply to:** all new files — plain `export async function ...` / `export function ...`, JSDoc above each export, module-scope constants for fixed config values (URLs, namespaces, business-rule thresholds like `minSizesInStock = 3`).

### Secrets / config
**Source:** `.env` (`NUVEMSHOP_ACCESS_TOKEN`, `NUVEMSHOP_STORE_ID`) read exclusively via `getAccessToken()` in `nuvemshop-auth.js`; `app-partners-recomendados/.gitignore` (lines 1-5) currently ignores `.env`, `node_modules/`, `.vercel`.
**Apply to:** no new file should read `process.env` directly except `nuvemshop-auth.js` (already the case) — reuse `getAccessToken()`. **Gap to flag for planner:** `.gitignore` does NOT yet cover `data/*.db` — RESEARCH.md Wave 0 Gaps explicitly calls this out; the ingestion plan must add a `data/` or `*.db` entry to `.gitignore` before the first real run.

### Testing
**Source:** none exists yet in the repo (`package.json` has no test framework/scripts, no `*.test.js` found).
**Apply to:** `stock-availability.js` and `fabric-taxonomy.js` are pure functions with no I/O — RESEARCH.md recommends `vitest` (ESM-first, matches `"type": "module"`) and flags this as a Wave 0 gap (`npm install -D vitest` before writing tests). No existing test file to copy conventions from; planner should establish the first test file's structure from scratch, colocated as `*.test.js` next to the module under test (per RESEARCH.md `## Validation Architecture > Phase Requirements → Test Map`).

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/ingestion/fabric-taxonomy.js` | utility | transform | No pure-transform modules exist yet in the repo; content sourced from RESEARCH.md Pattern 3 instead |
| `src/ingestion/stock-availability.js` | utility | transform | Same — first pure business-rule module; content sourced from RESEARCH.md Pattern 1 / Pitfall A |
| `src/db/schema.sql` | migration | batch | First SQL/DDL artifact in the project; content sourced from RESEARCH.md Code Examples |
| `src/db/catalog-store.js` (data-layer specifics) | model/service | CRUD, batch | No existing DB wrapper to copy the persistence logic from — only the module-export *style* is borrowed from `client.js`; the `better-sqlite3` transaction pattern itself comes from RESEARCH.md / official docs |

## Metadata

**Analog search scope:** `app-partners-recomendados/src/` (entire tree — 4 existing JS files: `client.js`, `nuvemshop-auth.js`, `recommendations.js`, `server.js`)
**Files scanned:** 4 source files + `package.json` + `.gitignore`
**Pattern extraction date:** 2026-07-10
