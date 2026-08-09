# Stack Research

**Domain:** Server-side Nuvemshop (Tiendanube) automation — deterministic recommendation engine + Partners app (NubeSDK storefront script) + internal approval panel
**Researched:** 2026-07-08
**Confidence:** HIGH for Nuvemshop/NubeSDK-specific facts (sourced directly from `dev.nuvemshop.com.br` DevHub and `tiendanube.github.io/api-documentation`, the two official doc sites) / MEDIUM for general tooling choices (hosting, framework picks) where multiple valid options exist and the recommendation is opinionated best-practice rather than a documented requirement.

## Critical Architecture Finding (reads on all downstream choices)

**A NubeSDK storefront script cannot safely call the Nuvemshop Admin API directly.** The public Nuvemshop API (`https://api.tiendanube.com/2025-03/{store_id}/...`, including the Metafields resource) requires `Authorization: Bearer {access_token}` — an OAuth app token tied to your Partners app installation. NubeSDK scripts execute in a **Web Worker in the customer's browser** (confirmed: "Apps are hosted inside Web Workers in the browser — an isolated sandbox," dev.nuvemshop.com.br/en/docs/applications/nube-sdk/overview). If that Bearer token were embedded in the shipped script bundle, any visitor could extract it from the worker source and gain read/write access to the store's Admin API. `fetch()` is available natively inside the worker with no SDK wrapper needed, and requests to external domains just need the target to support CORS (dev.nuvemshop.com.br/en/docs/applications/nube-sdk/browser-apis) — but that capability must point at **your own lightweight public read endpoint**, never at Nuvemshop's authenticated Admin API.

