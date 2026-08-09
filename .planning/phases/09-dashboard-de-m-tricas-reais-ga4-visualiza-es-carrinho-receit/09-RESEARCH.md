# Phase 9: Dashboard de Métricas Reais (GA4) - Research

**Researched:** 2026-07-23
**Domain:** Instrumentação GA4 Enhanced Ecommerce em Script legado (sem GTM) + leitura via Google Analytics Data API em servidor Node nativo (Vercel)
**Confidence:** MEDIUM (a instrumentação de `view_item_list`/`select_item` é HIGH confidence; a atribuição de receita/conversão a `item_list_name` tem uma lacuna estrutural documentada em LOW/MEDIUM confidence — ver Pitfall 3)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-71:** GA4/`gtag.js` já está instalado no tema da loja Talgui, e o usuário já tem acesso admin ao GA4 para criar a service account Google Cloud (permissão Viewer/Data API). Pré-requisitos prontos, pesquisa/planejamento seguem sem bloqueio.
- **D-72:** Fase 8 (carrossel) tratada como funcionalmente concluída, apesar de "0 plans/to be planned" no ROADMAP.md. Entregável real: `storefront-script/main-partners.js`. Nota para o planejador: considerar registrar a Fase 8 retroativamente (não bloqueante).
- **D-73:** `storefront-script/main-partners.js` é o script real e ativo/publicado na loja Talgui hoje — é ESTE arquivo que recebe a instrumentação GA4, não `main.js` (versão anterior, v.Alpha, sem carrossel, conforme a decisão do usuário).
- **D-74:** Eventos GA4 disparados via `window.gtag()` diretamente no script, assumindo que `gtag.js` do tema Morelia já expõe `window.gtag` globalmente. NÃO usar `window.dataLayer.push()` — sem GTM confirmado no meio.
- **D-75:** `add_to_cart` precisa capturar quando o visitante adiciona ao carrinho um produto recomendado a partir do bloco. Sem hook/evento documentado do tema Morelia — pesquisa deveria investigar o mecanismo real. **Resolvido nesta pesquisa — ver Pitfall 1 e Pattern 2.**
- **D-76:** `item_list_name="Recomendados"` sozinho já isola os dados no GA4 Data API — bloco nativo "Produtos Relacionados" suprimido desde a Fase 1 (D-03), sem risco de mistura. Não é necessário `item_list_id` extra.
- **D-77:** Dashboard vira nova rota (`GET /metrics`) em `review-server.js` existente — reaproveita padrão HTTP nativo e SSR HTML de `GET /audit`, **mesmo servidor/deploy (Vercel)**. **Atenção — gap de arquitetura identificado nesta pesquisa: ver Pitfall 4.**
- **D-78:** Diferente de `GET /audit` (sem auth, D-37), o dashboard de métricas GA4 precisa de proteção de acesso simples (token/senha) — mecanismo exato a critério do planejador.
- **D-79:** Janelas de tempo: presets fixos (hoje / 7 dias / 30 dias). Sem range customizado nesta fase.
- **D-80:** Apresentação: cartões de resumo (visualizações, add_to_cart, receita, taxa de conversão) no topo + tabelas detalhadas abaixo.
- **D-81:** Tabelas detalhadas em dois níveis: por produto-fonte (onde o bloco foi exibido) e por produto recomendado (o que apareceu no carrossel).
- **D-82:** Escopo estritamente nos números absolutos do bloco Recomendados — SEM comparativo com conversão geral da loja (fora de escopo).
- **D-83:** Credenciais da service account (JSON) em variável de ambiente string (`GA4_SERVICE_ACCOUNT_JSON`), parseada em runtime — sem arquivo de credenciais no filesystem (compatibilidade serverless/Vercel).
- **D-84:** GA4 Property ID em variável de ambiente (`GA4_PROPERTY_ID`), nunca hardcoded.

### Claude's Discretion

- Mecanismo exato de descoberta do hook de `add_to_cart` no tema Morelia (D-75) — resolvido nesta pesquisa (ver Pattern 2).
- Mecanismo exato da proteção de acesso ao dashboard (D-78) — resolvido nesta pesquisa (ver Pattern 3), decisão final cabe ao planejador.

### Deferred Ideas (OUT OF SCOPE)

- **Comparativo com conversão geral da loja** (D-82) — fora de escopo desta fase; possível extensão futura.
- **Registro retroativo da Fase 8** — vale considerar `/gsd-docs-update` ou registro manual em algum momento; não bloqueia a Fase 9.
</user_constraints>

<phase_requirements>
## Phase Requirements

> Nenhum REQ-ID formal existe em REQUIREMENTS.md para esta fase ainda ("TBD"). Por instrução explícita, as decisões D-71 a D-84 de `09-CONTEXT.md` são tratadas como os requisitos vinculantes desta fase.

| ID | Descrição | Suporte da Pesquisa |
|----|-----------|---------------------|
| D-73/D-74 | Instrumentar `main-partners.js` via `window.gtag()` direto, sem GTM/dataLayer | Pattern 1 (schemas de evento gtag) — HIGH confidence, `[CITED: developers.google.com]` |
| D-75 | Detectar `add_to_cart` de produto recomendado sem hook nativo documentado | Pattern 2 (bridge sessionStorage cross-page + delegação de clique em `.js-addtocart`) — MEDIUM/LOW confidence, requer verificação ao vivo |
| D-76 | `item_list_name="Recomendados"` isola dados sem `item_list_id` | Confirmado pela Fase 1 (D-03, bloco nativo suprimido) — decisão do projeto, não pesquisa nova |
| D-77 | Nova rota `/metrics` em `review-server.js`, mesmo deploy Vercel | Pitfall 4 (gap arquitetural: `review-server.js` hoje só roda local, D-49) + Pattern 4 (adaptador Vercel) |
| D-78 | Proteção de acesso ao `/metrics` | Pattern 3 (token fixo via header, comparação em tempo constante) — HIGH confidence, padrão amplamente documentado |
| D-79/D-80/D-81/D-82 | Presets de tempo, cartões + 2 tabelas, escopo absoluto sem comparativo | Architecture Patterns (mapeamento de dimensões/métricas GA4 Data API) — MEDIUM confidence |
| D-83/D-84 | Credenciais/Property ID via env var, sem arquivo no filesystem | Standard Stack + Pitfall 5 (parsing de JSON com chave privada multi-linha) |
| Meta da fase (receita/conversão "não estimativa") | Comprovar com dados reais o impacto do bloco na receita/conversão | Pitfall 3 — **lacuna estrutural crítica do GA4**, ver Open Questions #1 |
</phase_requirements>

