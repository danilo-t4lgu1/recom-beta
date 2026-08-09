# Phase 6: Operação Diária Autônoma na Nuvem - Pattern Map

**Mapped:** 2026-07-17
**Files analyzed:** 6 (new) + 2 (modified)
**Analogs found:** 8 / 8

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|-----------------|----------------|
| `app-partners-recomendados/scripts/run-daily-job.js` (NEW) | utility/CLI orchestrator | batch (idempotent, exits early) | `app-partners-recomendados/scripts/run-ingestion.js` | exact (same role: CLI entry point calling a `src/` module, prints summary, exit codes) |
| `app-partners-recomendados/src/db/catalog-store.js` (MODIFIED — add `getSuccessfulRunForToday`, `seedPendingApprovalQueue`, `checkpointAndCloseDb`) | model/data-access | CRUD | same file, existing functions (`getLatestSuccessfulRunId`, `upsertApprovalDecision`, `closeDbForTests`) | exact (same file — additive functions following the file's own conventions) |
| `app-partners-recomendados/src/db/catalog-store.test.js` (MODIFIED — new test cases) | test | unit | same file, existing `describe`/`it` blocks + `CATALOG_DB_DIR` isolation pattern | exact |
| `app-partners-recomendados/scripts/run-daily-job.test.js` (NEW) | test | integration (subprocess) | `app-partners-recomendados/scripts/rollback.test.js` (subprocess/CLI test pattern) | role-match |
| `.github/workflows/daily-recompute.yml` (NEW) | config | scheduled/event-driven | none in repo (no `.github/workflows/` exists yet) | no analog — use RESEARCH.md Code Examples verbatim |
| `storefront-script/main.js` (MODIFIED — add cache TTL) | component (client-side script) | request-response + cache | same file, existing `fetchRecommendation`/`init` functions | exact (same file — additive, follows existing style: `var` IIFE, graceful degradation via try/catch) |
| `storefront-script/main.test.js` (NEW) | test | unit (no jsdom, injected fakes) | `app-partners-recomendados/src/review/notify-failure.test.js` (pure-function test w/ fetch/webhook faked, graceful-degradation assertions) | role-match |
| Job failure notification (reused, not new) | service | event-driven (webhook) | `app-partners-recomendados/src/review/notify-failure.js` | exact — reuse as-is, no new file needed per D-46 |

## Pattern Assignments

### `app-partners-recomendados/scripts/run-daily-job.js` (NEW)

**Analog:** `app-partners-recomendados/scripts/run-ingestion.js` (full file read above)

**Imports pattern** (lines 21):
```javascript
import { runIngestion } from '../src/ingestion/ingest-catalog.js';
```
For the new file, add:
```javascript
import { runIngestion } from '../src/ingestion/ingest-catalog.js';
import {
  getSuccessfulRunForToday,
  seedPendingApprovalQueue,
  checkpointAndCloseDb,
  getLatestSnapshotProducts,
} from '../src/db/catalog-store.js';
import { buildReviewQueue } from '../src/review/review-queue.js';
import { notifyWriteFailure } from '../src/review/notify-failure.js';
```

**Core orchestration pattern** (mirrors lines 23-47 of `run-ingestion.js` — async `main()`, console summary, explicit exit codes):
```javascript
async function main() {
  const existingRunId = getSuccessfulRunForToday();
  if (existingRunId != null) {
    console.log(`Já existe execução bem-sucedida hoje (run_id=${existingRunId}) — pulando (SC#2).`);
    process.exit(0);
  }

  const categoryNames = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ['Vestidos'];
  const result = await runIngestion({ categoryNames });
  // ... buildReviewQueue + seedPendingApprovalQueue (D-47/Pattern 2 in RESEARCH.md) ...

  checkpointAndCloseDb(); // MUST run before process exits (Pitfall 1 — WAL not merged)
  process.exit(0);
}

main().catch(async (err) => {
  console.error('\nERRO durante o job diário:', err.message);
  await notifyWriteFailure({ productId: 'daily-job', error: err, triggeredBy: 'scheduled' });
  process.exit(1); // D-46: never mask failure
});
```

**Error handling pattern** — same shape as `run-ingestion.js` lines 44-47 (`main().catch(...)` → `console.error` + `process.exit(1)`), extended with `notifyWriteFailure` call per D-46 (reuse `notify-failure.js` verbatim, no new notification code).

**Module doc-comment convention:** Follow the header block style seen at top of `run-ingestion.js` (lines 1-19) and `rollback.js` (lines 1-16) — a plain `//` block explaining Uso/D-refs/behavior, not JSDoc, since this is a CLI script not an exported library function.

---

### `app-partners-recomendados/src/db/catalog-store.js` (MODIFIED)

**Analog:** same file — follow existing conventions exactly (this file is both the analog and the target).

