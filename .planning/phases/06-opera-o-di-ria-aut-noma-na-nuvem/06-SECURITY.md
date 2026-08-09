---
phase: 06
slug: opera-o-di-ria-aut-noma-na-nuvem
status: complete
threats_open: 0
asvs_level: 1
created: 2026-07-17
---

# SECURITY.md — Phase 06: Operação Diária Autônoma na Nuvem

**Audit date:** 2026-07-17
**Auditor:** gsd-security-auditor (retroactive verification, `/gsd-secure-phase`)
**ASVS Level:** 1
**Block-on config:** none configured
**Scope:** All 3 plans of Phase 06 (06-01, 06-02, 06-03) — threat mitigations verified against implemented code, not documentation/intent.

## Method

Every threat in the phase's three `<threat_model>` blocks (06-01-PLAN.md, 06-02-PLAN.md, 06-03-PLAN.md) was classified by disposition (mitigate / accept) and verified directly in the cited implementation files via `Read`/`Grep`, following the FORCE stance (absence assumed until proven present in the right location). No new vulnerability scanning was performed — only declared-mitigation verification, per the auditor's read-only, non-blind mandate.

Full test suites re-run as corroborating evidence:
- `cd app-partners-recomendados && npm test` → **154/154 tests passing** (16 test files)
- `node app-partners-recomendados/node_modules/vitest/vitest.mjs run storefront-script/main.test.js` (from repo root) → **6/6 tests passing**

`## Threat Flags` sections checked in all 3 SUMMARY.md files: absent in 06-01-SUMMARY.md and 06-02-SUMMARY.md (no new attack surface reported); present in 06-03-SUMMARY.md, explicitly stating no new surface beyond the plan's registered threats.

## Threat Verification

