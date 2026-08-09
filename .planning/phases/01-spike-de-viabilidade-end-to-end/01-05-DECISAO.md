# Fase 1 — Decisão Final de Viabilidade

**Data:** 2026-07-10
**Plano:** 01-05 (Wave 4)
**Produto de teste real:** Vestido Elaine Preto (ID 349886153) — `https://talgui.com.br/produtos/vestido-elaine-preto/`
**Produto recomendado real:** Vestido Regina Com Fenda Preto (ID 321418552)

## Nota de enquadramento obrigatória (D-11)

Esta decisão é tomada com base numa **adaptação explícita e autorizada** do plano original: o Script publicado e verificado nesta fase **não é um Script NubeSDK** — é um **v.Alpha construído sobre a Script API tradicional da Nuvemshop** (`write_scripts`, JS puro, sem build/bundle, manipulação direta do DOM), por decisão explícita do usuário (D-11, registrada em `01-CONTEXT.md`), tomada em 2026-07-10 porque a ativação do NubeSDK para o tema Morelia da loja **ainda não foi submetida/aprovada** externamente.

**O que isso significa para o Critério de Sucesso 3 do roadmap** ("Um Script NubeSDK publicado via esse App Partners lê esse Metafield no navegador e renderiza um bloco 'Recomendados' visível..."):

- A **arquitetura de dados de ponta a ponta** (Metafield gravado via API pública → endpoint próprio seguro → Script no navegador → bloco renderizado no DOM real) está **provada e confirmada com evidência real**, na loja de produção Talgui.
- O **modelo de execução NubeSDK especificamente** (Web Worker sandbox, UI Slots, `nube.render()`, sem acesso direto a `document`) **permanece não confirmado e pendente** — não foi exercitado nesta fase, porque a ativação do tema segue não submetida. É trabalho futuro, separado e ainda não iniciado.
- Este documento **não** afirma "NubeSDK funciona no tema Morelia" — afirma que o pipeline de dados que o NubeSDK viria a consumir (Metafield → endpoint → renderização) está validado, e que a camada de execução final (Script API tradicional agora, NubeSDK depois) é substituível sem invalidar essa prova.

## Os 5 Critérios de Sucesso do Roadmap (Phase 1, ROADMAP.md)

### Critério 1 — App Partners privado autentica com sucesso contra a loja real Talgui

**Status: CONFIRMADO**

- Evidência: `01-02-SUMMARY.md` — App Partners privado novo ("Talgui Recomendados"), distinto do app de ordenação de vitrines existente (D-09/D-10), registrado no Partners Portal e autenticado via OAuth completo contra a loja real Talgui. `client_id`, `client_secret`, `access_token` e `store_id` reais obtidos e funcionando, lidos de `.env` (nunca hardcoded) pelo módulo `nuvemshop-auth.js`.
- Requisito: PLAT-01 — confirmado.

### Critério 2 — Metafield escrito via API pública confirmado por leitura de volta (round-trip)

**Status: CONFIRMADO**

- Evidência: `01-02-SUMMARY.md` — `recomendados.produto_sugerido=321418552` escrito no produto 349886153 (Vestido Elaine Preto) via `POST /v1/{store_id}/metafields`, lido de volta com valor idêntico via `GET /v1/{store_id}/metafields/products`. Prova que a arquitetura de Metafields contorna a limitação do campo nativo `alternative_products`/`complementary_products` (não gravável por API pública, confirmado em `PROJECT.md` durante a revalidação de 2026-07-08).
- Bug real encontrado e corrigido durante essa validação: `owner_resource` precisa ser `'Product'` (capitalizado), não `'product'` — API real rejeitava com 422 (RESEARCH.md tinha inconsistência entre prosa e exemplo de código). Corrigido, round-trip re-executado com sucesso.
- Requisito: WRTE-01 — confirmado.

### Critério 3 — Script (v.Alpha, per D-11) lê o Metafield no navegador e renderiza o bloco "Recomendados" visível na página real, confirmado ao vivo

**Status: CONFIRMADO — via v.Alpha da Script API tradicional (D-11), NÃO via NubeSDK**

Evidência completa da cadeia real na loja de produção, incluindo o processo de depuração ao vivo conduzido nesta task (não uma publicação de primeira tentativa sem incidentes):

**Publicação inicial (Partners Portal):**
- Descoberta durante o processo: a Nuvemshop exige "Instalação Loja Demo" antes de uma versão do Script poder ir para a loja real — a primeira versão (V1) ficou restrita à demo; somente a partir da V2 (reautorizando via o mesmo link OAuth do Wave 2) o script foi liberado para a loja real Talgui.
- Evento de carregamento do script configurado como `onfirstinteraction` (não `onload`) — `onload` exige aprovação prévia da Nuvemshop via e-mail (`api@nuvemshop.com.br`), não solicitada nesta fase. `onfirstinteraction` não exige essa aprovação e é aceitável: o bloco fica abaixo da dobra, então um visitante real já rolou a página (= já interagiu) antes de chegar até lá.

