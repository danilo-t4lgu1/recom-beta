# Pitfalls Research

**Domain:** Nuvemshop/Tiendanube Partners app integration — automated product-recommendation writer (script injection + Metafields + scheduled scan) on a live production storefront
**Researched:** 2026-07-08
**Confidence:** MEDIUM overall (official first-party docs — dev.nuvemshop.com.br, dev.tiendanube.com, tiendanube.github.io — surfaced via web search rather than a curated/cached docs provider, so the mechanical confidence tag is LOW-on-single-source / MEDIUM-on-cross-checked; treat platform-quirk claims as "verify against this store's live API responses before relying on them," not as gospel)

## Critical Pitfalls

### Pitfall 1: Building on the write_scripts/legacy-script path that is being actively deprecated (2026-10-30)

**What goes wrong:**
The project's validated architecture uses a Partners app with `write_scripts` scope to inject a JS file into the storefront (legacy `Script` resource: `event: onload|onfirstinteraction`, `src`, `location`). Nuvemshop has published a hard deprecation timeline for this model — and critically, **it applies to private/unlisted apps too, not just apps in the public app store**:
- **2026-06-05** — NubeSDK became mandatory for homologation (new homologation requests rejected without SDK compliance).
- **2026-08-30** — new installations blocked for apps not built with NubeSDK.
- **2026-10-30** — progressive deprecation and uninstallation begins; Nuvemshop's own docs state this is enforced "via front-end (systemic blocking)" for private apps that inject scripts, independent of the homologation process. Nuvemshop recommends an alternative app to affected merchants at this point.
- The legacy Script public-API endpoints have already been updated to **stop registering new scripts** per official docs ("The legacy scripts endpoints in the Public API were updated and will not register scripts anymore").

If this project ships on the legacy `write_scripts` model without a NubeSDK migration plan, the storefront-facing recommendation block **will stop rendering** sometime around Oct 2026 with no advance code-level warning beyond Nuvemshop's own comms — this is a live production store, so the customer-facing symptom is recommendations silently disappearing (reverting to the native/default block, or nothing).

**Why it happens:**
The sister/parallel project (vitrine ordering automation) that "already validates this in production" was very likely built before this policy was finalized or communicated widely, and Partners-app documentation for the legacy Script resource is still live and discoverable, making it easy to assume the pattern is still fully supported. Teams anchor on "it works today" without checking platform roadmap communications, which for Nuvemshop currently live in the DevHub migration guide, not in the base API reference most devs read first.

**How to avoid:**
- Confirm during Phase 1 (Foundation) whether the sister project's script has already been migrated to NubeSDK, or is still legacy — do not assume it is safe just because it is "in production now."
- Treat NubeSDK as the target architecture from day one, not a future migration. Build the storefront-rendering component using NubeSDK's UI Slots + `nube.render()` model, not raw `document.write`/DOM injection via a legacy script tag.
- If NubeSDK cannot deliver the required UX at project start (see Pitfall 2), explicitly budget a mid-project migration phase before 2026-10-30, and communicate this risk to the stakeholder now — it is a hard external deadline outside the project's control.
- Re-verify the deprecation dates directly against `https://dev.nuvemshop.com.br/en/docs/applications/nube-sdk/overview` and the migration guide close to the actual build date, since specifics could shift.

**Warning signs:**
- Any reliance on `event: onload`/`onfirstinteraction` fields of the legacy Script API in the implementation plan.
- No mention of NubeSDK's Web Worker execution model, `UI Slots`, or `nube.render()` in the technical design.
- Sister-project code reused verbatim without checking its NubeSDK status.

**Phase to address:**
Phase 1 (Foundation / technical spike) — must be resolved before any storefront-rendering code is written, since it determines the entire rendering architecture, not just an implementation detail.

---

### Pitfall 2: NubeSDK has no slot to hide/replace the native "Produtos Relacionados" block — visual conflict risk