| Threat ID | Category | Component | Disposition | Verification | Evidence |
|-----------|----------|-----------|--------------|---------------|----------|
| T-06-01 | Tampering | `seedPendingApprovalQueue` | mitigate | CLOSED | `app-partners-recomendados/src/db/catalog-store.js:157-161` — `seedPendingApprovalQueueStmt` uses `ON CONFLICT(product_id, run_id) DO NOTHING` (never `DO UPDATE`); function body (`:397-408`) runs this statement inside a single `db.transaction`. Test: `catalog-store.test.js:549-570` ("Test 20") seeds an `approved` decision first via `upsertApprovalDecision`, then calls `seedPendingApprovalQueue` for the same `(productId, runId)` and asserts the row remains `approved`, unmodified |
| T-06-02 | Tampering (root cause of "approval disappears" risk) | `getSuccessfulRunForToday` / `run-daily-job.js` | mitigate | CLOSED | `catalog-store.js:109-111` — `selectSuccessfulRunForTodayStmt`: `WHERE status = 'success' AND date(started_at) = date('now')`; exported at `:312-315`. Call site in `scripts/run-daily-job.js:58-66` — `runDailyJob` checks `getSuccessfulRunForToday()` first and returns `{ skipped: true, ... }` *before* calling `runIngestion` if a run already exists today. Test: `catalog-store.test.js:532-547` ("Test 19") proves a `success` row with a backdated `started_at` (yesterday) does NOT satisfy the guard; `run-daily-job.test.js` proves a second same-day call does not re-invoke `listCategories`/`listProducts` mocks |
| T-06-03 | Repudiation (silent data loss) | `checkpointAndCloseDb` | mitigate | CLOSED | `catalog-store.js:590-593` — `db.pragma('wal_checkpoint(TRUNCATE)'); db.close();`, called explicitly (not relying on automatic WAL-size checkpoint). Call site confirmed CLI-only: `scripts/run-daily-job.js:94`, inside the `.then()` of the CLI entrypoint block, never inside the exported `runDailyJob()` function body (`:57-78`, no checkpoint/close call present). Test: `catalog-store.test.js:582-609` ("Test 22") opens a fresh `Database` connection post-checkpoint and confirms data survives |
| T-06-04 | Denial of Service (masked failure) | `run-daily-job.js` CLI block | mitigate | CLOSED | `scripts/run-daily-job.js:97-101` — `.catch(async (err) => { console.error(...); await notifyWriteFailure({ productId: 'daily-job', error: err, triggeredBy: 'scheduled' }); process.exit(1); })` chained directly off the `runDailyJob(...).then(...)` promise — any exception from `runIngestion` (awaited inside `runDailyJob`, `:68`) or from the `.then()` branch itself propagates here; never swallowed silently |
| T-06-SC (×3, one per plan 06-01/06-02/06-03) | Tampering (supply chain) | npm / GitHub Actions marketplace | accept | CLOSED | Documented in Accepted Risks Log below. `git log --oneline -- app-partners-recomendados/package.json app-partners-recomendados/package-lock.json` shows no commits within Phase 6's range (last change was Phase 2) — confirms no new packages added in 06-01/06-03. `.github/workflows/daily-recompute.yml:20,22` — `actions/checkout@v5`, `actions/setup-node@v6`, both official GitHub Actions, pinned by major version tag |
| T-06-05 | Information Disclosure | `daily-recompute.yml` `env:` block | mitigate | CLOSED | `.github/workflows/daily-recompute.yml:31-34` — `NUVEMSHOP_ACCESS_TOKEN`, `NUVEMSHOP_STORE_ID`, `WRITE_FAILURE_WEBHOOK_URL` referenced exclusively via `${{ secrets.NAME }}` inside the step's `env:` block. Confirmed no `echo`/`console.log` of any secret anywhere in the file (full file read; only `run:` commands are `npm ci`, `node scripts/run-daily-job.js`, and the git commit-back sequence — none echo an env var) |
| T-06-06 | Elevation of Privilege | `permissions:` block | mitigate | CLOSED | `.github/workflows/daily-recompute.yml:10-11` — `permissions:\n  contents: write` explicit and minimal; `grep -c "write-all"` → 0 anywhere in the file. **Note:** implemented at workflow-root level rather than nested under `jobs.recompute.permissions` as the plan's literal text specified — functionally equivalent here since the workflow has exactly one job (`recompute` inherits the root-level minimal grant), so the elevation-of-privilege mitigation itself (explicit, minimal, never `write-all`, never omitted) is intact. Flagged as a plan-literalism deviation, not a security gap |
| T-06-07 | Denial of Service (self-inflicted CI loop) | commit-back re-triggering the workflow | mitigate | CLOSED | `.github/workflows/daily-recompute.yml:46` — commit message `"chore(daily): recompute automático [skip ci]"` includes the CI-skip tag |
| T-06-08 | Tampering (masked push failure) | commit-back step | mitigate | CLOSED | `grep -c "continue-on-error" .github/workflows/daily-recompute.yml` → 0 (confirmed via tool, whole file). `git push` (line 47) is the last command of the step with no suppression of its exit code |
| T-06-09 | Information Disclosure | `sessionStorage` cache | accept | CLOSED | Documented in Accepted Risks Log below. `storefront-script/main.js:146-157` (`setCachedRecommendation`) persists exactly the `data` object returned by `fetchRecommendation` (public product name/price/image/url) — same shape already rendered to the DOM pre-cache; no token/PII field added to the cached payload |
| T-06-10 | Tampering (corrupted/manipulated storage input) | `getCachedRecommendation` | mitigate | CLOSED | `storefront-script/main.js:130-137` — `try { parsed = JSON.parse(raw); } catch (e) { return null; }` — invalid JSON always degrades to cache miss (`null`), never throws, never propagates malformed data past this point. Test: `storefront-script/main.test.js` covers "miss/não-lança em JSON corrompido" per 06-03-SUMMARY.md |
| T-06-11 | Injection (XSS via cached catalog data) | `renderRecommendationBlock` | accept (already mitigated in Phase 1) | CLOSED | `storefront-script/main.js:185-217` — `renderRecommendationBlock` calls `escapeHtml` on `url`/`name`/`image`/`price` (lines 186-188, 195) regardless of call site; both the cache-hit path (`init()`, line 259: `renderRecommendationBlock(cached.recommendedProduct)`) and the live-fetch path (line 276: `renderRecommendationBlock(data.recommendedProduct)`) route through the identical function — no new unescaped path introduced by the cache. `escapeHtml` itself unchanged since Phase 1 (lines 176-183) |

**Threats Closed: 12/12** (7 mitigate + 3 accept [T-06-SC counted once, spans all 3 plans] + 2 accept)

