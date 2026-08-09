---
phase: 01-spike-de-viabilidade-end-to-end
plan: 03
subsystem: api
tags: [nuvemshop, tiendanube, script-api, storefront, node, vanilla-js, alpha]

# Dependency graph
requires:
  - phase: 01-spike-de-viabilidade-end-to-end
    provides: "Plano 01-02 (getMetafields, produto de teste 349886153, recomendado 321418552) e 01-04 (posicao exata de renderizacao D-03: entre #compre-junto-block e #product-description)"
provides:
  - "Endpoint proprio somente-leitura GET /recommendations/:productId (PLAT-05), le o Metafield gravado no Wave 2 e retorna JSON minimo sem token"
  - "Script de storefront v.Alpha (storefront-script/main.js) construido com a Script API tradicional (write_scripts, sem NubeSDK) por decisao explicita de override do usuario (D-11)"
  - "Mecanismo confirmado (nao suposto) de obtencao do produto atual na pagina real: window.LS.product.id, verificado via inspecao do HTML ao vivo de talgui.com.br"
affects: [01-05-PLAN, roadmap, wave-4-publicacao]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Script API tradicional (legada) em vez de NubeSDK: JS puro, sem build step, acesso direto ao DOM — oposto do modelo Web Worker/UI Slots do NubeSDK"
    - "http nativo do Node para o backend (sem framework), consistente com o padrao minimo ja estabelecido em 01-02"
    - "window.LS.product.id como mecanismo confiavel de leitura do produto atual em temas Nuvemshop/LojaIntegrada (familia Morelia) — global atribuido uma unica vez por pagina, distinto de data-product-id (repetido em cards de vitrine) e do destructure inline de analytics (escopo de funcao, nao estavel)"

key-files:
  created:
    - app-partners-recomendados/src/api/recommendations.js
    - app-partners-recomendados/src/server.js
    - storefront-script/main.js
  modified: []

key-decisions:
  - "D-11 (override explicito, 2026-07-10): construir o Script desta fase com a Script API tradicional (v.Alpha), nao NubeSDK, enquanto a ativacao NubeSDK para o tema Morelia segue pendente de aprovacao externa. Risco aceito explicitamente pelo usuario: apps sem NubeSDK bloqueados para novas instalacoes a partir de 30/ago/2026, removidos progressivamente a partir de 30/out/2026"
  - "Diretorio storefront-script/ (nao nube-sdk-script/) para deixar claro que este NAO e o codigo-base do futuro Script NubeSDK — sera reconstruido do zero, nao incrementado"
  - "Task 1.5 do plano original (checkpoint de confirmacao do pacote create-nube-app) foi pulada integralmente e nao executada — nao aplicavel, pois este plano nao usa nenhum pacote @tiendanube/nube-sdk-* nem create-nube-app"
  - "Renderizacao do produto recomendado neste v.Alpha e minima (link com ID, sem nome/imagem/preco) — aceitavel para validar o pipeline ponta-a-ponta, nao para producao"

patterns-established:
  - "Contrato de resposta do endpoint proprio ({ productId, recommendedProductId }) e o mesmo contrato que qualquer implementacao futura do Script (legada ou NubeSDK) deve consumir — nao muda com a troca de modelo de execucao do Script"

requirements-completed: [PLAT-05, FRNT-01]

# Metrics
duration: 20min
completed: 2026-07-10
status: complete
---

# Phase 01 Plan 03: Endpoint Proprio + Script de Storefront v.Alpha (Script API Tradicional) Summary

**Endpoint GET /recommendations/:productId funcional e seguro (PLAT-05), consumido por um script de storefront v.Alpha construido deliberadamente com a Script API tradicional da Nuvemshop (nao NubeSDK) por decisao explicita de override do usuario (D-11), que le o produto atual via `window.LS.product.id` (confirmado por inspecao do HTML real da loja) e renderiza um bloco "Recomendados" minimo na posicao exata documentada em 01-04.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-10T04:18:00Z (aprox.)
- **Completed:** 2026-07-10T04:38:07Z
- **Tasks:** 2 executadas (Task 1 original + Task 2 substituida por override), 1 pulada (Task 1.5, nao aplicavel)
- **Files modified:** 3

## Accomplishments