**What goes wrong:**
The native related-products block (`alternative_products`/`complementary_products`, shows "up to 8" products) is rendered by **theme Liquid code** (`product-related.tpl`, included from `product.tpl`), not by a pluggable platform feature. NubeSDK's documented Storefront UI Slots for the product-detail page are `after_product_detail_name` and `before/after_product_detail_add_to_cart` — there is **no documented slot that targets, clears, or hides the native related-products block itself**. NubeSDK apps also run inside isolated Web Workers with no direct DOM access, so there is no scripted way to `remove()` or `display:none` the native block either — that capability was only available under the old, now-deprecated raw-script-injection model.
Combined with the project's own validated finding that the native field is not writable via any app API, this creates a real risk: the custom Metafield-driven recommendation block renders in a NubeSDK slot, while the **native block may still render independently** (defaulting to same-category products when `alternative_products` is empty, since Nuvemshop's own docs state the native block falls back to "default" same-category picks when nothing is manually linked). Result: two competing "recommended products" sections on the same page, confusing customers and undermining the entire purpose of the project.

**Why it happens:**
The project's architecture assumed "inject a script that renders a custom block" implies control over what else appears on the page. That assumption held under the legacy raw-script model (which *could* manipulate the DOM to hide the native block) but does not hold under NubeSDK's sandboxed slot model, which is the path being forced by the Oct 2026 deprecation (Pitfall 1). These two pitfalls compound: migrating to the compliant path may cost the ability to suppress the native block.

**How to avoid:**
- Before committing to final architecture, run a live spike (Phase 1/2): with the Partners app active, set `alternative_products` to an empty/unmanaged state on a real Talgui test product and confirm exactly what the theme renders by default. Confirm whether the theme in use (verify if Talgui runs the Patagonia theme, since some historical NubeSDK constraints applied only there) exposes a theme-editor toggle to disable the block entirely — ask the theme documentation/support directly, this is not reliably in the app-side docs.
- If the theme has a merchant-facing toggle for the related-products block, treat "disable native block in theme settings" as a one-time manual setup step in Phase 1, separate from the automation.
- If no toggle exists, consider CSS-only suppression via a NubeSDK-permitted mechanism (if NubeSDK exposes any store-level CSS injection facility) as a fallback, and validate it doesn't produce a layout gap or double-heading ("Recomendados" appearing twice).
- Explicitly test the empty-state / fallback behavior of the native block (same-category default) as this is the most likely silent-conflict scenario, not just the case where recommendations were manually set.

**Warning signs:**
- UAT on a real product page shows two "related products" sections, or duplicate/near-duplicate product grids.
- The native block reappears after the custom Metafield-driven block renders (race condition — native block is server-rendered in the initial HTML, custom NubeSDK block renders asynchronously in a worker, so a flash-of-native-content before the custom block mounts is expected and must be designed around, e.g., via a loading skeleton, not treated as a bug to "fix later").

**Phase to address:**
Phase 1 (Foundation/spike) for the discovery, Phase covering "Script renders custom block" for the mitigation (must complete before UAT sign-off).

---

### Pitfall 3: Treating `variant.stock` as authoritative — silent recommendation errors from multi-inventory/multi-location stock

**What goes wrong:**
Nuvemshop has migrated stock tracking to a multi-inventory model: `variant.inventory_levels[]` (array of `{location_id, stock}`) is now the source of truth, and `variant.stock` is officially deprecated (though still populated for backward compatibility as an aggregate). If Talgui has more than one sales location/warehouse configured (or ever enables one), a naive read of `variant.stock` may show a nonzero aggregate total while a single relevant location is actually out of stock, or vice versa depending on how the store's fulfillment is configured — causing the recommendation engine's mandatory "estoque disponível" rule to recommend products that are effectively unavailable for that channel, or exclude ones that are available. This is exactly the kind of error that fails silently: the API call succeeds, the field has a value, nothing throws.

**Why it happens:**
`variant.stock` remains present and populated (Nuvemshop kept it for compatibility), so it looks like a complete, working field during casual testing against a single-location store — the bug only appears once multi-location is involved or when Nuvemshop's backend semantics for the legacy field change silently.

**How to avoid:**
- During the catalog-reading phase, explicitly check whether Talgui has multiple locations (`GET /locations`) and design stock-availability logic against `inventory_levels[]` from the start rather than `variant.stock`, even if it means slightly more aggregation code up front.
- Define "in stock" precisely for this project's rules engine (e.g., "sum of stock across all locations > 0" vs. "stock > 0 at the store's primary/online-sales location") — this is a business decision, not just a technical one, and should be confirmed with the stakeholder since it changes recommendation output.
- Add a data-quality check in the daily snapshot job that flags variants where `variant.stock` and `sum(inventory_levels[].stock)` disagree, as an early-warning canary for platform-side changes.

**Warning signs:**
- Recommendation engine output includes products that show as sold out on the live storefront (or vice-versa).
- Talgui admin panel shows a different stock number for a product than what the sync job logged.