## Summary

Esta fase tem duas metades tecnicamente independentes, mas com uma dependência de dados crítica entre elas. A primeira metade — instrumentar `view_item_list`, `select_item` e `add_to_cart` via `window.gtag()` direto em `storefront-script/main-partners.js` — é bem documentada e de risco baixo: os três eventos têm schema estável e público na documentação oficial do GA4 `[CITED: developers.google.com/analytics/devguides/collection/ga4/ecommerce]`. O ponto realmente difícil (D-75) é que o carrossel Recomendados, como construído hoje em `main-partners.js`, **não tem um botão "adicionar ao carrinho" próprio** — cada card é apenas um link (`<a href>`) para a página do produto recomendado. Isso significa que "adicionar ao carrinho um produto recomendado" é necessariamente uma ação **em outra página** (a página do produto recomendado), não dentro do próprio bloco. A pesquisa confirma que o tema (baseado no `base-theme` oficial da Tiendanube) implementa "adicionar ao carrinho" via um botão `.js-addtocart` com um handler jQuery que chama `LS.addToCartEnhanced(...)` — **sem disparar nenhum evento DOM customizado** que um script de terceiros possa escutar diretamente. A solução recomendada (Pattern 2) é uma ponte via `sessionStorage`: no clique do card dentro do bloco, gravar `{sourceProductId, recommendedProductId, ts}`; na página do produto recomendado, escutar clique em `.js-addtocart` e, se houver uma entrada de atribuição válida (TTL curto) para o produto atual, disparar `add_to_cart` com `item_list_name="Recomendados"` de forma otimista (no clique, não na confirmação de sucesso do carrinho — o tema não expõe esse sinal de forma interceptável sem inspecionar tráfego de rede ao vivo).

A segunda metade — o dashboard via Google Analytics Data API — tem uma lacuna estrutural importante que a pesquisa precisa expor com honestidade: **o GA4 não atribui receita/conversão automaticamente a um item list em eventos posteriores da mesma sessão** `[CITED: multiplas fontes sobre GA4 ecommerce attribution]`. O parâmetro `item_list_name` só é contabilizável pela Data API no **mesmo evento** em que foi enviado. Como o evento `purchase` é disparado pelo checkout nativo da Nuvemshop (fora do escopo desta fase, conforme `<domain>` do CONTEXT.md), **a "receita atribuível ao bloco Recomendados" não é obtida automaticamente só por instrumentar o storefront-script** — isso é detalhado como o achado crítico da fase em Pitfall 3 e Open Questions #1, com opções concretas de mitigação. Visualizações e `add_to_cart` (que o script instrumenta e controla integralmente) **são** dados reais e diretamente atribuíveis — não estimativa.

