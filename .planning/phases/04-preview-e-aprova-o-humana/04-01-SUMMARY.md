---
phase: 04-preview-e-aprova-o-humana
plan: 01
subsystem: database
tags: [better-sqlite3, sqlite, vitest, tdd, upsert]

# Dependency graph
requires:
  - phase: 03.1-criterio-grupo-produtos
    provides: catalog_snapshots.category_raw/product_group_canonical, getLatestSnapshotProducts(), CATALOG_DB_DIR test seam
  - phase: 02-ingestao-catalogo
    provides: recommendation_baseline table (write-only until this plan), ingestion_runs/products/variants tables
provides:
  - "approval_queue table (UNIQUE(product_id, run_id)) — persists approve/reject decisions with exact approved-id set (D-25), never a boolean"
  - "getLatestSuccessfulRunId() — first exported function resolving the current run_id"
  - "getBaselineForRun({runId}) — first read function ever for recommendation_baseline (write-only since Phase 2)"
  - "upsertApprovalDecision/getApprovalDecision/listApprovalQueueChanges — full decision read/write API for Plans 04-02/04-03/04-04/04-05"
affects: [04-02-preview-e-aprova-o-humana, 04-03-preview-e-aprova-o-humana, 04-04-preview-e-aprova-o-humana, 04-05-preview-e-aprova-o-humana, 05-gravacao-loja]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Upsert-by-decision via ON CONFLICT(product_id, run_id) DO UPDATE, excluding created_at from SET to preserve first-insert timestamp across repeated decisions (upsert, not append)"
    - "Corrected DDL vs research example: UNIQUE(product_id, run_id) constraint (not a plain non-unique CREATE INDEX) is required for ON CONFLICT target to be valid in SQLite/better-sqlite3"

key-files:
  created: []
  modified:
    - app-partners-recomendados/src/db/schema.sql
    - app-partners-recomendados/src/db/catalog-store.js
    - app-partners-recomendados/src/db/catalog-store.test.js

key-decisions:
  - "Corrected 04-RESEARCH.md/04-PATTERNS.md approval_queue DDL example by adding UNIQUE(product_id, run_id) — the example's plain CREATE INDEX cannot be an ON CONFLICT target in SQLite, better-sqlite3 would throw 'ON CONFLICT clause does not match any PRIMARY KEY or UNIQUE constraint'"
  - "created_at intentionally excluded from the DO UPDATE SET clause so the first decision's timestamp survives later overwrites"

patterns-established:
  - "Read-only function pairs with prior write-only tables (getBaselineForRun mirrors getCanonicalMap's empty-Map-on-no-rows convention) — never throws on absence of data"

requirements-completed: [APRV-02, APRV-03]

# Metrics
duration: 30min
completed: 2026-07-16
status: complete
---

# Phase 04 Plan 01: approval_queue + baseline/decision persistence layer Summary

**approval_queue table (UNIQUE(product_id, run_id)) plus 5 exported catalog-store.js functions (getLatestSuccessfulRunId, getBaselineForRun, upsertApprovalDecision, getApprovalDecision, listApprovalQueueChanges) closing the read gap on recommendation_baseline and giving D-25 a persistence target**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-07-16T10:13:00-03:00 (approx, based on first commit)
- **Completed:** 2026-07-16T10:14:24-03:00
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- `approval_queue` table added to `schema.sql` with `UNIQUE(product_id, run_id)`, correcting the non-unique-index DDL example in 04-RESEARCH.md/04-PATTERNS.md that would have caused an `ON CONFLICT` preparation error in better-sqlite3
- `getBaselineForRun({runId})` — the first read function ever written for `recommendation_baseline` (write-only since Phase 2), confirmed live against the real `data/catalog.db` (run_id=5, 675 baseline rows)
- `upsertApprovalDecision`/`getApprovalDecision`/`listApprovalQueueChanges` implement the full round-trip for D-25 (exact approved-id set, never a boolean), with upsert-not-append semantics proven by test
- `getLatestSuccessfulRunId()` exposes the run resolution logic that was previously only internal to `getLatestSnapshotProducts`