**Bug real #1 — CORS bloqueando o fetch (encontrado na primeira tentativa de verificação visual, V3):**
- Sintoma: script carregava no navegador mas o bloco não aparecia; console mostrava `TypeError: Failed to fetch` em `fetchRecommendation`.
- Causa raiz: `app-partners-recomendados/api/recommendations/[productId].js` não enviava header `Access-Control-Allow-Origin` — o navegador bloqueia respostas cross-origin sem esse header antes mesmo do script poder ler o corpo. Os testes via `curl` feitos mais cedo nesta mesma task não capturaram o problema porque CORS é uma política aplicada exclusivamente pelo navegador, não por `curl`.
- Fix: commit `cdd824c` — headers CORS adicionados (`Access-Control-Allow-Origin: https://talgui.com.br`, `Access-Control-Allow-Methods`, `Access-Control-Allow-Headers`) e tratamento de `OPTIONS` (preflight) no handler.
- Verificação pós-fix: `curl -H "Origin: https://talgui.com.br"` contra o endpoint público confirmou os headers CORS corretos na resposta.

**Bug real #2 — link do produto recomendado quebrado (encontrado após o fix de CORS, no primeiro teste visual bem-sucedido de carregamento):**
- Sintoma: bloco "RECOMENDADOS" apareceu corretamente no DOM, mas o link levava a `https://talgui.com.br/produtos/321418552` — uma URL inexistente (404).
- Causa raiz: a Nuvemshop roteia produtos pelo "Identificador URL" (handle/slug, ex: `vestido-regina-com-fenda-preto`), não pelo ID numérico bruto. A v.Alpha original (construída no plano 01-03) montava o link erroneamente como `/produtos/{id}`.
- Fix: commit `7ca8c5d` — `getRecommendations()` em `app-partners-recomendados/src/api/recommendations.js` passou a também chamar `getProduct(recommendedProductId)` e retornar um objeto `recommendedProduct: { url, name, image, price }`, usando `canonical_url` (já correto, retornado pronto pela API pública) em vez de reconstruir a URL manualmente. `storefront-script/main.js` atualizado para renderizar nome + foto + preço + link correto usando esse objeto, em vez de apenas um link de texto com o ID.
- Verificação pós-fix: `curl` confirmou `recommendedProduct.url` com a URL real e válida; usuário publicou o script atualizado (V4 no Partners Portal, mesmo conteúdo do arquivo commitado) e confirmou visualmente: nome do produto, foto e preço aparecem corretamente, e o link redireciona certo para a página real do produto recomendado.

**Ajuste de alinhamento (cosmético, não bloqueante):**
- Usuário reportou o bloco "colado no canto esquerdo da tela" em viewport mobile. Tentativa de fix: commit `3c273c3` (envolver o bloco em `.container-fluid.position-relative`). Inspeção via DevTools do usuário (screenshot real, mobile 337px) mostrou que o bloco já estava corretamente aninhado dentro do `.container-fluid` existente que também envolve `#product-description` — o alinhamento não parecia visualmente quebrado no viewport testado. Nenhuma iteração adicional foi feita.
- **Decisão explícita do usuário:** aceitar o alinhamento atual como suficiente para este v.Alpha. Polimento visual fino fica para a reconstrução em NubeSDK — não vale iterar mais agora num código já sabido descartável (D-11).

**Confirmação visual final:**
- Bloco "Recomendados" (nome "Vestido Regina Com Fenda Preto", foto, preço R$ 349,90, link funcional) confirmado visível na página real do produto de teste, na posição documentada em D-03 (entre `#compre-junto-block` e `#product-description`).
- Nenhum conflito visual com o bloco nativo suprimido observado (ver Critério 4 abaixo).
- Resposta do usuário ao checkpoint desta task: **"aprovado, arquitetura viável"**.
- Requisito: FRNT-01 — confirmado via v.Alpha (Script API tradicional). NubeSDK como modelo de execução específico permanece não exercitado/pendente (ver nota de enquadramento acima e débito técnico rastreado abaixo).

### Critério 4 — Documentado, com evidência, se o tema suporta NubeSDK e se o bloco nativo pode ser suprimido sem conflito visual

**Status: CONFIRMADO (ambas as partes)**

