---
phase: 04-preview-e-aprova-o-humana
plan: 05
subsystem: api
tags: [node-http, better-sqlite3, vitest, approval-workflow, dry-run]

# Dependency graph
requires:
  - phase: 04-preview-e-aprova-o-humana (04-01/04-02/04-03/04-04)
    provides: getApprovalDecision/upsertApprovalDecision (04-01), computeDiff/recomputeAfterRemoval (04-02), assertApproved/executeApprovedWrite (04-03), GET /review + GET /review/:productId (04-04)
provides:
  - "POST /review/:productId/approve — persiste decisão approved com o conjunto EXATO recomputado no servidor via computeDiff (nunca aceita um campo approvedIds do corpo)"
  - "POST /review/:productId/reject — persiste decisão rejected, approvedRecommendationIds null"
  - "POST /review/:productId/write — endpoint machine-only, gate via ApprovalRequiredError->409, dry-run true/false produzindo o mesmo stub (Fase 5 substitui o stub)"
  - "readRawBody/parseRemovedIds/sendJson — parsing de corpo com teto de bytes e extração restrita a removedIds"
affects: [05-escrita-real-na-loja]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Gate de aprovação aplicado no backend (nunca na UI) — POST /write chama executeApprovedWrite, que chama assertApproved como primeira operação"
    - "Corpo de requisição drenado sem accumular além de MAX_BODY_BYTES, sem destruir o socket antes da resposta de erro ser escrita"

key-files:
  created: []
  modified:
    - app-partners-recomendados/src/review-server.js
    - app-partners-recomendados/src/review-server.test.js

key-decisions:
  - "removedIds é o ÚNICO campo aceito do corpo de /approve; o conjunto final aprovado é SEMPRE diff.afterIds (computeDiff), nunca um campo lido diretamente do corpo — fecha o Pitfall 2 do 04-RESEARCH.md por construção"
  - "req.destroy() imediato (como descrito verbatim no plano/RESEARCH) foi substituído por drenagem sem acumulação (marca tooLarge=true, ignora chunks extras, só rejeita no 'end') — destruir o socket antes de sendJson(res, 413, ...) impedia a resposta de chegar ao cliente (comprovado por teste falhando com SocketError antes do fix)"

requirements-completed: [APRV-02, APRV-03, APRV-04]

# Metrics
duration: 25min
completed: 2026-07-16
status: complete
---

# Phase 04 Plan 05: Rotas POST approve/reject/write Summary

**As três rotas de ação do painel (approve/reject/write) estão implementadas com 17/17 testes verdes, e a confirmação humana ao vivo (Task 2) contra o servidor real e `data/catalog.db` foi aprovada sem divergências — Fase 4 completa.**

## Performance

- **Started:** 2026-07-16T10:44:00Z (aprox.)
- **Tasks:** 2/2 completos (Task 1 auto; Task 2 checkpoint:human-verify aprovado)
- **Files modified:** 2

## Accomplishments

- `POST /review/:productId/approve` — le `removedIds` do corpo (form-urlencoded ou JSON), recomputa o diff via `computeDiff`, persiste `diff.afterIds` via `upsertApprovalDecision`, responde `303 Location: /review`
- `POST /review/:productId/reject` — drena o corpo (ignorado), persiste `status: 'rejected'`/`approvedRecommendationIds: null`, responde `303 Location: /review`
- `POST /review/:productId/write` — resolve `dryRun` a partir da query string (`?dryRun=`) com fallback para `DRY_RUN_MODE` do servidor, delega a `executeApprovedWrite`; `ApprovalRequiredError` mapeado para `409` com a mensagem "aprovação registrada"; qualquer outro erro cai em `500`
- `readRawBody(req)` com teto explícito `MAX_BODY_BYTES = 10_000` — corpo maior é recusado (`413`) sem que o processo acumule o corpo inteiro em memória
- `parseRemovedIds(rawBody, contentType)` — único ponto de leitura do corpo do cliente; nunca existe um campo "approvedIds"/"ids aprovados" no código
- Suíte estendida de 8 para 17 comportamentos verdes (`review-server.test.js`); suíte completa do projeto: 114/114 verde