**Recomendação primária:** instrumentar os três eventos em `main-partners.js` com um parâmetro customizado próprio (`source_product_id`) além de `item_list_name`, usar a API REST da Google Analytics Data API (não o pacote `@google-analytics/data`, pesado/gRPC) autenticada via `google-auth-library` + `fetch` nativo (alinhado ao padrão zero-dependência do projeto), e tratar a atribuição de receita como uma decisão explícita a levar ao usuário antes de planejar tarefas em torno dela (ver Open Questions #1) — não assumir que "instrumentar o storefront basta" para a métrica de receita.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Disparo de `view_item_list`/`select_item`/`add_to_cart` | Browser / Client (`main-partners.js`) | — | Script legado roda com acesso irrestrito ao DOM (D-11); `window.gtag()` é uma API de browser |
| Atribuição cross-page (sessionStorage bridge) | Browser / Client | — | Mesma origem, mesma sessão de navegador; não requer backend |
| Coleta/agregação de eventos GA4 | Serviço externo (Google Analytics) | — | Fora do controle do projeto; GA4 é o "banco de dados" de eventos |
| Leitura de métricas (GA4 Data API) | API / Backend (`review-server.js` ou função Vercel nova) | — | Credenciais de service account nunca podem viver no browser (mesmo princípio de PLAT-05: token nunca no client) |
| Renderização SSR do dashboard `/metrics` | API / Backend (Vercel) | — | Mesmo padrão de `GET /audit` — SSR sem framework, sem exposição de credencial |
| Proteção de acesso ao `/metrics` (D-78) | API / Backend | — | Verificação de token deve acontecer no servidor, nunca confiar em client-side gate |
| Registro de custom dimension `source_product_id` | GA4 Admin (configuração externa, não código) | — | Passo manual único no painel do GA4 (o usuário já tem acesso admin, D-71) — não é código do projeto |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `google-auth-library` | 10.9.0 (verificado via `npm view`, 2026-07-23) `[VERIFIED: npm registry + repo oficial googleapis/google-cloud-node]` | Obter token OAuth2/JWT a partir da service account JSON, sem gRPC | Biblioteca oficial do Google, ~71M downloads/semana, dependências leves (`gaxios`, `jws`, sem `grpc-js`) — muito mais compatível com o padrão "zero dependência HTTP externa, usa fetch nativo" já estabelecido em `client.js` (Fase 5) |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| — (nenhuma) | — | Chamada REST à GA4 Data API via `fetch` nativo do Node (`POST https://analyticsdata.googleapis.com/v1beta/properties/{id}:runReport`) | Sempre — evita depender do pacote `@google-analytics/data` (ver Alternativas Consideradas) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| REST + `google-auth-library` (recomendado) | `@google-analytics/data` (`BetaAnalyticsDataClient`) | Client oficial com DX mais simples (`analyticsDataClient.runReport({...})`), mas traz `google-gax`→gRPC como dependência transitiva (~7MB unpacked, binários nativos), o que é o oposto do padrão zero-dependência já estabelecido no projeto (`nuvemshop-client/client.js`: "Sem dependências externas — usa fetch global do Node") e aumenta o risco de estourar o limite de tamanho de função serverless na Vercel (50MB comprimido no plano padrão) quando somado a `better-sqlite3` (binário nativo já presente) |
| Token fixo comparado em servidor (D-78, recomendado) | HTTP Basic Auth manual (`Authorization: Basic base64(user:pass)`) | Ambos são leves e sem framework; Basic Auth exige lógica de decode Base64 + prompt de browser nativo (UX mais "crua"); token fixo via header/query é mais simples de testar via `curl`/painel e é o padrão já sugerido pelo próprio usuário em D-78 ("token fixo em query param/header") |
| `sessionStorage` bridge para add_to_cart (Pattern 2, recomendado) | Monkey-patch de `window.fetch`/`XMLHttpRequest` para detectar a resposta real do endpoint de carrinho | Monkey-patch detectaria sucesso real (não apenas clique), mas exige descobrir o endpoint exato que `LS.addToCartEnhanced()` chama internamente — não documentado publicamente, exigiria inspeção de tráfego de rede AO VIVO na loja Talgui (checkpoint humano). Fica registrado como alternativa mais precisa, não como recomendação primária desta pesquisa |

**Installation:**
```bash
npm install google-auth-library
```

**Version verification:** `npm view google-auth-library version` → `10.9.0`, publicado em 2026-06-24, downloads semanais 71.244.869, sem `postinstall` suspeito, repositório oficial `googleapis/google-cloud-node` confirmado.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|--------------|---------|-------------|
| `google-auth-library` | npm | Última versão publicada 2026-06-24 (pacote existe desde muito antes; a checagem de idade usa a data do último release, não do primeiro) | 71.244.869/semana | github.com/googleapis/google-cloud-node | **[SUS]** (motivo automático: `too-new`, falso positivo — o release mais recente é recente, mas o pacote é o client oficial de autenticação do Google Cloud, com dezenas de milhões de downloads semanais e mesmo repositório oficial do `@google-analytics/data`) | Aprovado com nota — manter checkpoint humano antes do primeiro `npm install` real, per protocolo, mas risco real é baixo |
| `@google-analytics/data` | npm | Publicado desde 2020-09-03 | 365.208/semana | github.com/googleapis/google-cloud-node | **[OK]** | Não usado nesta recomendação (ver Alternativas Consideradas), mas citado no research como opção válida caso o planejador prefira DX sobre tamanho de bundle |

**Packages removed due to [SLOP] verdict:** nenhum.
**Packages flagged as suspicious [SUS]:** `google-auth-library` — sinalizado apenas por heurística de "too-new" (data do último publish), não por sinal real de risco. Pacote oficial Google Cloud, mesmo mantenedor de `@google-analytics/data`. Recomenda-se ao planejador manter um `checkpoint:human-verify` antes de `npm install google-auth-library` mesmo assim, seguindo o protocolo à risca.

## Architecture Patterns

### System Architecture Diagram

```
[Visitante na página de PRODUTO A]
        │
        ▼
main-partners.js (IIFE, onfirstinteraction/onload)
        │  1. renderRecommendationBlock() monta o carrossel
        ▼
gtag('event','view_item_list', {item_list_name:'Recomendados', source_product_id:A, items:[...]})
        │
        │  2. visitante clica em um card (produto recomendado B)
        ▼
gtag('event','select_item', {item_list_name:'Recomendados', source_product_id:A, items:[{item_id:B}]})
sessionStorage.setItem('recomendados_attr_B', {sourceProductId:A, ts:now})   ◄── ponte cross-page
        │
        │  navegação real de página (mesma aba, mesma sessão)
        ▼
[Visitante na página de PRODUTO B — main-partners.js roda de novo]
        │  3. delega clique em .js-addtocart (mesmo listener já registrado no init())
        ▼
lookup: sessionStorage['recomendados_attr_B'] existe e não expirou?
        │  sim
        ▼
gtag('event','add_to_cart', {item_list_name:'Recomendados', source_product_id:A,
                             value, currency:'BRL', items:[{item_id:B, price, quantity:1}]})
        │
        ▼
[Google Analytics 4 — coleta de eventos, ~24-48h de latência de processamento padrão]
        │
        │  (checkout nativo da Nuvemshop dispara 'purchase' — FORA do escopo desta fase,
        │   sem item_list_name propagado — ver Pitfall 3)
        ▼
Google Analytics Data API (REST, runReport)
        │  autenticado via google-auth-library + service account (GA4_SERVICE_ACCOUNT_JSON)
        ▼
review-server.js (local) OU api/metrics.js (Vercel) — MESMA função pura de renderização
        │  filtra por dimensão itemListName='Recomendados' (+ source_product_id quando aplicável)
        │  presets D-79: hoje / 7d / 30d
        ▼
GET /metrics (protegido por token, D-78) → HTML SSR: cartões + 2 tabelas (D-80/D-81)
```

### Recommended Project Structure

```
app-partners-recomendados/
├── src/
│   ├── analytics/
│   │   ├── ga4-client.js          # auth (google-auth-library) + runReport via fetch REST
│   │   └── metrics-queries.js     # monta os 3 relatórios (resumo, por-fonte, por-recomendado)
│   ├── review-server.js           # ganha GET /metrics (reusa padrão de GET /audit)
│   └── ...
├── api/
│   └── metrics.js                 # NOVO — adaptador Vercel que chama a mesma lógica de review-server.js
storefront-script/
└── main-partners.js                # ganha os 3 disparos gtag + bridge sessionStorage
```

### Pattern 1: Disparo dos 3 eventos GA4 Enhanced Ecommerce via `window.gtag()`

**What:** Chamadas diretas a `window.gtag('event', <nome>, {...})`, sem `dataLayer.push` (D-74).
**When to use:** `view_item_list` no momento em que `renderRecommendationBlock()` insere o bloco com sucesso; `select_item` no clique de um card; `add_to_cart` na ponte cross-page (Pattern 2).
**Example:**
```javascript
// Source: developers.google.com/analytics/devguides/collection/ga4/ecommerce [CITED]
function trackViewItemList(products, sourceProductId) {
  if (typeof window.gtag !== 'function') return; // defensivo — gtag.js pode não estar pronto
  window.gtag('event', 'view_item_list', {
    item_list_name: 'Recomendados',
    source_product_id: sourceProductId, // parâmetro CUSTOM — precisa virar custom dimension no GA4 Admin
    items: products.map(function (p, i) {
      return { item_id: String(p.id), item_name: p.name, price: Number(p.price) || undefined, index: i };
    }),
  });
}

function trackSelectItem(product, sourceProductId) {
  if (typeof window.gtag !== 'function') return;
  window.gtag('event', 'select_item', {
    item_list_name: 'Recomendados',
    source_product_id: sourceProductId,
    items: [{ item_id: String(product.id), item_name: product.name, price: Number(product.price) || undefined }],
  });
}

function trackAddToCart(product, sourceProductId) {
  if (typeof window.gtag !== 'function') return;
  window.gtag('event', 'add_to_cart', {
    currency: 'BRL', // obrigatório no nível do evento
    value: Number(product.price) || 0, // obrigatório no nível do evento
    item_list_name: 'Recomendados',
    source_product_id: sourceProductId,
    items: [{ item_id: String(product.id), item_name: product.name, price: Number(product.price) || undefined, quantity: 1 }],
  });
}
```

### Pattern 2: Ponte cross-page via `sessionStorage` para detectar `add_to_cart` (resolve D-75)

**What:** Como o card do carrossel é só um `<a href>` (sem botão de carrinho próprio — confirmado por leitura de `main-partners.js`, `buildSlideHtml`), a detecção de add-to-cart de um produto recomendado precisa atravessar a navegação real de página. A pesquisa confirmou (via inspeção do `base-theme` oficial da Tiendanube) que o botão de adicionar ao carrinho usa a classe `.js-addtocart` com handler jQuery chamando `LS.addToCartEnhanced(...)` — **sem** disparar nenhum `CustomEvent`/`document.dispatchEvent` interceptável `[LOW confidence — inspeção de código de tema referencial, não confirmada ao vivo contra o tema Morelia real da Talgui]`.
**When to use:** No clique do card (grava a atribuição), e no clique do botão `.js-addtocart` de QUALQUER página de produto (o script já roda sitewide, condicionado a `window.LS.product.id` existir).
**Example:**
```javascript
var ATTR_KEY_PREFIX = 'recomendados_attr_';
var ATTR_TTL_MS = 30 * 60 * 1000; // 30min — janela plausível de clique->carrinho

function rememberAttribution(recommendedProductId, sourceProductId) {
  try {
    window.sessionStorage.setItem(
      ATTR_KEY_PREFIX + recommendedProductId,
      JSON.stringify({ sourceProductId: sourceProductId, ts: Date.now() })
    );
  } catch (e) { /* degrada silenciosamente, mesma disciplina do cache D-50 */ }
}

function consumeAttribution(currentProductId) {
  try {
    var raw = window.sessionStorage.getItem(ATTR_KEY_PREFIX + currentProductId);
    if (!raw) return null;
    var parsed = JSON.parse(raw);
    if (Date.now() - parsed.ts > ATTR_TTL_MS) return null;
    return parsed; // { sourceProductId, ts }
  } catch (e) { return null; }
}

// Delegação de clique — registrada uma vez no init(), em QUALQUER página de produto:
document.addEventListener('click', function (ev) {
  var btn = ev.target.closest && ev.target.closest('.js-addtocart:not(.js-addtocart-placeholder)');
  if (!btn) return;
  var currentProductId = getCurrentProductId();
  if (!currentProductId) return;
  var attribution = consumeAttribution(currentProductId);
  if (!attribution) return; // add-to-cart normal, não veio do bloco Recomendados
  trackAddToCart(/* dados do produto atual */ currentProductInfo, attribution.sourceProductId);
}, true); // fase de captura — roda mesmo se o handler jQuery do tema parar propagação
```
**Limitação assumida (documentar no plano):** este disparo é **otimista** (no clique do botão, não na confirmação real de sucesso do carrinho) — se o produto estiver sem estoque e o tema mostrar erro, o evento ainda é enviado. Alternativa mais precisa (monkey-patch de `fetch`/`XHR` para inspecionar a resposta real) requer descobrir o endpoint real de carrinho por inspeção de rede ao vivo na loja Talgui — não confirmável nesta pesquisa sem acesso à loja real.

### Pattern 3: Proteção de acesso ao `/metrics` (resolve D-78)

**What:** Token fixo comparado no servidor, nunca em Basic Auth do browser (evita prompt nativo feio e permite testar com `curl -H "Authorization: Bearer $TOKEN"` ou `?token=`).
**When to use:** Toda requisição a `/metrics`, antes de qualquer chamada à GA4 Data API.
**Example:**
```javascript
// Source: padrão amplamente documentado de comparação de token em tempo constante [CITED]
import { timingSafeEqual } from 'node:crypto';

function isAuthorized(req, url) {
  const expected = process.env.METRICS_ACCESS_TOKEN;
  if (!expected) return false; // fail-closed se a env var não estiver configurada
  const provided = req.headers['x-metrics-token'] || url.searchParams.get('token') || '';
  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);
  if (expectedBuf.length !== providedBuf.length) return false; // timingSafeEqual exige mesmo tamanho
  return timingSafeEqual(expectedBuf, providedBuf);
}
```
**Nota de segurança:** comparação ingênua (`===`) de string é vulnerável a timing attack teórico; `timingSafeEqual` é nativo do Node (`node:crypto`), sem dependência nova — consistente com o padrão zero-dependência do projeto.

### Pattern 4: Reaproveitar a lógica de `/metrics` entre local (`review-server.js`) e Vercel (`api/metrics.js`)

**What:** Extrair o handler da rota `/metrics` como função pura/exportada, chamável tanto pelo dispatcher `createServer()` de `review-server.js` (dev local) quanto por uma nova função serverless Vercel.
**When to use:** Sempre — resolve o gap arquitetural do Pitfall 4.
**Example:**
```javascript
// src/review-server.js
export async function handleMetricsRequest(req, res, url) {
  if (!isAuthorized(req, url)) { sendJson(res, 401, { error: 'unauthorized' }); return; }
  const preset = url.searchParams.get('preset') || 'today'; // allow-list: today|7d|30d (D-79)
  const html = await renderMetricsPage(preset);
  sendHtml(res, 200, html);
}
// dentro de createServer(): if (METRICS_PATH.test(url.pathname)) return handleMetricsRequest(req, res, url);

// api/metrics.js (Vercel Node.js Function — assinatura (req,res) compatível com node:http)
import { handleMetricsRequest } from '../src/review-server.js';
export default async function handler(req, res) {
  const url = new URL(req.url, `https://${req.headers.host}`);
  await handleMetricsRequest(req, res, url);
}
```

### Anti-Patterns to Avoid

- **Usar `dataLayer.push`:** explicitamente proibido por D-74 — não há GTM confirmado; `dataLayer.push` sem GTM/gtag.js consumindo a fila não gera nenhum hit no GA4.
- **Confiar em `page_path`/`page_location` para atribuir `add_to_cart` ao produto-fonte:** a página onde o `add_to_cart` acontece é a do produto RECOMENDADO, não a do produto-fonte — sem o parâmetro customizado `source_product_id`, a tabela "por produto-fonte" (D-81) não é reconstruível.
- **Misturar métricas event-scoped com dimensões item-scoped na mesma query da Data API:** `addToCarts`/`checkouts` (event-scoped) são incompatíveis com `itemListName` (item-scoped) — usar sempre as variantes item-scoped (`itemsAddedToCart`, `itemsViewed`, `itemsPurchased`, `itemRevenue`) quando filtrando/agrupando por `itemListName` `[CITED: developers.google.com — nota de compatibilidade de esquema]`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Assinatura JWT/OAuth2 da service account Google | Parser manual de JWT + chamada de token endpoint | `google-auth-library` (`GoogleAuth`/`JWT` client) | Assinatura RS256 e refresh de token têm detalhes de segurança fáceis de errar; biblioteca oficial já resolve, sem trazer gRPC |
| Comparação de token de acesso | `token === expected` | `crypto.timingSafeEqual` (nativo Node) | Comparação ingênua vaza timing information sobre o token correto byte a byte |
| Contagem de eventos/agregação de métricas GA4 | Query manual em log bruto de eventos | Google Analytics Data API (`runReport`) | GA4 já faz a agregação/dedup/sessionização — reimplementar seria replicar um pipeline de analytics inteiro |

**Key insight:** tudo que envolve autenticação Google (JWT, OAuth2, refresh) e agregação de eventos GA4 já é resolvido por bibliotecas/serviço oficiais — o único código realmente "hand-rolled" desta fase é a ponte de atribuição client-side (Pattern 2), que é inerentemente específica do projeto (não existe biblioteca para "detectar add-to-cart de um item recomendado sem GTM").

## Common Pitfalls

### Pitfall 1: O carrossel Recomendados não tem botão de carrinho próprio
**What goes wrong:** Assumir que basta um listener de clique DENTRO do bloco `#recomendados-motor-block` para capturar add_to_cart.
**Why it happens:** `buildSlideHtml()` em `main-partners.js` só renderiza um `<a href>` para a página do produto — não há `.js-addtocart` dentro do card.
**How to avoid:** Implementar a ponte cross-page (Pattern 2) — o listener de `.js-addtocart` precisa estar ativo em QUALQUER página de produto, não só onde o bloco aparece.
**Warning signs:** Zero eventos `add_to_cart` com `item_list_name=Recomendados` mesmo com tráfego real no bloco.