- Endpoint proprio `GET /recommendations/:productId` implementado e verificado ao vivo: retorna `{"productId":"349886153","recommendedProductId":"321418552"}` para o produto de teste, sem nenhuma substring `access_token`/`client_secret`/`Bearer` na resposta
- `POST /recommendations/:productId` confirmado retornando `405 Method Not Allowed`
- **Reversao explicita executada (D-11):** em vez do Script NubeSDK planejado originalmente (bloqueado pela ativacao pendente do tema Morelia), foi construido um script de storefront tradicional (`storefront-script/main.js`) como v.Alpha de validacao, por decisao explicita do usuario que aceitou o risco de retrabalho documentado
- Mecanismo de obtencao do produto atual **confirmado por evidencia real**, nao suposto: inspecao do HTML ao vivo de `https://talgui.com.br/produtos/vestido-elaine-preto/` (`curl -s -L`) revelou o global `window.LS.product.id`, atribuido exatamente uma vez por pagina — mecanismo documentado extensivamente via comentario no proprio codigo
- Script renderiza bloco "Recomendados" minimo na posicao exata documentada em 01-04-SUMMARY.md (D-03): irmao inserido imediatamente antes de `#product-description` (com fallback para depois de `#compre-junto-block`, caso o primeiro seletor nao esteja presente no momento da execucao)
- Task 1.5 do plano original (checkpoint de confirmacao do pacote `create-nube-app` [SUS]) foi **pulada integralmente** por nao ser aplicavel — este plano nao usa nenhum pacote `@tiendanube/nube-sdk-*` nem `create-nube-app`

## Task Commits

Cada task foi commitada atomicamente:

1. **Task 1: Endpoint proprio somente-leitura (PLAT-05)** — `4feffcf` (feat) — inalterado em relacao ao plano original
2. **Task 1.5: Checkpoint create-nube-app** — PULADA, nao aplicavel (documentado abaixo, nao gera commit)
3. **Task 2 (substituida por override D-11): Script de storefront v.Alpha via Script API tradicional (FRNT-01)** — `c2b372c` (feat)

**Plan metadata:** commit de documentacao a seguir (SUMMARY.md + STATE.md + ROADMAP.md) — nao gerado neste repositorio pois `commit_docs: false` em `.planning/config.json`.

## Files Created/Modified

- `app-partners-recomendados/src/api/recommendations.js` - `getRecommendations(productId)`, le o Metafield `recomendados.produto_sugerido` via `getMetafields()` e retorna `{ productId, recommendedProductId }`, sem nenhum campo de autenticacao
- `app-partners-recomendados/src/server.js` - servidor HTTP nativo do Node (`http` builtin), `GET /recommendations/:productId`, 405 em outros metodos, porta configuravel via `PORT`
- `storefront-script/main.js` - script vanilla JS (sem build step, sem dependencias npm), le `window.LS.product.id`, faz fetch ao endpoint proprio, insere bloco "Recomendados" no DOM na posicao documentada em D-03

## Decisions Made

**1. D-11 — Reversao explicita para Script API tradicional (v.Alpha)**
- Documentada anteriormente por outro agente em `01-CONTEXT.md` (secao "Reversao explicita: Script API tradicional como v.Alpha (2026-07-10)"), esta execucao apenas implementa a decisao ja tomada
- Motivo: Wave 3 estava bloqueado pela ativacao NubeSDK ainda nao aprovada para o tema Morelia (bloqueio rastreado desde 01-01/01-02); o usuario preferiu validar a arquitetura ponta-a-ponta agora com Script API tradicional, aceitando que o script tera que ser reconstruido do zero em NubeSDK quando a ativacao for aprovada
- Nao e uma migracao incremental — o proximo Script NubeSDK real usara um modelo de execucao completamente diferente (Web Worker sandbox, sem acesso a `document`, `nube.render()` em vez de manipulacao de DOM), entao `storefront-script/` deve ser tratado como prototipo descartavel, nao como base de codigo

**2. Nome do diretorio `storefront-script/`, nao `nube-sdk-script/`**
- Reserva `nube-sdk-script/` explicitamente para o futuro rebuild real em NubeSDK, evitando qualquer confusao futura entre os dois modelos de execucao

**3. Mecanismo de obtencao do produto atual: `window.LS.product.id`**
- Fundamentado em evidencia real, nao suposicao: `curl -s -L https://talgui.com.br/produtos/vestido-elaine-preto/` (2026-07-10) mostrou o objeto global `LS.product = { id: 349886153, name: 'Vestido Elaine Preto', ... }` atribuido exatamente uma vez na pagina
- Alternativas descartadas: `data-product-id="..."` aparece repetido em varios cards de produtos na vitrine/relacionados (nao identifica o produto principal de forma unica); o destructure inline `const { id: productId, price: productPrice } = {...}` usado pelo tema para tracking de analytics e uma variavel de escopo de funcao interna, nao um global estavel acessivel de outro script

**4. Task 1.5 (checkpoint create-nube-app) pulada, nao silenciosamente omitida**
- Task 1.5 do plano original 01-03-PLAN.md existe apenas para confirmar a legitimidade do pacote `create-nube-app` antes do setup manual do NubeSDK Script (Task 2 original)
- Como a Task 2 foi inteiramente substituida por este plano (Script API tradicional, sem nenhum pacote `@tiendanube/nube-sdk-*` ou `create-nube-app`), a Task 1.5 nao se aplica e foi pulada por instrucao explicita do escopo de override recebido, nao por omissao

