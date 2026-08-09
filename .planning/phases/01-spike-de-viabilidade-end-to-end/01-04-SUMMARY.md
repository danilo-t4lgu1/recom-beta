---
phase: 01-spike-de-viabilidade-end-to-end
plan: 04
subsystem: ui
tags: [nuvemshop, css, tema, admin, produtos-relacionados, presentation-only]

# Dependency graph
requires:
  - phase: 01-spike-de-viabilidade-end-to-end
    provides: "Plano 01-02 confirmou o produto de teste real (Vestido Elaine Preto, ID 349886153) usado neste plano para inspecao/supressao"
provides:
  - "Bloco nativo 'Produtos Relacionados' suprimido de forma visualmente limpa (sem espaco vazio remanescente, sem titulo orfao) no produto de teste real, via CSS customizado no admin da Nuvemshop"
  - "Posicao exata documentada onde o bloco nativo aparecia — insumo obrigatorio para o Wave 4 (bloco customizado deve renderizar no mesmo lugar, D-03)"
  - "Estrutura DOM completa do bloco nativo documentada (3 elementos irmaos que precisam ser ocultados juntos)"
affects: [01-05-PLAN, roadmap, wave-4-script-nubesdk]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Supressao de bloco nativo via CSS customizado do tema (admin > Temas > Editar layout > Edicao de CSS avancada), nao via Script/API — edicao de apresentacao pura"
    - "Ocultar TODOS os elementos irmaos do bloco (header + secao + paginacao), nao so o conteudo interno, para evitar titulo orfao/espaco vazio (Pitfall 3 do RESEARCH.md)"

key-files:
  created:
    - .planning/phases/01-spike-de-viabilidade-end-to-end/01-04-SUMMARY.md
  modified: []

key-decisions:
  - "Produto de teste reaproveitado do plano 01-02 (Vestido Elaine Preto, ID 349886153) — consistencia entre planos do mesmo spike, conforme D-06/D-07 do CONTEXT.md"
  - "Supressao aplicada via CSS customizado do tema no admin (nao via Script), conforme D-01/D-02 — PLAT-04 fechado sem necessidade de investigar supressao via Script como plano B (D-02)"
  - "Os 3 elementos irmaos do bloco (header-related, related-products, swiper-pagination) foram ocultados juntos numa unica regra CSS, para evitar o risco de titulo orfao identificado no Pitfall 3 do RESEARCH.md"

patterns-established:
  - "Elementos permanecem no DOM (display:none, nao removidos do tema) — consistente com D-01/D-02 (edicao de CSS/layout, nao edicao estrutural do tema)"

requirements-completed: [PLAT-04]

# Metrics
duration: 15min
completed: 2026-07-10
status: complete
---

# Phase 01 Plan 04: Supressão do Bloco Nativo "Produtos Relacionados" Summary

**Bloco nativo "Produtos Relacionados" suprimido de forma visualmente limpa no produto de teste real (Vestido Elaine Preto) via CSS customizado no admin da Nuvemshop, ocultando os 3 elementos irmãos (header, seção de vitrine e paginação) juntos para evitar título órfão — posição exata documentada para reuso no Wave 4.**

## Performance

- **Duration:** 15 min (aprox.)
- **Started:** 2026-07-10T04:00:00Z (aprox.)
- **Completed:** 2026-07-10T04:15:00Z (aprox.)
- **Tasks:** 1 (checkpoint:human-verify)
- **Files modified:** 0 código (edição de apresentação pura no admin da loja real) + 1 arquivo de evidência (este SUMMARY)

## Accomplishments

- Bloco nativo "Produtos Relacionados" inspecionado via análise direta do HTML real da loja (fetch da página publicada)
- Estrutura DOM completa identificada: o bloco é composto por **3 elementos irmãos**, não um único contêiner — todos precisavam ser ocultados juntos para evitar título órfão (Pitfall 3 do RESEARCH.md)
- Supressão aplicada via CSS customizado no admin da Nuvemshop (Temas > Editar layout > Edição de CSS avançada), preservando as regras de CSS já existentes (FAQ accordion, ocultação de ícone de favorito)
- Confirmação independente via novo fetch do HTML publicado: a regra CSS está presente e ativa na página ao vivo
- Posição exata documentada para reuso no Wave 4 (D-03): entre o bloco "compre junto" e a seção de descrição do produto

## Task Commits

Este plano não gera commit de código — é uma edição de apresentação pura no admin da loja real (fora do repositório). Nenhum arquivo de código foi criado ou modificado.

**Plan metadata:** commit de documentação a seguir (SUMMARY.md + STATE.md + ROADMAP.md)

## Files Created/Modified

- `.planning/phases/01-spike-de-viabilidade-end-to-end/01-04-SUMMARY.md` - este documento de evidência

Nenhum arquivo de código do repositório foi criado/modificado. A alteração real ocorreu no CSS customizado do tema, gerenciado inteiramente no admin da Nuvemshop (fora do controle de versão deste projeto).

## Evidência Técnica (Antes/Depois)

**Produto de teste:** "Vestido Elaine Preto" (ID 349886153) — mesmo produto usado no plano 01-02.
**URL real:** `https://talgui.com.br/produtos/vestido-elaine-preto/`

**Estrutura DOM do bloco nativo (identificada via fetch do HTML real da página):**

O bloco "Produtos Relacionados" é composto por 3 elementos irmãos, todos necessários para suprimir juntos:

1. `<div class="header-related">` — contém o `<h2>` com o título visível "Recomendados" + link "Compre Agora"
2. `<section id="related-products" class="products-section js-related-products section-home section-products-related position-relative products-bullets-enabled" data-component="alternative-products">` — a vitrine/carrossel de produtos (slider)
3. `<div class="js-swiper-related-pagination">` — bolinhas de paginação do carrossel

