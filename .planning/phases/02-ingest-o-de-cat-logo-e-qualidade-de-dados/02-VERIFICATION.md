---
phase: 02-ingest-o-de-cat-logo-e-qualidade-de-dados
verified: 2026-07-11T04:30:00Z
status: passed
score: 9/9 must-haves verified
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Confirmar mapeamento cor/tamanho por nome de atributo (WR-06) contra um payload real de produto Nuvemshop com mais de um atributo (ou atributo em ordem não padrão)"
    expected: "product.attributes contém entradas com .pt igual a 'Cor'/'Tamanho' (ou 'Color'/'Size'), e extractVariantValueByAttributeName() localiza o índice correto por nome em vez de cair no fallback posicional 0/1"
    why_human: "Nenhum teste automatizado (vitest) exercita findAttributeIndex/extractVariantValueByAttributeName; a correção não pôde ser validada contra um payload real da API no ambiente do fixer (02-REVIEW-FIX.md, nota da WR-06). A ingestão real (run_id=4) rodou com sucesso, mas isso não prova a ordem dos atributos — apenas que o fallback posicional (comportamento anterior, idêntico ao pré-fix) não quebrou nada, o que é esperado independentemente de o nome do atributo ter sido encontrado ou não."
    resolved: "PASSOU (2026-07-11T04:20:00Z, 02-UAT.md) — consulta ao vivo via listProducts contra 3 produtos reais da categoria Vestidos (321418512, 321418534, 321418552) confirma product.attributes = [{pt:'Cor'},{pt:'Tamanho'}] nos 3 casos; findAttributeIndex resolve pelo nome, não por coincidência posicional."
---

# Phase 2: Ingestão de Catálogo e Qualidade de Dados Verification Report

**Phase Goal:** Ingestão de Catálogo e Qualidade de Dados — leitura paginada e confiável do catálogo completo (categorias/produtos) da Nuvemshop respeitando rate limits reais (PLAT-02), cálculo correto de disponibilidade de estoque (DATA-01), leitura da baseline atual de recomendações via Metafields (DATA-02), e infraestrutura de auditoria contínua de tags de tecido (DATA-03) — tudo persistido em SQLite e comprovado ponta a ponta contra a categoria real "Vestidos" da loja Talgui.
**Verified:** 2026-07-11T04:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification (post-review-fix)

## Goal Achievement

