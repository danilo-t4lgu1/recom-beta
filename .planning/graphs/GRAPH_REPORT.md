# Graph Report - Recomendados Talgui  (2026-07-15)

## Corpus Check
- 81 files · ~118,979 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 880 nodes · 879 edges · 105 communities (69 shown, 36 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `196b70b0`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Backend: Auth e Client (AST)
- Backend: Modulos de Alto Nivel (semantico)
- Endpoint de Recomendacoes
- Config do Pacote Backend
- Deploy Vercel
- Script Storefront v.Alpha
- Fase 1/2: Review e Verificacao
- Arquitetura e Stack Pesquisada
- Metafields e NubeSDK (conceitos)
- Pesquisa NubeSDK e Pitfalls
- Documentos Raiz do Projeto
- Pesquisa: Metafield POST
- Pesquisa: Pattern 3
- Pesquisa: Pitfall 1
- Pesquisa: Pitfall 4
- Fase 2: Criterio de Estoque (D-04)
- Fase 2: Armazenamento SQLite (D-10)
- REQUIREMENTS.md
- Pesquisa: Pitfall 6
- Implications for Roadmap
- Implementation Decisions
- Pitfalls Research
- Phase 01 Plan 04: Supressão do Bloco Nativo "Produtos Relacionados" Summary
- Pattern Assignments
- Phase 4: Preview e Aprovação Humana - Context
- recommendation-engine.js
- Phase 01 Plan 05: Publicação Pública + Verificação Visual ao Vivo (v.Alpha, D-11) Summary
- Phase 2 Plan 2: Schema SQLite, disponibilidade de estoque e auditoria de tags de tecido Summary
- Phase 3: Motor de Recomendação Determinístico - Context
- Phase 4: Preview e Aprovação Humana - Discussion Log
- Phase 01 Plan 02: Autenticação Real + Round-trip de Metafield Summary
- Phase 01 Plan 03: Endpoint Proprio + Script de Storefront v.Alpha (Script API Tradicional) Summary
- Phase 1: Spike de Viabilidade End-to-End - Context
- Phase 1: Code Review Report
- Phase 2 Plan 3: Baseline de recomendações + execução real completa da ingestão Summary
- Warnings
- v1 Requirements
- Phase 2 Plan 1: Cliente paginado + rate limiter adaptativo Summary
- Goal Achievement
- Phase 3 Plan 1: Motor de Recomendação Determinístico Summary
- Phase 3 Plan 2: Motor de Recomendação Determinístico Summary
- Feature Research
- Phase 01 Plan 01: Verificação de Compatibilidade de Tema com NubeSDK Summary
- Phase 3: Motor de Recomendação Determinístico - Pattern Map
- Stack Research
- Os 5 Critérios de Sucesso do Roadmap (Phase 1, ROADMAP.md)
- Goal Achievement
- Bot de Produtos Recomendados — Talgui
- Phase 1: Spike de Viabilidade End-to-End - Research
- Goal Achievement
- Phase Details
- Fixed Issues
- Phase 2: Ingestão de Catálogo e Qualidade de Dados - Discussion Log
- Session State
- Phase 1 — Validation Strategy
- Phase 2 — Validation Strategy
- Phase 1: Spike de Viabilidade End-to-End - Discussion Log
- Phase 1: Spike de Viabilidade End-to-End - Pattern Map
- Architecture Patterns
- Walking Skeleton — Bot de Produtos Recomendados (Talgui)
- Phase 3: Motor de Recomendação Determinístico - Discussion Log
- User Constraints (from CONTEXT.md)
- 02-UAT.md
- Code Examples
- Common Pitfalls
- Validation Architecture
- 03-01-PLAN.md
- 03-02-PLAN.md
- 01-01-PLAN.md
- 01-02-PLAN.md
- 01-03-PLAN.md
- 01-04-PLAN.md
- 01-05-PLAN.md
- Standard Stack
- Sources
- 02-01-PLAN.md
- 02-02-PLAN.md
- 02-03-PLAN.md
- Security Domain
- Nuvemshop API Client
- Recommendations API Handler
- Backend Server
- Vercel API Endpoint
- Nuvemshop NubeSDK
- Nuvemshop Public API
- Nuvemshop Partners Portal
- Phase 1 Context
- Phase 1 Decision
- Renderização via UI Slots (NubeSDK)
- CR-02: Unencoded productId in URLs
- Phase 1 Verification: Passed
- Walking Skeleton Capability
- D-01: Categoria piloto Vestidos
- Pattern 1: Snapshot-and-Diff
- Pattern 3: Metafields as Integration Buffer
- Critical Pitfall: Legacy Script Deprecation
- Critical Finding: NubeSDK cannot call Admin API directly
- Metafield Roundtrip Script
- Nuvemshop Script API (Legacy)
- Storefront Script v.Alpha
- orgId
- projectId

## God Nodes (most connected - your core abstractions)
1. `Phase 1: Spike de Viabilidade End-to-End - Research` - 19 edges
2. `Phase 2: Ingestão de Catálogo e Qualidade de Dados - Research` - 19 edges
3. `Phase 01 Plan 04: Supressão do Bloco Nativo "Produtos Relacionados" Summary` - 15 edges
4. `runIngestion()` - 14 edges
5. `Phase 01 Plan 03: Endpoint Proprio + Script de Storefront v.Alpha (Script API Tradicional) Summary` - 12 edges
6. `Phase 01 Plan 05: Publicação Pública + Verificação Visual ao Vivo (v.Alpha, D-11) Summary` - 12 edges
7. `Phase 2 Plan 2: Schema SQLite, disponibilidade de estoque e auditoria de tags de tecido Summary` - 12 edges
8. `Phase 2 Plan 3: Baseline de recomendações + execução real completa da ingestão Summary` - 12 edges
9. `Goal Achievement` - 12 edges
10. `getMetafields()` - 11 edges

## Surprising Connections (you probably didn't know these)
- `main()` --calls--> `runIngestion()`  [EXTRACTED]
  app-partners-recomendados/scripts/run-ingestion.js → app-partners-recomendados/src/ingestion/ingest-catalog.js
- `listAllProductsInCategory()` --calls--> `listProducts()`  [EXTRACTED]
  app-partners-recomendados/src/ingestion/ingest-catalog.js → app-partners-recomendados/src/nuvemshop-client/client.js
- `readRecommendationBaseline()` --calls--> `getMetafields()`  [EXTRACTED]
  app-partners-recomendados/src/ingestion/ingest-catalog.js → app-partners-recomendados/src/nuvemshop-client/client.js
- `handler()` --calls--> `getRecommendations()`  [EXTRACTED]
  app-partners-recomendados/api/recommendations/[productId].js → app-partners-recomendados/src/api/recommendations.js
- `main()` --calls--> `resolveCategoryIdByName()`  [EXTRACTED]
  app-partners-recomendados/scripts/resolve-category.js → app-partners-recomendados/src/ingestion/ingest-catalog.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Phase 1 End-to-End Spike Flow** — app_partners_auth, app_partners_client, app_partners_vercel_api, storefront_script_alpha, metafields [EXTRACTED 1.00]
- **Nuvemshop App Integration Pattern** — app_partners_auth, app_partners_client, nuvemshop_api, nuvemshop_partners [INFERRED 0.90]

## Communities (105 total, 36 thin omitted)

### Community 0 - "Backend: Auth e Client (AST)"
Cohesion: 0.16
Nodes (17): handler(), setCorsHeaders(), main(), main(), getRecommendations(), getAccessToken(), resolveCategoryIdByName(), assertOk() (+9 more)

### Community 2 - "Endpoint de Recomendacoes"
Cohesion: 0.04
Nodes (48): Alternatives Considered, Anti-Patterns to Avoid, Applicable ASVS Categories, Architectural Responsibility Map, Architecture Patterns, Assumptions Log, Claude's Discretion, Code Examples (+40 more)

### Community 3 - "Config do Pacote Backend"
Cohesion: 0.15
Nodes (12): dependencies, better-sqlite3, devDependencies, vitest, engines, node, name, private (+4 more)

### Community 5 - "Script Storefront v.Alpha"
Cohesion: 0.60
Nodes (5): escapeHtml(), fetchRecommendation(), getCurrentProductId(), init(), renderRecommendationBlock()

### Community 10 - "Documentos Raiz do Projeto"
Cohesion: 0.09
Nodes (30): main(), db, DB_DIR, __dirname, finishIngestionRun(), getCanonicalMap(), insertFabricAudit, insertIngestionRun (+22 more)

### Community 20 - "REQUIREMENTS.md"
Cohesion: 0.07
Nodes (26): Anti-Pattern 1: Writing to Nuvemshop directly from the rules engine, Anti-Pattern 2: Treating the native "Produtos Relacionados" field as eventually writable, Anti-Pattern 3: Assuming the storefront script has full DOM control like a classic Script, Anti-Pattern 4: Per-recommended-item metafield writes, Anti-Patterns, Architectural Patterns, Architecture Research, Component Responsibilities (+18 more)

### Community 22 - "Implications for Roadmap"
Cohesion: 0.09
Nodes (22): Architecture Approach, Confidence Assessment, Critical Pitfalls, Executive Summary, Expected Features, Gaps to Address, Implications for Roadmap, Key Findings (+14 more)

### Community 23 - "Implementation Decisions"
Cohesion: 0.10
Nodes (20): Armazenamento do catálogo ingerido, Baseline de recomendações atuais (DATA-02), Canonical References, Claude's Discretion, Contexto e requisitos do projeto, Critério de "estoque disponível", Deferred Ideas, Escala e escopo da ingestão (+12 more)

### Community 24 - "Pitfalls Research"
Cohesion: 0.10
Nodes (19): Critical Pitfalls, Integration Gotchas, "Looks Done But Isn't" Checklist, Performance Traps, Pitfall 1: Building on the write_scripts/legacy-script path that is being actively deprecated (2026-10-30), Pitfall 2: NubeSDK has no slot to hide/replace the native "Produtos Relacionados" block — visual conflict risk, Pitfall 3: Treating `variant.stock` as authoritative — silent recommendation errors from multi-inventory/multi-location stock, Pitfall 4: Rate-limit exhaustion from naive full-catalog scans (592 products, daily schedule) (+11 more)

### Community 25 - "Phase 01 Plan 04: Supressão do Bloco Nativo "Produtos Relacionados" Summary"
Cohesion: 0.11
Nodes (18): Accomplishments, Confirmação de D-04 (Ocultamento Limpo), Decisions Made, Dependency graph, Deviations from Plan, Evidência Técnica (Antes/Depois), Files Created/Modified, Issues Encountered (+10 more)

### Community 26 - "Pattern Assignments"
Cohesion: 0.11
Nodes (18): `app-partners-recomendados/src/auth/nuvemshop-auth.js` (REUSE, unmodified), `app-partners-recomendados/src/db/catalog-store.js` (NEW), `app-partners-recomendados/src/db/schema.sql` (NEW), `app-partners-recomendados/src/ingestion/fabric-taxonomy.js` (NEW, pure logic), `app-partners-recomendados/src/ingestion/ingest-catalog.js` (NEW), `app-partners-recomendados/src/ingestion/stock-availability.js` (NEW, pure logic), `app-partners-recomendados/src/nuvemshop-client/client.js` (EXTEND), `app-partners-recomendados/src/rate-limit/adaptive-limiter.js` (NEW) (+10 more)

### Community 27 - "Phase 4: Preview e Aprovação Humana - Context"
Cohesion: 0.11
Nodes (18): Canonical References, Claude's Discretion, Curadoria manual (o que o humano pode editar), Deferred Ideas, Escopo da fila de revisão (quais produtos aparecem), Established Patterns, Estado "antes" e leitura do catálogo (input do baseline), Existing Code Insights (+10 more)

### Community 28 - "recommendation-engine.js"
Cohesion: 0.19
Nodes (13): getLatestSnapshotProducts(), recommendations, buildRecommendation(), CENTRAL_SIZES_LETTER, CENTRAL_SIZES_NUMERIC, compareByCentralSizesStock(), compareByProductIdAsc(), compareBySizesWithStock() (+5 more)

### Community 29 - "Phase 01 Plan 05: Publicação Pública + Verificação Visual ao Vivo (v.Alpha, D-11) Summary"
Cohesion: 0.11
Nodes (17): Accomplishments, Auto-fixed Issues (subagente executor, antes do checkpoint), Correções pós-checkpoint (conduzidas pelo orquestrador com o usuário, durante a investigação ao vivo da Task 2 — não um desvio no sentido das Regras 1-4, mas trabalho real de depuração necessário para completar a verificação visual que a própria Task 2 exige), Decisions Made, Dependency graph, Deviations from Plan, Files Created/Modified, Issues Encountered (+9 more)

### Community 30 - "Phase 2 Plan 2: Schema SQLite, disponibilidade de estoque e auditoria de tags de tecido Summary"
Cohesion: 0.12
Nodes (16): Accomplishments, Auto-fixed Issues, Checkpoint Resolvido (Task 0 — Open Question A4), Decisions Made, Dependency graph, Deviations from Plan, Files Created/Modified, Issues Encountered (+8 more)

### Community 31 - "Phase 3: Motor de Recomendação Determinístico - Context"
Cohesion: 0.12
Nodes (16): Canonical References, Claude's Discretion, Dados e schema herdados da Fase 2 (input do motor), Deferred Ideas, Desempate quando há mais de 8 elegíveis, Elegibilidade do produto-fonte e critério de tecido (RULE-01/D-09), Established Patterns, Existing Code Insights (+8 more)

### Community 32 - "Phase 4: Preview e Aprovação Humana - Discussion Log"
Cohesion: 0.12
Nodes (16): Claude's Discretion, Como a Fase 4 entrega o gate de backend (SC#3)?, Como o dry-run se comporta na Fase 4?, Curadoria manual, Deferred Ideas, Escopo da fila, Item de backfill: revisável ou automático?, O humano pode editar a recomendação antes de aprovar? (+8 more)

### Community 33 - "Phase 01 Plan 02: Autenticação Real + Round-trip de Metafield Summary"
Cohesion: 0.12
Nodes (15): Accomplishments, Auto-fixed Issues, Decisions Made, Dependency graph, Deviations from Plan, Files Created/Modified, Issues Encountered, Metrics (+7 more)

### Community 34 - "Phase 01 Plan 03: Endpoint Proprio + Script de Storefront v.Alpha (Script API Tradicional) Summary"
Cohesion: 0.12
Nodes (15): Accomplishments, Decisions Made, Dependency graph, Deviations from Plan, Files Created/Modified, Issues Encountered, Metrics, Next Phase Readiness (+7 more)

### Community 35 - "Phase 1: Spike de Viabilidade End-to-End - Context"
Cohesion: 0.12
Nodes (15): Acesso ao App Partners, Bloco nativo vs. customizado, Canonical References, Claude's Discretion, Contexto e requisitos do projeto, Credenciais existentes (não usar diretamente nesta fase, mas relevante), Deferred Ideas, Documentação oficial NubeSDK (pesquisado em 2026-07-09, em resposta a dúvida do usuário sobre necessidade real do NubeSDK) (+7 more)

### Community 36 - "Phase 1: Code Review Report"
Cohesion: 0.12
Nodes (15): CR-01: Unescaped product data injected into DOM via `insertAdjacentHTML` (stored/reflected HTML injection), CR-02: Unencoded `productId` interpolated into outbound Nuvemshop API URLs (query/path injection), Critical Issues, Fixes Applied, IN-01: Duplicate/hardcoded `NAMESPACE`/`KEY` constants across two files, IN-02: `USER_AGENT` contains a personal email hardcoded in source, IN-03: CORS origin allowlist is a single hardcoded string with no `www.` variant handling, Info (+7 more)

### Community 37 - "Phase 2 Plan 3: Baseline de recomendações + execução real completa da ingestão Summary"
Cohesion: 0.12
Nodes (15): Accomplishments, Checkpoint Resolvido (Task 3 — execução real), Decisions Made, Dependency graph, Deviations from Plan, Files Created/Modified, Issues Encountered, Metrics (+7 more)

### Community 38 - "Warnings"
Cohesion: 0.12
Nodes (15): CR-01: `fabric_tag_raw` snapshot picks an arbitrary tag, not the fabric tag, Critical Issues, IN-01: Duplicate `.vercel` entry and stray blank line in `.gitignore`, IN-02: `listCategories` "more than 200 categories" warning is unreachable in practice but silently truncates data if it ever fires, IN-03: `snapshots[].colorValue` derived from `product.variants[0]` regardless of how many colors the product has, Info, Phase 02: Code Review Report, Summary (+7 more)

### Community 39 - "v1 Requirements"
Cohesion: 0.12
Nodes (15): Eficiência de Aprovação, Gravação e Segurança Operacional, Leitura de Dados, Motor de Recomendação, Observabilidade, Out of Scope, Plataforma e Fundação, Preview e Aprovação (+7 more)

### Community 40 - "Phase 2 Plan 1: Cliente paginado + rate limiter adaptativo Summary"
Cohesion: 0.13
Nodes (14): Accomplishments, Decisions Made, Dependency graph, Deviations from Plan, Files Created/Modified, Issues Encountered, Metrics, Next Phase Readiness (+6 more)

### Community 41 - "Goal Achievement"
Cohesion: 0.13
Nodes (14): 1. WR-06 attribute-name-based color/size mapping — confirm against real API payload, Anti-Patterns Found, Behavior-Unverified Item (routed to Human Verification), Behavioral Spot-Checks, Data-Flow Trace (Level 4), Gaps Summary, Goal Achievement, Human Verification Required (+6 more)

### Community 42 - "Phase 3 Plan 1: Motor de Recomendação Determinístico Summary"
Cohesion: 0.13
Nodes (14): Accomplishments, Decisions Made, Dependency graph, Deviations from Plan, Files Created/Modified, Issues Encountered, Metrics, Next Phase Readiness (+6 more)

### Community 43 - "Phase 3 Plan 2: Motor de Recomendação Determinístico Summary"
Cohesion: 0.13
Nodes (14): Accomplishments, Decisions Made, Dependency graph, Deviations from Plan, Files Created/Modified, Issues Encountered, Metrics, Next Phase Readiness (+6 more)

### Community 44 - "Feature Research"
Cohesion: 0.13
Nodes (14): Add After Validation (v1.x), Anti-Features (Deliberately Avoid), Competitor Feature Analysis, Dependency Notes, Differentiators (Competitive Advantage / Valuable Additions), Feature Dependencies, Feature Landscape, Feature Prioritization Matrix (+6 more)

### Community 45 - "Phase 01 Plan 01: Verificação de Compatibilidade de Tema com NubeSDK Summary"
Cohesion: 0.14
Nodes (13): Accomplishments, Decisions Made, Dependency graph, Deviations from Plan, Files Created/Modified, Issues Encountered, Metrics, Next Phase Readiness (+5 more)

### Community 46 - "Phase 3: Motor de Recomendação Determinístico - Pattern Map"
Cohesion: 0.14
Nodes (13): Decision-ID traceability comments, Defensive, non-throwing domain functions, File Classification, JSDoc on every exported function, Metadata, Named constants for business values, No Analog Found, Pattern Assignments (+5 more)

### Community 47 - "Stack Research"
Cohesion: 0.14
Nodes (13): Alternatives Considered, Core Technologies, Critical Architecture Finding (reads on all downstream choices), Development Tools, Installation, Recommended Stack, Rollback / previous-state storage — recommendation, Sources (+5 more)

### Community 48 - "Os 5 Critérios de Sucesso do Roadmap (Phase 1, ROADMAP.md)"
Cohesion: 0.15
Nodes (12): Critério 1 — App Partners privado autentica com sucesso contra a loja real Talgui, Critério 2 — Metafield escrito via API pública confirmado por leitura de volta (round-trip), Critério 3 — Script (v.Alpha, per D-11) lê o Metafield no navegador e renderiza o bloco "Recomendados" visível na página real, confirmado ao vivo, Critério 4 — Documentado, com evidência, se o tema suporta NubeSDK e se o bloco nativo pode ser suprimido sem conflito visual, Critério 5 — Decisão explícita de viabilidade registrada, DECISÃO FINAL, Fase 1 — Decisão Final de Viabilidade, Justificativa (+4 more)

### Community 49 - "Goal Achievement"
Cohesion: 0.15
Nodes (12): Anti-Patterns Found, Behavioral Spot-Checks, Data-Flow Trace (Level 4), Gaps Summary, Goal Achievement, Human Verification Required, Key Link Verification, Note on Verification Methodology (+4 more)

### Community 50 - "Bot de Produtos Recomendados — Talgui"
Cohesion: 0.15
Nodes (12): Active, Bot de Produtos Recomendados — Talgui, Constraints, Context, Core Value, Evolution, Key Decisions, Out of Scope (+4 more)

### Community 51 - "Phase 1: Spike de Viabilidade End-to-End - Research"
Cohesion: 0.17
Nodes (11): Architectural Responsibility Map, Assumptions Log, Don't Hand-Roll, Environment Availability, Metadata, Open Questions, Package Legitimacy Audit, Phase 1: Spike de Viabilidade End-to-End - Research (+3 more)

### Community 52 - "Goal Achievement"
Cohesion: 0.17
Nodes (11): Anti-Patterns Found, Behavioral Spot-Checks, Data-Flow Trace (Level 4), Gaps Summary, Goal Achievement, Human Verification Required, Key Link Verification, Observable Truths (+3 more)

### Community 53 - "Phase Details"
Cohesion: 0.17
Nodes (11): Overview, Phase 1: Spike de Viabilidade End-to-End, Phase 2: Ingestão de Catálogo e Qualidade de Dados, Phase 3: Motor de Recomendação Determinístico, Phase 4: Preview e Aprovação Humana, Phase 5: Gravação Segura em Produção, Phase 6: Operação Diária Autônoma na Nuvem, Phase Details (+3 more)

### Community 54 - "Fixed Issues"
Cohesion: 0.18
Nodes (10): CR-01: `fabric_tag_raw` snapshot picks an arbitrary tag, not the fabric tag, Fixed Issues, Phase 02: Code Review Fix Report, Skipped Issues, WR-01: `fabric_tag_canonical_map` table is never read — canonical mapping is permanently dead code, WR-02: Unbounded recursive retry on persistent HTTP 429, WR-03: `productsRead: 0` hardcoded on failure even when the real count is already known, WR-04: SQLite database path is relative to `process.cwd()`, not to the module file (+2 more)

### Community 55 - "Phase 2: Ingestão de Catálogo e Qualidade de Dados - Discussion Log"
Cohesion: 0.22
Nodes (8): Armazenamento do catálogo ingerido, Claude's Discretion, Deferred Ideas, Escala e categoria piloto (subárea que emergiu durante a discussão de estoque), Estratégia de leitura de estoque, Leitura de recomendações atuais (baseline), Padronização de tags de tecido, Phase 2: Ingestão de Catálogo e Qualidade de Dados - Discussion Log

### Community 56 - "Session State"
Cohesion: 0.22
Nodes (8): Blockers, Decisions, Performance Metrics, Position, Project Reference, Session, Session Log, Session State

### Community 57 - "Phase 1 — Validation Strategy"
Cohesion: 0.25
Nodes (7): Manual-Only Verifications, Per-Task Verification Map, Phase 1 — Validation Strategy, Sampling Rate, Test Infrastructure, Validation Sign-Off, Wave 0 Requirements

### Community 58 - "Phase 2 — Validation Strategy"
Cohesion: 0.25
Nodes (7): Manual-Only Verifications, Per-Task Verification Map, Phase 2 — Validation Strategy, Sampling Rate, Test Infrastructure, Validation Sign-Off, Wave 0 Requirements

### Community 59 - "Phase 1: Spike de Viabilidade End-to-End - Discussion Log"
Cohesion: 0.29
Nodes (6): Acesso ao App Partners, Bloco nativo vs. customizado, Claude's Discretion, Deferred Ideas, Persistência pós-spike, Phase 1: Spike de Viabilidade End-to-End - Discussion Log

### Community 60 - "Phase 1: Spike de Viabilidade End-to-End - Pattern Map"
Cohesion: 0.29
Nodes (6): Codebase Scan Result, File Classification (Planned New Files, No Analog Available), Guidance for Planner, Metadata, No Analog Found, Phase 1: Spike de Viabilidade End-to-End - Pattern Map

### Community 61 - "Architecture Patterns"
Cohesion: 0.29
Nodes (7): Anti-Patterns to Avoid, Architecture Patterns, Pattern 1: Autenticação de App Partners privado, Pattern 2: Renderização via UI Slots (NubeSDK), Pattern 3: Supressão do bloco nativo via CSS/layout no admin, Recommended Project Structure, System Architecture Diagram

### Community 62 - "Walking Skeleton — Bot de Produtos Recomendados (Talgui)"
Cohesion: 0.29
Nodes (6): Capability Provada de Ponta a Ponta, Decisões Arquiteturais, Fora de Escopo (Adiado para Fatias Futuras), Plano de Fatias Subsequentes, Stack Tocada na Fase 1, Walking Skeleton — Bot de Produtos Recomendados (Talgui)

### Community 63 - "Phase 3: Motor de Recomendação Determinístico - Discussion Log"
Cohesion: 0.29
Nodes (6): Claude's Discretion, Deferred Ideas, Desempate acima de 8 elegíveis, Elegibilidade do produto-fonte, Formato de saída do motor, Phase 3: Motor de Recomendação Determinístico - Discussion Log

### Community 64 - "User Constraints (from CONTEXT.md)"
Cohesion: 0.33
Nodes (6): Calendário de deprecação NubeSDK (já confirmado em CONTEXT.md, não re-pesquisar), Canonical References (must read before implementing), Claude's Discretion, Deferred Ideas (OUT OF SCOPE), Locked Decisions, User Constraints (from CONTEXT.md)

### Community 65 - "02-UAT.md"
Cohesion: 0.33
Nodes (5): 1. Mapeamento de cor/tamanho por nome de atributo (WR-06), Current Test, Gaps, Summary, Tests

### Community 66 - "Code Examples"
Cohesion: 0.40
Nodes (5): Code Examples, Endpoint de criação de Metafield (WRTE-01), Leitura de volta do Metafield (round-trip do Critério de Sucesso 2), Script NubeSDK mínimo (FRNT-01), tsup.config.js (build do Script)

### Community 67 - "Common Pitfalls"
Cohesion: 0.40
Nodes (5): Common Pitfalls, Pitfall 1: Assumir que qualquer tema Nuvemshop suporta NubeSDK no storefront, Pitfall 2: Tentar renderizar em um slot que não existe para o tema/template atual, Pitfall 3: Ocultamento parcial do bloco nativo (viola D-04), Pitfall 4: Confundir App Sob Medida (custom app) existente com o novo App Partners

### Community 68 - "Validation Architecture"
Cohesion: 0.40
Nodes (5): Phase Requirements → Test Map, Sampling Rate, Test Framework, Validation Architecture, Wave 0 Gaps

### Community 69 - "03-01-PLAN.md"
Cohesion: 0.40
Nodes (4): Artifacts this phase produces (deste plano), Phase Goal, STRIDE Threat Register, Trust Boundaries

### Community 70 - "03-02-PLAN.md"
Cohesion: 0.40
Nodes (4): Artifacts this phase produces (deste plano), Phase Goal, STRIDE Threat Register, Trust Boundaries

### Community 71 - "01-01-PLAN.md"
Cohesion: 0.50
Nodes (3): Artifacts this phase produces (deste plano), STRIDE Threat Register, Trust Boundaries

### Community 72 - "01-02-PLAN.md"
Cohesion: 0.50
Nodes (3): Artifacts this phase produces (deste plano), STRIDE Threat Register, Trust Boundaries

### Community 73 - "01-03-PLAN.md"
Cohesion: 0.50
Nodes (3): Artifacts this phase produces (deste plano), STRIDE Threat Register, Trust Boundaries

### Community 74 - "01-04-PLAN.md"
Cohesion: 0.50
Nodes (3): Artifacts this phase produces (deste plano), STRIDE Threat Register, Trust Boundaries

### Community 75 - "01-05-PLAN.md"
Cohesion: 0.50
Nodes (3): Artifacts this phase produces (deste plano), STRIDE Threat Register, Trust Boundaries

### Community 76 - "Standard Stack"
Cohesion: 0.50
Nodes (4): Alternatives Considered, Core, Standard Stack, Supporting

### Community 77 - "Sources"
Cohesion: 0.50
Nodes (4): Primary (HIGH confidence), Secondary (MEDIUM confidence), Sources, Tertiary (LOW confidence)

### Community 78 - "02-01-PLAN.md"
Cohesion: 0.50
Nodes (3): Artifacts this phase produces (deste plano), STRIDE Threat Register, Trust Boundaries

### Community 79 - "02-02-PLAN.md"
Cohesion: 0.50
Nodes (3): Artifacts this phase produces (deste plano), STRIDE Threat Register, Trust Boundaries

### Community 80 - "02-03-PLAN.md"
Cohesion: 0.50
Nodes (3): Artifacts this phase produces (deste plano), STRIDE Threat Register, Trust Boundaries

### Community 81 - "Security Domain"
Cohesion: 0.67
Nodes (3): Applicable ASVS Categories, Known Threat Patterns for este stack, Security Domain

## Knowledge Gaps
- **616 isolated node(s):** `name`, `version`, `private`, `type`, `node` (+611 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **36 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Phase 1: Spike de Viabilidade End-to-End - Research` connect `Phase 1: Spike de Viabilidade End-to-End - Research` to `User Constraints (from CONTEXT.md)`, `Code Examples`, `Common Pitfalls`, `Validation Architecture`, `Standard Stack`, `Sources`, `Security Domain`, `Architecture Patterns`?**
  _High betweenness centrality (0.003) - this node is a cross-community bridge._
- **Why does `getMetafields()` connect `Backend: Auth e Client (AST)` to `Documentos Raiz do Projeto`?**
  _High betweenness centrality (0.001) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _623 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Endpoint de Recomendacoes` be split into smaller, more focused modules?**
  _Cohesion score 0.04081632653061224 - nodes in this community are weakly interconnected._
- **Should `Documentos Raiz do Projeto` be split into smaller, more focused modules?**
  _Cohesion score 0.08677098150782361 - nodes in this community are weakly interconnected._
- **Should `REQUIREMENTS.md` be split into smaller, more focused modules?**
  _Cohesion score 0.07407407407407407 - nodes in this community are weakly interconnected._
- **Should `Implications for Roadmap` be split into smaller, more focused modules?**
  _Cohesion score 0.08695652173913043 - nodes in this community are weakly interconnected._