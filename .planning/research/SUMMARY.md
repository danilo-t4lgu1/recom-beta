# Project Research Summary

**Project:** Recomendados Talgui — deterministic product-recommendation automation for Nuvemshop
**Domain:** E-commerce catalog automation bot (rules-based recommendation engine + human-approval workflow + NubeSDK storefront script)
**Researched:** 2026-07-08
**Confidence:** MEDIUM-HIGH

## Executive Summary

This project is a server-side automation bot for a Nuvemshop (Tiendanube) store: a daily job reads the 592-product catalog, computes up to 8 "recommended" products per product using deterministic rules (same color plus same fabric type plus in-stock, ranked by sales velocity), and after mandatory human approval via a web panel, writes the result into Nuvemshop Product Metafields. A separate NubeSDK storefront script (a Nuvemshop Partners app) fetches that metafield data client-side and renders it into the product page, since the native "Produtos Relacionados" field is confirmed unwritable via any app API. Experts building this class of tool split the system into a pure, I/O-free rules engine; a snapshot/diff layer; an approval-gated writer; and a fully decoupled, sandboxed storefront renderer, exactly the shape recommended across STACK, FEATURES, and ARCHITECTURE research.

The recommended approach is Node.js/TypeScript throughout, with a rate-limit-aware HTTP client shared between reads and writes, SQLite (or flat JSON) for snapshots/audit/rollback, Fastify/Express for the approval panel and a tiny public read endpoint, and critically, the storefront script must be built on NubeSDK, not the legacy raw-script injection API, because Nuvemshop is enforcing a hard deprecation of legacy scripts (new registrations already blocked; full enforcement, including for private apps, from 2026-10-30). This is the single most consequential risk in the project: building on the legacy pattern the sister project uses would work today but break in production a few months after launch with no code-level warning.

The other major risks are architectural/data-quality, not technical-obscurity: (1) NubeSDK's sandboxed Web Worker has no documented slot or DOM access to hide the native related-products block, creating a real risk of two competing "recommended products" sections on the same page; (2) fabric/color tag data is almost certainly inconsistent across 592 hand-tagged products, and since the matching is deliberately deterministic (no AI/ML), tag drift silently produces wrong-but-plausible recommendations rather than errors; (3) stock availability must be read from inventory_levels[], not the deprecated variant.stock, if the store has (or ever gets) multiple locations. All three are addressable with early spikes and explicit design decisions, and none require new technology choices, the fixes are sequencing and validation discipline.

## Key Findings

### Recommended Stack

Node.js 24.x plus TypeScript 5.x is recommended for both the batch job/backend and the NubeSDK script, because Nuvemshop's own official tooling (create-nube-app, nube-sdk packages, tsup) targets Node, and sharing TypeScript types between the engine and the script reduces duplication. A critical architecture finding drives infrastructure shape: the NubeSDK script cannot safely hold a Bearer token (it ships to every visitor's browser inside a Web Worker), so the system needs a small, always-on/serverless public read-only endpoint in addition to the scheduled batch job, not just a cron script.

**Core technologies:**
- Node.js 24.x — runtime shared by batch job, approval panel, and public read API — matches official Nuvemshop tooling
- TypeScript 5.x (strict, esnext target) — required by NubeSDK's own manual-setup docs; shared types across engine and script
- nube-sdk packages plus create-nube-app — the only supported way to ship a 2026-compliant storefront script (legacy Scripts API is being sunset)
- Fastify/Express — backend for the approval panel and the public read endpoint the NubeSDK script calls
- SQLite (better-sqlite3) or flat JSON — snapshots, audit log, rollback history (Metafields API has no built-in version history, so this store is the actual rollback source of truth)
- bottleneck (or hand-rolled leaky-bucket limiter) — shared rate limiter for all Nuvemshop API calls

### Expected Features

Nearly all table-stakes features are already committed in PROJECT.md as Active requirements, this is a case of confirm, don't discover. The rules-based approach deliberately departs from the industry-default (AI/ML personalization) in favor of determinism and auditability, matching the project's explicit constraints.

**Must have (table stakes):**
- Deterministic matching: same color plus same fabric/material plus in-stock only
- Cap on recommendation count (up to 8), ranked by sales velocity/giro among eligible candidates
- Preview/before-vs-after diff before any store write
- Mandatory human approval gate (server-side enforced, not UI-only)
- Dry-run/simulation mode (reuses the diff renderer)
- Pre-write state snapshot plus rollback capability
- Audit/change log
- Daily scheduled re-run with basic failure notification
- Tag/fabric-type standardization pass, run before the rules engine is trusted