**Note on scope:** This verification covers the full current codebase state, including the 3 original plans (02-01/02-02/02-03) **and** the 7 follow-up fix commits (`02bb7cc`, `d40f9e0`, `7313d3e`, `7cbc68e`, `476578a`, `7699eb4`, `fbce969`) from `02-REVIEW-FIX.md`, and the live re-run (`run_id=4`, `status=success`, 645 products, 143 available, 0 errors) that followed the fixes — not just the original 3 SUMMARY.md claims.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Leitura completa de produtos executa sem erros de rate limit, adaptando dinamicamente aos headers `x-rate-limit-*` reais, sem valor fixo assumido (Roadmap SC1 / PLAT-02) | VERIFIED | `client.js` `listCategories`/`listProducts`/`getMetafields` all route through `fetchWithRateLimit`; `AdaptiveRateLimiter.updateFromHeaders` reads `x-rate-limit-remaining`/`x-rate-limit-reset` live and never hardcodes a delay; `waitIfNeeded` only waits once real data exists. Live re-run `run_id=4` (2026-07-11T03:58–04:00Z) completed `status='success'`, `products_read=645`, and the 02-03-SUMMARY.md / DB inspection confirm zero `429` log lines across 4 real runs. WR-02 fix caps retries at 5 attempts (`MAX_429_RETRIES`), removing the prior unbounded-recursion risk. |
| 2 | Estoque lido via `inventory_levels[]`, não `variant.stock` depreciado, validado com produto real (Roadmap SC2 / DATA-01) | VERIFIED | `stock-availability.js: getVariantStock` sums `variant.inventory_levels[].stock` exclusively (`variant.stock` never referenced anywhere in the codebase — confirmed by reading the file). 6 vitest behaviors pass (`npx vitest run` → 16/16 total incl. this suite). Live DB query on `run_id=4`: 645 snapshot rows, `available=143` (`has_available_grade` computed via `hasAvailableGrade`, minSizesInStock=3), consistent with the 02-02-SUMMARY.md's real-data validation. |
| 3 | Estado atual das recomendações (Metafields) é lido para cada produto ANTES de qualquer nova computação, persistido como registro informativo (DATA-02, D-12) | VERIFIED | `ingest-catalog.js: readRecommendationBaseline()` calls `getMetafields({ ownerId, limiter })` per product, inside the `runIngestion` loop, before `persistIngestionBatch`. Live DB query on `run_id=4`: `recommendation_baseline` has 645 rows (1 non-null), matching 02-03-SUMMARY.md's claim exactly. No drift/comparison logic present (D-12 honored — only read + persist). |
| 4 | Relatório de auditoria de frequência de tags cobre todo o catálogo real com tabela de mapeamento canônico (Roadmap SC4 / DATA-03) | VERIFIED | `fabric-taxonomy.js: auditFabricTags` computes `frequency`/`unmapped` over the full batch (not per-product); `schema.sql` defines `fabric_tag_canonical_map`; `catalog-store.js: getCanonicalMap()` (added in fix commit `d40f9e0`) actually reads that table now — closing the WR-01 dead-code gap. Live DB: `fabric_tag_audit` has 366 distinct rows for `run_id=4`. |
| 5 | Produtos com tags não mapeáveis são sinalizados explicitamente (não adivinhados), checagem roda a cada execução, não é limpeza pontual (Roadmap SC5 / DATA-03) | VERIFIED | `auditFabricTags` never fuzzy-matches (exact string comparison only against `canonicalMap` keys — Test 5 of the behavior suite proves this); unmapped tags land in the `unmapped` Set, not silently dropped or auto-normalized. Confirmed regenerated every run — `fabric_tag_audit` count is 366 in both `run_id=1/2` (02-02-SUMMARY.md) and `run_id=4` (this verification's live query), i.e. re-audited each execution, not computed once and cached. |
| 6 | Uma única transação persiste produtos/variantes/snapshots/baseline por execução (não uma escrita por produto) | VERIFIED | `catalog-store.js: persistIngestionBatch` wraps all 5 inserts (`insertProduct`/`insertVariant`/`insertSnapshot`/`insertFabricAudit`/`insertRecommendationBaseline`) inside one `db.transaction(() => {...})()` call. |
| 7 | `fabric_tag_audit` é regenerada a cada execução, não apenas na primeira vez | VERIFIED | Confirmed via live DB query: 366 rows present for `run_id=4`, matching the counts from `run_id=1`/`run_id=2` in 02-02-SUMMARY.md — table is rebuilt (not appended-once) per run, driven by `auditFabricTags` running fresh over the batch each `runIngestion()` call. |
| 8 | `data/*.db` (and WAL/SHM sidecars) never committed to git | VERIFIED | `.gitignore` contains `data/*.db`, `data/*.db-wal`, `data/*.db-shm` (IN-01 duplicate-`.vercel`-line issue was Info-level and not required to fix). Live `git status --short --ignored data/` → `!! data/` (entire directory ignored). Overall repo `git status` shows no `.db`/`.db-wal`/`.db-shm` files staged or untracked. |
| 9 | Bug fixes from 02-REVIEW.md (1 critical + 6 warnings) are actually applied in the current codebase, not just claimed in 02-REVIEW-FIX.md | VERIFIED | All 7 fix commits exist in `git log` (`02bb7cc`, `d40f9e0`, `7313d3e`, `7cbc68e`, `476578a`, `7699eb4`, `fbce969`) and their code changes were read directly and confirmed present: CR-01 (`rawTags.find((tag) => canonicalMap.has(tag))` — no more `rawTags[0]`), WR-01 (`getCanonicalMap()` wired into `runIngestion`), WR-02 (`MAX_429_RETRIES = 5` cap), WR-03 (`productsRead: allProducts.length` on failure, not hardcoded `0`), WR-04 (`DB_DIR` resolved via `__dirname` + `mkdirSync`), WR-05 (`resolveCategoryIdByName` exported once, reused by `resolve-category.js`), WR-06 (`findAttributeIndex`/`extractVariantValueByAttributeName` present with name-based lookup + positional fallback — see Truth below for its behavioral caveat). |

**Score:** 9/9 truths verified (8 behavior-confirmed via live DB queries + code reading; 1 present-but-behavior-unverified item tracked separately below, per Step 3 methodology)

### Behavior-Unverified Item (routed to Human Verification)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 10 | WR-06 fix: variant color/size values are mapped by real attribute name (`product.attributes`), not a fixed positional assumption | PRESENT_BEHAVIOR_UNVERIFIED | Code is present and wired: `findAttributeIndex()`/`extractVariantValueByAttributeName()` in `ingest-catalog.js` look up `product.attributes[].pt` against `["cor","color"]`/`["tamanho","size"]` case-insensitively, falling back to fixed index 0/1 only when the name can't be found. No dedicated test file exists for `ingest-catalog.js` (only `stock-availability.test.js`/`fabric-taxonomy.test.js` exist), so this logic is not exercised by `vitest run`. 02-REVIEW-FIX.md explicitly flags this as "requires human verification — confirm against a real product sample... before relying on this in production." The live `run_id=4` execution succeeded end-to-end, but success alone does not prove the attribute-name branch was actually taken (a product whose `attributes` are absent/misnamed would silently fall back to the pre-fix positional behavior with no error, and no diagnostic was added to distinguish "matched by name" from "fell back to position"). |

This item is **not counted as FAILED** (the code exists, is wired into the orchestrator, and did not break the live run) and **not counted as VERIFIED** (no test or logged evidence confirms the name-based branch actually fires against real Nuvemshop attribute data). It is excluded from the `verified_truths` count per the verification methodology's behavior-dependent-truth rule, and routed to human verification below.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `app-partners-recomendados/src/nuvemshop-client/client.js` | `listCategories`/`listProducts`/`getMetafields`, all rate-limited | VERIFIED | Exports confirmed; all three route through `fetchWithRateLimit`; `getProduct`/`createMetafield` unchanged from Phase 1. |
| `app-partners-recomendados/src/rate-limit/adaptive-limiter.js` | `AdaptiveRateLimiter` + `fetchWithRateLimit`, capped retries | VERIFIED | Present; `MAX_429_RETRIES=5` added post-review (WR-02). |
| `app-partners-recomendados/scripts/resolve-category.js` | CLI proof script, reuses shared category-resolution logic | VERIFIED | Imports `resolveCategoryIdByName` from `ingest-catalog.js` (WR-05 dedupe fix applied), no longer duplicates match logic. |
| `app-partners-recomendados/src/db/schema.sql` | 7-table DDL (`ingestion_runs`, `products`, `variants`, `catalog_snapshots`, `fabric_tag_canonical_map`, `fabric_tag_audit`, `recommendation_baseline`) | VERIFIED | All 7 tables present with expected columns; `has_available_grade INTEGER NOT NULL` in `catalog_snapshots`. |
| `app-partners-recomendados/src/db/catalog-store.js` | Prepared-statement-only wrapper, no raw `db` export, `getCanonicalMap()` added | VERIFIED | `startIngestionRun`/`persistIngestionBatch`/`finishIngestionRun`/`getCanonicalMap` exported; no `db`/`Database` export found; all writes via `db.prepare(...).run(params)`. DB path now resolved via `__dirname` (WR-04). |
| `app-partners-recomendados/src/ingestion/stock-availability.js` | `getVariantStock`/`hasAvailableGrade`, D-04 rule | VERIFIED | Matches spec exactly; 6/6 tests pass. |
| `app-partners-recomendados/src/ingestion/fabric-taxonomy.js` | `auditFabricTags`, no fuzzy-matching | VERIFIED | Matches spec exactly; 5/5 tests pass. |
| `app-partners-recomendados/src/ingestion/ingest-catalog.js` | `runIngestion()` orchestrator, chains category→pagination→stock→tags→baseline→persist | VERIFIED | All steps present in correct order; `getCanonicalMap()`/`resolveCategoryIdByName` exported and reused per fix commits. |
| `app-partners-recomendados/scripts/run-ingestion.js` | Single-entry CLI script, prints summary | VERIFIED | Imports `runIngestion`, prints all 5 expected metrics, correct exit codes. |
| `app-partners-recomendados/.gitignore` | `data/*.db` + WAL/SHM sidecars ignored | VERIFIED | All 3 patterns present; live `git status --ignored` confirms `data/` fully ignored. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `client.js` (`listProducts`/`listCategories`/`getMetafields`) | `adaptive-limiter.js` | `fetchWithRateLimit(url, options, limiter)` | WIRED | Confirmed by direct code read — all three functions call it instead of raw `fetch`. |
| `resolve-category.js` | `ingest-catalog.js` | `import { resolveCategoryIdByName } from '../src/ingestion/ingest-catalog.js'` | WIRED | Confirmed — WR-05 fix removed the prior duplicated inline logic. |
| `ingest-catalog.js` (`runIngestion`) | `stock-availability.js` | `hasAvailableGrade(product, { minSizesInStock: 3 })` | WIRED | Called once per product in the main loop, result used for `availableCount` and persisted `has_available_grade`. |
| `ingest-catalog.js` (`runIngestion`) | `fabric-taxonomy.js` | `auditFabricTags(allProducts, canonicalMap)` | WIRED | Called once per batch (not per product), `canonicalMap` now sourced from `getCanonicalMap()` (WR-01 fix), not a hardcoded empty `Map`. |
| `ingest-catalog.js` (`runIngestion`) | `catalog-store.js` | `persistIngestionBatch({ runId, records })` | WIRED | Single call at end of loop; `db.transaction()` wraps all 5 record types. |
| `ingest-catalog.js` (`runIngestion`) | `client.js` | `getMetafields({ ownerId, limiter })` for baseline read (DATA-02) | WIRED | Called inside `readRecommendationBaseline()`, invoked per product before persistence. |
| `run-ingestion.js` | `ingest-catalog.js` | `import { runIngestion } from '../src/ingestion/ingest-catalog.js'` | WIRED | Confirmed. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `catalog_snapshots.has_available_grade` | `availableGrade` | `hasAvailableGrade(product, {...})` over real API products | Yes — live query on `run_id=4`: 143/645 = true | FLOWING |
| `recommendation_baseline.current_recommended_product_id` | `currentRecommendedProductId` | `getMetafields()` real API call per product | Yes — live query: 645 rows, 1 non-null (consistent with Phase 1's single test write) | FLOWING |
| `fabric_tag_audit` | `frequency`/`unmapped` | `auditFabricTags(allProducts, canonicalMap)` over real `product.tags` | Yes — live query: 366 distinct rows for run_id=4 | FLOWING |
| `catalog_snapshots.fabric_tag_raw` | `fabricTagRaw` | `rawTags.find((tag) => canonicalMap.has(tag))` | Yes (correctly NULL) — live query: 0 non-null rows for run_id=4, expected since `canonicalMap` is still empty (D-06/D-07 spreadsheet not yet imported) and CR-01 fix stops the arbitrary `rawTags[0]` fallback | FLOWING (correctly empty, not hollow — verified this is the intended post-fix behavior, not a stub) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full test suite passes | `cd app-partners-recomendados && npx vitest run` | `Test Files 3 passed (3)`, `Tests 16 passed (16)` | PASS |
| `data/` never leaks to git | `git status --short --ignored data/` | `!! data/` | PASS |
| Live catalog.db reflects the post-fix re-run | Direct `better-sqlite3` read-only query against `data/catalog.db` | `run_id=4`, `status='success'`, `products_read=645`, `available=143`, `baseline 645 rows (1 non-null)`, `fabric_tag_audit=366`, `fabric_tag_raw=0 non-null` | PASS — matches task's stated expectation exactly |
| All 7 review-fix commits exist in history | `git log --oneline` | `02bb7cc`, `d40f9e0`, `7313d3e`, `7cbc68e`, `476578a`, `7699eb4`, `fbce969` all present | PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` convention used by this project — skipped (N/A, project uses vitest + live-run checkpoints instead of shell probes).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| PLAT-02 | 02-01, 02-03 | Lê catálogo/variantes/estoque via API pública respeitando rate limits reais | SATISFIED | Adaptive limiter + paginated client verified live (run_id=4, 0 errors). |
| DATA-01 | 02-02, 02-03 | Lê estoque via `inventory_levels[]`, não `variant.stock` | SATISFIED | `getVariantStock` exclusively sums `inventory_levels`; live data shows 143/645 available. |
| DATA-02 | 02-03 | Lê recomendações atuais via Metafields antes de nova computação | SATISFIED | `readRecommendationBaseline` called before persistence; 645/645 rows persisted, 1 non-null. |
| DATA-03 | 02-02, 02-03 | Auditoria contínua de taxonomia de tags, reavaliada a cada execução | SATISFIED | `auditFabricTags` regenerates every run (366 rows both at run 1/2 and run 4); no fuzzy-matching; canonicalMap now actually read from DB post-fix. |

**No orphaned requirements** — REQUIREMENTS.md maps exactly PLAT-02/DATA-01/DATA-02/DATA-03 to Phase 2, and all four appear across the three plans' `requirements:` frontmatter.

### Anti-Patterns Found

None (blocker or warning level). Scanned all files modified across the phase (`client.js`, `adaptive-limiter.js`, `resolve-category.js`, `run-ingestion.js`, `catalog-store.js`, `schema.sql`, `fabric-taxonomy.js`, `stock-availability.js`, `ingest-catalog.js`, `.gitignore`) for `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`/hardcoded empty returns — no matches other than benign Portuguese-language substrings (e.g. "todo o lote", not an actual TODO marker).

The 3 Info-level findings from 02-REVIEW.md (IN-01 duplicate `.vercel` line, IN-02 `listCategories` truncation edge case, IN-03 snapshot color representativeness) were correctly excluded from the fix pass per `fix_scope: critical_warning` — these are cosmetic/low-priority and do not block phase goal achievement.

### Human Verification Required

### 1. WR-06 attribute-name-based color/size mapping — confirm against real API payload

**Test:** Inspect a real Vestidos product's `product.attributes` field (e.g., `node --env-file=.env -e "import('./src/nuvemshop-client/client.js').then(m=>m.getProduct(ID)).then(p=>console.log(JSON.stringify(p.attributes)))"`) and confirm the `.pt` values match `"Cor"`/`"Tamanho"` (or `"Color"`/`"Size"`) as `findAttributeIndex` expects. Ideally also test a product with only one attribute or attributes in reversed order.
**Expected:** `findAttributeIndex` returns the correct index for color/size by name (not falling back to the fixed positional guess) for the products actually in the Vestidos catalog.
**Why human:** No automated test exercises this logic (no `ingest-catalog.test.js` exists); 02-REVIEW-FIX.md explicitly flags this fix as unverified against real API data in the fixer's environment. The live full-catalog run succeeded, but success alone doesn't prove the name-based branch is what actually resolved the values (a silent fallback to position would look identical from the outside).

## Gaps Summary

No blocking gaps. All 4 phase requirements (PLAT-02, DATA-01, DATA-02, DATA-03) and all 5 ROADMAP.md Success Criteria for Phase 2 are satisfied by the current codebase state, including the full set of post-review fixes (1 critical + 6 warnings, all 7 commits confirmed present and correctly applied) and the live re-run against the real "Vestidos" category (run_id=4: 645 products, 143 available, 0 rate-limit errors, baseline read for 100% of products, tag audit regenerated with 366 distinct tags, `fabric_tag_raw` correctly NULL post-CR-01-fix).

One item (WR-06's attribute-name-based variant mapping) is present and wired but not behaviorally proven by a test or logged diagnostic — this was already self-flagged by the fixer as needing human confirmation against a real API payload, and is carried forward here as the sole human-verification item. It does not block phase completion since the underlying data (`colorValue`/`sizeValue`) is not consumed by anything yet in this phase (Phase 3's recommendation engine is the first real consumer) — but should be confirmed before Phase 3 relies on `variants.color_value`/`variants.size_value` for matching logic.

---

_Verified: 2026-07-11T04:30:00Z_
_Verifier: Claude (gsd-verifier)_
