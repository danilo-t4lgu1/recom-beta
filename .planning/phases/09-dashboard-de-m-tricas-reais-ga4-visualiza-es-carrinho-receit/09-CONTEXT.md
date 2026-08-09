# Phase 9: Dashboard de Métricas Reais (GA4) — visualizações, carrinho, receita e conversão do bloco Recomendados - Context

**Gathered:** 2026-07-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Três entregas: (1) instrumentar o storefront-script (`main-partners.js`) com eventos GA4 Enhanced Ecommerce (`view_item_list`, `select_item`, `add_to_cart`), todos marcados com `item_list_name="Recomendados"`, disparados a partir do bloco "Recomendados" já renderizado no storefront; (2) instrumentar um SEGUNDO Script Nuvemshop (`location: checkout`) na página de confirmação do pedido, para reconstruir a atribuição de receita ao bloco via a ponte `sessionStorage` já usada no add_to_cart (ver D-85) — sem essa segunda instrumentação, "receita"/"conversão" atribuíveis ao bloco não são alcançáveis (GA4 não propaga `item_list_name` automaticamente para o evento `purchase` do checkout nativo); (3) construir um dashboard de leitura (nova rota em `review-server.js`, reaproveitada também como função Vercel) via Google Analytics Data API (GA4) que isole visualizações, adições ao carrinho, receita e conversão atribuíveis especificamente a esse bloco.

Sem dados retroativos — a atribuição só existe a partir do dia em que os eventos forem instrumentados; não há reconstrução de tráfego passado.

</domain>

<decisions>
## Implementation Decisions

### Estado prévio confirmado pelo usuário (pré-requisitos do ROADMAP)
- **D-71:** GA4/`gtag.js` já está instalado no tema da loja Talgui, e o usuário já tem acesso admin ao GA4 para criar a service account Google Cloud (permissão Viewer/Data API). Ambos os pré-requisitos listados no ROADMAP.md estão prontos — pesquisa e planejamento podem seguir sem bloqueio.
- **D-72:** A Fase 8 ("App de vitrine de Recomendados no storefront — carrossel") é tratada como funcionalmente concluída, apesar de constar "0 plans / to be planned" no ROADMAP.md e não ter CONTEXT.md/PLAN.md formal. O entregável real é `storefront-script/main-partners.js` (não commitado no git no momento desta discussão), que renderiza o bloco "Recomendados" em formato carrossel nativo (Swiper, cards `col-6 col-md-3`), reaproveitando o CSS/estrutura do tema Morelia. **Nota para o planejador:** considerar registrar a Fase 8 retroativamente (ex: `/gsd-docs-update` ou CONTEXT.md manual) em algum momento — não é bloqueante para a Fase 9, mas é uma lacuna de rastreabilidade.

### Script a instrumentar
- **D-73:** `storefront-script/main-partners.js` é o script real e ativo/publicado na loja Talgui hoje (recebendo tráfego real de visitantes) — é ESTE arquivo que recebe a instrumentação GA4, não `main.js` (versão anterior, v.Alpha, sem carrossel).
- **D-74:** Os eventos GA4 são disparados via `window.gtag()` diretamente no script, assumindo que o `gtag.js` do tema Morelia já expõe `window.gtag` globalmente na página (confirmado como pré-requisito pronto, D-71). Não usar `window.dataLayer.push()` — não há Google Tag Manager confirmado no meio.
- **D-75:** O evento `add_to_cart` precisa capturar quando o visitante adiciona ao carrinho um produto recomendado a partir do bloco. Não há hook/evento conhecido documentado do tema Morelia para isso ainda — **fica para a pesquisa/planejamento investigar** o mecanismo real (interceptar clique no botão "Adicionar ao carrinho" dentro do bloco, ou escutar evento customizado do tema, se existir).
- **D-76:** `item_list_name="Recomendados"` sozinho já isola os dados no GA4 Data API — o bloco nativo "Produtos Relacionados" do tema foi suprimido desde a Fase 1 (D-03) e não coexiste, então não há risco de mistura de atribuição. Não é necessário adicionar `item_list_id` extra.

