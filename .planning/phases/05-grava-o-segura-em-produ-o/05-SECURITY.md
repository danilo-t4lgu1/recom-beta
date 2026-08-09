---
phase: 05
slug: grava-o-segura-em-produ-o
status: complete
threats_open: 0
asvs_level: 1
created: 2026-07-17
---

# SECURITY.md — Phase 05: Gravação Segura em Produção

**Audit date:** 2026-07-17
**Auditor:** gsd-security-auditor (retroactive verification, `/gsd-secure-phase`)
**ASVS Level:** 1
**Block-on config:** none configured
**Scope:** All 5 plans of Phase 05 (05-01 through 05-05) — threat mitigations verified against implemented code, not documentation/intent.

## Method

Every threat in the phase's consolidated `<threat_model>` was classified by disposition (mitigate / accept) and verified directly in the cited implementation files via `grep`/`Read`, following the FORCE stance (absence assumed until proven present). No new vulnerability scanning was performed — only declared-mitigation verification, per the auditor's read-only, non-blind mandate. Full test suite (`npx vitest run`) was re-run as corroborating evidence: **144/144 tests passing**, 15 test files.

No `## Threat Flags` section was found in any of the 5 SUMMARY.md files for this phase (`05-01` through `05-05`) — no new unregistered attack surface was reported by the executor during implementation.

## Threat Verification

