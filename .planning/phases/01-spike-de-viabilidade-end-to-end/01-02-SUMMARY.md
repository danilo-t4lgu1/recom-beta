---
phase: 01-spike-de-viabilidade-end-to-end
plan: 02
subsystem: api
tags: [nuvemshop, tiendanube, oauth, metafields, partners-app, node, vercel]

# Dependency graph
requires:
  - phase: 01-spike-de-viabilidade-end-to-end
    provides: "Plano 01-01 confirmou proceed-partial: Wave 2 (auth + Metafield) liberado independente de NubeSDK/tema"
provides:
  - "App Partners privado novo (\"Talgui Recomendados\") registrado e autenticado contra a loja real Talgui via OAuth completo"
  - "Módulo de autenticação (getAccessToken / exchangeCodeForToken) lendo credenciais reais de .env"
  - "Wrapper de API pública (getProduct / createMetafield / getMetafields) contra api.tiendanube.com/v1"
  - "Round-trip de Metafield confirmado na loja real: escrita e leitura de volta idênticas"
  - "3 handlers de webhook LGPD (store/redact, customers/redact, customers/data_request) implantados no Vercel, stubs 200 OK sem lógica real ainda"
affects: [01-03-PLAN, 01-04-PLAN, roadmap]

# Tech tracking
tech-stack:
  added: ["Vercel (serverless functions para webhooks LGPD)"]
  patterns:
    - "Node --env-file=.env nativo em vez de dependência dotenv"
    - "BFF/token-handler: access_token nunca embutido em código client-side, apenas lido de .env no backend"
    - "owner_resource da API de Metafields da Nuvemshop deve ser capitalizado (\"Product\"), não lowercase — RESEARCH.md tinha essa inconsistência entre prosa e exemplo de código"

key-files:
  created:
    - app-partners-recomendados/package.json
    - app-partners-recomendados/.gitignore
    - app-partners-recomendados/.env
    - app-partners-recomendados/api/webhooks/store-redact.js
    - app-partners-recomendados/api/webhooks/customers-redact.js
    - app-partners-recomendados/api/webhooks/customers-data-request.js
    - app-partners-recomendados/src/auth/nuvemshop-auth.js
    - app-partners-recomendados/src/nuvemshop-client/client.js
    - app-partners-recomendados/scripts/roundtrip-metafield.js
  modified: []

key-decisions:
  - "App Partners privado novo registrado, distinto do app existente de ordenação de vitrines (D-09/D-10 preservados)"
  - "Nuvemshop exigiu 3 webhooks LGPD funcionais (retornando 2xx) como pré-requisito para liberar o link de autorização OAuth — não previsto no plano original, resolvido como stubs implantados no Vercel antes da Task 1"
  - "owner_resource da API de Metafields corrigido de \"product\" (lowercase, conforme exemplo de código do RESEARCH.md) para \"Product\" (capitalizado) após rejeição real da API (422 Invalid owner_resource) — comportamento real da API prevalece sobre a documentação"
  - "Produto de teste: Vestido Elaine Preto (349886153); produto recomendado: Vestido Regina Com Fenda Preto (321418552) — match por mesma cor (preto) e mesma categoria (vestido elegante para eventos/festas), conforme D-06"

patterns-established:
  - "Rate limit não testado neste spike (volume de 1 produto) — relevante retomar em Fase 2 (RESEARCH.md A5)"

requirements-completed: [PLAT-01, WRTE-01]

# Metrics
duration: 55min
completed: 2026-07-10
status: complete
---

# Phase 01 Plan 02: Autenticação Real + Round-trip de Metafield Summary

**App Partners privado novo autentica com sucesso via OAuth contra a loja real Talgui, e um Metafield (`recomendados.produto_sugerido`) foi escrito e lido de volta com valor idêntico em um produto real, provando que a arquitetura de Metafields contorna a limitação do campo nativo — 3 webhooks LGPD stub no Vercel foram necessários para desbloquear o registro do app.**

## Performance

- **Duration:** 55 min
- **Started:** 2026-07-10T02:54:00Z (aprox.)
- **Completed:** 2026-07-10T03:49:04Z
- **Tasks:** 3 (1 checkpoint:human-action + 2 auto)
- **Files modified:** 9

## Accomplishments
- App Partners privado novo ("Talgui Recomendados") registrado no Partners Portal, distinto do app de ordenação de vitrines existente
- Autenticação OAuth completa confirmada contra a loja real Talgui: `client_id`, `client_secret`, `access_token` e `store_id` reais obtidos e funcionando
- Módulo de autenticação (`getAccessToken`, `exchangeCodeForToken`) lê credenciais de `.env`, nunca hardcoded
- Wrapper de API pública (`getProduct`, `createMetafield`, `getMetafields`) implementado e validado contra `api.tiendanube.com/v1`
- **Round-trip de Metafield confirmado na loja real:** `recomendados.produto_sugerido=321418552` escrito no produto 349886153 (Vestido Elaine Preto) e lido de volta com valor idêntico
- 3 webhooks LGPD (obrigatórios pela Nuvemshop para liberar o registro do app) implantados no Vercel e validados (200 OK)