**Should have (competitive, v1.x):**
- Bulk approve/reject once daily diff-review volume becomes tedious
- Drift detection mid-cycle (approved-but-unwritten recommendation goes stale, e.g. product sells out)
- Dead-man's-switch heartbeat monitoring (catches a silently-disabled scheduled job, not just errors)
- Tag-quality dashboard flagging likely duplicate/typo tag variants

**Defer (v2+):**
- AI/ML-based recommendations, per-shopper personalization, real-time recomputation — all explicitly out of scope, structurally incompatible with the approval-gate model
- Partial (per-slot) approval, price/size-based matching criteria, seasonality rules, manual pin/override

### Architecture Approach

The system splits cleanly into a cloud-side pipeline (scheduler leads to ingestion leads to pure rules engine leads to diff generator leads to state store leads to approval panel leads to throttled metafields writer) and a fully decoupled storefront half (NubeSDK script running in a browser Web Worker, reading Metafields via a public read endpoint, rendering into a NubeSDK UI Slot). The two halves only interact indirectly through Nuvemshop Metafields storage, there is no direct integration, which is intentional given the script's sandboxed, stateless-per-page-load design.

**Major components:**
1. Ingestion Layer — paginated, rate-limited reads of catalog/stock/tags/current metafields, normalized into a snapshot
2. Rules Engine — pure function, no I/O, deterministic color+fabric+stock filter and velocity ranking (highest-leverage component to keep testable in isolation)
3. Diff/Preview Generator plus State Store — computes before/after diffs and persists snapshots, approvals, and audit history (source of truth for rollback, since Metafields has no version history)
4. Approval Web Panel — human review UI; only component that flips approval state; never talks to Nuvemshop directly
5. Metafields Writer — the sole write-credentialed component, throttled and idempotent, activates only on approved=true
6. NubeSDK Storefront Script — separate build target/deploy artifact; fetches metafield data client-side and renders via nube.render() into a UI Slot

### Critical Pitfalls

1. **Legacy write_scripts/raw-script injection is being deprecated (enforced from 2026-10-30, including private apps)** — build the storefront renderer on NubeSDK from day one; do not reuse the sister project's pattern without confirming its NubeSDK status first.
2. **No NubeSDK slot/DOM access to hide the native "Produtos Relacionados" block** — risk of two competing recommendation sections. Spike early: check the native block's empty-state/fallback behavior and whether the theme exposes a merchant-facing toggle to disable it.
3. **variant.stock is deprecated; multi-location stores need inventory_levels[]** — decide and document what "in stock" means before building the matching rule, and check whether Talgui has multiple locations.
4. **Fabric/color tag inconsistency silently poisons the deterministic matching engine** — because matching is exact by design (no AI/ML), tag drift produces plausible-but-wrong output rather than visible errors. Requires a tag-frequency audit, a canonical taxonomy/mapping table, and an "unmapped tag" review state, not a one-time cleanup.
5. **Preview/production divergence undermines the approval safety net** — dry-run must run the exact same write-path code as production writes (one code path, dry_run flag), not a separately-derived summary; also watch for approval fatigue from daily full-list reviews (diff-only views mitigate this).

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Foundation — API client, rate limiter, and dual spikes
**Rationale:** Every other component depends on the Nuvemshop API client; the two highest-uncertainty items (NubeSDK rendering feasibility and native-block coexistence) must be resolved before committing to the full architecture, and can run in parallel with backend work.
**Delivers:** Rate-limited Nuvemshop API client (shared by reads/writes); a hello-world NubeSDK script registered and rendering in a real UI Slot on a test product; confirmation of native-block empty-state behavior; confirmation of inventory_levels[] vs variant.stock situation for this store.
**Addresses:** Foundation requirement "conexão segura e autenticada, respeitando rate limits" (FEATURES.md)
**Avoids:** Pitfall 1 (legacy script deprecation), Pitfall 2 (native block conflict), Pitfall 3 (stock model), Pitfall 8 (over-trusting sister-project validation)

### Phase 2: Tag/Data Standardization
**Rationale:** PROJECT.md and FEATURES.md both flag this as a hard prerequisite — the rules engine is only as correct as the underlying tag data, and this is the highest-risk-of-silent-failure item in the whole project.
**Delivers:** Tag frequency audit report across all 592 products; canonical fabric/color taxonomy and mapping table; unmapped-tag flag baked into ingestion for ongoing drift detection.
**Addresses:** "Padronização/limpeza das tags de tecido" (explicit PROJECT.md/FEATURES.md requirement)
**Avoids:** Pitfall 6 (tag inconsistency silently poisoning the engine)

