# Architecture Research

**Domain:** E-commerce catalog automation bot (Nuvemshop product-recommendation engine, rules-based, human-approved writes)
**Researched:** 2026-07-08
**Confidence:** MEDIUM-HIGH (Nuvemshop public API contract and rate-limit numbers are HIGH confidence, verified against official docs; NubeSDK storefront-rendering mechanics are MEDIUM confidence — official docs are sparse on some specifics and the project's own sibling app is the strongest evidence)

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                         CLOUD (scheduled + on-demand)                │
├──────────────────────────────────────────────────────────────────────┤
│  ┌───────────────┐   ┌────────────────┐   ┌──────────────────────┐  │
│  │  Scheduler /   │──▶│  Ingestion     │──▶│   Rules Engine        │  │
│  │  Orchestrator  │   │  Layer         │   │   (deterministic)     │  │
│  │  (daily cron)  │   │  (GET catalog, │   │   color+tecido+stock  │  │
│  └───────┬────────┘   │   stock, cur-  │   │   → up to 8 recs      │  │
│          │            │   rent recs)   │   └──────────┬────────────┘  │
│          │            └────────────────┘              │               │
│          │                                             ▼               │
│          │                                  ┌──────────────────────┐  │
│          │                                  │  Diff / Preview       │  │
│          │                                  │  Generator             │  │
│          │                                  │  (old vs new recs)     │  │
│          │                                  └──────────┬────────────┘  │
│          │                                             ▼               │
│          │                                  ┌──────────────────────┐  │
│          └─────────────────────────────────▶│  State Store           │  │
│                                              │  (snapshots, audit,    │  │
│                                              │   approvals, rollback) │  │
│                                              └──────────┬────────────┘  │
│                                                          │               │
│                                              ┌──────────▼────────────┐  │
│                                              │  Approval Web Panel    │  │
│                                              │  (human reviews diff,  │  │
│                                              │   clicks Approve)      │  │
│                                              └──────────┬────────────┘  │
│                                                          │ approved     │
│                                              ┌──────────▼────────────┐  │
│                                              │  Metafields Writer     │  │
│                                              │  (throttled PUT/POST   │  │
│                                              │   to public API)       │  │
│                                              └──────────┬────────────┘  │
└─────────────────────────────────────────────────────────┼──────────────┘
                                                            │ writes
                                                            ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         NUVEMSHOP PLATFORM                            │
│  ┌────────────────────┐            ┌──────────────────────────────┐  │
│  │  Product Metafields │◀───────────┤  Public API (App Sob Medida  │  │
│  │  (namespace: recs)  │            │  or Partners — either works) │  │
│  └──────────┬──────────┘            └──────────────────────────────┘  │
│             │ read at render time                                     │
│             ▼                                                          │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  Storefront (browser, product page)                             │  │
│  │  ┌──────────────────────────────────────────────────────────┐  │  │
│  │  │  NubeSDK Script (Partners app, write_scripts + NubeSDK)   │  │  │
│  │  │  runs in Web Worker sandbox → fetch() metafield data      │  │  │
│  │  │  → nube.render() into UI Slot → custom "Recomendados"     │  │  │
│  │  │  block, replacing/coexisting with native block             │  │  │
│  │  └──────────────────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|-------------------------|
| Scheduler/Orchestrator | Triggers the daily snapshot job, coordinates the pipeline stages, owns retry/failure alerting | GitHub Actions scheduled workflow (`schedule: cron`) or hosted cron (Railway/Render cron job) calling a single entrypoint script |
| Ingestion Layer | Reads catalog, stock, tags, and current metafield state from Nuvemshop public API; normalizes into internal domain model | Paginated `GET /products` client with `updated_at_min` support for incremental runs, wrapped in a rate-limit-aware HTTP client |
| Rules Engine | Pure function(s): given normalized catalog state, compute up to 8 recommended product IDs per product (same color + same tecido tag + `has_stock`, ranked by giro) | Deterministic, no I/O — takes a snapshot in, returns a snapshot out; fully unit-testable |
| Diff/Preview Generator | Compares newly computed recommendations against the last approved/written state; produces a human-readable before/after per product | Pure function over two snapshots (previous vs candidate), output consumed by the approval panel |
| State Store | Persists snapshots (catalog + computed recs), approval decisions, audit log, and last-written-to-Nuvemshop state for rollback | Managed Postgres (Supabase/Neon/Railway) or even SQLite/flat JSON if traffic is low — durability and queryability matter more than scale here |
| Approval Web Panel | Human-facing UI: shows diff, accepts/rejects per-product or in bulk, triggers the write phase only on explicit approval | Small server-rendered or SPA app (Next.js/Remix/Flask+HTMX) reading from the State Store, calling an internal "approve" endpoint that unlocks the writer |
| Metafields Writer | Takes an approved snapshot, performs throttled writes to Nuvemshop Metafields via public API, records what was written for rollback | Queue-based client respecting `x-rate-limit-remaining`/`x-rate-limit-reset` headers, idempotent per-product writes |
| NubeSDK Storefront Script | Runs client-side in the shopper's browser on the product page; reads the product's metafield value and renders the custom "Recomendados" block into a UI Slot | Bundled JS (per NubeSDK build tooling), registered via Partners app with `Uses Nube SDK` flag enabled and `write_scripts` scope granted |

## Recommended Project Structure

```
src/
├── ingestion/              # Reads Nuvemshop public API (catalog, stock, current metafields)
│   ├── nuvemshop-client.ts # Thin HTTP client: auth header, base URL, pagination helper
│   ├── rate-limiter.ts     # Leaky-bucket-aware throttle wrapper shared by ingestion + writer
│   └── catalog-sync.ts     # Orchestrates paginated GET /products → normalized snapshot
├── rules-engine/            # Pure, deterministic, no I/O
│   ├── match-rules.ts       # color + tecido tag + has_stock filter
│   ├── ranking.ts           # giro-based priority among eligible candidates
│   └── compute-recommendations.ts  # snapshot in → recommendations-per-product out
├── diffing/
│   └── build-diff.ts        # previous snapshot vs candidate snapshot → human-readable diff
├── writer/
│   ├── metafields-writer.ts # throttled PUT/POST to /metafields, idempotent per product
│   └── rollback.ts          # restores previous metafield values from state store
├── state/
│   ├── schema.ts             # snapshot, approval, audit-log table/collection definitions
│   └── repository.ts         # read/write access to the State Store
├── approval-panel/           # Web UI + its own thin backend
│   ├── routes/
│   └── views/
├── orchestrator/
│   └── daily-job.ts          # entrypoint invoked by scheduler; wires ingestion → rules → diff → (wait for approval) → writer
└── storefront-script/        # Separate build target — NubeSDK app, ships independently
    ├── app.ts                # App(nube: NubeSDK) entrypoint
    └── render-recommendations.ts
```

### Structure Rationale

- **`rules-engine/` has zero dependencies on Nuvemshop, HTTP, or the database.** This is the highest-leverage boundary in the whole system: keeping it pure means it can be unit-tested with fixture catalogs and reused unchanged if the platform (or its API) ever changes.
- **`ingestion/` and `writer/` share the rate-limiter** because both consume the same per-store bucket — a single shared throttle prevents the read phase and write phase from fighting over budget if they ever run concurrently.
- **`storefront-script/` is a separate build target/deploy artifact**, not part of the backend deploy. It ships to the Nuvemshop Partners app dashboard independently of the daily job's cloud deployment — different runtime (browser Web Worker) and different release cadence (changes rarely once stable).
- **`approval-panel/` reads from the State Store, never directly from Nuvemshop.** This keeps the panel fast and avoids burning API budget on page views; only the writer talks to Nuvemshop for writes, only the ingestion layer talks to it for reads.

## Architectural Patterns

### Pattern 1: Snapshot-and-Diff (not incremental mutation)

**What:** Each daily run computes a full desired-state snapshot (recommendations for all 592 products) from scratch via the rules engine, rather than incrementally patching prior state. The diff against the last-written state is computed afterward, purely for human review and for minimizing writes.
**When to use:** Whenever the source of truth (stock, color, tecido tags) can change in ways that invalidate previously-valid recommendations (a product selling out invalidates it as a candidate everywhere it was recommended) — recomputing from scratch is simpler and more correct than tracking cascading invalidations.
**Trade-offs:** Slightly more read work per run (full catalog scan) in exchange for eliminating an entire class of "stale invalidation" bugs. At 592 products this cost is negligible.

### Pattern 2: Compute/Write Split with Approval Gate

**What:** The rules engine and diff generator never call the Nuvemshop write API directly. They write their output to the State Store. A separate Metafields Writer component is the only thing with write credentials, and it only activates on an explicit "approved" record.
**When to use:** Any pipeline where a human-in-the-loop gate is a hard requirement (as it is here — "nenhuma escrita na loja sem aprovação humana prévia").
**Trade-offs:** Adds one more component and one more state transition to track, but makes the "no write without approval" constraint structurally enforced rather than convention-based — the writer literally cannot run without reading an `approved=true` row.

**Example:**
```typescript
// orchestrator/daily-job.ts
const snapshot = await computeRecommendations(await syncCatalog());
const diff = buildDiff(await stateStore.getLastApproved(), snapshot);
await stateStore.savePendingSnapshot(snapshot, diff); // panel picks this up
// writer only runs later, triggered by approval-panel action, not by this job
```

### Pattern 3: Metafields as an Integration Buffer

**What:** The rules engine never writes to the platform's native, unwritable field. It writes its own computed data into a namespaced Metafield (e.g. `namespace: "recomendados"`, `key: "related_ids"`, value = JSON-encoded array of up to 8 product IDs + metadata like computed-at timestamp). The storefront Script is the only consumer of that data, and it renders it into the page independently of any native platform rendering.
**When to use:** Whenever the "real" field you want to control is locked behind session-only/internal APIs, but the platform exposes a general-purpose key-value extension mechanism through the public API.
**Trade-offs:** You now own rendering (the native block's HTML/CSS you don't control), but you gain a fully public-API-driven write path with no dependency on undocumented internal endpoints. This is the correct trade for this project given the field is confirmed unwritable any other way.

## Data Flow

### Daily Snapshot Flow (the primary flow)

```
Scheduler triggers daily-job
    ↓
Ingestion Layer: GET /products (paginated, throttled)
    ↓ normalized catalog+stock+tags snapshot
Rules Engine: pure function, no I/O
    ↓ candidate recommendations per product (≤8 each)
Diff Generator: compare vs last-approved snapshot
    ↓ before/after diff persisted
State Store: pending snapshot + diff saved, status = "awaiting_approval"
    ↓ (async — human in the loop)
Approval Web Panel: human reviews diff, clicks Approve
    ↓ status = "approved", triggers writer
Metafields Writer: throttled PUT/POST per product to /metafields
    ↓ writes recorded (old value + new value) for rollback
State Store: status = "written", audit log entry created
    ↓ (async — shopper visits storefront, any time later)
Storefront (browser): product page loads
    ↓
NubeSDK Script: fetch() metafield value for this product (or pre-resolved via app backend)
    ↓
nube.render() into UI Slot → custom Recomendados block displayed
```

### Rollback Flow

```
Human/operator selects "rollback" for a run in the panel
    ↓
State Store: read previous metafield values recorded at write time
    ↓
Metafields Writer: throttled PUT restoring previous values (same throttle path as forward writes)
    ↓
Audit log: rollback event recorded (who, when, which run)
```

### Key Data Flows

1. **Read path (ingestion → rules engine):** One-directional, pull-based, runs once daily (plus optional on-demand re-runs from the panel). No writes to Nuvemshop happen in this path.
2. **Approval path (state store ↔ panel):** Bidirectional but entirely internal — panel reads pending snapshots/diffs from the state store and writes back an approval decision. Nuvemshop is never touched here.
3. **Write path (writer → Nuvemshop Metafields):** One-directional, push-based, gated by approval, throttled. This is the only path with write credentials to the platform.
4. **Render path (storefront script → Metafields → DOM):** Fully decoupled in time from the write path — happens whenever a shopper loads a product page, potentially hours/days after the snapshot was written. The script must fetch fresh metafield data per page load (or per session-cache with a short TTL) rather than assuming it has current data baked in.

## Storefront Script: Constraints and Patterns (NubeSDK)

This is the highest-uncertainty component in the architecture and deserves explicit documentation of what is confirmed vs. what needs validation during build.

**Confirmed from official docs:**
- NubeSDK apps run inside an isolated **Web Worker sandbox** — there is **no direct DOM access**. You cannot `document.querySelector` the native "Produtos Relacionados" block and mutate it directly.
- Rendering happens via `nube.render(slotName, component)` into **predefined UI Slots** — fixed, named insertion points (e.g. `after_product_detail_name`, `before_product_detail_add_to_cart`, `after_product_detail_add_to_cart`). There is currently no evidence of a slot specifically named for "related/recommended products" — the block will need to be rendered into one of the generic product-detail-page slots (most likely `after_product_detail_add_to_cart` or `after_product_detail_name`), not literally injected into the native recommendations DOM location.
- Available browser-adjacent APIs are exposed through `nube.getBrowserAPIs()`: `fetch` (native), `asyncLocalStorage`/`asyncSessionStorage` with TTL support, `navigate`, `scrollTo`, iframe messaging, form submit/reset. **No documented bundle-size or execution-time limit** — this should be treated as an open question to validate empirically (keep the bundle small and dependency-free regardless, since Web Worker cold-start latency directly delays recommendation render).
- NubeSDK was originally Patagonia-theme-only; more recent updates indicate broader theme support. **Confirm Talgui's active theme supports NubeSDK before committing to this path** — this is a build-order-critical validation, not just a nice-to-have.
- Product-detail-page LS data (classic script context) exposes only `id, name, tags, requires_shipping` and variants — **no metafield values** are pushed into page context for free. The script must actively `fetch()` the metafield value (either directly from the public API with a scoped/public-readable token, or from a small backend proxy endpoint the app maintains) rather than expecting it pre-embedded.

**Practical implication — "replacing" the native block:**
Because there is no DOM access, "replacing" the native "Produtos Relacionados" block is not literally possible from a NubeSDK script alone. The realistic pattern (and the one consistent with what the sibling project already does in production) is:
1. Render the custom block into an available UI Slot near the product info (visually adjacent to or below where the native block would appear).
2. Separately, ensure the **native block itself is empty/suppressed** — since the native `alternative_products`/`complementary_products` fields are never written by this system (confirmed unwritable via public API), the native block will simply render nothing if the store's theme only shows it when populated. If Talgui's theme renders an empty-state placeholder even with no native data, that placeholder may need separate theme-level CSS suppression (a one-time manual theme edit, not part of the automated pipeline) — flag this as a build-time validation step, not an assumption.
3. Treat "coexists with" as the default expectation and "replaces" as something to verify empirically once the first Script version is live on a test product.

**Performance pattern:** Cache the fetched metafield value in `asyncSessionStorage` with a short TTL (e.g. 5-15 minutes) so repeat page views / navigation within a session don't re-fetch on every render — the daily-batch nature of the data (recomputed once per day) means aggressive client-side caching is safe and reduces both latency and any incidental API load from the storefront side.

## Rate-Limit Handling Strategy (concrete)

**Confirmed numbers (Nuvemshop official docs):**
- Base tier: leaky bucket, 2 requests/second sustained, 40-request burst bucket.
- **Nuvemshop plan Next (Talgui's plan) multiplies this by 10x: 20 requests/second sustained, 400-request burst bucket.** This is a materially better budget than the "2 req/s, buffer 40" stated as a constraint in PROJECT.md — treat that figure as a safe conservative floor, but design the throttle to read the actual limit from response headers rather than hard-coding either number.
- Rate limit is tracked per store+app via response headers: `x-rate-limit-limit`, `x-rate-limit-remaining`, `x-rate-limit-reset`. On `429`, back off until the bucket refills (use `x-rate-limit-reset`, which is milliseconds until empty).
- **No bulk/batch metafields endpoint exists** — every metafield write is one HTTP request (`POST /metafields` or `PUT /metafields/{id}`) for one product. There is no way to write recommendations for multiple products in a single call.

**Concrete math for the daily job:**
- **Read phase:** `GET /products` is paginated (default 30/page, expect higher `per_page` to be configurable — confirm exact max during build, but even at 30/page, 592 products = ~20 requests). Trivial relative to budget either tier.
- **Write phase:** 592 products × 1 metafield write each = 592 requests minimum (assuming one JSON-encoded metafield holds the full recommendation list per product, not one metafield per recommended item — this is the correct design choice specifically to minimize request count).
  - At the conservative base tier (2 req/s): 592 requests ≈ 5 minutes of sustained writing, well within any reasonable daily batch window.
  - At the actual Next-plan tier (20 req/s): 592 requests ≈ 30 seconds.
- **Conclusion: rate limit is not a binding constraint for a once-daily batch of 592 products under either tier.** The engineering requirement is not "how do we fit under the limit" but "throttle correctly so we never burst past it and never need aggressive backoff logic."

**Implementation pattern:**
- A single shared token-bucket/leaky-bucket client wrapping all Nuvemshop API calls (both ingestion reads and metafield writes), configured conservatively (e.g. target 1.5-1.8 req/s effective, ignoring the 10x multiplier as a safety margin unless/until it's empirically confirmed live) so the same code works correctly regardless of which plan-tier limit is actually in effect.
- Read `x-rate-limit-remaining` after each response; if it drops near zero, proactively pause rather than waiting for a 429.
- On 429 (should be rare to never with proactive throttling), exponential backoff reading `x-rate-limit-reset`.
- Because 592 sequential writes at ~1.5-2 req/s only takes minutes, there is no need for parallel/concurrent write workers — a simple sequential queue is sufficient and avoids the added complexity (and rate-limit-header-race-conditions) of concurrent throttled writers.

## Suggested Build Order

Dependencies between components dictate this order — each phase should produce something independently testable before the next depends on it.

1. **Nuvemshop API client + rate limiter (foundation).** Must exist before anything else — every other component either reads through it or writes through it. Validate against the real store early (read-only calls) to confirm actual observed rate-limit headers/tier.
2. **Ingestion layer (catalog/stock/tags/current-metafields reader).** Depends on (1). Should be independently runnable and produce a normalized snapshot as a file/DB record, decoupled from everything downstream — this lets the rules engine be developed against real fixture data before the rest of the pipeline exists.
3. **Rules engine (pure, deterministic).** Depends on (2)'s output shape, not on (2) itself running live — can be built and unit-tested entirely against fixture snapshots in parallel with (2). This is the highest-value component to get right early since it's the core business logic and the most testable in isolation.
4. **Tag standardization/cleanup pass.** PROJECT.md flags this as a data-quality prerequisite for the rules engine to produce correct results (consistent tecido tags). This should happen once real catalog data is visible from (2), before (3)'s output is trusted for real decisions — likely a one-time cleanup script plus validation logic embedded in ingestion.
5. **State store + diff generator.** Depends on (3)'s output shape. Needed before the approval panel can display anything meaningful.
6. **Approval web panel (read-only diff viewer first, approval action second).** Depends on (5). Can be built and demoed with the panel showing real computed diffs long before any write capability exists — this is a natural internal milestone/demo point.
7. **Metafields writer (throttled, idempotent, with rollback recording).** Depends on (1) for the client, (5) for state to read approval status from and write audit/rollback data to. This is the first component that touches production data — build it last among the backend components and test extensively against a single test product before enabling it for the full catalog.
8. **Nuvemshop Partners app registration (write_scripts + NubeSDK) — in parallel track.** This can and should start early as its own validation track, independent of (1)-(7): confirm Talgui's theme supports NubeSDK, confirm the Partners app can register a script with the NubeSDK flag, and get a "hello world" script rendering into a UI Slot on a real product page. This de-risks the highest-uncertainty component of the whole architecture (see the Storefront Script section above) without blocking the backend pipeline's progress.
9. **Storefront script — real implementation (reads metafields, renders recommendations block).** Depends on (7) having written real metafield data to at least one test product, and (8)'s "hello world" validation being complete. This is necessarily late in the build order since it's the only component that depends on both halves of the architecture (data written by the backend, rendering mechanism validated on the platform) being proven independently first.
10. **Scheduler/orchestrator wiring + cloud deployment.** Wires (1)-(7) into a single daily-triggered entrypoint (GitHub Actions or hosted cron) with failure alerting. This should be one of the last steps since it's pure integration of already-proven components — doing it earlier risks debugging pipeline logic and infrastructure simultaneously.
11. **Rollback + audit log validation.** Technically implemented as part of (5)/(7), but should get a dedicated end-to-end test pass at the end: write → verify → rollback → verify restored, on a real (test) product, before the system is trusted to run unattended daily.

**Critical path note:** Steps 3 (rules engine) and 8 (NubeSDK validation) can run fully in parallel and should — they are the two components with the most inherent uncertainty (business logic correctness vs. platform capability), and validating both early means the late-stage integration steps (9-11) aren't blocked discovering fundamental problems in either.

## Anti-Patterns

### Anti-Pattern 1: Writing to Nuvemshop directly from the rules engine

**What people do:** Combine computation and writing into a single script/function for simplicity — "compute recommendations, then loop over products and PUT the metafield."
**Why it's wrong:** Violates the hard "no write without human approval" constraint, makes dry-run mode an afterthought instead of the default, and makes the rules engine untestable in isolation (every test run risks touching the real store).
**Do this instead:** Keep the rules engine pure (snapshot in, snapshot out, no network calls) and route all output through the State Store, with the Metafields Writer as the sole, separately-gated consumer of approved snapshots.

### Anti-Pattern 2: Treating the native "Produtos Relacionados" field as eventually writable

**What people do:** Design the system with a fallback path or migration plan "in case we find a way to write the native field later" (e.g. leaving hooks for a future admin-session-based writer).
**Why it's wrong:** This has already been definitively ruled out (confirmed via network inspection + live API tests documented in PROJECT.md) — the native field is written exclusively via an internal, session-authenticated, non-API endpoint. Building around an assumption that this might become writable is speculative engineering against a closed door; it also risks accidentally depending on undocumented internal endpoints that Nuvemshop can change without notice (unlike the versioned public API).
**Do this instead:** Fully commit to the Metafields + Script architecture as the permanent design, not a workaround. Treat the native field as permanently out of reach for this integration model.

### Anti-Pattern 3: Assuming the storefront script has full DOM control like a classic Script

**What people do:** Design the rendering logic assuming `document.querySelector` access to find and replace the native recommendations block, based on familiarity with classic (pre-NubeSDK) Nuvemshop scripts which do have direct DOM access.
**Why it's wrong:** NubeSDK scripts run in a Web Worker sandbox with explicitly **no DOM access** — this is a deliberate security boundary, not a temporary limitation. Code written assuming DOM access will simply not run.
**Do this instead:** Design the rendering component around `nube.render()` into a named UI Slot from the start. Validate early (build-order step 8) which slot is visually appropriate and whether the native block needs separate theme-level suppression.

### Anti-Pattern 4: Per-recommended-item metafield writes

**What people do:** Model the data as one metafield per recommended product (e.g. `rec_1`, `rec_2`, ... `rec_8`) instead of one JSON-encoded metafield per source product.
**Why it's wrong:** With no bulk metafield endpoint, this multiplies write-phase API calls by up to 8x (up to ~4,700 requests instead of 592) for zero benefit, and complicates the storefront script's read logic (multiple fetches instead of one).
**Do this instead:** Store the full recommendation list as a single JSON-encoded value in one metafield per product (e.g. `namespace: recomendados`, `key: related_ids`, `value: '[{"id":123,"order":1},...]'`). This is also the pattern Nuvemshop's own native field uses internally, confirmed by the PATCH payload structure documented in PROJECT.md.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|----------------------|-------|
| Nuvemshop Public API (App Sob Medida or Partners token) | REST, `Authorization: Bearer`, throttled client | Used for both reads (catalog/stock/tags) and writes (metafields). Either app model works for this half — Partners is required only because of the Script requirement, not because of the API access itself. |
| Nuvemshop Partners Script/NubeSDK registration | Registered via Partners Portal dashboard, not purely API-driven | The script artifact itself is built/bundled locally and uploaded/registered through the Partners app configuration; requires the `Uses Nube SDK` flag explicitly enabled per script or it silently falls back to classic-script behavior and fails. |
| Cloud scheduler (GitHub Actions / hosted cron) | Scheduled trigger calling a single orchestrator entrypoint | Needs secrets management for the Nuvemshop app token and State Store credentials; must alert (e.g. failed workflow notification) on job failure since there's no human watching a terminal. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|----------------|-------|
| Ingestion ↔ Rules Engine | In-process function call or snapshot file/DB record | Prefer persisting the raw snapshot even if in-process, so a given day's computation is reproducible/debuggable after the fact. |
| Rules Engine ↔ State Store | Write-only from rules engine's perspective | Rules engine never reads prior approval state — that's the diff generator's job, keeping the rules engine's only concern "what should recommendations be right now." |
| State Store ↔ Approval Panel | Read (diffs) + write (approval decision) | Panel should never call Nuvemshop directly — it only flips state in the store; the writer component picks up the approved state asynchronously (or is triggered directly by the approval action, either is fine at this scale). |
| State Store ↔ Metafields Writer | Read (approved snapshot) + write (audit/rollback record) | Writer must record the previous metafield value before overwriting, not just the new value — this is what makes rollback possible. |
| Metafields Writer ↔ Storefront Script | Fully decoupled, indirect via Nuvemshop Metafields storage | No direct integration — the script has no knowledge of the writer beyond reading whatever value currently exists in the metafield. This decoupling is intentional and correct; do not introduce a direct dependency (e.g. webhook from writer to script) since the script is stateless per-page-load by design. |

## Sources

- [Overview | DevHub Nuvemshop (NubeSDK)](https://dev.nuvemshop.com.br/en/docs/applications/nube-sdk/overview) — MEDIUM confidence, official docs, sparse on size/perf limits
- [UI Slots | DevHub Nuvemshop](https://dev.nuvemshop.com.br/en/docs/applications/nube-sdk/ui-slots) — HIGH confidence, official docs, specific slot names confirmed
- [First Steps | DevHub Nuvemshop](https://dev.nuvemshop.com.br/en/docs/applications/nube-sdk/first-steps) — MEDIUM confidence, official docs, confirms `Uses Nube SDK` flag requirement
- [Browser APIs | DevHub Nuvemshop](https://dev.nuvemshop.com.br/en/docs/applications/nube-sdk/browser-apis) — MEDIUM confidence, official docs, no documented size/time limits (open question)
- [Scripts | Nuvemshop API](https://tiendanube.github.io/api-documentation/resources/script) — HIGH confidence, official API docs, confirms classic-script DOM access and LS object fields
- [Metafields | Nuvemshop API](https://tiendanube.github.io/api-documentation/resources/metafields) — HIGH confidence for schema/endpoints, MEDIUM for absence-of-bulk-endpoint (confirmed by absence in docs, not explicit negative statement)
- [Getting Started with Nuvemshop API | Nuvemshop API](https://tiendanube.github.io/api-documentation/intro) — HIGH confidence, official docs, confirms 2 req/s base / 40 bucket and 10x multiplier for Next/Evolution plans
- [Product | Nuvemshop API](https://tiendanube.github.io/api-documentation/resources/product) — HIGH confidence, official docs, confirms pagination and variants-included-in-response behavior
- PROJECT.md (this project's own validated findings, 2026-07-08 network-inspection evidence) — HIGH confidence, primary source for the native-field-unwritable conclusion and the sibling-project production validation of write_scripts

---
*Architecture research for: Nuvemshop product-recommendation automation bot*
*Researched: 2026-07-08*