**Antes:** fetch do HTML real (via curl) confirmou a presença visual do bloco com título "Recomendados", grid de produtos (ex: "VESTIDO REGINA COM FENDA OFF WHITE", "VESTIDO PAMELA... BEGE") e paginação, renderizado entre o bloco de compra/parcelamento ("compre junto") e a seção de descrição do produto.

**Depois:** usuário publicou a alteração no admin ("Publicar alterações"); confirmou visualmente no preview do editor que o bloco sumiu. O orquestrador confirmou de forma independente, via novo fetch do HTML real da página publicada, que a regra CSS está presente e ativa na página ao vivo:

```css
.header-related,
#related-products,
.js-swiper-related-pagination {
	display: none !important;
}
```

Os elementos HTML ainda existem no DOM (esperado — `display:none` é ocultação via CSS, não remoção estrutural do tema, conforme D-01/D-02), mas ficam com altura zero, sem espaço vazio remanescente.

## Método de Supressão Usado

**Local:** Nuvemshop admin → Temas → Editar layout → "Edição de CSS avançada" / "Para webdesigners"

**Ação:** adição das 3 regras acima ao final do CSS customizado já existente do tema (que continha regras de FAQ accordion e ocultação de ícone de favorito — preservadas sem alteração).

**Reaplicação futura:** para reverter ou ajustar, editar/remover o bloco de regras `.header-related, #related-products, .js-swiper-related-pagination { display: none !important; }` no mesmo editor de CSS avançado do tema.

## Posição Exata (para D-03 — reuso no Wave 4)

O bloco nativo ficava **entre o bloco "compre junto" (cross-sell, `#compre-junto-block`) e a seção de descrição do produto (`#product-description`)** — ou seja, logo abaixo da área de compra/parcelamento, antes da descrição.

**Esta é a posição-alvo obrigatória para o bloco customizado (Script NubeSDK) do Wave 4** — deve renderizar no mesmo local, não em posição arbitrária da página (D-03).

## Confirmação de D-04 (Ocultamento Limpo)

- [x] Nenhum espaço em branco remanescente
- [x] Nenhum título "Produtos Relacionados"/"Recomendados" órfão sem conteúdo abaixo
- [x] Nenhuma diferença perceptível de padding/margin na página
- [x] Os 3 elementos irmãos foram ocultados juntos numa única regra CSS — elimina o risco de título órfão identificado no Pitfall 3 do RESEARCH.md

**Resultado:** D-04 satisfeito. PLAT-04 (Critério de Sucesso 4 do roadmap) confirmado com evidência real, não suposição.

## Decisions Made

**1. Reaproveitamento do produto de teste do plano 01-02**
- Mesmo produto (Vestido Elaine Preto, ID 349886153) usado consistentemente entre os planos deste spike, evitando introduzir uma segunda variável de teste

**2. Supressão via CSS customizado do tema, não via Script**
- Confirma D-01/D-02 do CONTEXT.md: a supressão via CSS/layout resolveu o problema, não sendo necessário investigar supressão via Script como plano B — PLAT-04 fechado

**3. Ocultar os 3 elementos irmãos juntos numa única regra CSS**
- **Encontrado durante:** inspeção da árvore DOM real da página (Task 1)
- **Situação:** o bloco "Produtos Relacionados" não é um único contêiner, mas 3 elementos irmãos independentes no DOM (header, seção da vitrine, paginação) — ocultar apenas um deles teria deixado título órfão ou espaço vazio, exatamente o risco descrito no Pitfall 3 do RESEARCH.md
- **Resolução:** os 3 seletores foram combinados numa única regra `display: none !important`, garantindo ocultamento atômico e limpo

## Deviations from Plan

None - plan executado exatamente como especificado. A investigação da estrutura DOM (3 elementos irmãos, não 1 contêiner único) já era esperada como possibilidade explícita pelo Pitfall 3 do RESEARCH.md, e foi tratada dentro do próprio fluxo `how-to-verify` do plano, não como desvio.

## Issues Encountered

None. A única complexidade prevista (estrutura DOM com múltiplos elementos irmãos, não um único wrapper) já estava antecipada no RESEARCH.md (Pitfall 3) e foi resolvida dentro do escopo normal da task.

## User Setup Required

None - a alteração de CSS já foi publicada pelo usuário diretamente no admin da Nuvemshop durante a execução deste plano. Nenhuma ação pendente adicional.

## Next Phase Readiness

- **PLAT-04 confirmado:** bloco nativo suprimido de forma visualmente limpa, com evidência real (fetch do HTML antes/depois), não suposição
- **D-03 documentado e pronto para Wave 4:** posição exata (entre `#compre-junto-block` e `#product-description`) é o alvo de renderização do bloco customizado (Script NubeSDK) do próximo plano de frontend
- **D-04 satisfeito:** nenhum artefato visual remanescente (espaço vazio ou título órfão)
- **Wave 4 (01-05, renderização do bloco customizado) pode prosseguir** quanto a este pré-requisito — depende separadamente da ativação do NubeSDK para o tema Morelia (bloqueio rastreado desde 01-01/01-02, ainda pendente de aprovação externa)
- **Nenhum débito técnico introduzido por este plano**

---
*Phase: 01-spike-de-viabilidade-end-to-end*
*Completed: 2026-07-10*

## Self-Check: PASSED

Arquivo de evidência (`01-04-SUMMARY.md`) verificado presente em disco. Nenhum commit de código foi gerado por este plano (edição de apresentação pura, fora do repositório) — apenas o commit de metadados de documentação (SUMMARY.md + STATE.md + ROADMAP.md) é esperado, verificado após a criação deste arquivo.