This means the architecture requires a small, unauthenticated (or token-scoped-to-read-only) **public JSON endpoint you host**, e.g. `GET /api/public/recommendations/{product_id}`, that the NubeSDK script fetches client-side. That endpoint is a thin proxy in front of your own snapshot data (which itself was written to Nuvemshop Metafields by the daily job using the real Bearer token, server-side only). This single fact drives the "Supporting Libraries" and "Runtime" sections below — you need a tiny always-on (or edge/serverless) HTTP server in addition to the scheduled batch job, not just a cron script.

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Node.js | 24.x (Active LTS as of Oct 2026; use 24 now, it's the current Active LTS line going into that transition) | Runtime for the batch job, approval-panel backend, and public read API | Nuvemshop's own official tooling (`create-nube-app`, NubeSDK packages, App Sob Medida/Partners Node templates on `github.com/TiendaNube`) targets Node/npm; using the same runtime for both the NubeSDK build toolchain and your backend avoids a second language/toolchain for a one-person-maintained project. HIGH confidence on "Node is the path of least resistance for Nuvemshop tooling" (official templates are Node); MEDIUM on exact version pin — verify `.nvmrc` in `TiendaNube/create-nube-app` output at implementation time. |
| TypeScript | 5.x | Language for engine, API, and NubeSDK script | NubeSDK's own manual-setup docs mandate a `tsconfig.json` with `strict: true`, `target: "esnext"`, `jsx: "react-jsx"` — the script itself must be TypeScript/JSX compiled with `tsup`. Sharing TypeScript across script + backend lets you reuse types (e.g. a `Recommendation` shape) between the engine that writes Metafields and the script that reads them. HIGH confidence (directly from `dev.nuvemshop.com.br/en/docs/applications/nube-sdk/manual-setup`). |
| `@tiendanube/nube-sdk-*` packages (`nube-sdk-types`, `nube-sdk-ui`, `nube-sdk-jsx`) + `create-nube-app` CLI | latest (SDK is actively released; pin exact versions at scaffold time via `npm create nube-app@latest`) | Build and scaffold the storefront Script that renders the custom "Recomendados" block | This is not optional — it is the only supported way to ship a script that targets Nuvemshop's 2026 script runtime (legacy raw-JS Scripts API is being sunset for checkout and is being consolidated into NubeSDK; DevHub explicitly warns "Mandatory migration for Checkout scripts by 10/30" for the old Scripts API). Building fresh in mid-2026 should start on NubeSDK, not the legacy Scripts API, even though PROJECT.md's `write_scripts` scope and the legacy `POST /scripts` endpoint are still what registers/deploys the compiled script. HIGH confidence (github.com/TiendaNube/nube-sdk, dev.nuvemshop.com.br NubeSDK section). |
| `tsup` | 8.x | Bundler for the NubeSDK script | Explicitly recommended in NubeSDK's manual setup guide (`tsup.config.js` at project root) as the compiler for the worker bundle. Don't fight this with webpack/vite for the script specifically — NubeSDK's own scaffolding (`create-nube-app`) already wires `tsup`, and the worker runtime has constraints (Web Worker global scope, no DOM) that the NubeSDK tsup preset is tuned for. HIGH confidence. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node-fetch` / native `fetch` | native (Node 24 has global `fetch`) | HTTP calls to Nuvemshop Admin API from the batch job | Node 24's built-in `fetch` (stable since Node 18/undici) is sufficient — no need for `axios`. Use for `GET /2025-03/{store_id}/products`, `GET/PUT /2025-03/{store_id}/metafields`, and the legacy `POST/PUT /scripts` calls. |
| `bottleneck` or a small hand-rolled leaky-bucket limiter | `bottleneck@2.19.x` | Rate-limit outbound calls to the Nuvemshop API | Nuvemshop enforces a leaky-bucket: bucket size 40, leak rate 2 req/s on base plans, **multiplied by 10 for Next/Evolution plans** (so Talgui's Next-plan store gets ~20 req/s sustained with a 400-request burst — confirmed via `x-rate-limit-limit`/`x-rate-limit-remaining`/`x-rate-limit-reset` response headers, tiendanube.github.io/api-documentation/intro). Still worth a limiter: 592 products × (1 read + up to 1 metafield write each) comfortably fits in the burst, but concurrent panel usage + the daily job could collide. HIGH confidence on the numbers (official docs), MEDIUM on "Next plan gets the ×10" being current for Talgui specifically — reconfirm bucket headers empirically against the real store token before relying on 20 req/s. |
| Express or Fastify | Express 5.x / Fastify 5.x | Backend for (a) the approval panel API and (b) the tiny public read endpoint the NubeSDK script calls | You need a real always-on (or serverless) HTTP surface, not just a cron script — see Critical Architecture Finding above. Fastify is the more modern, faster, TypeScript-friendlier choice for a small greenfield service in 2026; Express is fine too if the developer already knows it better. Either is massively overkill-proof for ~592 products and single-digit approvers. MEDIUM confidence (general Node ecosystem best practice, not Nuvemshop-specific). |
| SQLite via `better-sqlite3` (or Postgres if already using a hosted DB) | `better-sqlite3@11.x` | Store daily snapshots, pending-approval diffs, audit log, rollback history | See "Rollback storage" section below — flat JSON files are viable too, but a single-file embedded DB gives you queryable audit history (who approved what, when) essentially for free and is still zero-ops. MEDIUM confidence — this is a judgment call, not a documented Nuvemshop requirement. |
| `zod` | `zod@3.x` (or `zod@4` if stable at implementation time — check npm before pinning) | Validate Nuvemshop API responses and metafield payloads before writing | Nuvemshop API responses aren't strongly typed on the wire; validating shape at the boundary (especially before writing to Metafields, which silently accepts any string value per the docs) prevents malformed writes. MEDIUM confidence (standard practice, not Nuvemshop-specific). |
| `node-cron` (only if self-hosting the scheduler) OR GitHub Actions `schedule:` trigger (if using CI-based scheduling) | `node-cron@3.x` | Trigger the daily snapshot job | See "Scheduling" section below — recommend GitHub Actions over `node-cron`, so this library is a fallback only. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| NubeSDK DevTools Chrome extension | Real-time debugging of the script in a real storefront | Documented as part of the official NubeSDK toolchain ("Chrome DevTools extension for real-time debugging," dev.nuvemshop.com.br NubeSDK overview) — install this before writing the script, it's the only supported way to inspect Web Worker state live. |
| NubeSDK dev-mode custom script URL (localhost/CDN override) | Iterate on the script against a real test store without redeploying to Nuvemshop's hosting on every change | Documented: "developers may use development mode with custom URLs (localhost or CDN), which overrides the default hosting for test stores during development" (tiendanube.github.io/api-documentation/resources/script). Use this to point a test store at `http://localhost:PORT/script.js` while iterating. |
| Biome | Lint/format for the NubeSDK script codebase | NubeSDK's own monorepo (`github.com/TiendaNube/nube-sdk`) uses Biome (`biome.json`) — matching it in your script package keeps tooling consistent if you ever need to read their source/examples for reference. Optional for the backend/panel code, where ESLint+Prettier is equally fine. |

## Installation

```bash
# NubeSDK script package (separate package.json from the backend)
npm create nube-app@latest recomendados-script
cd recomendados-script
npm install

# Backend (batch job + approval panel API + public read endpoint) — separate package
npm init -y
npm install fastify zod bottleneck better-sqlite3
npm install -D typescript tsx @types/node

# Approval panel frontend (if building outside the backend, e.g. simple SPA)
# See "Approval panel" section — a server-rendered approach avoids this step entirely
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| GitHub Actions `schedule:` cron for the daily job | Small always-on VPS/cron (e.g. a $5/mo box) or a managed cron service (Render Cron Jobs, Railway Cron, fly.io scheduled machines) | Use a hosted VPS/cron only if the job needs to run for longer than GitHub Actions' practical free-tier minutes allowance, needs a persistent local filesystem between runs (Actions runners are ephemeral — fine here since state should live in your DB/repo, not the runner disk), or if you want sub-daily scheduling reliability guarantees tighter than Actions provides (Actions cron can be delayed by several minutes during high load, which is irrelevant for a once-daily job). |
| Fastify/Express for approval panel backend | Next.js (App Router) as a combined frontend+backend | Use Next.js if you want a nicer approval-panel UI with less hand-rolled HTML templating and don't mind the extra framework surface. For a genuinely small internal tool (single approver, ~592 products, a "before/after" diff view and an approve/reject button), a server-rendered Fastify + a templating lib (or even htmx) is less to maintain long-term than a full Next.js app plus its own hosting/deploy pipeline. |
| SQLite (`better-sqlite3`) for snapshots/audit/rollback | Flat JSON files per snapshot (`snapshots/2026-07-08.json`) | Flat files are perfectly fine and arguably simpler to reason about ("rollback" = "reload yesterday's JSON and re-diff") if you don't need queries like "show me all approvals by X in the last 30 days." Given this is a single-store, single-approver tool, flat JSON + git-committed snapshots is a legitimate lighter-weight choice — see dedicated section below for the tradeoff. |
| Legacy Nuvemshop Scripts API (`write_scripts` + raw JS uploaded via `POST /scripts`) only for registration/deploy plumbing, NubeSDK for the actual script logic | Pure legacy Scripts API (hand-written vanilla JS script, no NubeSDK) | Only use pure legacy Scripts API if the project must avoid any NubeSDK dependency for some reason (e.g. porting from an existing non-NubESDK script). Since this is greenfield in 2026 and Nuvemshop is actively migrating checkout scripts to NubeSDK, starting fresh on the legacy raw-JS path is choosing a deprecating pattern on day one. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|--------------|
| Embedding the Nuvemshop Admin API Bearer token (or any write-capable credential) inside the NubeSDK script bundle | The script ships to every visitor's browser inside a Web Worker; anyone can extract the bundle and read the token, granting them read/write access to the store's Admin API (products, metafields, everything the app scope covers). This is a severe security hole, not a style preference. | Server-side-only Bearer token, used exclusively by the batch job and the approval-panel backend. The NubeSDK script calls your own public read-only endpoint (see Critical Architecture Finding). |
| AI/ML recommendation libraries (embeddings, collaborative filtering frameworks, vector DBs) | Explicitly out of scope per PROJECT.md — "IA/ML para geração de recomendações" is listed under Out of Scope; the engine must be deterministic and auditable (same color + same fabric type + in-stock, ranked by turnover). Pulling in a vector DB or ML library adds cost, non-determinism, and audit complexity for zero requested benefit. | Plain rule-based filtering/sorting in TypeScript — array `.filter()`/`.sort()` over the product catalog is sufficient at 592 products; no framework needed. |
| Writing directly to the native "Produtos Relacionados" field (`alternative_products`/`complementary_products`) via any app API | Confirmed non-viable in PROJECT.md's validated findings: that field is only writable via the internal `cirrus.tiendanube.com` endpoint authenticated by a logged-in admin browser session (`X-Access-Token`), not by any `Authorization: Bearer` app token — public API and Partners apps alike get 404 on that endpoint. | Metafields (public API, `POST/PUT /metafields`, owner_resource `Product`) + a NubeSDK script rendering a custom block, exactly as already decided in PROJECT.md. |
| App Sob Medida (custom app) alone, without a Partners app | Custom/"Sob Medida" apps do not have script-injection capability in this ecosystem (confirmed in a prior project per PROJECT.md context) — even though the public API access for reading/writing products and metafields is fine on App Sob Medida, you need `write_scripts` scope, which requires the Partners program. | Nuvemshop Partners, private/unlisted app ("Exclusivo para Lojistas Selecionados") — confirmed in DevHub: apps built exclusively for your own selected merchants skip the homologation/review process entirely, so there's no marketplace review bottleneck for a single-store internal tool. |
| Polling the Nuvemshop API without respecting `x-rate-limit-remaining`/backing off on 429 | Even with the Next-plan ×10 multiplier (~20 req/s, burst 400), a naive full-catalog re-read plus per-product metafield writes in a tight loop across 592 products, especially if the approval panel also queries live during a job run, can trip 429s. Nuvemshop's algorithm is a leaky bucket, not a hard per-minute cap, so a burst-then-throttle client is the correct model. | A rate limiter (`bottleneck` or equivalent) configured to the observed bucket size/leak rate, reading the `x-rate-limit-*` response headers to adapt in real time rather than hard-coding assumed limits. |

## Stack Patterns by Variant

**If the approval panel only ever has one human approver (current stated scope):**
- Skip building real auth/roles — a single shared password or a Nuvemshop-admin-gated link is enough.
- Because building multi-user auth for a tool with one user is pure overhead; add it later only if a second approver is actually requested.

**If daily snapshot volume and audit history need to be queryable/reportable later (e.g. "how often did stock changes trigger a recommendation swap in the last quarter"):**
- Use SQLite (`better-sqlite3`) from day one instead of flat JSON files.
- Because migrating from flat files to a DB later means writing a one-time importer anyway — for near-zero extra cost now, SQLite gives you SQL queries over history without that future migration.

**If you want zero infrastructure to operate/pay for beyond GitHub itself:**
- Store snapshots and audit log as JSON files committed to the repo by the GitHub Actions job (each run opens a commit/PR with the diff), and use GitHub Actions' `workflow_dispatch` + a lightweight static-hosted panel (e.g. GitHub Pages calling a small Actions-triggered API, or a single Vercel/Render free-tier function) for approval.
- Because for a single internal store tool, avoiding a always-on paid server (even a $5/mo one) is a legitimate simplicity win — but note the tradeoff: the NubeSDK script's public read endpoint (Critical Architecture Finding) still needs *some* always-on or edge-hosted surface, so "zero infra" really means "zero infra beyond one small serverless function," not literally nothing.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|------------------|-------|
| `@tiendanube/nube-sdk-jsx` | `tsconfig.json` with `jsx: "react-jsx"` and `jsxImportSource: "@tiendanube/nube-sdk-jsx/dist"` | This exact `jsxImportSource` path is required per the official manual-setup docs — a generic React JSX config will not compile NubeSDK components correctly. |
| `tsup` config for NubeSDK | `module: "commonjs"` in `tsconfig.json` (per official docs), `target: "esnext"` | Slightly unusual combination (commonjs module resolution with esnext target) — don't "fix" this to `module: "esnext"` assuming it's a docs typo; follow the documented config exactly since the NubeSDK worker loader expects this output shape. |
| Nuvemshop Admin API | `2025-03` version path, confirmed current as of this research (2026-07-08) | Check `tiendanube.github.io/api-documentation/intro` for the latest version segment before implementation — Nuvemshop versions by date-string in the URL path (`/2025-03/{store_id}/...`) and a newer version may have shipped between this research and implementation. |
| Legacy Scripts API (`POST /scripts`) | NubeSDK-built script bundle | The legacy endpoint is still the mechanism that registers/deploys a script version and associates it with a store (`deploy`/`deploy-test`, script-store association) even when the script content itself is built with NubeSDK — these are not mutually exclusive; NubeSDK replaces the script's *internal* architecture, not the deployment plumbing. |

## Rollback / previous-state storage — recommendation

**Use your own storage (SQLite or flat JSON snapshots), not Nuvemshop Metafields versioning, as the source of truth for rollback.** The Metafields API documentation (`tiendanube.github.io/api-documentation/resources/metafields`) shows only `id, namespace, key, value, owner_id, owner_resource, description, created_at, updated_at, deleted_at` — there is no documented version history or "previous value" field. A `PUT` overwrites `value` with no built-in undo. Concretely:

1. Before every write, the batch job reads the current Metafield value for each affected product and appends it to a `snapshots` table/file tagged with a timestamp and run ID.
2. The approval panel diffs "current metafield value" vs "proposed new value" for human review before any write happens (this is also your dry-run/simulation output — the same diff engine serves both dry-run display and the real pre-write snapshot).
3. Rollback = re-running the write step with the last approved-good snapshot's values, going through the same approval gate (never an unreviewed automatic revert) — consistent with PROJECT.md's constraint that "nenhuma escrita na loja sem aprovação humana prévia."

Confidence: MEDIUM — this is architectural judgment applied to a documented API gap (no version history in the Metafields resource), not a directly-documented Nuvemshop recommendation.

## Sources

- `dev.nuvemshop.com.br/en/docs/applications/nube-sdk/overview` — NubeSDK architecture, Web Worker sandbox, insertion points (HIGH, official DevHub)
- `dev.nuvemshop.com.br/en/docs/applications/nube-sdk/getting-started` — project scaffolding entry points (HIGH, official DevHub — page itself is thin, links to manual-setup)
- `dev.nuvemshop.com.br/en/docs/applications/nube-sdk/manual-setup` — exact CLI commands, tsconfig/tsup requirements, folder structure (HIGH, official DevHub)
- `dev.nuvemshop.com.br/en/docs/applications/nube-sdk/browser-apis` — confirmed `fetch` availability and CORS requirement inside the Web Worker; confirmed no documented metafield-read helper (HIGH, official DevHub)
- `dev.nuvemshop.com.br/en/docs/applications/nube-sdk/events` — confirmed product event payloads are minimal (`product.id` only in shown examples), no metafields in event payloads (HIGH, official DevHub)
- `dev.nuvemshop.com.br/en/docs/applications/nube-sdk/script-structure` — `App(nube: NubeSDK)` entry point, `getState()`, `getBrowserAPIs()` (HIGH, official DevHub)
- `tiendanube.github.io/api-documentation/resources/script` — Scripts API resource, `write_scripts` scope requirement, POST/PUT endpoints, deploy/deploy-test lifecycle, script hosting URLs (`apps-scripts.tiendanube.com`), dev-mode custom URL override, mandatory NubeSDK migration notice for checkout scripts (HIGH, official API docs)
- `tiendanube.github.io/api-documentation/resources/metafields` — Metafields CRUD endpoints, supported owner resources, naming constraints, confirmed no documented size/version-history fields (HIGH, official API docs)
- `tiendanube.github.io/api-documentation/intro` — rate limit bucket size (40) and leak rate (2 req/s, ×10 for Next/Evolution plans), rate-limit headers, OAuth Bearer auth requirement, current API version `2025-03`, pagination (HIGH, official API docs)
- `github.com/TiendaNube/nube-sdk` — monorepo structure, `create-nube-app` CLI, package list, Biome tooling, npm-based release process (HIGH, official GitHub repo)
- Partner homologation exemption for apps built "para seus clientes"/"exclusivo para lojistas selecionados" — general web search of Nuvemshop partner program pages, cross-referenced against PROJECT.md's already-validated claim of the same fact from live production use in a parallel project (MEDIUM-HIGH: general search corroborates an already-empirically-validated fact in PROJECT.md)
- Node.js 24 as Active LTS / Node 26 as Current as of mid-2026 — general web search of nodejs.org release blog and endoflife.date (MEDIUM — standard ecosystem fact, verify exact `.nvmrc` pin against `create-nube-app` scaffold output at implementation time)
- Hosting/scheduling recommendations (GitHub Actions vs VPS cron, Fastify/Express, SQLite vs flat files) — general engineering best-practice judgment, not Nuvemshop-specific documentation (MEDIUM, opinionated recommendation clearly framed as such, with alternatives listed)

---
*Stack research for: Nuvemshop/Tiendanube product-recommendation automation (server-side engine + NubeSDK storefront script + approval panel)*
*Researched: 2026-07-08*
