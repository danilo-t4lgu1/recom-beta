---
phase: 2
slug: ingest-o-de-cat-logo-e-qualidade-de-dados
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-10
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (recommended — não configurado ainda no projeto; leve, ESM-first, compatível com `"type": "module"` já usado em `app-partners-recomendados/package.json`) |
| **Config file** | none — Wave 0 installs |
| **Quick run command** | `npx vitest run src/ingestion/stock-availability.test.js` (a criar) |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5 seconds (lógica pura, sem rede) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run` for the changed pure-logic modules (`stock-availability`, `fabric-taxonomy`)
- **After every plan wave:** Run the real ingestion job against the full "Vestidos" category (628 products) and validate product count, absence of 429s, and correctly populated SQLite schema
- **Before `/gsd-verify-work`:** Full ingestion of "Vestidos" running error-free, with versioned history recorded (D-11) and Metafield baseline read (DATA-02)
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | PLAT-02 | — | Paginated listing respects `per_page`/`Link` header; adaptive throttling reads real headers, never hardcodes a fixed delay | integration | `npx vitest run src/nuvemshop-client` (a criar) | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | DATA-01 | — | "Grade ≥ 3 sizes in stock" (D-04) computed correctly from `inventory_levels[]`, never from deprecated `variant.stock` | unit | `npx vitest run src/ingestion/stock-availability.test.js` (a criar) | ❌ W0 | ⬜ pending |
| 02-01-03 | 01 | 1 | DATA-02 | — | Reading the recommendation Metafield baseline does not throw when a product has no prior recommendation | integration | manual/smoke script reusing `roundtrip-metafield.js` as reference | ❌ W0 | ⬜ pending |
| 02-01-04 | 01 | 1 | DATA-03 | — | Raw→canonical fabric-tag mapping; unmapped tags are excluded silently (D-09), never guessed | unit | `npx vitest run src/ingestion/fabric-taxonomy.test.js` (a criar) | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Install `vitest` (`npm install -D vitest`) — no test framework configured yet in `app-partners-recomendados`
- [ ] `src/db/schema.sql` + `catalog-store.js` wrapper (better-sqlite3) — do not exist yet
- [ ] `data/` directory for the SQLite file — create and confirm it is covered by `.gitignore` (`data/*.db`)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|--------------------|
| Real ingestion run against the live "Vestidos" category completes without a 429 and persists the expected ~628 products | PLAT-02 | Requires live API credentials and real rate-limit behavior — not mockable without losing signal on the adaptive throttler | Run the ingestion job against the real store, inspect `ingestion_runs.status = 'success'` and `products_read` ≈ 628, confirm no 429 in logs |
| `category_id` for "Vestidos" resolves correctly by name via `GET /categories` | PLAT-02 (Pitfall C) | Depends on real store category data, not deterministic without hitting the live API | Run category resolution against the real store, confirm the logged `category_id` matches the category shown in the Nuvemshop admin |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 10s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-10 — confirmed against 02-01/02-02/02-03-PLAN.md by gsd-plan-checker (Dimension 8, checks 8a–8c pass)
