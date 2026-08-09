# Phase 1: Spike de Viabilidade End-to-End - Pattern Map

**Mapped:** 2026-07-09
**Files analyzed:** 0 existing files (greenfield phase)
**Analogs found:** 0 / N/A

## Codebase Scan Result

This repository contains no application source code to date. `git ls-files` returns only `.planning/PROJECT.md`; the working tree additionally has `.planning/` docs (untracked subfiles), `app sob medida.txt` (credentials for an unrelated existing Custom App, explicitly excluded from reuse by CONTEXT.md D-09/D-10 and RESEARCH.md Pitfall 4), and tooling config (`.gitignore`, `.graphifyignore`, `.graphifyinclude`). There are no `src/`, `app/`, `lib/`, or framework directories, no `package.json`, and no prior controllers/services/components/middleware of any kind.

Confirmed by targeted search:
- `Glob("**/*.{ts,tsx,js,jsx,py,go}")` → no matches outside `node_modules`-free, non-existent dirs (none found).
- `Grep("class.*Controller|router\\.(get|post)|export.*function.*handler")` → no matches (no such files exist).

**Conclusion:** There is no closest-existing-analog to map for any file this phase will create. Per the task instructions, this is expected and correct for Phase 1 of a new project — PATTERNS.md is kept short rather than inventing analogs from unrelated code (e.g., the `app sob medida.txt` credentials file is data, not code, and has no structural pattern to copy).

## File Classification (Planned New Files, No Analog Available)

Based on CONTEXT.md decisions and RESEARCH.md's `Recommended Project Structure`, the following files/areas will be created fresh in this phase. All are **greenfield — no analog** in this repo.

| New File (planned) | Role | Data Flow | Closest Analog | Match Quality |
|---------------------|------|-----------|-----------------|----------------|
| `app-partners-recomendados/src/auth/*` | service | request-response (OAuth/token exchange) | none | no-analog |
| `app-partners-recomendados/src/nuvemshop-client/*` | service | CRUD (wraps Nuvemshop public API: read product, write/read Metafield) | none | no-analog |
| `app-partners-recomendados/src/api/*` (PLAT-05 endpoint) | route/controller | request-response (GET-only, read-only) | none | no-analog |
| `app-partners-recomendados/.env` | config | — | none | no-analog |
| `nube-sdk-script/src/main.tsx` | component (NubeSDK Script) | event-driven (Web Worker, `nube.render` into UI Slot) | none | no-analog |
| `nube-sdk-script/tsup.config.js` | config | — | none (use RESEARCH.md Code Examples verbatim) | no-analog |
| `nube-sdk-script/tsconfig.json` | config | — | none | no-analog |

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| All files listed above | (various) | (various) | Repository has zero pre-existing application source code; this is the first implementation code written in the project. RESEARCH.md's `## Code Examples` and `## Architecture Patterns` sections (Metafield POST/GET, NubeSDK `App(nube)` minimal script, `tsup.config.js`) are the only available reference patterns and should be used by the planner directly in place of a codebase analog. |

## Guidance for Planner

Since no in-repo analogs exist, the planner should treat **RESEARCH.md** as the pattern source directly, specifically:
- `## Code Examples` → literal request/response shapes for Metafield create (WRTE-01) and read-back (round-trip), and the minimal NubeSDK `App(nube)` script (FRNT-01).
- `## Architecture Patterns > Pattern 1` → auth flow (OAuth fallback documented in full; try admin-generated permanent token first per PLAT-01/D-10).
- `## Architecture Patterns > Pattern 2` → UI Slot rendering model (no DOM access, no dedicated "related products" slot — use `after_product_detail_name` or `after_product_detail_add_to_cart`).
- `## Recommended Project Structure` → directory layout for the two new sub-projects (`app-partners-recomendados/`, `nube-sdk-script/`).
- `## Security Domain` and `## Don't Hand-Roll` → apply directly since no existing security/error-handling conventions exist in-repo to inherit from.

No shared cross-cutting patterns (auth middleware, error wrappers, logging, response formatting) can be extracted from this codebase — they do not exist yet. The planner should establish these conventions fresh in Phase 1's plans, informed by RESEARCH.md's Security Domain and Anti-Patterns sections, since Phase 2+ will reuse whatever is established here.

## Metadata

**Analog search scope:** entire working tree (`C:\Users\danil\Desktop\Recomendados Talgui`), via `git ls-files`, `ls -la`, `Glob`, and `Grep`.
**Files scanned:** 4 tracked/relevant files total (`.planning/PROJECT.md`, `app sob medida.txt`, `.gitignore`, `.graphifyignore`/`.graphifyinclude`) — none are source-code analogs.
**Pattern extraction date:** 2026-07-09