Breakdown: T-06-01, T-06-02, T-06-03, T-06-04, T-06-05, T-06-06, T-06-07, T-06-08, T-06-10 = 9 mitigate; T-06-SC, T-06-09, T-06-11 = 3 accept. Total 12 distinct threat IDs, all CLOSED.

**Threats Open: 0**

## Accepted Risks Log

The following risks are formally accepted for Phase 06, consistent with the project's established ASVS Level 1 / local-trust posture:

1. **T-06-SC — Supply chain risk (npm / GitHub Actions marketplace), all 3 plans of Phase 06.** No new npm packages were installed in 06-01 or 06-03 (`package.json`/`package-lock.json` unchanged since Phase 2, confirmed via `git log`). 06-02 introduces the project's first GitHub Actions dependencies (`actions/checkout@v5`, `actions/setup-node@v6`) — both official, GitHub-maintained actions from the verified marketplace, pinned by major version tag, consistent with the trust level already applied to existing npm dependencies.

2. **T-06-09 — Cached recommendation data in `sessionStorage` is not encrypted/protected beyond same-origin storage isolation.** Accepted because: (a) the cached payload is exactly the public product metadata (name/price/image/url) already rendered directly into the page DOM before this phase; (b) no PII, session token, or credential is ever written to the cache key; (c) `sessionStorage` is cleared on tab close and scoped to same-origin, consistent with the browser's own security boundary — no new trust boundary is crossed.

3. **T-06-11 — Cached data reaches the DOM through the same rendering path as live-fetched data, without an additional cache-specific sanitization layer.** Accepted because this is a re-affirmation of Phase 1's already-closed mitigation (CR-01): `escapeHtml` is applied unconditionally inside `renderRecommendationBlock`, which is the single call site used by both the cache-hit and cache-miss branches of `init()` — the cache introduces no new code path that bypasses escaping.

## Unregistered Flags

None. `06-01-SUMMARY.md` and `06-02-SUMMARY.md` contain no `## Threat Flags` section (no new attack surface reported by the executor). `06-03-SUMMARY.md` contains an explicit `## Threat Flags` section stating the four registered threats (T-06-09, T-06-10, T-06-11, T-06-SC) already cover the full surface introduced by that plan — no unregistered flag to log.

## Out-of-Scope Note (not a threat-model item)

A correctness bug was identified during an earlier code review in `storefront-script/main.js:208` — the `data-recommended-product-id` DOM attribute is populated with `recommendedProduct.name` instead of the product's ID field. This is a data-correctness defect, not an injection/escaping gap: the value still passes through `encodeURIComponent` before insertion into the quoted attribute, and does not affect T-06-11's declared mitigation (XSS escaping via `escapeHtml`, applied to `url`/`name`/`image`/`price`, confirmed intact above). Per the launching agent's explicit instruction, this bug is out of scope for this security audit and is not counted as an open threat. Implementation files are read-only for this audit; no patch was applied.

## Verification Commands Run

```
cd app-partners-recomendados && npm test
# 16 test files passed, 154 tests passed

node app-partners-recomendados/node_modules/vitest/vitest.mjs run storefront-script/main.test.js
# 1 test file passed, 6 tests passed (run from repo root)

grep -c "ON CONFLICT.*DO NOTHING" app-partners-recomendados/src/db/catalog-store.js       # seedPendingApprovalQueueStmt (T-06-01)
grep -c "date(started_at) = date('now')" app-partners-recomendados/src/db/catalog-store.js # T-06-02
grep -c "wal_checkpoint" app-partners-recomendados/src/db/catalog-store.js                 # T-06-03
grep -n "process.exit(1)" app-partners-recomendados/scripts/run-daily-job.js               # T-06-04, inside .catch only
git log --oneline -- app-partners-recomendados/package.json app-partners-recomendados/package-lock.json  # no Phase 6 commits (T-06-SC)
grep -c "continue-on-error" .github/workflows/daily-recompute.yml                          # 0 (T-06-08)
grep -c "write-all" .github/workflows/daily-recompute.yml                                  # 0 (T-06-06)
grep -c "skip ci" .github/workflows/daily-recompute.yml                                    # 1 (T-06-07)
grep -n "try {" storefront-script/main.js                                                  # getCachedRecommendation JSON.parse guard (T-06-10)
```

---
*Generated by gsd-security-auditor — retroactive threat mitigation verification for Phase 06.*