## Task Commits

Cada sub-etapa TDD foi comitada atomicamente:

1. **Task 1 (RED): testes falhos para as 9 rotas novas (Tests 9-17)** - `e92b8c8` (test)
2. **Task 1 (GREEN): implementação das rotas approve/reject/write** - `c30d0db` (feat)

_Task 2 (checkpoint:human-verify) não gera commit próprio — é uma verificação ao vivo contra o servidor real, sem alteração de código. Aprovada pelo usuário ("aprovado") após confirmação dos passos 1-6 do plano._

## Task 2 — Evidência de Verificação ao Vivo (checkpoint aprovado)

Verificação realizada contra o servidor real (`node src/review-server.js`) e `data/catalog.db` real (não o banco de teste isolado):

1. Servidor iniciado com sucesso: log "review server listening on http://127.0.0.1:3100", sem erro ao abrir `data/catalog.db` real.
2. `GET /review` — fila NÃO vazia: 1 produto real listado, "Vestido Elaine Preto" (productId `349886153`), com link "Revisar" e banner de dry-run ("Modo simulação ativo — nenhuma escrita real será feita na loja").
3. `GET /review/349886153` — título "Revisão: Vestido Elaine Preto". Seção "Antes" mostrou "Vestido Regina Com Fenda Preto (321418552)" com badge "Removido" (item de baseline ausente na saída atual do motor). Seção "Depois" mostrou "Nenhum item." — consistente com o estado real conhecido documentado em 04-01 (`product_group_canonical` NULL na última ingestão, motor fail-closed). Formulários "Aprovar recomendações" e "Rejeitar produto" renderizados corretamente.
4. Cores computadas confirmadas via `getComputedStyle()` no navegador, exatamente conforme `04-UI-SPEC.md`: badge "Removido" `rgb(220,38,38)` = `#DC2626`; botão "Aprovar recomendações" `rgb(37,99,235)` = `#2563EB`; botão "Rejeitar produto" `rgb(220,38,38)` = `#DC2626`.
5. `curl -i -X POST http://127.0.0.1:3100/review/999999999/write` → `HTTP/1.1 409 Conflict`, corpo `{"error":"Produto 999999999 não tem aprovação registrada — escrita recusada."}` (SC#3 confirmado ao vivo, fora da suíte automatizada).
6. `curl -i -X POST "http://127.0.0.1:3100/review/999999999/write?dryRun=false"` → também `409 Conflict`, mesmo corpo — confirma que o gate independe do valor de `dryRun`.
7. Servidor encerrado sem processo remanescente.

Usuário respondeu "aprovado", confirmando que os passos 1-6 do `<how-to-verify>` corresponderam ao esperado, sem divergência.

## Files Created/Modified

- `app-partners-recomendados/src/review-server.js` — adiciona `APPROVE_PATH`/`REJECT_PATH`/`WRITE_PATH`, `MAX_BODY_BYTES`, `BodyTooLargeError`, `sendJson`, `readRawBody`, `parseRemovedIds`, e os três ramos de rota (approve/reject/write) posicionados ANTES do roteamento GET já existente (04-04)
- `app-partners-recomendados/src/review-server.test.js` — adiciona `seedMultiCandidateFixture` (2 candidatos elegíveis, necessária para o Test 12) e os Tests 9-17

## Decisions Made

- **removedIds como único campo de entrada (D-19/D-20/D-25):** o handler de `/approve` nunca lê um campo "conjunto final aprovado" do corpo — só `removedIds`, que só pode ENCOLHER o pool calculado pelo motor. O valor persistido é sempre `diff.afterIds` de `computeDiff`. Isso fecha o Pitfall 2 do RESEARCH por construção, não por validação adicional (mesma abordagem já usada em `04-02`/`04-03`).
- **Body draining sem destruir o socket (ver Deviations):** ao exceder `MAX_BODY_BYTES`, o handler marca o corpo como grande demais e ignora os chunks excedentes (nunca os empilha), mas só rejeita a Promise no evento `'end'` — isso preserva o socket aberto o suficiente para `sendJson(res, 413, ...)` de fato chegar ao cliente.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `req.destroy()` imediato quebrava a entrega da resposta 413**
- **Found during:** Task 1, ao rodar o Test 15 (corpo > 10.000 bytes) contra a implementação inicial
- **Issue:** O `<action>` do plano descreve, verbatim do `04-RESEARCH.md`, chamar `req.destroy()` imediatamente ao exceder `MAX_BODY_BYTES`, antes do `catch` externo responder `413`. Em `node:http`, `IncomingMessage.destroy()` derruba o socket subjacente compartilhado com a resposta — a chamada `sendJson(res, 413, ...)` no `catch` falhava com `SocketError: other side closed` porque o socket já não existia mais quando a resposta tentava ser escrita. Isso contradiz diretamente o `<behavior>`/acceptance do próprio plano ("o teste envia um corpo de ~20.000 bytes e mede que a resposta chega em tempo razoável, sem timeout" — implica receber de fato um `413`, não um erro de socket).
- **Fix:** `readRawBody` passou a marcar uma flag `tooLarge` ao exceder o limite e simplesmente descartar (nunca empilhar) os chunks excedentes — preservando a garantia de nunca acumular o corpo inteiro em memória — e só rejeitar a Promise com `BodyTooLargeError` no handler `'end'`, depois que a conexão drenou naturalmente. O socket nunca é destruído explicitamente; a resposta `413` é escrita normalmente.
- **Files modified:** `app-partners-recomendados/src/review-server.js` (função `readRawBody`)
- **Verification:** Test 15 (`POST /review/:productId/approve` com corpo de ~20.000 bytes) passa de forma consistente, recebendo `413` sem erro de socket; suíte completa (114/114) permanece verde.
- **Committed in:** `c30d0db` (parte do commit GREEN da Task 1)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Necessário para que o comportamento observável (SC#4/T-04-07) realmente funcione como o próprio plano exige; nenhum scope creep — a mudança é interna a `readRawBody`, a assinatura/contrato da função não mudou.

## Issues Encountered

- `fetch()` do Node/undici segue redirects `303` por padrão — os testes que checam o status `303`/header `Location` de `/approve` e `/reject` precisaram de `redirect: 'manual'` explícito para inspecionar a resposta original em vez da página final seguida (`/review`). Ajuste de teste, não deviation de produção.

## User Setup Required

None - nenhuma configuração de serviço externo necessária.

## Next Phase Readiness

- **Fase 4 completa (5/5 planos):** fila de aprovação pronta para a Fase 5 consumir via `getApprovalDecision`/`listApprovalQueueChanges`.
- APRV-02/03/04 fechados: aprovação/rejeição funcionam via painel, o gate de escrita recusa sem aprovação prévia mesmo pulando a UI (SC#3, confirmado por teste E por curl ao vivo), e dry-run true/false produzem o mesmo resultado stub sem chamada de rede real (SC#4).
- D-19/D-20/D-21/D-25 fechados de ponta a ponta: remoção + backfill + persistência do conjunto exato, tudo recomputado no servidor, nunca aceito literalmente do corpo da requisição.
- Próximo trabalho real de escrita na loja (Fase 5) pode assumir que toda decisão em `approval_queue` já passou por este gate — nenhuma validação adicional de "quem aprovou" é necessária além de ler `getApprovalDecision`.

## Self-Check: PASSED

- FOUND: app-partners-recomendados/src/review-server.js
- FOUND: app-partners-recomendados/src/review-server.test.js
- FOUND commit: e92b8c8
- FOUND commit: c30d0db

---
*Phase: 04-preview-e-aprova-o-humana*
*Completed: 2026-07-16*
*Status: complete (2/2 tasks — Task 1 auto TDD, Task 2 checkpoint:human-verify aprovado)*