**5. Renderizacao minima do produto recomendado (limitacao conhecida do Alpha)**
- O bloco renderizado mostra apenas um titulo "Recomendados" e um link/rotulo com o ID do produto recomendado, sem nome, imagem ou preco
- Motivo: buscar detalhes completos do produto recomendado exigiria uma segunda chamada de API (ex: expor `getProduct` via um novo endpoint do backend), fora do escopo minimo definido no override_scope deste plano
- Aceitavel para validar o pipeline ponta-a-ponta (Metafield -> endpoint proprio -> Script -> DOM real); sera enriquecido em fase futura, nao necessariamente no rebuild NubeSDK (pode ser resolvido no proprio backend antes disso)

## Deviations from Plan

Nenhum desvio das regras 1-4 (nenhum bug corrigido, nenhuma funcionalidade critica ausente adicionada, nenhum bloqueio de execucao, nenhuma mudanca arquitetural nao prevista). O unico "desvio" em relacao ao `01-03-PLAN.md` original e a substituicao deliberada e ja autorizada da Task 2 e o skip da Task 1.5, ambos instruidos explicitamente pelo escopo de override (D-11) recebido para esta execucao — nao uma decisao tomada de forma autonoma por este executor.

## Issues Encountered

None. A verificacao do endpoint (Task 1) passou na primeira execucao (servidor local + curl). A inspecao do HTML real da loja (necessaria para a Task 2) retornou `200 OK` de imediato e revelou um mecanismo de identificacao de produto claro e sem ambiguidade (`window.LS.product.id`), sem necessidade de investigacao adicional.

## User Setup Required

Nenhuma acao pendente para este plano. O servidor local (`app-partners-recomendados/src/server.js`) foi testado localmente durante a execucao (nao permanece rodando). A publicacao real do `storefront-script/main.js` na loja via Partners Portal, e a definicao da URL publica final do `BACKEND_URL`, ficam para o Wave 4 (01-05), que precisa ser adaptado de "publicar Script NubeSDK" para "publicar Script legado via write_scripts" — sinalizado explicitamente abaixo.

## Nota para o proximo plano (01-05 / Wave 4)

**01-05-PLAN.md precisa ser re-adaptado antes de executar.** O plano original de publicacao (Wave 4) foi escrito assumindo o fluxo de publicacao do NubeSDK (upload de bundle `dist/main.min.js` com a flag "Uses Nube SDK" habilitada no Partners Portal). Como este plano (01-03) substituiu o Script por uma versao Script API tradicional, o 01-05 precisara:
1. Publicar `storefront-script/main.js` via o mecanismo tradicional de Scripts do Partners Portal (sem a flag NubeSDK, sem bundle/build step)
2. Finalizar o valor real de `BACKEND_URL` em `storefront-script/main.js` (atualmente aponta para `http://localhost:3000`, precisa apontar para uma URL publica real do backend — ex: hospedagem Vercel ja usada para os webhooks LGPD em 01-02)
3. Confirmar visualmente na loja real que o bloco "Recomendados" aparece na posicao correta, sem conflito com a supressao CSS ja aplicada em 01-04
4. Documentar explicitamente, no SUMMARY do 01-05, que o Script publicado e o v.Alpha legado (D-11), com prazo de vida curto (bloqueio de novas instalacoes a partir de 30/ago/2026, remocao progressiva a partir de 30/out/2026) e que a reconstrucao em NubeSDK e trabalho futuro nao coberto por este spike

## Next Phase Readiness

- **PLAT-05 confirmado:** endpoint proprio somente-leitura funcional, testado ao vivo contra o produto real de teste, sem nenhum segredo exposto na resposta
- **FRNT-01 parcialmente confirmado (via v.Alpha):** script de storefront construido e pronto para publicacao no Wave 4 — mas via Script API tradicional, nao NubeSDK, conforme override explicito D-11. A confirmacao visual real na loja (renderizacao de fato aparecendo na pagina) permanece para o Wave 4
- **Debito tecnico explicito rastreado (D-11):** este script (`storefront-script/main.js`) tera que ser reconstruido do zero em NubeSDK quando a ativacao para o tema Morelia for aprovada — nao e uma base de codigo a ser incrementada, e um prototipo descartavel de validacao
- **Debito tecnico rastreado:** renderizacao do produto recomendado e minima (sem nome/imagem/preco) neste Alpha
- **01-05 (Wave 4) precisa ser re-adaptado** de "publicar Script NubeSDK" para "publicar Script legado via write_scripts tradicional", incluindo a finalizacao da URL publica do `BACKEND_URL` — nao e um simples "prosseguir conforme planejado"

---
*Phase: 01-spike-de-viabilidade-end-to-end*
*Completed: 2026-07-10*

## Self-Check: PASSED

All 3 created files verified present on disk (`app-partners-recomendados/src/api/recommendations.js`, `app-partners-recomendados/src/server.js`, `storefront-script/main.js`); both task commits (`4feffcf`, `c2b372c`) verified present in `git log`.
