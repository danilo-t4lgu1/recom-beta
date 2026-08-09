---
phase: 01-spike-de-viabilidade-end-to-end
plan: 05
subsystem: infra
tags: [nuvemshop, vercel, script-api, cors, storefront, alpha, live-debugging]

# Dependency graph
requires:
  - phase: 01-spike-de-viabilidade-end-to-end
    provides: "Plano 01-03 (endpoint proprio + script v.Alpha via Script API tradicional, D-11) e 01-04 (posicao exata D-03, bloco nativo suprimido)"
provides:
  - "Endpoint publico app-partners-recomendados.vercel.app/api/recommendations/:productId, reaproveitando o mesmo projeto Vercel dos webhooks LGPD (01-02)"
  - "storefront-script/main.js publicado e ativo na loja real via Partners Portal (Script API tradicional, sem NubeSDK)"
  - "Verificacao visual ao vivo confirmada na loja de producao real, com 2 bugs reais encontrados e corrigidos durante o processo (CORS, link de produto quebrado)"
  - "Decisao final de viabilidade registrada em 01-05-DECISAO.md: arquitetura confirmada viavel, roadmap prossegue para Fase 2"
affects: [phase-2, roadmap]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Vercel Serverless Function como wrapper fino de uma funcao ja existente (getRecommendations), reaproveitando o MESMO projeto Vercel que ja hospeda outro endpoint (webhooks LGPD), em vez de subir infraestrutura separada"
    - "CORS deve ser testado com fetch() real de navegador cross-origin, nao apenas curl — curl nao aplica a mesma politica de CORS que o navegador aplica, entao testes via curl podem passar mesmo com o header Access-Control-Allow-Origin ausente"
    - "canonical_url da API publica da Nuvemshop deve ser usado diretamente para links de produto, nunca reconstruido a partir do ID numerico — a rota real usa o Identificador URL (handle/slug), nao o ID"

key-files:
  created:
    - "app-partners-recomendados/api/recommendations/[productId].js"
    - ".planning/phases/01-spike-de-viabilidade-end-to-end/01-05-DECISAO.md"
  modified:
    - "storefront-script/main.js"
    - "app-partners-recomendados/src/api/recommendations.js"

key-decisions:
  - "Endpoint publico deployado no MESMO projeto Vercel existente (app-partners-recomendados), reaproveitando a infraestrutura ja usada pelos webhooks LGPD de 01-02, em vez de infra nova separada"
  - "Credenciais Nuvemshop (NUVEMSHOP_ACCESS_TOKEN, NUVEMSHOP_STORE_ID) configuradas como variaveis de ambiente de producao no Vercel via 'vercel env add' nao-interativo, lidas do .env local sem serem impressas no output visivel"
  - "Evento de carregamento do script no Partners Portal configurado como onfirstinteraction, nao onload — onload exige aprovacao previa por e-mail da Nuvemshop, nao solicitada nesta fase; onfirstinteraction dispensa essa aprovacao e e aceitavel pois o bloco fica abaixo da dobra"
  - "D-11 reconfirmado: o Script publicado e verificado nesta task e a v.Alpha da Script API tradicional, NAO NubeSDK — o modelo de execucao NubeSDK permanece nao exercitado, pendente da ativacao do tema Morelia ainda nao submetida"
  - "Decisao final de viabilidade: arquitetura confirmada viavel, roadmap prossegue para Fase 2 (ver 01-05-DECISAO.md para os 5 Success Criteria detalhados)"

patterns-established:
  - "Debug ao vivo contra loja de producao real deve incluir teste de fetch() real do navegador, nao apenas verificacao via curl do backend isolado — CORS e um caso concreto onde os dois divergem"

requirements-completed: [FRNT-01]

# Metrics
duration: 90min
completed: 2026-07-10
status: complete
---

# Phase 01 Plan 05: Publicação Pública + Verificação Visual ao Vivo (v.Alpha, D-11) Summary

