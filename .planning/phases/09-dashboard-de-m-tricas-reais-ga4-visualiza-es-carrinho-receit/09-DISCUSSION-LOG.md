# Phase 9: Dashboard de Métricas Reais (GA4) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-23
**Phase:** 9-Dashboard de Métricas Reais (GA4)
**Areas discussed:** Pré-checagem (Fase 8 / pré-requisitos GA4), Qual script instrumentar, Onde mora o dashboard, Métricas e apresentação do dashboard, Credenciais da service account Google

---

## Pré-checagem: Fase 8 vs Fase 9

| Option | Description | Selected |
|--------|-------------|----------|
| Fase 8 já está pronta, seguir para 9 | main-partners.js é o entregável real da Fase 8, tratar como concluída funcionalmente | ✓ |
| Parar e planejar a Fase 8 primeiro | Rodar /gsd-plan-phase 8 antes de discutir a Fase 9 | |
| Outra situação | main-partners.js seria rascunho/teste | |

**User's choice:** Fase 8 já está pronta, seguir para 9
**Notes:** Registrado como D-72 no CONTEXT.md — pendência de rastreabilidade (Fase 8 sem CONTEXT/PLAN formal) anotada como Deferred Idea, não bloqueante.

---

## Pré-checagem: Pré-requisitos GA4

| Option | Description | Selected |
|--------|-------------|----------|
| Ambos já prontos | GA4 instalado + acesso admin para service account | ✓ |
| Nenhum ainda | Precisa confirmar/fazer antes da execução | |
| Não sei / preciso verificar | Incógnita a confirmar | |

**User's choice:** Ambos já prontos
**Notes:** Registrado como D-71 — pesquisa/planejamento podem seguir sem bloqueio.

---

## Qual script instrumentar com GA4

| Option | Description | Selected |
|--------|-------------|----------|
| main-partners.js (carrossel) | Versão mais recente, formato carrossel nativo Swiper | ✓ |
| main.js (v.Alpha original) | Versão original, link simples sem carrossel | |
| Ambos coexistem / não tenho certeza | | |

**User's choice:** main-partners.js (carrossel) — D-73
**Notes:** Confirmado como o script real ativo/publicado recebendo tráfego real.

| Option | Description | Selected |
|--------|-------------|----------|
| Sim, usar window.gtag() diretamente | Assume gtag.js do tema já carregado | ✓ |
| Empurrar para window.dataLayer | Mais robusto se houver GTM no meio | |
| Você decide | | |

**User's choice:** window.gtag() diretamente — D-74

| Option | Description | Selected |
|--------|-------------|----------|
| Descobrir na pesquisa (padrão) | Investigar hook de add_to_cart do tema Morelia | ✓ |
| Já sei como funciona, vou descrever | | |

**User's choice:** Descobrir na pesquisa — D-75

| Option | Description | Selected |
|--------|-------------|----------|
| item_list_name="Recomendados" basta | Bloco nativo suprimido, sem risco de mistura | ✓ |
| Adicionar item_list_id extra também | | |

**User's choice:** item_list_name="Recomendados" basta — D-76

---

## Onde mora o dashboard

| Option | Description | Selected |
|--------|-------------|----------|
| Nova rota no review-server.js (ex: GET /metrics) | Reaproveita servidor existente, mesmo padrão SSR | ✓ (recomendação de Claude, aceita) |
| Arquivo/serviço separado | | |

**User's choice:** perguntou a recomendação de Claude; Claude recomendou reaproveitar review-server.js; usuário aceitou — D-77
**Notes:** Justificativa: single deploy no Vercel, mesmo padrão zero-framework já usado em /audit, evita duplicar setup do client GA4.

| Option | Description | Selected |
|--------|-------------|----------|
| Sem autenticação, mesma postura do /audit | Consistente com D-37 | |
| Adicionar proteção simples | Dados de receita são mais sensíveis | ✓ |

**User's choice:** Adicionar proteção simples — D-78
**Notes:** Mecanismo exato (token/senha) deixado à discrição do planejador.

---

## Métricas e apresentação do dashboard

| Option | Description | Selected |
|--------|-------------|----------|
| Presets fixos (hoje / 7d / 30d) | Simples, sem input de data | ✓ |
| Range customizado | | |
| Ambos | | |

**User's choice:** Presets fixos — D-79

| Option | Description | Selected |
|--------|-------------|----------|
| Tabela simples (como /audit) | | |
| Cartões de resumo + tabela por produto | Números-chave em destaque + tabela detalhada | ✓ |
| Você decide | | |

**User's choice:** Cartões de resumo + tabela por produto — D-80

| Option | Description | Selected |
|--------|-------------|----------|
| Por produto-fonte | | |
| Por produto recomendado | | |
| Ambos os níveis | Duas tabelas | ✓ |

**User's choice:** Ambos os níveis — D-81

| Option | Description | Selected |
|--------|-------------|----------|
| Só números absolutos do bloco | Mantém escopo estrito | ✓ |
| Incluir comparação com conversão geral da loja | | |

**User's choice:** Só números absolutos do bloco — D-82
**Notes:** Comparativo com conversão geral anotado como Deferred Idea.

---

## Credenciais da service account Google

| Option | Description | Selected |
|--------|-------------|----------|
| Variável de ambiente (JSON como string) | Mesmo padrão do projeto hoje | ✓ |
| Arquivo de credenciais separado (fora do git) | Quebra em ambiente serverless | |

**User's choice:** Variável de ambiente (JSON como string) — D-83

| Option | Description | Selected |
|--------|-------------|----------|
| Config via env var (GA4_PROPERTY_ID) | Nunca hardcoded | ✓ |
| Já tenho o ID e quero registrar agora | | |

**User's choice:** Config via env var (GA4_PROPERTY_ID) — D-84

---

## Claude's Discretion

- Mecanismo exato de descoberta do hook de `add_to_cart` no tema Morelia (D-75)
- Mecanismo exato da proteção de acesso ao dashboard (D-78)

## Deferred Ideas

- Comparativo com conversão geral da loja (D-82) — fora de escopo desta fase
- Registro retroativo da Fase 8 no fluxo GSD (CONTEXT.md/PLAN.md/SUMMARY formal para main-partners.js)