## Task Commits

Each task was committed atomically:

1. **Task 1: schema.sql + catalog-store.js — approval_queue e funções de leitura/escrita** - `2b8a58e` (feat)
2. **Task 2: catalog-store.test.js — round-trip de approval_queue e leitura de baseline por run** - `8dcd69d` (test)

**Plan metadata:** (final docs commit follows this summary)

_Note: Task 1 implemented the functions directly (not strict RED-then-GREEN) since the plan's own behavior spec (Comportamentos 1-6) doubled as the acceptance criteria already covered by Task 1's own automated verify step; Task 2 then added the dedicated vitest coverage (Tests 5-12) and confirmed GREEN on the first run — consistent with the plan's own note that "if Task 1 already executed before Task 2, tests should only fail on implementation bugs, never on missing functions."_

## Files Created/Modified
- `app-partners-recomendados/src/db/schema.sql` - Added `approval_queue` table (UNIQUE(product_id, run_id)) and header comment describing it
- `app-partners-recomendados/src/db/catalog-store.js` - Added `getLatestSuccessfulRunId`, `getBaselineForRun`, `upsertApprovalDecision`, `getApprovalDecision`, `listApprovalQueueChanges`, plus their backing prepared statements
- `app-partners-recomendados/src/db/catalog-store.test.js` - Added `describe('approval_queue e leitura de baseline (Fase 4, D-25)')` with Tests 5-12, reusing the existing `tempDir`/`CATALOG_DB_DIR`/`closeDbForTests` setup

## Decisions Made
- Followed the plan's corrected DDL exactly (`UNIQUE(product_id, run_id)` added to the `approval_queue` example from 04-RESEARCH.md/04-PATTERNS.md) — no additional architectural changes needed.
- No new libraries or migrations required: `approval_queue` is a brand-new table, so `CREATE TABLE IF NOT EXISTS` alone suffices (unlike the Phase 03.1 `ALTER TABLE` migration pattern for existing tables).

## Deviations from Plan

None (functional) — plan executed exactly as written for both tasks.

**Note on an imprecise acceptance-criteria check (informational, not a bug):** the plan's Task 1 acceptance criteria states `grep -c "ON CONFLICT(product_id, run_id) DO UPDATE" src/db/catalog-store.js` should return `1`. In the real file it returns `2`, because the pre-existing `insertRecommendationBaseline` statement (written in Phase 2, `recommendation_baseline` upsert) already contains the exact same SQL fragment `ON CONFLICT(product_id, run_id) DO UPDATE SET`. This is expected and correct — both statements legitimately upsert against the same `(product_id, run_id)` composite key on two different tables; the grep pattern is not table-scoped so it double-counts. No code change was needed; this is purely an artifact of the plan's grep pattern not distinguishing between tables. All other acceptance criteria (schema greps, function-existence greps, live-db read check) returned exactly as specified.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plans 04-02 (pure domain diff logic), 04-04 (GET routes), and 04-05 (POST routes + write gate) can consume `getLatestSuccessfulRunId`, `getBaselineForRun`, `upsertApprovalDecision`, `getApprovalDecision`, and `listApprovalQueueChanges` directly — no further schema exploration needed.
- Confirmed against the real `data/catalog.db`: `getLatestSuccessfulRunId()` returns `5`, `getBaselineForRun({runId: 5})` returns a 675-entry Map — the data layer is ready even though `product_group_canonical` is currently null for all rows in run 5 (a data/ingestion-timing issue documented in the plan's `<objective>`, out of scope for this plan).
- No blockers for the next plan.

---
*Phase: 04-preview-e-aprova-o-humana*
*Completed: 2026-07-16*

## Self-Check: PASSED

- FOUND: app-partners-recomendados/src/db/schema.sql
- FOUND: app-partners-recomendados/src/db/catalog-store.js
- FOUND: app-partners-recomendados/src/db/catalog-store.test.js
- FOUND: 2b8a58e (Task 1 commit)
- FOUND: 8dcd69d (Task 2 commit)