### Pitfall 2: Metric incompatibility na GA4 Data API (event-scoped x item-scoped)
**What goes wrong:** Query com `metrics: [{name:'addToCarts'}]` + `dimensions: [{name:'itemListName'}]` retorna erro ou dado vazio.
**Why it happens:** `addToCarts`/`checkouts` são métricas event-scoped; `itemListName` é uma dimensão item-scoped — GA4 exige a variante item-scoped da métrica (`itemsAddedToCart`) quando combinada com dimensões de item `[CITED: developers.google.com]`.
**How to avoid:** Sempre usar `itemsViewed`, `itemsAddedToCart` (ou `itemListClickEvents`), `itemsPurchased`, `itemRevenue` ao filtrar/agrupar por `itemListName`/`itemName`/`itemId`.
**Warning signs:** Erro 400 da Data API mencionando incompatibilidade de esquema, ou linhas vazias inesperadas.

### Pitfall 3: Receita/conversão NÃO se atribui automaticamente ao item list no GA4 (achado crítico)
**What goes wrong:** Assumir que instrumentar `view_item_list`/`select_item`/`add_to_cart` com `item_list_name="Recomendados"` já é suficiente para a Data API reportar "receita gerada pelo bloco Recomendados" via o evento `purchase`.
**Why it happens:** No modelo de dados do GA4, um parâmetro item-scoped como `item_list_name` só é contabilizado pela Data API no **mesmo evento** em que foi enviado — não existe atribuição automática "last list interaction" entre eventos de uma mesma sessão (isso é uma capacidade do Universal Analytics/GA3 que o GA4 NÃO reproduz nativamente, exceto via templates customizados de GTM Server-Side) `[CITED: múltiplas fontes — Google Tag Manager community templates confirmam que essa atribuição exige tooling adicional]`. O evento `purchase` é disparado pelo checkout nativo da Nuvemshop, que não tem conhecimento do `item_list_name` custom deste projeto — logo `itemRevenue`/`itemsPurchased` filtrados por `itemListName='Recomendados'` provavelmente retornarão vazio/zero, mesmo que produtos recomendados tenham sido de fato comprados.
**How to avoid:** Ver Open Questions #1 — não é um pitfall de implementação corrigível só no código do storefront-script; é uma decisão de escopo que precisa voltar ao usuário antes do plano assumir que "receita real" é alcançável sem tocar o checkout.
**Warning signs:** Cartão de "Receita" no dashboard sempre mostrando R$ 0,00 mesmo com `add_to_cart` reais registrados.

