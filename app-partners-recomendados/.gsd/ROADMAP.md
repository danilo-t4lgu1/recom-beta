# Roadmap: Bot de Produtos Recomendados — Talgui

## Overview

Este roadmap consolida o ciclo de desenvolvimento do sistema de recomendações da Talgui: do spike de viabilidade e ingestão de pedidos históricos com análise de co-compra, até o motor determinístico em produção, o carrossel nativo com o sinal de Look Comprovado (Fase 08), e a nova frente de atuação no **Painel de Exibição e Gestão do App Recom** (`web/`).

---

## Phases Overview

- [x] **Phase 1: Spike de Viabilidade End-to-End** — Prova de round-trip de Metafield e supressão de bloco nativo (completed 2026-07-10)
- [x] **Phase 2: Ingestão de Catálogo e Qualidade de Dados** — Snapshot do catálogo real e taxonomia de tecidos (completed 2026-07-11)
- [x] **Phase 3: Motor de Recomendação Determinístico** — Elegibilidade e desempate determinístico (completed 2026-07-15)
- [x] **Phase 03.1: Critério de Grupo de Produtos (INSERTED)** — Cota fixa 4+4 entre Look Inteiro e Partes Cima/Baixo (completed 2026-07-15)
- [x] **Phase 4: Preview e Aprovação Humana** — Painel interno de curadoria e recomputação (completed 2026-07-16)
- [x] **Phase 5: Gravação Segura em Produção** — Escritas com snapshot, rollback e log de auditoria (completed 2026-07-16)
- [x] **Phase 6: Operação Diária Autônoma na Nuvem** — Cron diário no GitHub Actions com cache de 24h (completed 2026-07-17)
- [x] **Phase 7: Rollout do Motor no Catálogo Completo** — 11 categorias, disjuntor de churn e defesas de integridade (completed 2026-07-24)
- [x] **Phase 8: App de Vitrine no Storefront** — Carrossel de rolagem nativa, navegação glassmorphism e flag "Sugestão de Look" (completed 2026-09-18)
- [ ] **Phase 9: Dashboard de Métricas GA4** — [ADIADA para milestone futuro a pedido do usuário]
- [ ] **Phase 10: Migração para NubeSDK** — [Prazo regulatório out/2026]
- [ ] **Phase 11: Painel de Exibição e Gestão do App Recom** — [EM PLANEJAMENTO — Foco Antigravity]

---

## Phase Details

### Phase 8: App de Vitrine de Recomendados no Storefront (Concluída)
- **Goal:** Redesenho completo do carrossel no storefront (substituição do Swiper por flexbox horizontal nativo + scroll-snap), eliminação do auto-avanço de 3s, adição de controles de navegação circulares glassmorphism e exibição do selo preto "Sugestão de Look" exclusivamente para itens com `isProvenLook: true`.
- **Status:** Complete (3/3 planos verificados e script publicado no Nuvemshop Partners).

### Phase 11: Painel de Exibição e Gestão do App Recom (Planejada — Pronta para Execução)
- **Goal:** Desenvolver e expandir a interface do Painel Administrativo do App Recom (`web/`), proporcionando uma visão gerencial e operacional completa:
  1. **Hub de Inteligência de Looks:** Visualização dos 1.373 pares de co-compra reais (`co_purchase_pairs`), ordenados por força de associação e volume de pedidos.
  2. **Explorador Visual de Recomendações por Produto:** Mecanismo de busca e inspeção individual (digitar nome ou ID de qualquer produto e visualizar na hora a vitrine exata que o motor gera para ele, com motivos de match e pesos 0/1/2).
  3. **Monitor de Saúde Operacional & Disjuntor:** Indicadores de churn de catálogo, alertas de produtos órfãos de categoria, status das últimas execuções do cron e telemetria de cobertura por categoria.
  4. **Scaffolding de Vínculo Manual de Recomendados:** Interface estruturada e funcional para curadoria manual (pronta para futura persistência pelo Claude Code).
  5. **Design System & UX:** Estética *Luxury Minimal / Clean Utilitarian* (/frontend-design, DFII 12/15), paleta escura sutil, tipografia refinada, zero emojis genéricos (ícones SVG inline).
- **Subsystem:** `app-partners-recomendados/web`
- **Depends on:** Phase 8
- **Plans:**
  - [ ] **11.1: Backend Domain Models & Query Selectors** (Wave 1) — Funções puras em `src/api/admin-intelligence.js`, testes Vitest e atualização de `prepare-admin-api.mjs`.
  - [ ] **11.2: Vercel Serverless Endpoints & API Client** (Wave 2) — Rotas serverless em `web/api/*.js` e cliente frontend `web/src/api/client.js`.
  - [ ] **11.3: Design System, Tokens, Icons & Shell Navigation** (Wave 3) — Design system em `index.css`, ícones vetoriais SVG e shell de abas navegável no `App.jsx`.
  - [ ] **11.4: Inspetor Visual de Vitrines & Scaffolding de Vínculo Manual** (Wave 4) — `InspectorTab.jsx` com autocomplete e vitrine simulada + `ManualCurationTab.jsx` com slots reativos de curadoria.
  - [ ] **11.5: Hub de Looks Comprovados & Painel de Saúde do Catálogo** (Wave 5) — `LooksHubTab.jsx` com 1.373 pares paginados/filtráveis + `CatalogHealthTab.jsx` com as 11 categorias e disjuntor.
  - [ ] **11.6: Verificação Empírica, Screenshots no Browser & Documentação** (Wave 6) — Testes automatizados, build, lint, screenshots em alta resolução no browser e relatório `VERIFICATION.md`.
- **Status:** Planned (6/6 plans defined)