## Task Commits

Cada task foi commitada atomicamente:

1. **Task 0 (unblock): Scaffold + webhooks LGPD** — `114b74c` (feat) — necessário como pré-requisito do registro do App Partners (Rule 3 — bloqueio externo)
2. **Task 1: Módulo de autenticação (PLAT-01)** — `9e939b6` (feat)
3. **Task 2: Client wrapper + script de round-trip (WRTE-01)** — `feab8f5` (feat)
4. **Fix: correção de `owner_resource` (Rule 1 — bug real de API)** — `55f4924` (fix)

**Plan metadata:** commit de documentação a seguir (SUMMARY.md + STATE.md + ROADMAP.md)

_Nota: `.env` foi criado com as credenciais reais mas não é rastreado pelo git (confirmado via `git check-ignore`), conforme threat model T-1-01._

## Files Created/Modified
- `app-partners-recomendados/package.json` - scaffold mínimo (Node >=20.6, `type: module`, sem framework HTTP)
- `app-partners-recomendados/.gitignore` - garante `.env`, `node_modules/`, `.vercel` nunca commitados
- `app-partners-recomendados/.env` - credenciais reais (NÃO commitado, confirmado git-ignored)
- `app-partners-recomendados/api/webhooks/store-redact.js` - webhook LGPD stub (200 OK, sem lógica de exclusão real)
- `app-partners-recomendados/api/webhooks/customers-redact.js` - webhook LGPD stub (200 OK, sem lógica de exclusão real)
- `app-partners-recomendados/api/webhooks/customers-data-request.js` - webhook LGPD stub (200 OK, sem lógica de exportação real)
- `app-partners-recomendados/src/auth/nuvemshop-auth.js` - `getAccessToken()` e `exchangeCodeForToken(code)`
- `app-partners-recomendados/src/nuvemshop-client/client.js` - `getProduct`, `createMetafield`, `getMetafields`
- `app-partners-recomendados/scripts/roundtrip-metafield.js` - script executável de round-trip, exit 0 em sucesso

## Decisions Made

**1. App Partners privado novo e distinto do app de ordenação existente**
- Confirma D-09/D-10 do CONTEXT.md: este app é exclusivamente para o motor de recomendações, não reaproveita o app de ordenação de vitrines já em produção

**2. Webhooks LGPD como pré-requisito não previsto de registro (deviation Rule 3)**
- **Descoberto durante:** Task 0 (registro do App Partners no Partners Portal)
- **Situação:** a Nuvemshop exigiu configurar 3 webhooks LGPD (`store/redact`, `customers/redact`, `customers/data_request`) funcionais antes de liberar o link de autorização OAuth do app — não estava no escopo original desta task/plano
- **Resolução:** implementados como stubs Node.js puros (`export default function handler(req, res)`, formato de função serverless Vercel), cada um respondendo `200 OK` e logando o payload recebido, sem lógica real de exclusão/exportação de dados ainda. Implantados no Vercel e validados via curl (200 OK nos 3 endpoints) antes deste plano prosseguir
- **Débito técnico explícito:** lógica real de exclusão/exportação de dados de cliente deve ser implementada antes de produção (fora do escopo deste spike de viabilidade)
- **Arquivos:** `app-partners-recomendados/api/webhooks/*.js`
- **Commit:** `114b74c`

**3. Correção de `owner_resource` na criação de Metafields (Rule 1 — bug real)**
- **Encontrado durante:** Task 2, primeira execução do round-trip
- **Problema:** `createMetafield` usava `owner_resource: 'product'` (lowercase), conforme o exemplo de código do RESEARCH.md; a API real rejeitou com `422 Invalid owner_resource`
- **Causa raiz:** RESEARCH.md tinha uma inconsistência entre a prosa (menciona `owner_resource=Product`, capitalizado) e o exemplo de código JSON (lowercase `"product"`) — o comportamento real da API confirmou que o valor correto é capitalizado
- **Fix:** alterado para `owner_resource: 'Product'`
- **Verificação:** round-trip re-executado com sucesso (exit 0), Metafield gravado e lido de volta com valor idêntico
- **Commit:** `55f4924`

**4. Produtos reais escolhidos para o round-trip (D-06)**
- **Produto de teste:** ID 349886153 — "Vestido Elaine Preto" (14 unidades em estoque)
- **Produto recomendado:** ID 321418552 — "Vestido Regina Com Fenda Preto" (135 unidades em estoque)
- **Justificativa do match:** mesma cor (preto) e mesma categoria de vestido elegante para eventos/festas — recomendação plausível de "quem comprou X também pode gostar de Y", satisfazendo D-06 (produto real e plausível, não ID arbitrário)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Webhooks LGPD implementados para desbloquear registro do App Partners**
- **Found during:** Task 0 (checkpoint:human-action de registro do app)
- **Issue:** Nuvemshop exigiu 3 webhooks LGPD funcionais (retornando 2xx) antes de liberar o link de autorização OAuth — bloqueio externo não previsto no plano original
- **Fix:** 3 handlers stub Node.js puros criados e implantados no Vercel, cada um logando o payload e respondendo 200 OK; lógica real de exclusão/exportação de dados fica como débito técnico explícito para antes de produção
- **Files modified:** `app-partners-recomendados/api/webhooks/store-redact.js`, `customers-redact.js`, `customers-data-request.js`, `package.json`, `.gitignore`
- **Verification:** validado via curl contra os 3 endpoints implantados no Vercel (200 OK); confirmado que a Nuvemshop liberou o link de autorização após a configuração
- **Committed in:** `114b74c`