| Threat ID | Category | Component | Disposition | Verification | Evidence |
|-----------|----------|-----------|--------------|---------------|----------|
| T-05-01 | Information Disclosure (secret leak in webhook payload) | `notify-failure.js` | mitigate | CLOSED | `src/review/notify-failure.js:32-39` — payload object literal contains only `text`, `content`, `productId`, `triggeredBy`, `error: error.message`, `timestamp`; `grep -ic "accessToken\|Authorization\|Bearer" notify-failure.js` → `0` |
| T-05-02 | DoS (infinite retry loop on webhook) | `notify-failure.js` | mitigate | CLOSED | `src/review/notify-failure.js:41-45` — single `await fetch(...)` call, no loop/retry construct anywhere in the file; failure path only calls `console.error` (line 48-50) |
| T-05-03 | Tampering (webhook failure masking a bigger error) | `notify-failure.js` | mitigate | CLOSED | `src/review/notify-failure.js:29-58` — single `try{...}catch(err){...}` wraps the entire network call + status check; catch block returns `{ notified: false, reason: err.message }`, never re-throws |
| T-05-SC (×5, one per plan 05-01..05-05) | Tampering (supply chain in package install) | npm | accept | CLOSED | `app-partners-recomendados/package.json` unchanged since Phase 2 (`git log --oneline -- package.json` shows no commits in Phase 5 range); `dependencies: { better-sqlite3 }`, `devDependencies: { vitest }` only — confirms no package added in any of the 5 plans |
| T-05-04 | Tampering (SQL injection via product_id/error_message) | `catalog-store.js` | mitigate | CLOSED | `src/db/catalog-store.js:157-174` — `insertWriteLogStmt`, `selectLastSuccessfulWriteLogStmt`, `selectAllWriteLogStmt` all built via `db.prepare(...)` with named parameters (`@productId` etc.); `insertWriteLog` (line 379-401) calls `.run({...})` with an object, never string concatenation |
| T-05-05 | Repudiation (a real write failure disappearing without record) | `write_log` schema | mitigate | CLOSED | `src/db/schema.sql:112` — `status TEXT NOT NULL` on the `write_log` table definition |
| T-05-06 | Tampering (accidental real write during automated test run) | `write-executor.test.js`, `review-server.test.js` | mitigate | CLOSED | `src/review/write-executor.test.js:33` — `vi.mock('../nuvemshop-client/client.js', ...)`; `src/review-server.test.js:59` — `vi.mock('./nuvemshop-client/client.js', ...)` (whole module, 8 functions). Neither test file imports the real `client.js` |
| T-05-07 | Repudiation (a real write failure disappearing without log/notification) | `write-executor.js` catch block | mitigate | CLOSED | `src/review/write-executor.js:66-86` — `catch (err)` block unconditionally calls `insertWriteLog({ status: 'failed', errorMessage: err.message, ... })` (lines 67-77) before the notify/re-throw |
| T-05-08 | Information Disclosure (secret leak via notifyWriteFailure call site) | `write-executor.js` → `notify-failure.js` | mitigate | CLOSED | `src/review/write-executor.js:83` — `notifyWriteFailure({ productId, error: err, triggeredBy: 'manual' })`, no `accessToken`/headers passed |
| T-05-09 | DoS (webhook failure blocking/delaying the real write's HTTP response) | `write-executor.js` | mitigate | CLOSED | `src/review/write-executor.js:83` — `await notifyWriteFailure(...).catch(() => {})` followed unconditionally by `throw err;` (line 85) — original error always re-thrown regardless of webhook outcome |
| T-05-10 | Tampering (rollback overwriting a manual edit/more recent write) | `scripts/rollback.js` `performRollback` | mitigate | CLOSED | `scripts/rollback.js:57-68` — live `findMetafield` read (line 57) + strict `!==` comparison against `lastWrite.writtenValue` (line 60) BEFORE any `updateMetafield`/`deleteMetafield`/`insertWriteLog` call; divergence throws `RollbackConflictError` (line 61) with zero side effects. Confirmed by test: `scripts/rollback.test.js` Test 4 (lines 164-194) asserts `updateMetafield`/`deleteMetafield` never called on divergence |
| T-05-11 | Tampering (SQL injection via productId in write_log reads/writes) | `catalog-store.js` | mitigate | CLOSED | Same statements verified under T-05-04 — parameterized since Plan 05-02, reused unchanged by `rollback.js` |
| T-05-12 | Elevation of Privilege (rollback executable by anyone with shell access, no auth) | `scripts/rollback.js` CLI | accept | CLOSED | Documented in this SECURITY.md accepted-risks log below. Confirmed CLI-only entry point (no HTTP route): `scripts/rollback.js:88-100` guards the CLI body with `if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)`; no route registered in `review-server.js` for rollback |
| T-05-13 | Tampering/Information Disclosure (XSS via unescaped write_log field) | `review-server.js` `renderAuditPage` | mitigate | CLOSED | `src/review-server.js:342-363` — all 6 interpolated fields (`productId`, `writtenAt`, `previousValue`, `writtenValue`, `triggeredBy`, `status`) pass through `escapeHtml(...)` (lines 355-360). `escapeHtml` itself (lines 73-76) escapes `& < > " '`. Confirmed by `review-server.test.js` XSS test (per 05-05-SUMMARY.md, Test 22) asserting `<script>` never appears raw in `GET /audit` response body |
| T-05-14 | Elevation of Privilege (GET /audit exposed without authentication) | `review-server.js` (bind 127.0.0.1) | accept | CLOSED | Documented in this SECURITY.md accepted-risks log below. Confirmed bind: `src/review-server.js:676` — `server.listen(PORT, '127.0.0.1', ...)` |

**Threats Closed: 15/15** (12 mitigate + 3 accept)
**Threats Open: 0**

## Accepted Risks Log

The following risks are formally accepted for Phase 05, consistent with the project's established ASVS Level 1 / local-trust posture (same posture already accepted for `GET /review` in Phase 4):

1. **T-05-SC — Supply chain risk (npm), all 5 plans of Phase 05.** No new packages were installed in any plan of this phase. `package.json` is unchanged since Phase 2 (`better-sqlite3`, `vitest` only). Risk accepted at the existing baseline; no new supply-chain surface introduced.

2. **T-05-12 — `scripts/rollback.js` CLI has no additional authentication/authorization beyond shell/machine access.** Accepted because: (a) it is a manual CLI tool (D-37), never exposed as an HTTP endpoint; (b) it follows the same local-trust posture already established for other operator tooling in this project (ASVS Level 1); (c) it requires direct machine/shell access, which is outside this application's threat boundary.

3. **T-05-14 — `GET /audit` is exposed without authentication.** Accepted because: (a) the server binds explicitly to `127.0.0.1` only (confirmed at `src/review-server.js:676`), never reachable from outside the host; (b) this is the same accepted posture already established for `GET /review` in Phase 4; (c) the tool is an internal operator dashboard, not a publicly exposed service.

## Unregistered Flags

None. No `## Threat Flags` section was present in any of the 5 SUMMARY.md files for this phase (05-01-SUMMARY.md through 05-05-SUMMARY.md) — the executor reported no new attack surface discovered during implementation beyond the threats already registered in the plans' `<threat_model>` blocks.

## Out-of-Scope Note (not a threat-model item)

A correctness bug (CR-01, per the launching agent's note) was identified during code review in `scripts/rollback.js`: a null-pointer crash on a specific double-rollback edge case (calling `performRollback` a second time after a rollback that used `deleteMetafield`, where a subsequent `updateMetafield` branch dereferences `existing.id` while `existing` is `null`). This is a correctness/reliability defect, not a gap in T-05-10's declared mitigation — T-05-10 is specifically about the live-read divergence check (`findMetafield` + strict comparison before any write), which functions correctly and is verified above. This bug is out of scope for this security audit per the launching agent's explicit instruction and is not counted as an open threat. Implementation files are read-only for this audit; no patch was applied.

## Verification Commands Run

```
cd app-partners-recomendados && npx vitest run
# 15 test files passed, 144 tests passed

grep -ic "accessToken\|Authorization\|Bearer" src/review/notify-failure.js   # 0
grep -n "await fetch(" src/nuvemshop-client/client.js                        # only line 37 (getProduct, out of scope)
grep -c "fetchWithRateLimit" src/nuvemshop-client/client.js                   # 10
grep -n "status TEXT NOT NULL" src/db/schema.sql                              # write_log.status (line 112)
grep -n "server.listen" src/review-server.js                                  # 127.0.0.1 bind (line 676)
git log --oneline -- app-partners-recomendados/package.json                   # no Phase 5 commits
```

---
*Generated by gsd-security-auditor — retroactive threat mitigation verification for Phase 05.*