**Phase to address:**
Catalog/stock-reading phase (early — this is foundational data plumbing that the whole rules engine depends on).

---

### Pitfall 4: Rate-limit exhaustion from naive full-catalog scans (592 products, daily schedule)

**What goes wrong:**
The API uses a leaky-bucket limiter: 2 req/s sustained, burst of 40 (per official docs baseline; one secondary source claims Next/Evolution-tier stores get a 10x multiplier — **this is unverified against Talgui's actual live rate-limit response headers and should not be assumed**; PROJECT.md's own stated constraint is the conservative 2 req/s / buffer 40 figure). A naive implementation that loops through 592 products with one request per product (plus N more for variants/metafields per product) without throttling will blow through the burst allowance almost immediately and start receiving `429`s. Worse, a retry loop without backoff can turn a slow job into a job that never finishes, or — if retries are not idempotent — can create duplicate/partial writes.

**Why it happens:**
592 products feels small enough that rate limiting seems like a non-issue during early manual testing (a handful of ad-hoc calls never trips the limiter), so the pacing logic gets skipped or stubbed, and the problem only appears once the job runs unattended against the full catalog on a schedule.

**How to avoid:**
- Build a single shared rate-limited HTTP client from day one (token-bucket or simple `sleep` pacing at safely under 2 req/s, e.g., 1.5 req/s, to leave headroom instead of assuming a possible 10x multiplier that hasn't been confirmed for this store) — do not let individual features each write ad-hoc fetch loops.
- Use `per_page=200` pagination on list endpoints (`GET /products?per_page=200`) rather than iterating one-by-one, to minimize total request count for the initial catalog read.
- Read and log `x-rate-limit-remaining` / `x-rate-limit-reset` response headers and self-throttle proactively rather than reactively waiting for a `429`.
- On `429`, back off using the reset window signaled by headers, not a fixed guess.
- Budget the total request count for one full daily run (≈592 products × read calls + write calls for changed metafields only) against the sustained rate to get a realistic runtime estimate (at 2 req/s, ~600 calls ≈ 5 minutes minimum, more with variants/metafields sub-calls) — this affects whether "daily" scheduling is comfortably safe or needs to run overnight to avoid overlapping with peak admin/storefront traffic on the same API budget.

**Warning signs:**
- Job logs show `429` responses, especially in bursts near the start of a run.
- Job runtime is inconsistent day-to-day (sign of retry storms).
- Full-catalog runs interfere with concurrent admin usage (the rate limit is shared per store+app pair, not isolated to the automation, but if this app registers as a separate token from other integrations it has its own bucket — confirm this store isn't sharing a single app's bucket across unrelated automations, including the sister vitrine-ordering project, which could compound both jobs' rate consumption if they run concurrently under the same app).

**Phase to address:**
Foundation phase ("conexão segura e autenticada... respeitando rate limits") — this is explicitly already a named requirement; make sure the shared rate-limited client is a reusable module, not per-feature code.

---

### Pitfall 5: Writing to Metafields without a documented size/count budget — silent truncation or unbounded growth

**What goes wrong:**
Nuvemshop's Metafields API documentation does **not publish** a maximum value length, a maximum metafield count per product, or a store-wide quota. For a rules engine storing "up to 8 recommended products" per product (592 products × potentially multiple metafields for alternative/complementary/audit data), there's a real risk of hitting an undocumented server-side limit only in production, mid-run, with no advance warning — and no documented behavior for what happens when a limit is hit (could be a clean 422, could be silent truncation, unknown without direct testing).

**Why it happens:**
Because the docs are silent, teams assume "no limit" rather than testing the boundary, and small-scale dev testing (a handful of products) never approaches whatever the real ceiling is.

**How to avoid:**
- Early in the Metafields-writing phase, deliberately test with a large payload (largest plausible: 8 product IDs + metadata, JSON-encoded) against a real (non-critical) test product to observe actual behavior — confirm it round-trips correctly on read.
- Keep the metafield value schema minimal and stable (e.g., a compact JSON array of product IDs, not verbose objects) to stay well under any plausible undocumented limit and to keep the payload cheap to read on every storefront page load.
- Namespace metafields clearly (e.g., `talgui_recomendados`) and keep the key set small and fixed (e.g., one key for the current recommendation list, one for last-updated timestamp) rather than growing a new key per snapshot — avoids unbounded growth and namespace clutter over the life of the daily job.
- Add a write-time validation step that checks the response of every metafield write for unexpected truncation (compare payload length sent vs. length in the confirmation response) rather than assuming success from a 200/201 status alone.

**Warning signs:**
- A metafield read-back doesn't match what was written (truncation).
- Metafield count on a product grows unbounded over time (sign snapshots are being appended instead of overwritten).
- 4xx errors specifically on write for certain products but not others (may indicate a length- or count-based limit tied to accumulated history).

**Phase to address:**
Metafields-writing phase — before the daily-snapshot automation goes live, since that's when accumulation risk compounds daily.

---

### Pitfall 6: Fabric-type/color tag inconsistency silently poisoning the rules engine

**What goes wrong:**
The recommendation engine's core rule is deterministic matching on "mesma cor + mesmo tipo de tecido + estoque disponível." Product tags in e-commerce catalogs are near-universally inconsistent when entered manually over time by multiple people (e.g., "Viscose", "viscose", "Viscose Lisa", "VISC", accented vs. unaccented "algodão"/"algodao", trailing whitespace, synonyms like "malha" vs. "jersey" for the same fabric family). Because the matching is exact/deterministic by design (explicitly not AI/ML, per project constraints), any tag inconsistency doesn't produce an error — it just silently excludes products that should have matched, or (worse) matches unrelated products that happen to share a malformed tag. This is the single highest-risk item for **undermining trust in the tool**, because the output looks plausible (a full list of "recommended" products) even when it's wrong, and a merchant reviewing the approval panel may not catch subtly-wrong-but-plausible recommendations, especially at scale (592 products, many reviews).

**Why it happens:**
Tag/attribute data entered by different people over months or years, without enforced controlled vocabulary at data-entry time, naturally drifts. This is compounded here because PROJECT.md already flags "Padronização/limpeza das tags de tecido" as a required pre-step — the risk is under-scoping that cleanup as a one-time task rather than an ongoing data-quality control.

**How to avoid:**
- Before writing any matching logic, run a full audit of the actual tag values present across all 592 products (frequency count of every distinct raw tag string) — this is a cheap, mechanical first step that will make the scope of inconsistency visible immediately.
- Build an explicit canonical taxonomy (a fixed enum of fabric types and colors) and a mapping table from raw tag variants → canonical value, rather than trying to normalize tags programmatically with fuzzy heuristics (fuzzy matching reintroduces the "silent wrong match" risk this project is explicitly trying to avoid by not using AI/ML).
- Treat any product whose tags don't map cleanly to the canonical taxonomy as **excluded from automated matching and flagged for manual review**, rather than guessed at — fail loud/visible in the approval panel, not silent in the engine.
- Because this is a live catalog with new products added over time, this can't be a one-time cleanup — bake a "new/unmapped tag detected" check into the daily snapshot job so drift is caught continuously, not just at project launch.
- Surface unmapped/ambiguous products explicitly in the approval panel UI (e.g., a distinct "needs tag review" state) so a human can see data-quality issues, not just recommendation-content issues.

**Warning signs:**
- The approval panel shows products with an empty or suspiciously short recommendation list (symptom of tags not matching anything, including near-duplicates of themselves).
- Spot-checking a few products reveals recommendations that are visually/stylistically wrong despite passing the rules (symptom of a false-positive tag match, e.g. two different fabrics both mistagged with the same normalized string).
- Tag frequency audit reveals dozens of near-duplicate variants for what should be a small fixed set of fabric types.

**Phase to address:**
Explicitly named in PROJECT.md as a pre-requisite phase ("Padronização/limpeza das tags de tecido") — ensure the roadmap treats this as sequenced *before* the rules engine phase, with its own verification step (tag audit report), and reserves a recurring check in the daily-snapshot phase for ongoing drift, not just a one-time cleanup.

---

### Pitfall 7: No dry-run/rollback discipline before writing to a live production store

**What goes wrong:**
PROJECT.md already mandates human approval before any write and rollback capability, which is good — but the specific failure mode to guard against is: the *approval panel preview* not being a byte-for-byte accurate representation of what will actually be written and rendered. If the preview shows "product A, B, C will be recommended" but the actual write (Metafield payload) or actual render (storefront script) diverges from that preview due to a bug in the serialization/rendering path, a human can approve something that then displays incorrectly on the live storefront — a customer-facing error that erodes trust in both the tool and the store. This is distinct from "no rollback exists" (already covered by requirements); the pitfall is a **false sense of safety** from having an approval step that doesn't actually guarantee correctness of what ships.
A second, more operational failure mode: the daily snapshot job runs unattended and, without a human in the loop for routine day-to-day changes (since the requirement is approval "before any change," but a *daily automated* job implies some threshold for what needs re-approval vs. what auto-applies), either (a) every day requires manual approval of a large diff, causing approval fatigue where the human starts rubber-stamping without real review, or (b) the team is tempted to relax "needs approval" for the daily job specifically, defeating the safety requirement.

**Why it happens:**
Preview/apply divergence typically happens because preview logic and apply logic are implemented as two separate code paths (e.g., preview computed by the recommendation engine directly, apply going through a different serialization/formatting step) rather than one code path with a "dry_run" flag — divergence creeps in over time as one path is updated and the other isn't.
Approval fatigue is a known pattern in any workflow requiring human sign-off on machine-generated diffs at daily cadence — humans habituate quickly to "yes/approve" when nothing looks unusual, and stop reading carefully within days.

**How to avoid:**
- Implement dry-run as a mode flag on the *exact same* write path, not a separate simulation — the preview shown to the human should be generated by running the real write logic against a "would write" branch (e.g., compute the actual Metafield payload, diff it against current state, show that diff) rather than a re-derived summary.
- Always capture the pre-write state (current Metafield values / current recommendation set) before every write, keyed by timestamp, enabling exact rollback to any prior snapshot — not just "the previous" state, since a bad state might not be caught until several days later.
- Design the approval UI to highlight *changes only* (diff view: added/removed/reordered products per product page) rather than the full recommendation list every time, to keep daily review fast and meaningful rather than encouraging rubber-stamping of unchanged noise.
- Consider a policy tier: auto-apply small, low-risk changes (e.g., removing an out-of-stock product from an existing list) without approval, but require explicit human approval for larger changes (e.g., a product's entire recommendation set changing) — confirm this policy choice explicitly with the stakeholder rather than assuming; it directly trades off the "no write without approval" constraint against practical daily usability, so it's a decision for the roadmap/requirements stage, not an implementation detail.
- Test rollback itself, not just forward writes — an untested rollback path is not a safety net.

**Warning signs:**
- Preview and actual post-write storefront state differ during UAT.
- Approval logs show near-100% approval rate with decreasing review time per approval (sign of fatigue/rubber-stamping).
- No test exists that exercises "rollback to snapshot from N days ago," only "rollback to immediately-previous state."

**Phase to address:**
The dry-run/audit-log/rollback requirement phase — should include an explicit UAT step verifying preview-to-production fidelity, plus a policy decision (with the stakeholder) on approval cadence/thresholds for the recurring daily job specifically, separate from the one-time initial rollout.

---

### Pitfall 8: Assuming the sister project's validation fully transfers to this project's requirements

**What goes wrong:**
PROJECT.md leans on the parallel vitrine-ordering project as evidence that "Script via Partners escrevendo no storefront real da Talgui já está validado em produção," which reduces risk for the general mechanism (Partners app can write scripts that render on this store). But that project validates a different, narrower claim: that *a* script can run and render *something*. It does not validate this project's specific needs — reading/writing Metafields at this project's scale and cadence, rendering a specific UI pattern that must coexist with (not necessarily replace) the native related-products block, or surviving the Oct 2026 NubeSDK cutover (Pitfall 1). Treating "the other project works" as validation for this project's full technical path risks skipping targeted spikes for what's actually novel here.

**Why it happens:**
Reuse of a validated mechanism is a reasonable risk-reduction heuristic, but it's easy to over-extend "the platform lets Partners apps write scripts" into "therefore this project's specific architecture is validated," which conflates mechanism-level and feature-level validation.

**How to avoid:**
- Explicitly scope what the sister project actually proves (Partners app registration works, `write_scripts` scope was granted, a script does load and execute on Talgui's real storefront) versus what still needs its own validation for this project (Metafield read/write at scale, NubeSDK-based UI slot rendering if migrating per Pitfall 1, coexistence with the native related-products block per Pitfall 2, multi-location stock handling per Pitfall 3).
- Run this project's own end-to-end spike (one real product, full pipeline: read catalog → compute one recommendation → write Metafield → render via script/NubeSDK → visually confirm on live storefront) before committing to the full roadmap, even though the underlying mechanism is "already proven" elsewhere.

**Warning signs:**
- Roadmap skips a foundational end-to-end spike phase on the assumption that "this already works" based on the sister project.
- No one has actually tested reading a Metafield back from the storefront-side script context on this store.

**Phase to address:**
Foundation phase — the spike described above should be an explicit, small, early milestone, distinct from "build the real thing," specifically to avoid this transfer-of-confidence trap.

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|-----------------|------------------|
| Ship on legacy `write_scripts`/raw script injection instead of NubeSDK | Faster initial build, reuses sister-project pattern directly | Breaks on/around 2026-10-30 per platform enforcement; forced emergency migration on a live store | Only as a throwaway spike to validate the mechanism (Pitfall 8), never for the shipped production build |
| Read `variant.stock` instead of `inventory_levels[]` | Simpler code, one field instead of an array to aggregate | Silently wrong availability once multi-location is active; deprecated field with no guaranteed lifetime | Only if Talgui is confirmed single-location for the life of the project, re-verified periodically |
| Skip tag-normalization mapping table, use fuzzy/heuristic string matching for fabric types | Faster to build than a canonical taxonomy | Reintroduces the "silent wrong match" risk the deterministic-engine design was chosen specifically to avoid | Never — contradicts the explicit "sem IA/ML, auditável" project constraint |
| Preview UI computed by separate logic from the actual write payload | Faster to build a nice-looking preview UI decoupled from write internals | Preview/production divergence risk (Pitfall 7); undermines the entire human-approval safety model | Never for the production build; acceptable only in a disposable UI mockup |
| No per-request rate-limit pacing, rely on catching 429 and retrying | Simpler client code initially | Unpredictable job runtime, risk of retry storms, wasted API budget shared with sister project's app | Never for the scheduled daily job; marginally acceptable for one-off manual scripts during dev only |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|-----------------|-------------------|
| Nuvemshop Script API (legacy) | Assuming it will keep accepting new script registrations indefinitely | Confirm current registration still works at build time; plan NubeSDK migration regardless, given the documented Oct 2026 cutover and the fact that legacy script *registration* endpoints reportedly already stopped accepting new registrations |
| NubeSDK UI Slots | Assuming a slot exists for every native block (e.g., related products) | Enumerate actual documented slots for the product-detail page before designing the UI; treat "hide native block" as a separate, possibly-unsolved problem |
| Metafields API | Treating undocumented limits as "no limits" | Test boundary behavior directly against a real test product before relying on it in production |
| Product/variant stock | Reading `variant.stock` as the single source of truight for availability | Read `inventory_levels[]`, decide and document what "available" means across locations |
| Rate limiting | Assuming a specific multiplier (e.g., "Next plan = 10x") without confirming against this store's actual response headers | Pace conservatively to the documented baseline (2 req/s, burst 40) unless live headers confirm a higher limit for this specific store+app pair |
| App scope grants | Requesting broad scopes "just in case" | Request only `write_scripts` + the specific read/write product/metafield scopes actually used — broader scopes increase review friction and security surface even for a private/unlisted app |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|-----------------|
| Unpaced full-catalog scan (592 products × N sub-calls) | 429 errors, inconsistent job runtime, job doesn't finish before next scheduled run | Shared rate-limited client, `per_page=200` pagination, proactive header-based throttling | As soon as concurrent sub-calls (variants, metafields per product) push effective request count into the hundreds within a short window — i.e., almost immediately at full scale without pacing |
| Storefront script/NubeSDK block rendering after page paint | Visible flash of native block or empty space before custom recommendations appear (layout shift, perceived slowness) | Design an explicit loading state in the custom block; consider whether `onload` vs `onfirstinteraction` timing (legacy) or the NubeSDK slot's natural render timing meets UX needs; get onload approval from api@nuvemshop.com.br if critical-path rendering is required | Any time the custom block depends on an async Metafield read that resolves after the native server-rendered HTML has already painted |
| Metafield payload growth over time (accumulating history in one key or adding new keys per snapshot) | Slower reads on every storefront page load as payload size grows; possible undocumented limit failures late in the project | Fixed, minimal, overwritten-not-appended schema (current state only); separate audit-log storage (not Metafields) for history | Gradual — degrades read latency and risk exposure continuously, worse the longer the daily job runs unchanged |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Storing the Partners app's private token/credentials in the same repo or config surface as the recommendation logic without secrets management | Token leak grants write access to the live production store (script injection + metafields) | Use a secrets manager / environment variables in the cloud runner (GitHub Actions secrets, etc.), never commit tokens, rotate if any suspected exposure |
| No audit trail of who approved which change | Cannot investigate after an incorrect/harmful write goes live | Log approver identity, timestamp, and the exact diff approved for every write, immutable/append-only |
| Treating the storefront-facing script as trusted just because it's first-party | A bug in the script that fetches/renders Metafield data insecurely (e.g., unescaped product data reflected into the DOM) could create an XSS-like risk if any product field ever contains attacker-influenced text (e.g., a compromised admin session editing a tag) | Sanitize/escape all rendered content in the custom block, treat product data as untrusted input even though it's "your own" store's data |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-------------------|
| Two competing "related/recommended products" sections visible simultaneously (Pitfall 2) | Confusing, unprofessional-looking storefront, undermines curation goal entirely | Resolve native-block coexistence before UAT sign-off; verify empty-state/default behavior of the native block specifically |
| Flash of native block content before custom block mounts | Perceived jank/slowness, inconsistent look between page loads | Design explicit loading/skeleton state; consider onload-approval path if timing is critical |
| Approval panel showing full recommendation lists daily instead of diffs | Approval fatigue, rubber-stamping, defeats the human-safety-net purpose | Diff-only view highlighting what changed since last approved state |
| Recommending out-of-stock or soon-to-sell-out items due to stock-sync/location handling gaps (Pitfall 3) | Customer clicks a "recommended" product that's unavailable — direct harm to the core value proposition | Correct `inventory_levels[]`-based availability logic, daily re-check via the snapshot job |

## "Looks Done But Isn't" Checklist

- [ ] **Storefront rendering "works":** Often verified only in a dev/test environment or single browser session — verify it actually survives a page reload, verify it doesn't conflict with the native related-products block in its default/fallback state (not just when manually configured), and verify current status against the NubeSDK deadline (is it still on the legacy path?).
- [ ] **Stock-availability rule "works":** Often verified against a single-location assumption — verify against `inventory_levels[]`, not `variant.stock`, and verify behavior with a genuinely zero-stock product and a multi-location product if any exist.
- [ ] **Tag-based matching "works":** Often verified only against a small sample of clean, well-tagged products — verify against the full 592-product catalog's actual raw tag values, including edge cases (missing tags, only-one-tag products, discontinued/legacy tag values).
- [ ] **Approval panel "works":** Often verified only for the happy path (approve everything) — verify a partial-approval or reject flow, and verify the preview shown exactly matches what gets written and what renders live.
- [ ] **Rollback "works":** Often only conceptually designed, never executed — verify an actual rollback to a snapshot from several days back, not just the immediately-previous state, and confirm the storefront reflects the rolled-back state correctly.
- [ ] **Rate limiting "works":** Often only tested against a handful of manual calls during dev — verify a full 592-product run end-to-end without 429s, ideally against a realistic clone/staging scenario before the first live production run.
- [ ] **Daily snapshot job "works":** Often verified as a one-off manual trigger — verify it actually runs unattended on the cloud schedule (GitHub Actions/cron) without depending on any local machine state, and verify failure alerting exists (a silently-failing daily job is worse than no automation, because staleness looks identical to a healthy but unchanged state).

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|-----------------|------------------|
| Legacy script stops working post-2026-10-30 without migration | HIGH | Emergency NubeSDK migration under time pressure on a live store; mitigate by starting migration well before the deadline, not after breakage |
| Native block conflict discovered post-launch | MEDIUM | Add CSS/theme-level suppression or renegotiate scope with theme editor access; requires re-opening a "closed" phase |
| Tag-inconsistency-driven bad recommendations discovered post-launch | MEDIUM | Re-run tag audit, expand canonical taxonomy mapping, re-run recommendation engine, re-approve affected products; mitigate by treating tag audit as continuous, not one-time |
| Metafield write hits an undocumented limit mid-rollout | LOW-MEDIUM | Shrink payload schema, split across additional metafield keys if needed, re-test; low cost if schema was already kept minimal per prevention guidance |
| Bad recommendation set approved and live due to preview/production divergence | MEDIUM | Roll back to last-known-good snapshot immediately; fix the divergent code path so preview and apply share one implementation, then re-audit history for other silently-approved discrepancies |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|-------------------|----------------|
| Legacy write_scripts deprecation (Oct 2026) | Foundation / architecture-decision phase | Confirm chosen rendering path (legacy vs NubeSDK) explicitly in a written decision; re-check platform docs close to build start |
| No NubeSDK slot for native related-products block | Foundation spike + Script/render-implementation phase | Live UAT screenshot showing no duplicate/conflicting related-products sections, including default/fallback native-block state |
| variant.stock vs inventory_levels | Catalog/stock-reading phase | Unit/integration test comparing `variant.stock` output against `inventory_levels[]`-derived output on a real product; confirmed decision on "what counts as in-stock" |
| Rate-limit exhaustion on full-catalog scans | Foundation phase (already named: "respeitando rate limits") | Full 592-product dry run completes with zero 429s and a predictable runtime |
| Metafield size/quota unknowns | Metafields-writing phase | Boundary test with largest plausible payload; read-back verification of no truncation |
| Fabric/color tag inconsistency | Explicit tag-standardization phase (already named in PROJECT.md) | Tag frequency audit report; canonical taxonomy coverage percentage; ongoing drift check wired into daily snapshot job |
| Dry-run/rollback/approval fidelity | Safety/audit-log/rollback phase (already named) | Preview-vs-production diff test; executed rollback test to a non-trivial-past snapshot; stakeholder-confirmed approval-cadence policy for the daily job |
| Over-trusting sister-project validation | Foundation phase | Dedicated small end-to-end spike on this project's actual pipeline (read → compute → write Metafield → render → visually confirm), independent of the sister project's own validation |

## Sources

- [Scripts | Nuvemshop API](https://tiendanube.github.io/api-documentation/resources/script) — legacy Script resource fields, event types, deprecation note on registration endpoints (official docs, WebFetch)
- [Overview | DevHub Nuvemshop — NubeSDK](https://dev.nuvemshop.com.br/en/docs/applications/nube-sdk/overview) — NubeSDK architecture, Web Worker sandboxing (official docs, WebFetch)
- [Script Structure | DevHub Nuvemshop](https://dev.nuvemshop.com.br/en/docs/applications/nube-sdk/script-structure) — event-driven model, `nube.render()`/`nube.on()`/`nube.off()` (official docs, WebFetch)
- [UI Slots | DevHub Nuvemshop](https://dev.tiendanube.com/docs/applications/nube-sdk/ui-slots) — enumerated storefront/checkout slots, Patagonia-theme note, product-detail slot names (official docs, WebFetch)
- [Metafields | Nuvemshop API](https://tiendanube.github.io/api-documentation/resources/metafields) — namespace/key format rules, no documented size/quota limits (official docs, WebFetch)
- [Multi Inventory Guides / "How to go from variant.stock to variant.inventory_levels" | Nuvemshop API](https://tiendanube.github.io/api-documentation/guides/multi-inventory/products) — deprecation of `variant.stock`, `inventory_levels[]` structure, 422 gotchas (official docs, WebFetch)
- [Getting Started with Nuvemshop API | Nuvemshop API](https://tiendanube.github.io/api-documentation/intro) — leaky-bucket rate limit baseline (2 req/s, burst 40), rate-limit headers, unverified Next/Evolution 10x claim (official docs, WebFetch)
- [Publication Guidelines for Tiendanube Partners](https://dev.nuvemshop.com.br/en/docs/applications/guidelines) / [Mandatory Requirements | DevHub Nuvemshop](https://dev.tiendanube.com/en/docs/homologation/requirements) — homologation process, private/"For Your Customers" app exemption from full review (official docs, WebSearch synthesis)
- [Produtos relacionados: Alternativos e complementares | Documentação para Web Designers](https://docs.nuvemshop.com.br/help/produtos-relacionados-alternativos-e-complementares) — native related-products block is theme Liquid code (`product-related.tpl`), default same-category fallback behavior, no merchant theme-editor toggle documented (official docs, WebFetch)
- NubeSDK/legacy-script deprecation timeline (2026-06-05, 2026-08-30, 2026-10-30) and private-app front-end enforcement — synthesized from multiple WebSearch results against official DevHub pages; **dates and private-app enforcement scope should be re-confirmed directly against `dev.nuvemshop.com.br`'s current migration guide close to build start**, since this is the single most consequential and time-sensitive claim in this document and was not confirmed via direct WebFetch of the migration guide page itself (only via search-result synthesis)

---
*Pitfalls research for: Nuvemshop/Tiendanube Partners app product-recommendation automation (Talgui)*
*Researched: 2026-07-08*