### Pitfall 4: `review-server.js` hoje só roda localmente — conflita com "mesmo deploy Vercel" (D-77)
**What goes wrong:** Planejar a rota `/metrics` como só mais uma rota dentro de `review-server.js` sem considerar que esse arquivo, hoje, só é executado localmente (`node src/review-server.js`, porta 127.0.0.1:3100, D-49 da Fase 6) — nunca foi deployado à Vercel. Só `api/recommendations/[productId].js` e os webhooks LGPD rodam na Vercel hoje (confirmado por inspeção direta do diretório `api/`).
**Why it happens:** D-77 assume que "mesmo servidor/deploy (Vercel)" já é verdade para `review-server.js` — não é. D-83 reforça isso ao mencionar "Vercel env vars" para as credenciais GA4, o que só faz sentido se o dashboard realmente rodar na Vercel (senão as credenciais viveriam só no `.env` local).
**How to avoid:** Pattern 4 — extrair a lógica da rota como função pura reaproveitável tanto pelo dispatcher local quanto por um novo arquivo `api/metrics.js` (Vercel Node.js Function, assinatura `(req,res)` compatível com `node:http`).
**Warning signs:** Planejador cria a rota só dentro de `review-server.js` e o dashboard nunca fica acessível fora da máquina local, contradizendo o valor de "hoje" (D-79) como preset em tempo quase-real.

### Pitfall 5: Parsing de `GA4_SERVICE_ACCOUNT_JSON` com chave privada multi-linha
**What goes wrong:** O campo `private_key` de uma service account JSON contém `\n` literais dentro de uma string PEM multi-linha; ao colar esse JSON inteiro como valor de uma única variável de ambiente, uma manipulação incorreta (ex: escapar `\n` duas vezes, ou quebras de linha reais na env var) quebra o `JSON.parse()` ou a validação da chave RSA.
**Why it happens:** Diferença entre "colar o JSON como está" (mantendo `\n` como dois caracteres literais dentro da string) vs. "colar com quebras de linha reais" (inválido para uma env var de uma linha só).
**How to avoid:** Documentar explicitamente no `.env.example`/instruções: colar o JSON minificado em uma linha só (sem quebras de linha reais), preservando os `\n` como texto literal dentro da string do `private_key`; testar com `JSON.parse(process.env.GA4_SERVICE_ACCOUNT_JSON)` antes de repassar a `google-auth-library`.
**Warning signs:** Erro de parsing "Unexpected token" ou erro de assinatura JWT ("invalid_grant"/"DECODER routines::unsupported") ao chamar a Data API.

