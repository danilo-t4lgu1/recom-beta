---
phase: 04
slug: preview-e-aprova-o-humana
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-16
---

# Phase 04 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.10 |
| **Config file** | none — automatic discovery of `*.test.js` (same pattern as Phases 1-3.1) |
| **Quick run command** | `npx vitest run src/review/<file>.test.js` |
| **Full suite command** | `npm test` (= `vitest run`) |
| **Estimated runtime** | ~2 seconds (current suite: 7 files / 64 tests / 704ms reported duration, measured live 2026-07-16) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run <changed-file>.test.js`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

*Task/Plan/Wave columns are TBD — this table is seeded pre-planning from RESEARCH.md's requirement-level test map. The planner assigns concrete task/plan/wave IDs and threat refs (`<threat_model>`, security contribution active) when PLAN.md files are created.*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | APRV-01 | — | Diff antes/depois calculado corretamente por produto, incluindo baseline vazio | unit | `npx vitest run src/review/diff.test.js` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | APRV-01 | — | Comparação "mudou" ignora reordenação pura (D-23) | unit | `npx vitest run src/review/review-queue.test.js` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | APRV-02 | — | Fluxo completo HTTP: listar fila → ver diff → aprovar produto → persistido em `approval_queue` | integration | `npx vitest run src/review-server.test.js` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | APRV-02 | — | Remoção de item (D-19) dispara backfill correto (D-20) para os 3 grupos de produto | unit | `npx vitest run src/review/diff.test.js` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | APRV-03 | T-04-{elevation-of-privilege} | Chamada direta ao endpoint de escrita sem aprovação prévia é recusada (403/409) | integration | `npx vitest run src/review-server.test.js` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | APRV-03 | T-04-{tampering} | Payload de aprovação com id não elegível é rejeitado no backend (subset check, nunca confiar no cliente) | integration | `npx vitest run src/review-server.test.js` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | APRV-04 | — | `executeApprovedWrite({ dryRun: true })` nunca chama API real; Metafield de teste inalterado antes/depois | unit + smoke | `npx vitest run src/review/write-executor.test.js` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/review/review-queue.test.js` — covers APRV-01 (D-22/D-23 set-based "changed" comparison)
- [ ] `src/review/diff.test.js` — covers APRV-01/APRV-02 (D-19/D-20/D-21 backfill via recomputation)
- [ ] `src/review/approval-gate.test.js` — covers APRV-03 (`assertApproved` pure function)
- [ ] `src/review/write-executor.test.js` — covers APRV-03/APRV-04 (dry-run seam)
- [ ] `src/review-server.test.js` — covers APRV-02/APRV-03 end-to-end via native `fetch()` against an ephemeral port
- [ ] Fixture with `fabric_tag_canonical` populated for at least a few test products — required to exercise the non-empty diff/curation path (today 0/645 real products have fabric tag filled, D-16; without this, all integration tests hit the "empty queue" path only)

---

## Manual-Only Verifications

*All phase behaviors have automated verification.* SC#4 (dry-run leaves the store untouched) additionally has a real-read smoke check via the existing `getMetafields` (PLAT-05) against the test product used in Phase 1/2 — automated, not manual, but worth flagging since it is the one check that touches the live Nuvemshop API rather than only local SQLite/HTTP.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