**Prepared-statement + exported-function pattern** (lines 271-274, `getLatestSuccessfulRunId`):
```javascript
const selectLatestSuccessfulRun = db.prepare(
  `SELECT id FROM ingestion_runs WHERE status = 'success' ORDER BY id DESC LIMIT 1`
);

export function getLatestSuccessfulRunId() {
  const latestRun = selectLatestSuccessfulRun.get();
  return latestRun ? latestRun.id : null;
}
```
New `getSuccessfulRunForToday()` follows this exact shape (own prepared statement declared near the top with the others, JSDoc block above the export — see lines 264-274, 292-302, 508-519 for JSDoc conventions: `@param`, `@returns`, prose explaining "never throws" / "only used by X, never by Y").

**Upsert-with-DO-NOTHING pattern** (contrast with `upsertApprovalDecisionStmt` at lines 130-138, which uses `DO UPDATE`): new `seedPendingApprovalQueueStmt` must use `ON CONFLICT(...) DO NOTHING` — see RESEARCH.md Pattern 2 code example (lines 246-273 of 06-RESEARCH.md) for the exact statement text. Follow the `db.transaction(() => { ... })` batching convention from `persistIngestionBatch` (lines 463-491) when looping over `queueEntries`.

**Resource-cleanup pattern** (lines 508-519, `closeDbForTests`):
```javascript
export function closeDbForTests() {
  db.close();
}
```
New `checkpointAndCloseDb()` follows this shape but adds `db.pragma('wal_checkpoint(TRUNCATE)')` before `db.close()` — see RESEARCH.md Pattern 3 (lines 279-295 of 06-RESEARCH.md). JSDoc must state it is production-only (opposite of `closeDbForTests`, which is test-only) per the same doc-comment discipline used throughout this file.

---

### `app-partners-recomendados/scripts/run-daily-job.test.js` (NEW)

**Analog:** `app-partners-recomendados/scripts/rollback.test.js` (CLI test file, same directory) and `app-partners-recomendados/src/db/catalog-store.test.js` (CATALOG_DB_DIR isolation, lines 1-80 read above).

**Isolation pattern** (from `catalog-store.test.js` lines 1-24 comments): use `CATALOG_DB_DIR` env var pointing to a `mkdtempSync(join(tmpdir(), ...))` directory — never touch real `data/catalog.db`. Reset modules per test with `vi.resetModules()` + explicit `closeDbForTests()`/`checkpointAndCloseDb()` calls to release Windows file locks (documented rationale at lines 508-514 of `catalog-store.js`).

**Subprocess/guard test pattern:** structure tests around calling the exported guard function directly (`getSuccessfulRunForToday`) rather than spawning a real child process where avoidable, consistent with how `rollback.js`'s `performRollback` is unit-tested by import rather than CLI spawn — reserve actual subprocess spawning only if the plan requires testing `process.exit` behavior end-to-end.

---

### `.github/workflows/daily-recompute.yml` (NEW)

**No analog exists in this repository** (`.github/workflows/` does not exist yet — confirmed via Glob). Use the RESEARCH.md "Code Examples > Workflow GitHub Actions completo" section verbatim (06-RESEARCH.md lines 406-459) as the base template:
- `on.schedule.cron: '0 6 * * *'` (06:00 UTC = 03:00 BRT, D-52)
- `permissions: contents: write` (minimum, D-46/Security Domain)
- `actions/checkout@v5` → `actions/setup-node@v6` (Node 20, `cache: 'npm'`) → `npm ci` → `node scripts/run-daily-job.js` → commit-back step with `git add -f data/catalog.db`, `[skip ci]` in commit message, and NO `|| true` masking on `git push` (D-46).

---

### `storefront-script/main.js` (MODIFIED)

**Analog:** same file — existing `fetchRecommendation` (lines 98-107) and `init` (lines 194-219) functions define the conventions to extend.

**Style conventions to follow:**
- `var` declarations, not `const`/`let` (whole file uses `var`, IIFE pattern, `'use strict'`).
- Graceful degradation via try/catch that never throws, matching `fetchRecommendation`'s `.catch()` at line 216-218 (`console.warn`, never rethrow).
- Functions receive dependencies as parameters rather than reaching into globals directly where testability matters — mirrors the project-wide DI discipline seen in `approval-gate.js` (per RESEARCH.md Pattern 4 rationale) and in `catalog-store.js`'s `CATALOG_DB_DIR` seam (lines 23-27).