- **Suporte a NubeSDK:** `01-01-SUMMARY.md` — tema ativo da loja Talgui confirmado como **Morelia** (não-Patagonia) via inspeção direta do admin. Por documentação oficial, NubeSDK no storefront é nativamente suportado apenas no tema Patagonia; para Morelia, depende de ativação manual via formulário — **ainda não submetido** nesta fase (ação pendente do usuário, não resposta aguardada). Este é o motivo direto do override D-11: a Wave 3 original (Script NubeSDK) estava bloqueada por essa pendência externa, e o usuário optou por validar a arquitetura agora via Script API tradicional em vez de aguardar indefinidamente.
- **Supressão do bloco nativo:** `01-04-SUMMARY.md` — bloco nativo "Produtos Relacionados" suprimido de forma visualmente limpa via CSS customizado no admin (D-01/D-02), sem necessidade de investigar supressão via Script como plano B. Estrutura DOM real identificada: 3 elementos irmãos (`.header-related`, `#related-products`, `.js-swiper-related-pagination`), todos ocultados juntos numa única regra `display: none !important` para evitar título órfão/espaço vazio (Pitfall 3 do RESEARCH.md). Confirmado via fetch do HTML publicado antes/depois.
- **Reconfirmação nesta task (Critério 4 revisitado com o bloco customizado agora presente):** com o Script v.Alpha publicado e o bloco "Recomendados" customizado renderizando na mesma posição onde o bloco nativo aparecia, o usuário confirmou visualmente que não há espaço vazio remanescente nem título órfão do bloco nativo suprimido — D-04 permanece satisfeito mesmo com o novo bloco customizado ativo.
- Requisito: PLAT-04 — confirmado.

### Critério 5 — Decisão explícita de viabilidade registrada

**Status: DECISÃO FINAL REGISTRADA**

## DECISÃO FINAL

**Arquitetura confirmada viável. Roadmap prossegue para a Fase 2.**

### Justificativa

Os 5 Critérios de Sucesso da Fase 1 estão confirmados com evidência real (não suposição), coletada em produção contra a loja real Talgui, em um único produto de teste real (Vestido Elaine Preto):

1. Autenticação via App Partners privado — funcional.
2. Escrita e leitura de Metafield via API pública — funcional, round-trip confirmado.
3. Script lê o Metafield no navegador e renderiza o bloco visível na página real — funcional, **via v.Alpha da Script API tradicional** (não NubeSDK), com dois bugs reais encontrados e corrigidos durante a verificação ao vivo (CORS, link de produto incorreto).
4. Tema documentado (Morelia, não-Patagonia, ativação NubeSDK pendente) e bloco nativo suprimido sem conflito visual, incluindo reconfirmação com o bloco customizado presente.
5. Esta decisão.

A cadeia completa de dados (Metafield → endpoint próprio seguro → Script → DOM real) está provada de ponta a ponta em produção. Isso é suficiente para validar que a arquitetura escolhida (Metafields via API pública + Script via App Partners) contorna corretamente a limitação confirmada do campo nativo (`PROJECT.md`, revalidação de 2026-07-08) e resolve as duas incógnitas centrais do spike: compatibilidade de tema (parcialmente resolvida — CSS/Metafield funcionam nativamente; NubeSDK depende de ativação externa ainda pendente) e conflito visual com o bloco nativo (resolvido, D-04 satisfeito).

### O que NÃO está confirmado (débito técnico explícito, não bloqueia a decisão)

- **NubeSDK como modelo de execução não foi exercitado nesta fase.** O Script publicado e verificado é a Script API tradicional (legada), por decisão explícita do usuário (D-11), enquanto a ativação do NubeSDK para o tema Morelia segue não submetida. O Script atual (`storefront-script/main.js`) **precisará ser reconstruído do zero em NubeSDK** quando essa ativação for aprovada — não é uma base de código incremental, é um protótipo descartável assumido como tal desde o plano 01-03.
- **Prazo de vida curto do v.Alpha:** apps sem NubeSDK deixam de poder receber novas instalações a partir de 30/ago/2026 e enfrentam remoção progressiva a partir de 30/out/2026 — risco aceito explicitamente pelo usuário em D-11.
- **Renderização mínima do bloco:** ainda que enriquecida nesta task (nome, foto, preço, link correto), o v.Alpha renderiza apenas 1 produto recomendado (não um carrossel de até 8, como o usuário sinalizou desejar para a Fase 2).
- **Motor de recomendação real ainda não existe:** o valor atual do Metafield é um único valor fixo, gravado manualmente para o teste (D-06/D-07) — não um motor calculando recomendações para múltiplos produtos.

Nenhum desses pontos invalida a decisão de viabilidade — são escopo explícito das Fases 2+ do roadmap, não do spike de viabilidade em si.

### Persistência (D-05)

Conforme D-05, o Metafield e o Script de teste **permanecem ativos** no produto real (Vestido Elaine Preto, ID 349886153) após esta aprovação. Nenhuma instrução de reverter/desfazer foi executada nesta task ou em qualquer plano desta fase. Este produto vira a base real que a Fase 2 vai reutilizar/escalar.

---

*Fase: 01-spike-de-viabilidade-end-to-end*
*Decisão registrada: 2026-07-10*