### Phase 3: Rules Engine plus Ingestion (can build in parallel with Phase 2 validation)
**Rationale:** Pure, deterministic, and independently unit-testable against fixture data — the core business logic, highest-value to get right early, and does not require Phase 2 to be fully complete to start (can begin against fixtures).
**Delivers:** Ingestion layer producing a normalized catalog+stock+tags snapshot; rules engine computing up to 8 recommendations per product (color+fabric+stock+velocity), snapshot-in/snapshot-out with no I/O.
**Uses:** Node.js/TypeScript, zod for response validation, bottleneck rate limiter (STACK.md)
**Implements:** Ingestion Layer, Rules Engine components (ARCHITECTURE.md)

### Phase 4: State Store, Diff Generator, and Approval Panel (read-only first)
**Rationale:** Depends on Phase 3's output shape; the preview/diff substrate serves both dry-run and the real approval flow, so building it once and reusing it avoids duplicated logic, this is also a natural internal demo milestone before any write capability exists.
**Delivers:** Snapshot/audit/approval schema and persistence (SQLite or flat JSON); diff generator (previous vs candidate snapshot); approval panel showing real computed diffs (approve action can follow once writer exists).
**Addresses:** Preview/before-after diff, dry-run mode, audit trail (FEATURES.md table stakes)

### Phase 5: Metafields Writer plus Rollback
**Rationale:** The first component that touches production data — built last among backend components, after the client, rate limiter, and state store are proven, and tested extensively on one product before enabling for the full catalog.
**Delivers:** Throttled, idempotent metafield writer gated strictly on approved=true; rollback restoring prior snapshot values through the same write path; end-to-end write-verify-rollback-verify test on a real test product.
**Uses:** Metafields Writer pattern (ARCHITECTURE.md Pattern 2 and 3)
**Avoids:** Pitfall 5 (undocumented Metafields limits — test boundary early), Pitfall 7 (preview/production divergence — same code path for dry-run and real writes)

### Phase 6: Storefront Script (real implementation) plus Scheduler/Deployment
**Rationale:** Necessarily late — depends on both halves being independently proven (real metafield data from Phase 5, NubeSDK rendering validated in Phase 1). Scheduler wiring is pure integration of already-proven components and should not be done earlier to avoid debugging pipeline logic and infrastructure simultaneously.
**Delivers:** NubeSDK script reading live metafield data and rendering the Recomendados block (with loading-state design for the native-block flash-of-content issue); GitHub Actions (or hosted cron) daily trigger with failure alerting; full unattended end-to-end run.
**Addresses:** "Scheduled/periodic re-run," "Notification on failure" (FEATURES.md)
**Avoids:** Pitfall 4 (rate-limit exhaustion on unattended full-catalog runs)

### Phase Ordering Rationale

- Foundation-first ordering reflects that the API client and the two highest-uncertainty validations (NubeSDK feasibility, native-block coexistence) block or de-risk everything downstream, PITFALLS.md explicitly calls both out as Phase-1-critical.
- Tag standardization is sequenced before the rules engine is trusted for real decisions, per both FEATURES.md's dependency graph and PITFALLS.md Pitfall 6, this is not optional cleanup, it's a correctness prerequisite.
- The approval panel is built read-only before write capability exists, matching ARCHITECTURE.md's "Compute/Write Split with Approval Gate" pattern, this makes "no write without approval" structurally enforced, not convention-based.
- The Metafields Writer and Storefront Script are deliberately last, since they are the only components that touch production data or ship to real customers, both benefit from every upstream component being independently proven first (ARCHITECTURE.md build order).

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1 (Foundation/NubeSDK spike):** Sparse official docs on Web Worker bundle-size/execution-time limits, unconfirmed whether Talgui's theme supports NubeSDK, and the Oct 2026 deprecation timeline should be re-verified against current DevHub docs at build time — flag for research-phase.
- **Phase 1 (native-block coexistence):** No documented slot/mechanism to hide the native related-products block; requires live experimentation, not just docs reading.
- **Phase 2 (tag standardization):** Domain-specific to Talgui's actual catalog data, not something generic research can resolve — needs a live audit, not deeper doc research.