**Core cache pattern** (RESEARCH.md Pattern 4, lines 300-353 of 06-RESEARCH.md) — copy verbatim:
```javascript
var CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h (D-50)
var CACHE_KEY_PREFIX = 'recomendados_cache_';

function getCachedRecommendation(storage, productId, now) {
  try {
    var raw = storage.getItem(CACHE_KEY_PREFIX + productId);
    if (!raw) return null;
    var parsed = JSON.parse(raw);
    if (now - parsed.cachedAt > CACHE_TTL_MS) return null;
    return parsed.data;
  } catch (e) {
    return null; // JSON inválido ou storage indisponível — trata como cache miss
  }
}

function setCachedRecommendation(storage, productId, data, now) {
  try {
    storage.setItem(CACHE_KEY_PREFIX + productId, JSON.stringify({ data: data, cachedAt: now }));
  } catch (e) {
    // Safari modo privado ou quota excedida — degrada graciosamente
  }
}
```
`init()` must check `getCachedRecommendation(window.sessionStorage, productId, Date.now())` BEFORE calling `fetchRecommendation` (zero-fetch-on-hit, SC#4) and call `setCachedRecommendation` inside the existing `.then()` callback (line 204-215) right after a successful fetch, before rendering.

---

### `storefront-script/main.test.js` (NEW — first automated test for this file)

**Analog:** `app-partners-recomendados/src/review/notify-failure.test.js` (unread in full here but referenced in notify-failure.js header — pure-function test with faked fetch/env, asserting graceful-degradation branches never throw) and `app-partners-recomendados/src/review/approval-gate.test.js` pattern of DI (params passed instead of real I/O).

**Fake storage pattern** (per RESEARCH.md "Don't Hand-Roll" table, no jsdom):
```javascript
function createFakeStorage(initial = {}) {
  var store = { ...initial };
  return {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => { store[key] = value; },
  };
}
```
Test cases per RESEARCH.md Validation Architecture table (line 540 of 06-RESEARCH.md): hit within TTL, miss outside TTL, miss on empty storage, miss on corrupted JSON, graceful degradation when `storage.setItem` throws (simulate Safari private mode by making the fake throw).

---

## Shared Patterns

### Never-mask-failure discipline (D-46)
**Source:** `app-partners-recomendados/src/review/notify-failure.js` (full file, lines 1-59) + `app-partners-recomendados/scripts/run-ingestion.js` lines 44-47
**Apply to:** `run-daily-job.js`, `daily-recompute.yml` commit-back step
- Any exception in the orchestration script must reach `process.exit(1)`, never be swallowed.
- `notifyWriteFailure({ productId, error, triggeredBy })` is reused as-is (no new webhook code) — degrades gracefully itself (never throws) but the caller must still propagate the original failure via non-zero exit.
- In the YAML, `git push` must never be followed by `|| true` or similar masking.

### Dependency-injection for testability (project-wide convention)
**Source:** `app-partners-recomendados/src/db/catalog-store.js` lines 23-27 (`CATALOG_DB_DIR` env seam), `app-partners-recomendados/src/review/approval-gate.js` (receives `decision` as param, per RESEARCH.md)
**Apply to:** `storefront-script/main.js` cache functions (storage + now passed as params, never read `window.sessionStorage`/`Date.now()` internally) and `run-daily-job.test.js` (CATALOG_DB_DIR isolation)

### JSDoc/doc-comment convention
**Source:** `app-partners-recomendados/src/db/catalog-store.js` (every exported function, e.g. lines 264-274, 292-302, 493-497)
**Apply to:** all new exported functions in `catalog-store.js` (`getSuccessfulRunForToday`, `seedPendingApprovalQueue`, `checkpointAndCloseDb`) — full `@param`/`@returns` JSDoc plus prose explaining what happens in edge cases (no rows, null runId, etc.) and which callers should/shouldn't use it, exactly as done for `getLatestSuccessfulRunId`/`closeDbForTests`.

### Upsert vs. append-only vs. DO-NOTHING discipline
**Source:** `app-partners-recomendados/src/db/catalog-store.js` — three distinct SQL write disciplines already established: `DO UPDATE` for mutable state (`insertProduct`, `upsertApprovalDecisionStmt`, lines 45-50, 130-138), pure `INSERT` append-only for audit trails (`insertSnapshot`, `insertWriteLog`, lines 60-68, 157-163), and the new `seedPendingApprovalQueueStmt` needs `DO NOTHING` (a third discipline, never overwrite a human decision — RESEARCH.md Pattern 2 and Anti-Patterns section).
**Apply to:** `seedPendingApprovalQueue` in `catalog-store.js`.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `.github/workflows/daily-recompute.yml` | config | scheduled/event-driven | No `.github/workflows/` directory exists in this repo yet (confirmed via Glob) — use RESEARCH.md Code Examples section verbatim as the template instead of a codebase analog. |

## Metadata

**Analog search scope:** `app-partners-recomendados/src/**`, `app-partners-recomendados/scripts/**`, `storefront-script/**`, `.github/workflows/**` (empty)
**Files scanned:** ~30 (via Glob) + 6 read in full (`catalog-store.js`, `run-ingestion.js`, `main.js`, `rollback.js`, `notify-failure.js`, `catalog-store.test.js` partial)
**Pattern extraction date:** 2026-07-17