### Pitfall 6: Quota/latência da GA4 Data API e o preset "hoje" (D-79)
**What goes wrong:** Esperar que o preset "hoje" mostre dados completos/finais em tempo real.
**Why it happens:** Relatórios padrão do GA4 têm latência de processamento documentada de até 24-48h; eventos que chegam além de ~72h após o disparo são descartados pelo pipeline `[CITED: documentação/blogs sobre GA4 data delay]`.
**How to avoid:** Exibir um aviso textual no dashboard junto ao preset "hoje" (ex: "dados de hoje podem estar incompletos — GA4 processa com até 24-48h de atraso"), consistente com a transparência já praticada no projeto (banner de dry-run em `review-server.js`).
**Warning signs:** Usuário reporta "número de hoje parece baixo demais" comparado à navegação real observada.

## Code Examples

### Chamada REST à GA4 Data API (runReport) autenticada via google-auth-library

```javascript
// Source: developers.google.com/analytics/devguides/reporting/data/v1/rest [CITED] +
// google-auth-library README oficial [CITED: npmjs.com/package/google-auth-library]
import { GoogleAuth } from 'google-auth-library';

function loadServiceAccountCredentials() {
  const raw = process.env.GA4_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GA4_SERVICE_ACCOUNT_JSON não configurada');
  return JSON.parse(raw); // ver Pitfall 5
}

async function runReport({ dimensions, metrics, dateRange, dimensionFilter }) {
  const propertyId = process.env.GA4_PROPERTY_ID;
  if (!propertyId) throw new Error('GA4_PROPERTY_ID não configurada');

  const auth = new GoogleAuth({
    credentials: loadServiceAccountCredentials(),
    scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
  });
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();

  const response = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ dateRanges: [dateRange], dimensions, metrics, dimensionFilter }),
    }
  );
  if (!response.ok) throw new Error(`GA4 Data API respondeu ${response.status}`);
  return response.json();
}

// Exemplo de uso — resumo (D-80): visualizações + add_to_cart do bloco Recomendados
async function getSummary(preset) {
  const dateRange = presetToDateRange(preset); // 'today' -> {startDate:'today', endDate:'today'}, etc. (D-79)
  return runReport({
    dimensions: [{ name: 'itemListName' }],
    metrics: [{ name: 'itemsViewed' }, { name: 'itemsAddedToCart' }, { name: 'itemRevenue' }],
    dateRange,
    dimensionFilter: {
      filter: { fieldName: 'itemListName', stringFilter: { value: 'Recomendados' } },
    },
  });
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Universal Analytics (UA) Enhanced Ecommerce com atribuição automática de lista/promoção entre eventos | GA4 Enhanced Ecommerce — atribuição precisa ser explicitamente reenviada em cada evento subsequente | UA foi descontinuado em jul/2023-jul/2024; GA4 é o único caminho ativo | Projetos migrando de UA (ou que assumem o comportamento antigo) subestimam o esforço de instrumentação para atribuição de receita — é o cerne do Pitfall 3 |
| Google Analytics Reporting API v4 (view-based) | Google Analytics Data API v1beta (property-based, GA4-only) | GA4 API v1beta é a atual desde 2021 | `@google-analytics/data`/REST v1beta é o único caminho suportado hoje; a v4 antiga (Reporting API) não funciona com propriedades GA4 |

**Deprecated/outdated:**
- Universal Analytics / `ga.js`/`analytics.js` clássico: totalmente desativado, irrelevante para este projeto (loja já usa `gtag.js`/GA4 per D-71).
- Nuvemshop Script API legada (a base de `main-partners.js`, D-11): tem prazo de descontinuação já documentado em outras fases (30/ago/2026 bloqueio de novas instalações, 30/out/2026 remoção progressiva) — relevante porque um eventual script adicional de checkout (Open Questions #1, Opção B) estaria sujeito ao MESMO prazo.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | O botão de adicionar ao carrinho do tema Morelia usa a mesma convenção `.js-addtocart` + `LS.addToCartEnhanced()` do `base-theme` oficial da Tiendanube (inspecionado via GitHub, não via inspeção ao vivo da loja Talgui) | Pattern 2, Pitfall 1 | Se o tema Morelia usar uma classe/mecanismo diferente, o listener delegado do Pattern 2 nunca dispara — `add_to_cart` fica sempre zerado. Precisa de checkpoint de verificação ao vivo (inspecionar o botão real na loja) antes de codificar |
| A2 | `window.LS.product` expõe mais campos além de `.id` (ex: `name`, `price`) necessários para montar `items[]` no `add_to_cart` disparado na página do produto recomendado | Pattern 1/2, Code Examples | Se `window.LS.product` só tiver `.id`, o script precisa buscar nome/preço por outra via (ex: reaproveitar o endpoint `/recommendations/:id` já existente, ou ler do DOM) — acrescenta uma chamada de rede extra ao fluxo de add_to_cart |
| A3 | Nenhum evento DOM customizado (`CustomEvent`) é disparado após add-to-cart bem-sucedido no tema real da Talgui | Pattern 2, Pitfall 1 | Se existir um evento customizado real (não documentado publicamente, só visível por inspeção ao vivo), a solução poderia ser mais precisa (confirmação de sucesso, não clique otimista) — vale um checkpoint de inspeção de rede/DOM ao vivo antes de fechar o design final |
| A4 | GA4 não atribui automaticamente receita/conversão a um `item_list_name` de eventos anteriores da sessão quando o evento `purchase` não carrega esse parâmetro | Pitfall 3, Open Questions #1 | Esta é a base do achado crítico da fase — se estiver errada (isto é, se o GA4 realmente fizer algum tipo de stitching automático via o relatório "Attribution"/"Monetization"), a lacuna de receita seria menor do que documentado. Fontes consultadas (blogs especializados, templates de GTM) convergem na mesma direção, mas nenhuma é a documentação oficial do Google declarando isso de forma definitiva — MEDIUM confidence, não HIGH |
| A5 | O tema Morelia carrega `gtag.js` de forma síncrona o suficiente para `window.gtag` já existir quando `main-partners.js` executa (`onfirstinteraction`/`onload`) | Pattern 1 | Se `gtag.js` carregar de forma assíncrona e atrasada, os `typeof window.gtag !== 'function'` guards vão descartar silenciosamente os primeiros eventos — pode precisar de um retry/fila simples |

**Se esta tabela estivesse vazia:** não é o caso — 5 claims assumidas, todas precisam de confirmação/checkpoint humano antes ou durante a execução (a maioria requer inspeção ao vivo da loja real Talgui, que esta pesquisa não tem acesso para fazer).

## Open Questions

1. **A "receita atribuível ao bloco Recomendados" (meta central da fase) é alcançável só instrumentando `main-partners.js`, ou exige tocar o checkout (fora do escopo atual)?**
   - O que sabemos: `view_item_list`/`select_item`/`add_to_cart` SÃO 100% controláveis e atribuíveis pelo projeto (dados reais, não estimativa). O evento `purchase` roda no checkout nativo da Nuvemshop, fora do escopo desta fase, e o GA4 não propaga `item_list_name` automaticamente para eventos futuros da mesma sessão (Pitfall 3/A4).
   - O que não está claro: se vale a pena, para esta fase, registrar um SEGUNDO Script Nuvemshop com `location: checkout` (tecnicamente suportado pela API de Scripts, confirmado nesta pesquisa `[CITED: tiendanube.github.io/api-documentation/resources/script]`, sem precisar de GTM) que leia dados do pedido na página de confirmação e dispare um evento de receita reconstruindo a atribuição via `sessionStorage`. Isso expandiria o escopo formal do CONTEXT.md (que hoje só menciona "instrumentar o storefront-script", singular).
   - Recomendação: **levar esta decisão explicitamente ao usuário antes do plano assumir uma de duas rotas**: (a) dashboard reporta só Visualizações + Add to Cart como métricas 100% reais, com "Receita"/"Conversão" claramente marcadas como indisponíveis/aproximadas nesta fase, deixando a atribuição completa de receita para uma fase futura que toque o checkout; ou (b) esta fase absorve também um script de checkout adicional (mais escopo, mesmo prazo de migração NubeSDK que o script principal). Isto contradiz a meta da fase ("comprovar com dados reais, não estimativa") o suficiente para merecer uma pergunta explícita de discuss-phase adicional, não uma decisão unilateral do planejador.

2. **`window.LS.product` expõe nome/preço, ou só `.id`?**
   - O que sabemos: `getCurrentProductId()` em `main-partners.js` só lê `window.LS.product.id`.
   - O que não está claro: se o objeto `LS.product` (mesma convenção usada pelo tema para `LS.addToCartEnhanced`) expõe mais campos utilizáveis para montar `items[]` no `add_to_cart` sem chamada de rede extra.
   - Recomendação: checkpoint de inspeção ao vivo (`console.log(window.LS.product)` numa página de produto real da Talgui) antes de finalizar o Pattern 2.

3. **O tema Morelia realmente usa `.js-addtocart`/`LS.addToCartEnhanced()` como o `base-theme` genérico, ou tem uma customização própria?**
   - O que sabemos: Morelia é tema oficial da Nuvemshop (não de terceiro), o que aumenta a chance de reaproveitar as convenções do `base-theme` público.
   - O que não está claro: customizações específicas do Morelia não são visíveis via o repositório público inspecionado.
   - Recomendação: checkpoint de inspeção ao vivo do HTML/JS renderizado numa página de produto real antes de codificar o Pattern 2 (mesmo tipo de verificação já feita em fases anteriores, ex: D-03/01-04 capturou classes CSS reais do tema ao vivo).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|----------|----------|
| Node.js | Runtime do backend/scripts | ✓ | v24.17.0 (ambiente de dev local; `package.json` exige `>=20.6`) | — |
| npm registry (acesso de rede) | `npm view`/`npm install` | ✓ | — | — |
| `google-auth-library` | Autenticação GA4 Data API | Não instalado ainda (a instalar nesta fase) | 10.9.0 disponível no registry | `@google-analytics/data` (mais pesado, ver Alternativas Consideradas) |
| Conta de serviço Google Cloud + acesso GA4 Admin | Autenticação/leitura da Data API | Confirmado pelo usuário como pré-requisito pronto (D-71) | — | — |
| `gtag.js` já instalado na loja Talgui | Disparo dos eventos client-side | Confirmado pelo usuário (D-71) | — | — |
| Vercel (deploy já existente do projeto) | Hospedagem de `/metrics` (D-77) | ✓ (projeto já hospedado, `api/recommendations`) | — | — |
| Inspeção ao vivo da loja Talgui (DOM/rede reais) | Confirmar A1-A3 (Pattern 2) | ✗ (não disponível nesta sessão de pesquisa) | — | Checkpoint humano antes/durante a execução do plano |

**Missing dependencies with no fallback:**
- Inspeção ao vivo da loja Talgui — bloqueia a confirmação final de A1/A2/A3 (mecanismo exato de add-to-cart). O plano deve incluir uma tarefa de verificação/checkpoint dedicada antes de finalizar o Pattern 2 em produção.

**Missing dependencies with fallback:**
- `google-auth-library` não instalado — fallback trivial (`npm install`), sem risco.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (`^4.1.10`, já presente em `app-partners-recomendados/package.json`) |
| Config file | nenhum arquivo de config dedicado — Vitest roda com defaults via `"test": "vitest run"` |
| Quick run command | `npx vitest run src/analytics` (escopo restrito à pasta nova) |
| Full suite command | `npm test` (roda toda a suíte, incluindo os testes já existentes de `review-server.test.js`, `ingest-catalog.test.js`, etc.) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|--------------|
| D-74/D-75 (Pattern 1/2) | Funções puras de montagem de payload gtag (`trackViewItemList`/`trackSelectItem`/`trackAddToCart`) produzem o shape esperado dado um input fixo | unit | `npx vitest run storefront-script/main-partners.test.js` | ❌ Wave 0 — não existe teste para `main-partners.js` hoje (só `main.test.js` para o outro arquivo) |
| D-75 (Pattern 2) | `rememberAttribution`/`consumeAttribution` respeitam TTL e chave por produto | unit | `npx vitest run storefront-script/main-partners.test.js` | ❌ Wave 0 |
| D-78 (Pattern 3) | `isAuthorized` rejeita token ausente/errado, aceita token correto, usa comparação de tempo constante | unit | `npx vitest run src/review-server.test.js` (estender arquivo existente) | ✓ arquivo existe, precisa de novos casos |
| D-77/D-80/D-81 (queries GA4) | `getSummary`/`getBySourceProduct`/`getByRecommendedProduct` montam o `runReport` request corretamente (mockando `fetch`) | unit | `npx vitest run src/analytics/metrics-queries.test.js` | ❌ Wave 0 |
| D-77 (rota `/metrics`) | `GET /metrics` sem token retorna 401; com token válido retorna 200 e HTML | integration | `npx vitest run src/review-server.test.js` | ✓ arquivo existe (mesmo padrão de `GET /audit`), precisa de novos casos |
| D-79 (presets) | `presetToDateRange('today'|'7d'|'30d')` produz o `dateRange` correto; input fora do allow-list rejeitado | unit | `npx vitest run src/analytics/metrics-queries.test.js` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run <arquivo específico>`
- **Per wave merge:** `npm test` (suíte completa)
- **Phase gate:** Suíte completa verde antes de `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `storefront-script/main-partners.test.js` — cobre Pattern 1/2 (funções puras de payload gtag + sessionStorage bridge), seguindo o mesmo padrão de guard de exportação já usado em `main.test.js` (`module.exports` só quando `typeof module !== 'undefined'`)
- [ ] `src/analytics/metrics-queries.test.js` — cobre montagem de requests `runReport` e presets de data (D-79), mockando `fetch`/`google-auth-library`
- [ ] `src/analytics/ga4-client.js` — não precisa de teste de integração real contra o Google (custaria quota/credencial real); testar só a montagem da requisição com `fetch` mockado
- [ ] Estender `src/review-server.test.js` com casos para `/metrics` (401 sem token, 200 com token, presets inválidos rejeitados)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|----------------|---------|-------------------|
| V2 Authentication | yes | Token fixo (Pattern 3) comparado via `crypto.timingSafeEqual`, fail-closed se env var ausente |
| V3 Session Management | no | Não há sessão de usuário autenticado — token estático por requisição, sem cookie/sessão |
| V4 Access Control | yes | `/metrics` exige token em toda requisição (diferente de `/audit`, D-78); `/audit` e `/review` permanecem sem auth (postura já aceita, D-37) |
| V5 Input Validation | yes | Parâmetro `preset` (D-79) DEVE ser validado contra allow-list fixa (`today`/`7d`/`30d`) antes de virar `dateRange` — nunca aceitar string arbitrária que vire input não sanitizado para a Data API |
| V6 Cryptography | yes (indireta) | Autenticação Google via `google-auth-library` (assinatura JWT/RS256) — nunca implementar assinatura JWT manualmente; a service account JSON (D-83) nunca deve ser logada nem exposta em mensagens de erro |

### Known Threat Patterns for esta fase

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|------------------------|
| Vazamento do `METRICS_ACCESS_TOKEN`/`GA4_SERVICE_ACCOUNT_JSON` em logs de erro/stack trace | Information Disclosure | Nunca incluir `process.env.*` bruto em mensagens de erro retornadas ao cliente; erros da Data API devem ser sumarizados genericamente ao chamador (mesmo padrão de `sendJson(res, 500, {error:'Internal error'})` já usado em `review-server.js`) |
| Timing attack na comparação do token de acesso | Information Disclosure / Tampering | `crypto.timingSafeEqual` (Pattern 3), nunca `===` |
| Injeção de dimensionFilter arbitrário via query string manipulada (`?preset=<algo malicioso>`) | Tampering | Allow-list estrita de presets (V5) — nunca interpolar valor de query string diretamente no corpo da requisição à Data API |
| Reuso do token de acesso do `/metrics` capturado em URL (query param) aparecendo em logs de proxy/analytics de terceiros | Information Disclosure | Preferir header (`X-Metrics-Token`/`Authorization`) sobre query param quando possível; se usar query param por simplicidade (D-78 sugeriu ambos como opção), documentar o risco residual explicitamente |

## Sources

### Primary (HIGH confidence)
- `developers.google.com/analytics/devguides/collection/ga4/ecommerce` — schema oficial dos eventos GA4 Enhanced Ecommerce (`view_item_list`, `select_item`, `add_to_cart`)
- `developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runReport` — endpoint REST, shape do request/response
- `npm view @google-analytics/data` / `npm view google-auth-library` — versões, dependências, ausência de `postinstall` suspeito (verificado nesta sessão via registry real)
- `tiendanube.github.io/api-documentation/resources/script` — suporte a `location: checkout` no Script resource (base do Open Questions #1)

### Secondary (MEDIUM confidence)
- Múltiplas fontes convergentes sobre a não-atribuição automática de `item_list_name` a eventos futuros no GA4 (blogs especializados + templates GTM da comunidade que existem justamente para preencher essa lacuna) — nenhuma é a documentação oficial declarando isso de forma explícita e definitiva, daí MEDIUM e não HIGH
- Latência de processamento GA4 (24-48h) — citada por múltiplos blogs especializados em analytics, consistente entre si
- `raw.githubusercontent.com/TiendaNube/base-theme/master/static/js/store.js.tpl` — inspeção do handler `.js-addtocart`/`LS.addToCartEnhanced()`; é o tema BASE genérico da Tiendanube, não confirmado como idêntico ao Morelia real da Talgui

### Tertiary (LOW confidence)
- Existência (ou não) de `CustomEvent` disparado pelo tema real da Talgui após add-to-cart bem-sucedido — não verificável sem inspeção ao vivo (ver Assumptions Log A1/A3)
- Campos exatos expostos por `window.LS.product` além de `.id` (Assumptions Log A2)

## Metadata

**Confidence breakdown:**
- Standard stack (google-auth-library + REST): HIGH — verificado via registry real + documentação oficial
- Instrumentação gtag (view_item_list/select_item): HIGH — schema estável, múltiplas fontes oficiais convergentes
- Detecção de add_to_cart (Pattern 2): MEDIUM/LOW — mecanismo do tema base é conhecido, mas não confirmado ao vivo contra o tema Morelia real da Talgui
- Atribuição de receita/conversão (Pitfall 3): MEDIUM — achado bem sustentado por múltiplas fontes secundárias, mas sem confirmação por fonte primária/oficial explícita sobre esse comportamento específico
- Arquitetura de deploy (`/metrics` na Vercel, Pitfall 4/Pattern 4): HIGH — baseado em inspeção direta do próprio repositório (fatos verificáveis, não pesquisa externa)

**Research date:** 2026-07-23
**Valid until:** 30 dias para as partes de API/pacotes (estável); 7 dias para as assunções sobre o tema Morelia real (A1-A3) — essas devem ser tratadas como provisórias até checkpoint de inspeção ao vivo, independentemente da data