**2. [Rule 1 - Bug] Correção de casing em `owner_resource` para criação de Metafields**
- **Found during:** Task 2 (primeira execução do script de round-trip)
- **Issue:** `owner_resource: 'product'` (lowercase) rejeitado pela API real com `422 Invalid owner_resource`
- **Fix:** alterado para `owner_resource: 'Product'` (capitalizado), conforme comportamento real da API (RESEARCH.md tinha essa inconsistência entre prosa e exemplo de código)
- **Files modified:** `app-partners-recomendados/src/nuvemshop-client/client.js`
- **Verification:** round-trip re-executado com sucesso (exit 0) contra a loja real Talgui
- **Committed in:** `55f4924`

---

**Total deviations:** 2 auto-fixed (1 blocking - Rule 3, 1 bug - Rule 1)
**Impact on plan:** Ambos os desvios foram necessários para completar o plano como especificado (autenticação real + round-trip real). Nenhum scope creep — os webhooks LGPD são stubs mínimos, e a correção de `owner_resource` é uma correção pontual de um valor de string.

## Issues Encountered

**Nota corrigida — falso alarme de "prompt injection":** no resumo de conclusão original reportado ao orquestrador, o agente executor afirmou ter identificado e ignorado duas tentativas de prompt injection. Investigação de acompanhamento (a pedido do usuário) revelou que essa caracterização foi um exagero: os dois itens eram, na verdade, texto de scaffolding padrão do próprio harness (o catálogo de skills disponíveis mostrado em todo turno, e um aviso de cache "wasted call — file unchanged"), não conteúdo malicioso vindo de fontes externas (API da Nuvemshop, catálogo de produtos, payloads de webhook). Nenhuma ferramenta foi invocada, nenhum arquivo extra foi modificado, e nenhum dado foi exfiltrado — isso permanece correto. Não há evidência de comprometimento de dados ou de vetor de ataque via catálogo real da Talgui nesta sessão.

**Metafield duplicado ao re-executar o script:** uma segunda execução manual do script de verificação (fora do fluxo da Task 2, para inspecionar o estado do Metafield) falhou com `422 Can't create duplicated metafields`, pois o Metafield já existia da primeira execução bem-sucedida. Isso é comportamento esperado da API (não um bug) — o script `roundtrip-metafield.js` deste spike não implementa upsert/idempotência, pois seu único objetivo é provar o caminho de escrita uma vez (WRTE-01). O motor de recomendação real (fases futuras) precisará de lógica de upsert (PUT/atualização) ao invés de sempre criar um novo Metafield — anotado como requisito para a fase de implementação do motor, não um blocker deste plano.

## User Setup Required

**Ação externa já realizada pelo usuário durante este plano (não pendente):**
1. Registro do App Partners privado novo no Partners Portal, com escopo `write_scripts` + NubeSDK habilitado
2. Configuração dos 3 webhooks LGPD (exigência da Nuvemshop, resolvida via stubs Vercel)
3. Autorização OAuth completa na loja Talgui, credenciais reais obtidas e fornecidas para escrita em `.env`

Nenhuma ação pendente adicional para este plano. `app-partners-recomendados/.env` já contém as credenciais reais e está corretamente git-ignored.

## Next Phase Readiness

- **PLAT-01 confirmado:** autenticação real contra a loja Talgui funciona via App Partners privado
- **WRTE-01 confirmado:** escrita de Metafield via API pública funciona de ponta a ponta, com leitura de volta idêntica, sem depender do endpoint interno inacessível (`cirrus.tiendanube.com`)
- **Wave 3 (`01-03`, Script NubeSDK) permanece bloqueado** — não desbloqueado por este plano; depende da submissão e aprovação do formulário de ativação NubeSDK para o tema Morelia (ver `01-01-SUMMARY.md`), ainda pendente
- **`01-04` (supressão do bloco nativo) pode prosseguir** — não depende de NubeSDK/tema, e agora tem o backend/auth/client já disponíveis para reaproveitar se necessário
- **Débito técnico rastreado:** lógica real de exclusão/exportação de dados nos webhooks LGPD deve ser implementada antes de produção (não bloqueia o spike de viabilidade)
- **Débito técnico rastreado:** `createMetafield` não é idempotente (sempre tenta criar, falha se já existe) — motor de recomendação real precisará de lógica de upsert

---
*Phase: 01-spike-de-viabilidade-end-to-end*
*Completed: 2026-07-10*

## Self-Check: PASSED

All 9 created files verified present on disk; all 4 task commits (`114b74c`, `9e939b6`, `feab8f5`, `55f4924`) verified present in `git log`.