**Endpoint próprio publicado no mesmo projeto Vercel dos webhooks LGPD e Script v.Alpha (Script API tradicional, não NubeSDK, per D-11) publicado via Partners Portal e confirmado visível na loja real Talgui — após dois bugs reais encontrados e corrigidos ao vivo durante a verificação (CORS bloqueando o fetch cross-origin; link do produto recomendado apontando para uma URL inexistente por usar ID numérico em vez do handle da Nuvemshop) — fechando os 5 Success Criteria da Fase 1 com decisão final: arquitetura confirmada viável, roadmap prossegue para a Fase 2.**

## Performance

- **Duration:** ~90 min (incluindo ciclos de debug ao vivo conduzidos pelo orquestrador com o usuário)
- **Started:** 2026-07-10T~05:00:00Z (aprox.)
- **Completed:** 2026-07-10T~08:48:24-03:00 (último commit de fix, `3c273c3`)
- **Tasks:** 3 (1 auto/confirmação, 1 checkpoint:human-action, 1 checkpoint:human-verify) + ciclos de debug pós-checkpoint
- **Files modified:** 4 (`api/recommendations/[productId].js` criado, `src/api/recommendations.js` modificado, `storefront-script/main.js` modificado 2x, `01-05-DECISAO.md` criado)

## Accomplishments

- Endpoint público `GET /api/recommendations/:productId` deployado como Vercel Serverless Function, reaproveitando o **mesmo projeto Vercel** (`app-partners-recomendados`) que já hospeda os webhooks LGPD de 01-02 — sem infraestrutura nova separada
- Credenciais reais (`NUVEMSHOP_ACCESS_TOKEN`, `NUVEMSHOP_STORE_ID`) configuradas como env vars de produção no Vercel, lidas do `.env` local sem serem expostas em nenhum output visível
- `storefront-script/main.js` atualizado para apontar ao endpoint público real (`https://app-partners-recomendados.vercel.app/api/recommendations/:productId`)
- Confirmado (sem necessidade de ajuste) que a posição de renderização do bloco (`#product-description` / `#compre-junto-block`) já batia exatamente com a posição documentada em `01-04-SUMMARY.md` (D-03) — a Task 1 original do plano (ajustar slot NubeSDK + rebuild) não se aplica a este v.Alpha, que não tem build step
- Script publicado no Partners Portal via mecanismo tradicional (`write_scripts`, sem flag NubeSDK) — processo real revelou a exigência de "Instalação Loja Demo" antes da liberação para loja real (V1 restrita à demo; V2, reautorizada via o mesmo link OAuth do Wave 2, liberada para a loja real)
- **Bug real #1 encontrado e corrigido ao vivo:** CORS bloqueando o `fetch()` do navegador (script carregava mas bloco não renderizava; `curl` não capturou o problema porque CORS é aplicado só pelo navegador)
- **Bug real #2 encontrado e corrigido ao vivo:** link do produto recomendado apontando para uma URL inexistente (`/produtos/{id numérico}`, 404) — Nuvemshop roteia por handle/slug (`canonical_url`), não pelo ID
- Bloco enriquecido (nome, foto, preço, link correto) em vez do link de texto mínimo original, como consequência direta da correção do bug #2
- Verificação visual final confirmada pelo usuário na loja real: bloco "Recomendados" visível, sem conflito com o bloco nativo suprimido (D-04 reconfirmado com o bloco customizado presente)
- `01-05-DECISAO.md` criado, cobrindo os 5 Success Criteria do roadmap com evidência real de cada wave
- **Decisão final do usuário:** "aprovado, arquitetura viável"

## Task Commits

Tasks automatizáveis deste subagente foram commitadas atomicamente; os 3 commits de correção pós-checkpoint (bugs reais + tentativa de alinhamento) foram feitos diretamente pelo orquestrador junto com o usuário durante a investigação ao vivo do checkpoint de Task 2, e estão registrados aqui com a autoria correta:

1. **Task 1 (adaptada, confirmação): posição de renderização já correta** — sem commit de código próprio; confirmação documentada como comentário no arquivo, incluída no commit da Task 1.5 parte 2 abaixo
2. **Task 1.5 parte 1: deploy do endpoint público no projeto Vercel existente** — `d4da58c` (feat) — subagente executor
3. **Task 1.5 parte 2: atualizar `BACKEND_URL`/rota do script + confirmação da Task 1** — `82703cc` (feat) — subagente executor
4. **Publicação no Partners Portal (Task 1.5, checkpoint:human-action)** — sem commit de código; ação externa no Partners Portal, resolvida pelo usuário (V1→V2→V3→V4, detalhado abaixo)
5. **Fix: CORS bloqueando o fetch do navegador (bug real #1, encontrado durante Task 2)** — `cdd824c` (fix) — commitado pelo orquestrador junto com o usuário
6. **Fix: link do produto recomendado incorreto + enriquecimento do bloco (bug real #2, encontrado durante Task 2)** — `7ca8c5d` (fix) — commitado pelo orquestrador junto com o usuário
7. **Fix: alinhamento do bloco com o container da página (ajuste cosmético, não bloqueante)** — `3c273c3` (fix) — commitado pelo orquestrador junto com o usuário

**Plan metadata:** não gerado neste repositório pois `commit_docs: false` em `.planning/config.json` (`.planning/` é git-ignored na raiz).

## Files Created/Modified

- `app-partners-recomendados/api/recommendations/[productId].js` - Vercel Serverless Function (convenção de rota dinâmica), importa e reaproveita `getRecommendations()` de `src/api/recommendations.js` sem duplicar lógica; GET-only (405 em outros métodos); headers CORS adicionados no fix do bug #1 (`Access-Control-Allow-Origin: https://talgui.com.br`, tratamento de `OPTIONS`)
- `app-partners-recomendados/src/api/recommendations.js` - `getRecommendations()` passou a também chamar `getProduct(recommendedProductId)` e retornar `recommendedProduct: { url, name, image, price }` usando `canonical_url` da API pública (fix do bug #2)
- `storefront-script/main.js` - `BACKEND_URL` atualizado para `https://app-partners-recomendados.vercel.app`, rota do fetch atualizada para `/api/recommendations/:id`; bloco renderizado enriquecido (nome/foto/preço/link correto em vez de link de texto com ID); envolvido em `.container-fluid.position-relative` para herdar o alinhamento do tema

## Decisions Made

**1. Endpoint público no mesmo projeto Vercel existente, não infraestrutura separada**
- Reaproveita `app-partners-recomendados` (já em produção desde 01-02 para os webhooks LGPD), reduzindo superfície nova a gerenciar

**2. `onfirstinteraction` em vez de `onload` para o evento de carregamento do script**
- `onload` exige aprovação prévia da Nuvemshop via e-mail (`api@nuvemshop.com.br`), não solicitada nesta fase
- `onfirstinteraction` dispensa essa aprovação; aceitável porque o bloco renderiza abaixo da dobra — um visitante real já rolou a página (= já interagiu) antes de o bloco entrar em viewport

**3. D-11 reconfirmado explicitamente na decisão final**
- O Script publicado e verificado é a v.Alpha da Script API tradicional, não NubeSDK — `01-05-DECISAO.md` documenta essa distinção de forma explícita no Critério 3, para que a aprovação da Fase 1 não seja lida erroneamente como "NubeSDK validado"

**4. Alinhamento visual aceito como suficiente para o v.Alpha, sem mais iteração**
- Usuário decidiu explicitamente não continuar ajustando o alinhamento cosmético do bloco além do fix já aplicado (`3c273c3`) — polimento fino fica para a reconstrução em NubeSDK, não vale investir mais tempo num código já sabido descartável (D-11)

**5. Decisão final de viabilidade: "arquitetura confirmada viável, roadmap prossegue para Fase 2"**
- Ver `01-05-DECISAO.md` para a análise completa dos 5 Success Criteria

## Deviations from Plan

### Auto-fixed Issues (subagente executor, antes do checkpoint)

**1. [Rule 3 - Blocking] Nenhum desvio de bloqueio encontrado pelo subagente executor** — Tasks 1 e 1.5 parte 1/2 executadas conforme o escopo de override recebido (adaptação já pré-autorizada de NubeSDK para Script API tradicional + Vercel público), sem necessidade de correções adicionais além do que o override já previa.

### Correções pós-checkpoint (conduzidas pelo orquestrador com o usuário, durante a investigação ao vivo da Task 2 — não um desvio no sentido das Regras 1-4, mas trabalho real de depuração necessário para completar a verificação visual que a própria Task 2 exige)

**1. [Rule 1 - Bug real] CORS bloqueando o fetch do navegador**
- **Encontrado durante:** primeira tentativa de verificação visual ao vivo (V3 do script no Partners Portal)
- **Sintoma:** script carregava, bloco não aparecia; console: `TypeError: Failed to fetch`
- **Causa raiz:** `api/recommendations/[productId].js` não enviava `Access-Control-Allow-Origin`; testes via `curl` no Wave 4 não capturaram isso porque CORS é política aplicada apenas pelo navegador
- **Fix:** headers CORS + tratamento de `OPTIONS` adicionados
- **Verificação:** `curl -H "Origin: https://talgui.com.br"` confirmou os headers corretos na resposta; redeploy Vercel feito
- **Commit:** `cdd824c`

**2. [Rule 1 - Bug real] Link do produto recomendado quebrado (URL por ID em vez de handle)**
- **Encontrado durante:** primeiro carregamento bem-sucedido do bloco (pós-fix de CORS)
- **Sintoma:** bloco aparecia com texto "Ver produto recomendado (ID 321418552)", mas o link levava a uma URL 404 (`/produtos/321418552`)
- **Causa raiz:** Nuvemshop roteia produtos pelo "Identificador URL" (handle/slug), não pelo ID numérico; a v.Alpha original (01-03) construía o link incorretamente
- **Fix:** backend passou a retornar `recommendedProduct.url` (usando `canonical_url` real da API pública) + nome/foto/preço; script atualizado para renderizar esses dados em vez de um link de texto genérico
- **Verificação:** `curl` confirmou `recommendedProduct.url` correto; usuário publicou o script atualizado (V4) e confirmou visualmente nome, foto, preço e link funcionando
- **Commit:** `7ca8c5d`

**3. [Ajuste cosmético, não bloqueante] Alinhamento do bloco com o container da página**
- **Encontrado durante:** feedback do usuário pós-fix do bug #2 ("bloco colado no canto esquerdo da tela")
- **Fix tentado:** envolver o bloco em `.container-fluid.position-relative`
- **Resultado:** inspeção via DevTools (screenshot real, mobile 337px) mostrou que o bloco já estava corretamente aninhado dentro do `.container-fluid` existente que também envolve `#product-description` — sem quebra visual clara no viewport testado
- **Decisão do usuário:** aceitar o estado atual como suficiente para o v.Alpha; nenhuma iteração adicional
- **Commit:** `3c273c3`

---

**Total deviations:** 0 do subagente executor (Tasks 1/1.5 seguiram o escopo de override sem necessidade de correção adicional); 2 bugs reais + 1 ajuste cosmético corrigidos pelo orquestrador durante a investigação ao vivo do checkpoint de Task 2, todos necessários para completar a verificação visual exigida pela própria task.
**Impact on plan:** Nenhum scope creep — todas as correções foram necessárias para que o Critério de Sucesso 3 do roadmap (bloco visível e funcional na loja real) fosse de fato satisfeito, não apenas "parece que funcionou".

## Issues Encountered

**Instalação Loja Demo como pré-requisito não previsto para publicação em loja real:** a Nuvemshop exigiu que a V1 do script fosse primeiro instalada/testada numa loja demo antes de liberar a publicação para a loja real Talgui — não estava explicitado no plano original. Resolvido reautorizando o app via o mesmo link OAuth do Wave 2 (V2), o que liberou a publicação para a loja real.

**CORS não detectável via curl:** reforça que testes de endpoint via `curl` (usados extensivamente nos planos 01-02/01-03/01-05 Task 1.5) não substituem um teste de `fetch()` real de navegador cross-origin quando o consumidor final é um script rodando no domínio da loja — anotado como padrão a observar em fases futuras que também expõem endpoints consumidos pelo storefront.

## User Setup Required

Nenhuma ação pendente para este plano. Toda a configuração externa necessária (Vercel env vars, publicação no Partners Portal V1-V4, verificação visual) já foi realizada durante a execução desta task.

## Nota de escopo futuro (Fase 2 — registrar, não implementar aqui)

Durante a verificação final, o usuário expressou desejo de avançar, em paralelo à espera da ativação do NubeSDK, com os seguintes itens — **explicitamente fora do escopo deste plano/fase**, a serem tratados via `/gsd-discuss-phase` como próximo passo imediato após o fechamento da Fase 1:

- Carrossel de até 8 produtos recomendados (limite nativo da Nuvemshop para esse tipo de ordenação)
- Motor de recomendação real para múltiplos produtos (hoje é 1 valor fixo por Metafield, gravado manualmente per D-06)
- Comportamento do motor após re-snapshot/retroalimentação
- Tratamento de produto com stockout
- Mecanismo de intervenção manual humana na aba "Recomendados"

**Decisão explícita do usuário:** este trabalho não deve ser "empurrado para só depois que o NubeSDK estiver ativo" — deve avançar em paralelo, com o sequenciamento exato a critério do orquestrador/planejamento, com base na melhor construção de fundação do projeto.

## Next Phase Readiness

- **Fase 1 completa: todos os 5 Success Criteria do roadmap confirmados com evidência real** (ver `01-05-DECISAO.md`)
- **PLAT-01, PLAT-03, PLAT-04, PLAT-05, WRTE-01, FRNT-01 confirmados** — todos os requisitos mapeados à Fase 1
- **Decisão final: arquitetura confirmada viável, roadmap prossegue para Fase 2**
- **Débito técnico explícito rastreado (D-11):** `storefront-script/main.js` (v.Alpha, Script API tradicional) precisará ser reconstruído do zero em NubeSDK quando a ativação do tema Morelia for aprovada — prazo de vida curto (bloqueio de novas instalações a partir de 30/ago/2026, remoção progressiva a partir de 30/out/2026)
- **Débito técnico rastreado:** motor de recomendação real ainda não existe (valor fixo manual); renderização é de 1 produto apenas, não carrossel
- **Próximo passo imediato recomendado:** `/gsd-discuss-phase` para a Fase 2, incorporando a nota de escopo futuro acima (carrossel, motor multi-produto, stockout, intervenção manual) além do escopo já definido em `ROADMAP.md` (ingestão de catálogo e qualidade de dados)

---
*Phase: 01-spike-de-viabilidade-end-to-end*
*Completed: 2026-07-10*

## Self-Check: PASSED

Arquivos verificados presentes em disco: `app-partners-recomendados/api/recommendations/[productId].js`, `.planning/phases/01-spike-de-viabilidade-end-to-end/01-05-DECISAO.md`, `storefront-script/main.js` (modificado), `app-partners-recomendados/src/api/recommendations.js` (modificado). Todos os 5 commits desta task verificados presentes em `git log`: `d4da58c`, `82703cc`, `cdd824c`, `7ca8c5d`, `3c273c3`.