### Onde mora o dashboard
- **D-77:** O dashboard vira uma nova rota (ex: `GET /metrics`) no `review-server.js` existente — reaproveita o mesmo padrão HTTP nativo (sem framework) e SSR HTML já usado em `GET /audit`, mesmo servidor/deploy (Vercel). Não é um serviço/arquivo separado. (Recomendação de Claude, aceita pelo usuário.)
- **D-78:** Diferente do `GET /audit` (que roda sem autenticação, postura de confiança local, D-37), o dashboard de métricas GA4 precisa de uma camada de proteção simples de acesso (ex: senha/token), por expor dados de receita/conversão — mais sensíveis que log de auditoria de escrita. **Fica para o planejador definir o mecanismo exato** (ex: token fixo em query param/header, comparado contra env var).

### Métricas e apresentação
- **D-79:** Janelas de tempo: presets fixos (hoje / 7 dias / 30 dias). Sem range customizado nesta fase.
- **D-80:** Apresentação: cartões de resumo (números-chave em destaque: visualizações, add_to_cart, receita, taxa de conversão) no topo, mais tabelas detalhadas abaixo.
- **D-81:** As tabelas detalhadas cobrem **dois níveis**: uma tabela por produto-fonte (produto onde o bloco "Recomendados" foi exibido — total de visualizações/cliques/add_to_cart gerados por aquele bloco) e outra por produto recomendado (produto que apareceu dentro do carrossel — quais recomendações específicas geram mais clique/conversão).
- **D-82:** Escopo de métricas fica estritamente nos números absolutos do bloco Recomendados (visualizações, add_to_cart, receita, conversão) — **sem** comparativo com a conversão geral da loja. Isso é explicitamente fora de escopo desta fase.

### Credenciais da service account Google
- **D-83:** As credenciais da service account (JSON) ficam em variável de ambiente como string (ex: `GA4_SERVICE_ACCOUNT_JSON`, parseada em runtime), mesmo padrão já usado pelo projeto (`.env` / Vercel env vars, ver `app-partners-recomendados/.env.example`). Sem arquivo de credenciais separado no filesystem — evita quebrar em ambiente serverless (Vercel) sem sistema de arquivos persistente.
- **D-84:** O GA4 Property ID da loja Talgui fica em variável de ambiente (`GA4_PROPERTY_ID`), nunca hardcoded no código — mesma filosofia já aplicada no projeto (nada de valores fixos assumidos, ver rate limiter D-01 da Fase 2). O usuário preenche o valor real quando for configurar o ambiente.

