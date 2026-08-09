# Feature Research

**Domain:** E-commerce merchandising automation — rules-based product recommendation engine with human-approval workflow (Nuvemshop "Recomendados" showcase)
**Researched:** 2026-07-08
**Confidence:** MEDIUM (cross-checked web sources on merchandising rules engines, Shopify/Nuvemshop app patterns, PIM data quality, DevOps rollback/audit patterns, and cron monitoring best practices; no single HIGH-confidence primary-vendor doc for this exact "rules engine + approval workflow for a single small catalog" niche — it sits between enterprise merchandising platforms (Nosto, Optimizely, Salesforce B2C) and simple manual-curation Shopify apps, so findings are synthesized/extrapolated from both ends)

## Feature Landscape

### Table Stakes (Users Expect These)

Features the tool doesn't do its job without. This project's PROJECT.md already commits to nearly all of these as Active requirements — they are confirmed, not speculative.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Core matching criteria: same color + same fabric/material type + in-stock only | This is the literal job of the tool per PROJECT.md; enterprise engines (Optimizely, Nosto, Salesforce B2C) all support attribute-based filtering as the baseline before any ranking logic | LOW–MEDIUM | Depends entirely on tag/attribute data quality (see Data Quality section below) — the single biggest risk to this feature working correctly |
| Stock-availability exclusion (out-of-stock hidden automatically) | Universal pattern across every recommendation tool reviewed (Shopify complementary-products, Salesforce TTOOS sorting, Optimizely rules) — an OOS recommendation is the #1 complaint driving this project's existence | LOW | Nuvemshop API exposes `has_stock`/variant stock directly; straightforward filter |
| Sales-velocity / giro-based ranking among eligible candidates | Standard secondary-sort dimension in every merchandising rules engine surveyed (Salesforce blends velocity + age; general pattern: filter first, rank second) | MEDIUM | Requires a velocity metric (units sold / period) — needs sales-history data source, which may not be trivially available from Nuvemshop's product API and could need order-history aggregation |
| Cap on number of recommendations (e.g., max 8) | Universal — every recommendation surface (cross-sell blocks, related-products widgets) caps output; unbounded lists are never shipped | LOW | Simple truncation after ranking |
| Preview / "before vs. after" diff before writing to the store | Standard pattern in every approval-gated system reviewed (content moderation diff views, Shopify bulk editor preview) — required explicitly in PROJECT.md ("painel web de aprovação... preview antes vs depois") | MEDIUM | Must render current recommendations vs. proposed recommendations per product, likely as two lists with visual highlight of adds/removes |
| Mandatory human approval before any store write | Explicit hard constraint in PROJECT.md ("nenhuma escrita na loja sem aprovação humana prévia") — matches content-approval workflow patterns (draft → review → approved states) universally used when automated systems touch production data | MEDIUM | State machine: proposed → pending review → approved/rejected → written; must be enforced server-side, not just UI-level |
| Dry-run / simulation mode | Explicit requirement in PROJECT.md; standard in deployment automation (CI/CD dry-run before apply) | LOW–MEDIUM | Engine computes recommendations without calling any Nuvemshop write endpoint; reuses same preview/diff rendering |
| Pre-write state capture ("snapshot antes de sobrescrever") | Explicit requirement in PROJECT.md; matches universal audit-log pattern (log trigger, timestamp, from-state, to-state before mutating) | MEDIUM | Must snapshot the current Metafield/recommendation state per product immediately before each write, tied to the change being applied |
| Rollback capability | Explicit requirement in PROJECT.md; standard DevOps pattern — rollback restores a prior versioned snapshot | MEDIUM–HIGH | **Depends on snapshot/versioning existing first** (see Dependencies) — cannot roll back what wasn't captured |
| Audit trail / change log | Explicit requirement in PROJECT.md ("log de auditoria"); universal pattern — every rollback-capable system logs trigger, timestamp, actor, from-version, to-version | LOW–MEDIUM | Should record: what changed, when, triggered by (scheduled run vs manual), who approved |
| Scheduled/periodic re-run (daily) | Explicit requirement in PROJECT.md ("snapshot diário automático"); this is the core value proposition — replacing manual curation that decays | MEDIUM | Cloud cron (GitHub Actions schedule or hosted cron) — must handle idempotency (re-running same day shouldn't create duplicate approval requests) |
| Notification on failure | Not yet explicit in PROJECT.md but implied by "roda na nuvem... não depende de máquina pessoal" — universal best practice for any unattended cron job; silent failures in cron jobs commonly go unnoticed for days/weeks per DevOps sources reviewed | LOW | Simplest form: email/webhook on non-zero exit or exception; a "dead man's switch" heartbeat is a differentiator (see below) |
| Basic tag/attribute consistency check before rules run | Explicitly named as an Active requirement in PROJECT.md ("padronização/limpeza das tags de tecido — pré-requisito de qualidade de dados") | MEDIUM–HIGH | This is the highest-risk table-stakes item — fabric-type tags in real fashion catalogs are notoriously inconsistent (typos, synonyms, casing); without normalization the matching criteria silently degrades (see Pitfalls) |

### Differentiators (Competitive Advantage / Valuable Additions)

Not required for the tool to function, but meaningfully improve trust, efficiency, or robustness. Good candidates for v1.x once the MVP loop is validated.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Bulk approve/reject across many products at once | Manual review of 592 products one-by-one is a bottleneck; bulk actions are standard once approval-queue volume is non-trivial (ServiceNow, content-moderation tools all add bulk actions early) | MEDIUM | Natural v1.x add after single-product approval flow works — needs a queue/list UI first |
| Partial approval (approve some recommended slots, reject/edit others within one product) | More granular than accept/reject-whole-set; useful when 7 of 8 recommendations are good but 1 is wrong | MEDIUM–HIGH | Requires per-slot state, not per-product state — adds real complexity to the approval data model; defer until whole-product approve/reject proves insufficient |
| Comments / notes on approval decisions | Useful for a solo operator's own memory ("why did I reject this pairing") and essential if a second reviewer is ever added | LOW | Simple text field attached to the approval-decision record |
| Drift detection mid-cycle (e.g., a product sells out between daily runs, invalidating an already-approved-but-not-yet-applied recommendation) | Protects against the exact failure mode this project exists to prevent — decay between curation cycles | MEDIUM–HIGH | Requires either (a) re-validating approved-but-unapplied changes against fresh stock data immediately before write, or (b) shortening the approval-to-write window; genuinely valuable but adds a second "is this still valid?" check beyond the initial rule computation |
| Price-range matching as an additional criterion | Named in the question as "commonly added later" — confirmed by general merchandising-rules pattern of layering more attributes as the base matching stabilizes | LOW–MEDIUM | Easy to add once color+fabric+stock matching is proven; risk of over-constraining the candidate pool if added too early with only 592 SKUs |
| Size-availability matching (not just "in stock" but "the specific size the viewer likely wants is in stock") | Same "added later" pattern; more sophisticated than binary stock check | MEDIUM–HIGH | Requires variant-level stock reasoning, not product-level — meaningfully harder than the binary has_stock check that's table stakes |
| Seasonality rules (e.g., don't recommend winter coats in a summer-heavy showcase) | Named as a common later addition in enterprise engines (Salesforce blends seasonal applicability) | MEDIUM | Needs either manual seasonal tagging or date-based category rules — low ROI for a 592-SKU single-brand store unless the catalog has strong seasonal splits |
| Dead-man's-switch / heartbeat monitoring (alert if the daily job didn't run at all, not just if it errored) | Stronger guarantee than simple failure-email — catches silent non-execution (e.g., GitHub Actions scheduled workflow silently disabled after 60 days of repo inactivity, a known GH Actions gotcha) | LOW–MEDIUM | Cheap to add (a monitoring service ping) and closes a real gap simple try/catch notification leaves open |
| Rule-override / manual pin (merchandiser forces a specific product into the recommended slot regardless of rules) | Standard "boost" capability in every enterprise merchandising engine reviewed (Optimizely, Nosto) — lets a human override the algorithm for specific business reasons (e.g., promoting a new arrival) | MEDIUM | Valuable but expands scope beyond "rules engine + approval" into "rules engine + approval + manual overrides"; good v2 candidate once trust in the automated baseline is established |
| Multi-format tag-quality dashboard (flag likely-duplicate/typo tag variants for human review, e.g. "algodão" vs "algodao" vs "Algodão") | Directly prevents the core data-quality risk called out in the question; PIM/data-cleansing sources confirm this class of normalization issue (XL/X-Large/Extra Large pattern) is universal in real catalogs | MEDIUM | Differentiator vs. table-stakes "basic normalization" — a dashboard that surfaces likely-inconsistent tags for a human to merge is more robust than a one-time hardcoded cleanup script; strengthens the data-quality requirement over time as new products are tagged inconsistently |
| Versioned diff history (not just latest snapshot, but a scrollable history of prior states) | Enhances audit trail from "what changed last" to "what changed over time" — useful for diagnosing why a recommendation set drifted | LOW–MEDIUM | Natural extension once snapshot-per-write exists; mostly a storage/UI concern, not new logic |

### Anti-Features (Deliberately Avoid)

Features that seem appropriate for this category but conflict with this project's explicit constraints or would create risk disproportionate to value at this scale (592 products, single small store, solo operator).

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|------------------|-------------|
| AI/ML-based recommendation generation (collaborative filtering, embeddings, behavioral personalization) | Every major vendor in this space (Nosto, Optimizely, BigCommerce, Voyado) pushes AI-driven recommendations as the modern default, and it does raise conversion in high-traffic stores | Explicitly out of scope per PROJECT.md — the entire value proposition is a deterministic, auditable, cheap engine; ML recommendations are opaque ("why was this suggested?"), require behavioral data volume this store likely doesn't have, and undermine the human-approval/audit-trail model since ML outputs can't be fully explained to an approver | Deterministic rules (color + fabric + stock + velocity) exactly as scoped; velocity ranking gives "smart-feeling" output without opacity |
| Per-shopper personalization (different recommendations per visitor based on browsing/purchase history) | Natural next step once any recommendation engine exists — "why show the same 8 products to everyone?" | Requires real-time behavioral tracking infrastructure, contradicts the "same recommendations, human-reviewed once per cycle" approval model (you can't pre-approve infinite personalized permutations), and is explicitly excluded by the AI/ML exclusion in PROJECT.md | Keep recommendations product-scoped and identical for all visitors of that product page; this is what makes pre-approval tractable in the first place |
| Real-time/continuous re-computation (recommendations update the instant stock changes, rather than on a daily batch) | Feels more "correct" — why wait a day if a product sells out at 9am? | Breaks the approval workflow entirely (nothing to approve if it writes instantly) and multiplies operational risk/API rate-limit exposure (2 req/s constraint) for marginal benefit on a 592-SKU store; also reintroduces the "no write without human approval" violation | Daily scheduled batch (as scoped) plus the "drift detection" differentiator above to catch major changes (e.g., sell-outs) between cycles without full real-time recomputation |
| Editing the native Nuvemshop theme/Script via App Sob Medida | Seems like the obvious way to change what's displayed | Confirmed technically impossible for this app model — Nuvemshop's custom-app (App Sob Medida) API does not expose Script/theme editing; already resolved via the Partners `write_scripts` architecture decision in PROJECT.md | Already addressed: Partners app injects a Script reading from Metafields, per the validated architecture |
| Fully automatic write without approval, even with a dry-run history proving reliability | Tempting once the system has run correctly for months — "why still review every day?" | Explicitly excluded by PROJECT.md ("toda gravação na loja passa por aprovação prévia") as a permanent constraint, not a bootstrapping phase; removing the gate defeats the auditability goal that justifies choosing a rules engine over AI in the first place | If daily review becomes a burden, reduce review friction (bulk-approve, smart defaults, only surface products with actual diffs) rather than removing the gate |
| General-purpose PIM (full product-information-management suite with enrichment, multi-channel sync, DAM) | Data-quality research strongly recommends full PIM tooling for catalogs with the problems described | Massive overkill for 592 SKUs on a single sales channel; PIM systems are built for multi-supplier, multi-channel catalogs with continuous vendor feeds — this store's tag-quality problem is narrow (fabric-type normalization) and solvable with a targeted cleanup + validation step | Scoped tag-normalization/validation feature only (already in Table Stakes), not a general PIM |

## Feature Dependencies

```
[Basic tag/attribute consistency check]
    └──requires (precedes)──> [Core matching criteria: color+fabric+stock]
                                   └──requires──> [Sales-velocity ranking among eligible candidates]

[Pre-write state capture / snapshot]
    └──requires (precedes)──> [Rollback capability]
                                   └──enhanced by──> [Versioned diff history]

[Preview / before-vs-after diff UI]
    └──requires──> [Mandatory human approval workflow]
                       └──requires──> [Dry-run mode] (dry-run reuses the same diff rendering, no write)
                       └──enhanced by──> [Bulk approve/reject]
                                              └──enhanced by──> [Partial approval]

[Scheduled/periodic re-run]
    └──requires──> [Notification on failure]
                       └──enhanced by──> [Dead-man's-switch heartbeat monitoring]
    └──enhanced by──> [Drift detection mid-cycle]

[Mandatory human approval workflow] ──conflicts──> [Fully automatic write without approval]
[Rules engine (color/fabric/stock/velocity)] ──conflicts──> [AI/ML-based recommendation generation]
[Product-scoped identical recommendations] ──conflicts──> [Per-shopper personalization]
```

### Dependency Notes

- **Tag/attribute consistency check precedes core matching:** the matching criteria (same color, same fabric) is only as reliable as the underlying tag data. If fabric tags contain typos/synonyms/casing variants, the rules engine will silently fail to find valid matches (or over/under-match). This must run — at minimum as a one-time cleanup — before the matching logic is trusted, and ideally as an ongoing validation step so new products don't reintroduce the problem.
- **Snapshot/state-capture precedes rollback:** rollback is meaningless without a prior state to roll back to. The snapshot-before-write step (already scoped in PROJECT.md) is the foundation; rollback is the mechanism that consumes those snapshots. Build snapshot capture first, verify it's reliable, then build rollback on top.
- **Preview/diff UI is the substrate for both dry-run and the approval workflow:** the same "here's what would change" rendering serves dry-run mode (no write happens) and the real approval flow (write happens after approval). Building this once and reusing it for both avoids duplicating diff logic.
- **Bulk approve/reject enhances but does not replace single-item approval:** with 592 products, most daily runs will produce far fewer actual diffs (most products' eligible candidate set won't change day to day). Start with per-product approve/reject; add bulk actions once real usage shows the daily diff-review queue is large enough to be tedious.
- **Notification-on-failure precedes dead-man's-switch:** a heartbeat/dead-man's-switch is a strictly stronger version of "notify on failure" (it also catches the case where the job never ran at all, e.g., a disabled GitHub Actions schedule). Ship basic failure notification first; upgrade to heartbeat monitoring once the scheduled job is stable and worth hardening.
- **Human-approval workflow conflicts with full automation and with AI/ML:** both anti-features are excluded specifically because they're structurally incompatible with the approval-gate + auditability model this project is built around, not just because they're "extra work." Any future feature request that implies "skip the review" or "let the algorithm decide autonomously" should be flagged against this conflict.

## MVP Definition

### Launch With (v1)

Minimum viable product — matches PROJECT.md's Active requirements almost exactly; this is not speculative, it's already scoped.

- [ ] Catalog + stock read (592 products) via Nuvemshop public API — foundation for everything else
- [ ] Tag/fabric-type standardization pass — must happen before the rules engine is trusted
- [ ] Rules engine: up to 8 recommendations, same color + same fabric + in-stock (mandatory), ranked by giro among eligible candidates
- [ ] Preview/diff UI (before vs. after) in the web approval panel
- [ ] Mandatory approval step before any store write
- [ ] Dry-run/simulation mode (reuses diff UI, no write)
- [ ] Pre-write snapshot of prior state
- [ ] Rollback capability
- [ ] Audit/change log
- [ ] Cloud-hosted daily scheduled re-run (GitHub Actions or hosted cron)
- [ ] Basic failure notification on the scheduled job

### Add After Validation (v1.x)

Add once the daily approve/reject loop has run for real and shows where the friction actually is.

- [ ] Bulk approve/reject — trigger: daily diff queue becomes tedious to review one product at a time
- [ ] Comments/notes on approval decisions — trigger: operator wants to remember why a past change was rejected
- [ ] Drift detection mid-cycle — trigger: an approved-but-not-yet-written recommendation goes stale (product sells out) between review and write
- [ ] Dead-man's-switch heartbeat monitoring — trigger: any silent missed run is discovered after the fact
- [ ] Tag-quality dashboard (flag likely duplicate/typo variants) — trigger: new products keep reintroducing inconsistent fabric tags after the initial cleanup

### Future Consideration (v2+)

Defer until the deterministic core is proven reliable and trusted.

- [ ] Partial approval (per-slot accept/reject within one product) — defer: adds real data-model complexity; only worth it if whole-product approve/reject proves too coarse in practice
- [ ] Price-range and size-availability matching criteria — defer: risk of over-constraining an already-small 592-SKU candidate pool; add only if color+fabric+stock matching proves too loose
- [ ] Seasonality rules — defer: unclear ROI for a single-brand store unless the catalog shows strong seasonal splits
- [ ] Manual pin/override (force a specific product into a slot) — defer: expands scope from "automation + approval" into "automation + approval + manual merchandising," a meaningfully different tool
- [ ] Versioned diff history UI (browsable past states, not just latest) — defer: nice-to-have once snapshot/rollback is solid; mostly a UI/storage layer on top of already-captured data

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Tag/fabric normalization (initial pass) | HIGH | MEDIUM | P1 |
| Core rules engine (color+fabric+stock+velocity) | HIGH | MEDIUM | P1 |
| Preview/diff UI | HIGH | MEDIUM | P1 |
| Mandatory approval gate | HIGH | MEDIUM | P1 |
| Dry-run mode | HIGH | LOW | P1 |
| Pre-write snapshot | HIGH | MEDIUM | P1 |
| Rollback | HIGH | MEDIUM-HIGH | P1 |
| Audit log | MEDIUM | LOW-MEDIUM | P1 |
| Daily scheduled re-run | HIGH | MEDIUM | P1 |
| Basic failure notification | MEDIUM | LOW | P1 |
| Bulk approve/reject | MEDIUM | MEDIUM | P2 |
| Drift detection mid-cycle | MEDIUM | MEDIUM-HIGH | P2 |
| Dead-man's-switch monitoring | MEDIUM | LOW-MEDIUM | P2 |
| Comments on approval decisions | LOW | LOW | P2 |
| Tag-quality ongoing dashboard | MEDIUM | MEDIUM | P2 |
| Partial approval | LOW | MEDIUM-HIGH | P3 |
| Price-range / size-availability criteria | LOW | MEDIUM-HIGH | P3 |
| Seasonality rules | LOW | MEDIUM | P3 |
| Manual pin/override | LOW | MEDIUM | P3 |
| AI/ML recommendations | N/A (excluded) | N/A | Anti-feature |
| Per-shopper personalization | N/A (excluded) | N/A | Anti-feature |
| Real-time continuous recomputation | N/A (excluded) | N/A | Anti-feature |

**Priority key:**
- P1: Must have for launch — matches PROJECT.md Active requirements
- P2: Should have, add when v1 usage reveals the need
- P3: Nice to have, future consideration only after core trust is established

## Competitor Feature Analysis

Note: this project's category is a narrow niche (deterministic rules engine + approval workflow for a small single-brand catalog) that sits between two better-documented categories. No single competitor matches exactly; useful reference points from each end:

| Feature | Enterprise merchandising platforms (Nosto, Optimizely, Salesforce B2C) | Simple Shopify manual-curation apps (Manual Related Products, ShopSort) | Our Approach |
|---------|--------------------------------------------------------------------|---------------------------------------------------------------------|--------------|
| Matching logic | ML-personalized by default, with rule-based overrides (boost/bury) layered on top | Fully manual — merchant hand-picks every product's related list, or simple sort-by-attribute (price/stock/sales) | Fully rules-based (no ML default) — color+fabric+stock+velocity, matching the "override rules" tier of enterprise tools but without any ML base layer |
| Approval before publish | None — recommendations go live immediately once rules/ML are configured; merchandiser configures rules, doesn't approve each output | None — manual curation IS the approval (merchant directly sets it, no separate review step) | Distinct approval step between computation and publish — neither reference category has this, because both assume either full automation (enterprise) or full manual control (simple apps); this project needs it because compute is automated but writes must stay human-gated |
| Stock/availability filtering | Standard, real-time (TTOOS-based sorting in Salesforce) | Standard (Shopify complementary products require stock > 0) | Standard — matches both categories |
| Data quality tooling | Assumed to have clean PIM feeding the engine (enterprise-scale catalogs already invest in PIM) | Not addressed — merchant manually curates so bad tags don't propagate automatically | Must build a scoped normalization step ourselves — this store has neither enterprise PIM investment nor the "manual curation catches bad data" safety net, since the whole point is removing manual curation |
| Audit/rollback | Present in enterprise platforms as part of broader change-management, not commonly surfaced as a discrete "rollback my recommendation set" feature | Absent — manual apps have no concept of automated writes to roll back | Must build ourselves — closest analogy is general DevOps rollback/snapshot patterns, not e-commerce-specific tooling |
| Scheduling | Continuous/real-time by default | N/A (manual, no schedule) | Daily batch — deliberately less frequent than enterprise real-time, because the approval gate makes continuous recomputation incompatible with human review |

## Sources

- [Boost Sales with Personalized Product Recommendations — FastSimon](https://www.fastsimon.com/ecommerce-wiki/merchandising/why-product-recommendations-also-require-merchandising-rules/)
- [Optimizely Product Recommendations docs](https://webhelp.optimizely.com/latest/en/personalization/product-recommendations.htm)
- [Merchandising rules for Product Recommendations — Nosto](https://www.nosto.com/blog/whats-new-in-nosto-merchandising-rules-for-product-recommendations/)
- [LC Manual Related Products — Shopify App Store](https://apps.shopify.com/related-products-app)
- [Shopify Help Center: Customize product recommendations with Search & Discovery](https://help.shopify.com/en/manual/online-store/storefront-search/search-and-discovery-recommendations)
- [ShopSort — Visual merchandising, smart sorting, scheduling — Shopify App Store](https://apps.shopify.com/shopsort)
- [Manual Product Classification & Attribute Normalization — Semantico](https://semantico.ai/blog/manual-product-classification-and-attribute-normalization-the-hidden-pain-for-multi-brand/)
- [Product Data Cleansing for Ecommerce — Lasso](https://productlasso.com/en/blog/product-data-cleansing-enrichment-normalization)
- [Automating Data Cleansing and Normalization: Best Practices — Retail Taxonomy](https://retailtaxonomy.com/blog/automating-data-cleansing-and-normalization-best-practices/)
- [How to Create Rollback Automation — OneUptime](https://oneuptime.com/blog/post/2026-01-30-rollback-automation/view)
- [Power Automate Flow Version History — Rollback and Restore Guide](https://alphavima.com/blog/power-automate-flow-version-history/)
- [Handling Rollback Strategies for Failed Product Deployments — Agileseekers](https://agileseekers.com/blog/handling-rollback-strategies-for-failed-product-deployments)
- [Rule-Based vs. AI-Powered Recommendation — BoostCommerce](https://blog.boostcommerce.net/posts/rule-based-ai-powered-recommendation)
- [AI for Product Recommendations — Voyado](https://voyado.com/resources/blog/ai-for-product-recommendations/)
- [How to Monitor Cron Jobs and Get Notified on Failures — DEV Community](https://dev.to/hexshift/how-to-monitor-cron-jobs-and-get-notified-on-failures-automatically-4loa)
- [Cron Job Monitoring — Cronitor](https://cronitor.io/cron-job-monitoring)
- [Hello cron job monitoring & alerts, goodbye silent failures — Papertrail](https://www.papertrail.com/blog/cron-job-monitoring-and-alerts/)
- [Active Merchandising Scenarios — Salesforce B2C Commerce Cloud docs](https://documentation.b2c.commercecloud.salesforce.com/DOC1/topic/com.demandware.dochelp/content/b2c_commerce/topics/active_merchandising/b2c_active_merchandising_scenarios.html)
- [Optimize Product Sorting Strategies — Salesforce Trailhead](https://trailhead.salesforce.com/content/learn/modules/b2c-storefront-sorting-rules/b2c-sorting-rule-strategies)
- [Content moderation — Drupal.org](https://www.drupal.org/project/content_moderation)
- [UI Action for bulk Approval/Reject — ServiceNow Community](https://www.servicenow.com/community/itsm-forum/ui-action-for-bulk-approval-reject-in-approval-table/td-p/659712)
- Project context: `.planning/PROJECT.md` (Talgui project scope, constraints, and already-validated architecture decisions)

---
*Feature research for: E-commerce merchandising automation (rules-based recommendation engine + approval workflow)*
*Researched: 2026-07-08*