Phases with standard patterns (skip research-phase):
- **Phase 3 (Rules engine/ingestion):** Standard rate-limited REST client plus pure-function business logic pattern, well-documented in STACK/ARCHITECTURE research.
- **Phase 4 (State store/approval panel):** Standard CRUD plus diff-view pattern, no Nuvemshop-specific unknowns.
- **Phase 5 (Metafields writer):** API contract is HIGH-confidence documented; only the undocumented size/quota limit needs a boundary test, not broader research.
- **Phase 6 (Scheduler):** GitHub Actions cron is a standard, well-documented pattern.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM-HIGH | Nuvemshop/NubeSDK-specific facts sourced directly from official DevHub/API docs (HIGH); general tooling choices (Node version pin, Fastify vs Express, SQLite vs JSON) are opinionated best practice (MEDIUM) |
| Features | MEDIUM | Cross-checked against enterprise merchandising platforms and simple Shopify apps, but this project's exact niche has no single directly-comparable vendor; most Active features are already confirmed in PROJECT.md rather than speculative |
| Architecture | MEDIUM-HIGH | Nuvemshop API contract and rate limits are HIGH confidence (official docs); NubeSDK storefront-rendering mechanics are MEDIUM (docs are sparse on some specifics, sibling project is the strongest evidence but validates a narrower claim than this project needs — see Pitfall 8) |
| Pitfalls | MEDIUM | Official docs surfaced via search rather than a curated docs provider; the Oct 2026 deprecation timeline (the single most consequential finding) was synthesized from search results, not direct WebFetch of the migration guide — must be re-confirmed close to build start |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **NubeSDK deprecation dates and private-app enforcement scope:** re-verify directly against dev.nuvemshop.com.br's current migration guide immediately before Phase 1 starts, this is the single most time-sensitive and consequential claim in the research.
- **Whether Talgui's active theme supports NubeSDK:** unconfirmed — was originally Patagonia-theme-only; must be validated in Phase 1 before committing further build time.
- **Whether the sister project's script is legacy or already NubeSDK-migrated:** must be checked directly, not assumed, before treating it as validation.
- **Actual observed rate-limit tier for Talgui's store+app pair:** the Next-plan 10x-multiplier claim is unverified against live headers; pace conservatively (about 1.5-1.8 req/s) until confirmed empirically.
- **Whether Talgui has multiple sales locations:** determines whether inventory_levels[] aggregation logic is a hard requirement from day one or can be simplified (with periodic re-verification) if genuinely single-location.
- **Undocumented Metafields size/count limits:** no ceiling published; requires a direct boundary test with a real test product before relying on any particular payload size in production.
- **Approval-cadence policy for the daily job** (full re-approval every day vs. auto-apply for low-risk changes like removing an out-of-stock item): explicitly flagged as a stakeholder decision, not an implementation detail — should be resolved during requirements/roadmap discussion, not assumed during planning.

## Sources

### Primary (HIGH confidence)
- dev.nuvemshop.com.br/en/docs/applications/nube-sdk/ (overview, manual-setup, browser-apis, events, script-structure) — NubeSDK architecture, Web Worker sandbox, tooling requirements
- tiendanube.github.io/api-documentation/resources/ (script, metafields, product) — API contracts, rate limits, deprecation notices
- tiendanube.github.io/api-documentation/intro — rate-limit bucket size/leak rate, headers, API versioning
- tiendanube.github.io/api-documentation/guides/multi-inventory/products — variant.stock deprecation, inventory_levels[] structure
- docs.nuvemshop.com.br/help/produtos-relacionados-alternativos-e-complementares — native related-products block is theme Liquid code, default fallback behavior
- github.com/TiendaNube/nube-sdk — monorepo structure, CLI, tooling
- .planning/PROJECT.md — this project's own validated findings (native field unwritable, sister-project production validation)

### Secondary (MEDIUM confidence)
- General merchandising-rules and e-commerce recommendation vendor sources (Nosto, Optimizely, Salesforce B2C, Shopify apps) — feature landscape and competitor comparison
- DevOps rollback/audit-log and cron-monitoring best-practice sources — informed dry-run/rollback/notification feature recommendations
- Node.js/hosting/tooling ecosystem best practices (Node LTS version, Fastify vs Express, SQLite vs flat files) — opinionated judgment, not Nuvemshop-specific

### Tertiary (LOW confidence — needs validation before relying on)
- NubeSDK/legacy-script deprecation exact dates (2026-06-05, 2026-08-30, 2026-10-30) and private-app enforcement scope — synthesized from search results, not direct WebFetch of the migration guide; re-confirm at build start
- "Next/Evolution plan gets 10x rate-limit multiplier" — unverified against Talgui's actual live response headers

---
*Research completed: 2026-07-08*
*Ready for roadmap: yes*