### Escopo expandido pós-pesquisa (achado crítico, decisão do usuário 2026-07-23)
- **D-85:** A pesquisa (09-RESEARCH.md, Pitfall 3/Open Questions #1) confirmou que o GA4 NÃO atribui receita/conversão automaticamente ao `item_list_name="Recomendados"` em eventos futuros da mesma sessão — o evento `purchase`, disparado pelo checkout nativo da Nuvemshop, não carrega esse parâmetro. Só instrumentar `main-partners.js` deixaria "Receita"/"Conversão" (D-80) sempre zeradas. **Usuário decidiu expandir o escopo desta fase** (em vez de reduzir a fase a só Visualizações+Add to Cart, ou pausar para nova discuss-phase): registrar um SEGUNDO Script Nuvemshop com `location: checkout` (suportado pela API de Scripts, confirmado na pesquisa), que lê os dados do pedido confirmado e reconstrói a atribuição ao bloco Recomendados via a mesma ponte `sessionStorage` já usada para `add_to_cart` (Pattern 2 da pesquisa), disparando um evento de receita/conversão com `item_list_name="Recomendados"` na própria página de confirmação. Este segundo script fica sujeito ao mesmo prazo de migração NubeSDK já registrado na Fase 10 (bloqueio de novas instalações 30/08/2026).
- **D-86:** O planejador deve tratar a descoberta do mecanismo real de leitura dos dados do pedido na página de confirmação da Nuvemshop (quais dados ficam disponíveis via `window.LS`/DOM na página de checkout/obrigado, e se há forma de correlacionar com o produto recomendado que originou a compra) como um passo de pesquisa/implementação adicional desta fase — não estava coberto no RESEARCH.md original (que assumiu checkout fora de escopo). Igual a D-75/A1-A3, deve ter checkpoint de inspeção ao vivo da loja Talgui.

### Claude's Discretion
- Mecanismo exato de descoberta do hook de `add_to_cart` no tema Morelia (D-75) — a pesquisa decide a abordagem técnica.
- Mecanismo exato da proteção de acesso ao dashboard (D-78) — o planejador decide a implementação (token/senha).
- Mecanismo exato de leitura dos dados do pedido na página de checkout/confirmação para o script novo (D-86) — o planejador/execução decide, com checkpoint de verificação ao vivo.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Arquitetura e decisões anteriores
- `.planning/PROJECT.md` — visão geral, decisões-chave (D-01 a D-70), constraints da plataforma
- `.planning/ROADMAP.md` (seção "Phase 9") — goal completo e nota de viabilidade (2026-07-22) com os dois pré-requisitos GA4 já confirmados nesta discussão
- `.planning/phases/01-spike-de-viabilidade-end-to-end/01-CONTEXT.md` — D-03 (supressão do bloco nativo "Produtos Relacionados"), base para D-76 desta fase
- `.planning/phases/05-grava-o-segura-em-produ-o/05-CONTEXT.md` — D-37 (postura de confiança local, sem auth no /audit), contraponto para D-78 desta fase
- `.planning/phases/06-opera-o-di-ria-aut-noma-na-nuvem/06-CONTEXT.md` — D-50 (cache TTL 24h no storefront-script), padrão de referência para o mesmo arquivo que será instrumentado

### Código relevante (existente, não documentado formalmente como Fase 8)
- `storefront-script/main-partners.js` — script ativo a instrumentar com eventos GA4 (D-73)
- `app-partners-recomendados/src/review-server.js` — servidor HTTP nativo onde a nova rota `/metrics` deve ser adicionada (D-77)
- `app-partners-recomendados/.env.example` — padrão de variáveis de ambiente já em uso, seguir o mesmo estilo para `GA4_SERVICE_ACCOUNT_JSON`/`GA4_PROPERTY_ID`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `review-server.js` (`createServer()`, exporta uma instância `http.Server` sem `.listen()`, testável em porta efêmera): padrão a reaproveitar para a nova rota `/metrics`.
- `GET /audit` em `review-server.js`: referência direta de como uma tela SSR somente-leitura já foi construída neste projeto (HTML gerado sem framework).
- `storefront-script/main.js` cache TTL pattern (D-50, `asyncSessionStorage`): não diretamente reaproveitável para GA4 (eventos não usam cache), mas mostra o estilo de código esperado em `main-partners.js`.

### Established Patterns
- Zero framework HTTP (`node:http` puro) em todo o backend — qualquer nova rota GA4 deve seguir o mesmo estilo, sem introduzir Express/Fastify.
- Variáveis de ambiente simples (`.env`) para todo segredo/config — sem vault ou arquivo de credenciais separado (reforça D-83/D-84).
- Script de storefront é JS puro sem build step, injetado direto via `<script>` tag (Script API tradicional, D-11) — GA4 deve ser instrumentado nesse mesmo arquivo sem introduzir dependências externas/bundler.

### Integration Points
- `main-partners.js` já tem a lógica de renderização do carrossel e leitura de produtos — os eventos `view_item_list`/`select_item`/`add_to_cart` se conectam nos pontos onde o carrossel renderiza, onde o clique no produto é capturado, e onde o botão de carrinho é acionado (ponto exato a descobrir, D-75).
- `review-server.js` já tem acesso ao `catalog-store.js`/SQLite para outros dados do projeto — a nova rota `/metrics` não usa esse SQLite, e sim a GA4 Data API (integração nova, chamada externa ao Google).

</code_context>

<specifics>
## Specific Ideas

- Dashboard: cartões de resumo (visualizações, add_to_cart, receita, taxa de conversão) + duas tabelas (por produto-fonte, por produto recomendado), com presets de tempo hoje/7d/30d — ver D-79 a D-81.

</specifics>

<deferred>
## Deferred Ideas

- **Comparativo com conversão geral da loja** (D-82) — explicitamente fora de escopo desta fase; poderia ser uma extensão futura do dashboard se o usuário quiser medir impacto relativo.
- **Registro retroativo da Fase 8** — a Fase 8 (carrossel) foi tratada como concluída de fato (D-72), mas não tem CONTEXT.md/PLAN.md/SUMMARY formal no fluxo GSD. Vale considerar `/gsd-docs-update` ou um registro manual em algum momento, para manter o ROADMAP.md e o histórico de decisões coerentes com o estado real do código.

[None além dos itens acima — discussão ficou dentro do domínio da fase]

</deferred>

---

*Phase: 9-Dashboard de Métricas Reais (GA4)*
*Context gathered: 2026-07-23*
