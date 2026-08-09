---
phase: 05-grava-o-segura-em-produ-o
plan: 03
subsystem: api
tags: [nuvemshop-metafields, sqlite, vitest, write-audit]

requires:
  - phase: 05-01
    provides: findMetafield/updateMetafield/createMetafield (client.js) e notifyWriteFailure (notify-failure.js)
  - phase: 05-02
    provides: insertWriteLog/getLastSuccessfulWriteLog (catalog-store.js, tabela write_log)
provides:
  - executeApprovedWrite assincrono com escrita real de Metafield (update ou create conforme existir)
  - write_log passa a receber linhas reais (sucesso e falha) com runId preenchido
  - POST /review/:productId/write aguarda a escrita real e retorna written:true em sucesso
affects: [05-04, 05-05]

tech-stack:
  added: []
  patterns:
    - "gate-first async write: assertApproved sempre primeira operacao de uma funcao async, dryRun:true retorno antecipado com zero I/O"
    - "catch aninhado: falha de escrita grava log (status:failed) -> notifica webhook via .catch(() => {}) -> relanca o erro ORIGINAL (Pitfall 5)"

key-files:
  created: []
  modified:
    - app-partners-recomendados/src/review/write-executor.js
    - app-partners-recomendados/src/review/write-executor.test.js
    - app-partners-recomendados/src/review-server.js
    - app-partners-recomendados/src/review-server.test.js

key-decisions:
  - "Antigo 'Test 11' (dryRun ausente tratado como falsy) foi ADAPTADO (nao removido) para Test 13, confirmando que cai no ramo REAL — prova o comportamento novo desta fase em vez de reafirmar o comportamento antigo (stub)"
  - "review-server.test.js mocka o modulo INTEIRO de nuvemshop-client/client.js (8 funcoes, nao so as 3 novas) para blindar contra qualquer import futuro do mesmo modulo no mesmo teste"
  - "notifyWriteFailure mockado com mockResolvedValue({notified:false}) por padrao no beforeEach de review-server.test.js — necessario porque o call site em write-executor.js faz .catch() no retorno, que quebraria se o mock nao-configurado retornasse undefined em vez de uma Promise"

patterns-established:
  - "Composicao de 2 waves: write-executor.js (05-03) e a primeira funcao a compor client.js (05-01) + catalog-store.js (05-02) + notify-failure.js (05-01) no mesmo fluxo real"

requirements-completed: [WRTE-02, WRTE-04, WRTE-05]

duration: 20min
completed: 2026-07-16
status: complete
---

# Phase 05 Plan 03: Escrita Real de Metafield com Snapshot, Log e Notificação Summary

**executeApprovedWrite passou de stub síncrono para função assíncrona que grava JSON.stringify(approvedIds) via updateMetafield/createMetafield conforme o Metafield já exista, registra write_log (sucesso ou falha) e notifica falha sem mascarar o erro original — POST /review/:productId/write agora aguarda essa escrita real e passa runId.**

## Performance

- **Duration:** 20 min
- **Completed:** 2026-07-16
- **Tasks:** 2 completed
- **Files modified:** 4

## Accomplishments

- `write-executor.js`: stub da Fase 4 substituído por escrita real — `findMetafield` (leitura ao vivo do valor anterior) seguido de `updateMetafield` (se existir) ou `createMetafield` (se não existir), nunca assumindo upsert por POST repetido (D-43/Pitfall 1)
- Toda tentativa real de escrita grava exatamente uma linha em `write_log` (sucesso com `previousValue`/`writtenValue`/`runId`, ou falha com `errorMessage`) — nunca silenciosa (WRTE-04)
- Falha real dispara `notifyWriteFailure`, com o erro ORIGINAL sempre relançado ao chamador mesmo quando o próprio webhook também rejeita (Pitfall 5/WRTE-05), confirmado por teste dedicado (Test 12)
- `dryRun:true` continua zero I/O (confirmado por `toHaveBeenCalledTimes(0)` nos 4 mocks relevantes) — gate `assertApproved` permanece a primeira operação do corpo, nunca contornável
- `review-server.js`: `POST /review/:productId/write` agora `await` a função assíncrona e passa `runId` já calculado; suíte de integração cobre sucesso (200, `written:true`) e falha (500 + notificação), sem nenhuma chamada de rede real durante os testes (134/134 testes verdes na suíte completa do projeto)

## Task Commits

1. **Task 1: write-executor.js — escrita real com snapshot, log e notificação (RED→GREEN)** - `a2c9b9e` (feat)
2. **Task 2: review-server.js — POST /write aguarda a escrita real e passa runId** - `a23e158` (feat)

**Plan metadata:** commit_docs desabilitado no `.planning/config.json` — commit final de documentação pulado (ver seção "Final commit").

_Nota: ambas as tasks tinham `tdd="true"`, mas o RED (teste falhando) e o GREEN (implementação) foram produzidos e verificados juntos antes do commit único por task — os testes novos (Tests 9, 10, 12, 13 em write-executor.test.js; Test 19 em review-server.test.js) foram escritos e confirmados falhando contra a implementação antiga do stub antes da reescrita, depois confirmados verdes contra a implementação nova, seguindo o mesmo ciclo RED→GREEN descrito no `<name>` de cada task._

## Files Created/Modified

- `app-partners-recomendados/src/review/write-executor.js` - `executeApprovedWrite` assíncrona: gate primeiro, `dryRun:true` retorno antecipado zero I/O, ramo real com `findMetafield`→`updateMetafield`/`createMetafield`→`insertWriteLog`, catch com `insertWriteLog(status:'failed')`→`notifyWriteFailure().catch(()=>{})`→`throw err`
- `app-partners-recomendados/src/review/write-executor.test.js` - reescrito com `client.js`/`catalog-store.js`/`notify-failure.js` mockados (`vi.mock`); Tests 7-13 (mantém Test 7 do gate, adapta Test 8, substitui os antigos Tests 9/10 pelos novos Tests 9-12 do plano, adapta o antigo Test 11 para o novo Test 13)
- `app-partners-recomendados/src/review-server.js` - linha 543: `await executeApprovedWrite({ productId, decision, dryRun, runId })` no bloco `WRITE_PATH`
- `app-partners-recomendados/src/review-server.test.js` - mocka `./nuvemshop-client/client.js` (módulo inteiro, 8 funções) e `./review/notify-failure.js`; Test 14 atualizado (`written:true` após escrita real bem-sucedida); novo Test 19 cobre falha real (500 + `notifyWriteFailure` chamado 1x)

## Decisions Made

- Antigo "Test 11" (comportamento de fases anteriores: `dryRun` ausente tratado como falsy) foi ADAPTADO em vez de removido — virou Test 13, confirmando que `dryRun` ausente cai no ramo REAL (mudança de comportamento deliberada desta fase, já que antes ambos os ramos eram idênticos)
- `review-server.test.js` mocka o módulo inteiro de `client.js` (8 funções, não só as 3 novas de escrita) por segurança contra imports futuros do mesmo módulo no mesmo teste
- Valor default de `notifyWriteFailure` mockado (`mockResolvedValue({ notified: false })`) adicionado ao `beforeEach` de `review-server.test.js` — necessário porque o call site em `write-executor.js` encadeia `.catch(() => {})` no retorno de `notifyWriteFailure`, o que quebraria com `TypeError` se o mock não configurado retornasse `undefined` em vez de uma Promise

## Deviations from Plan

None - plan executed exactly as written. A única decisão explicitamente delegada ao executor pelo próprio texto do plano (Task 1, `<action>`: "Remover o antigo 'Test 11' ... OU adaptá-lo ... decisão do executor, documentar qual das duas opções foi escolhida") foi resolvida optando por adaptar (documentado acima), não é uma correção de bug/desvio de comportamento.

## Issues Encountered

None.

## User Setup Required

None - nenhuma configuração de serviço externo nova. `WRITE_FAILURE_WEBHOOK_URL` (usado por `notifyWriteFailure`, Plano 05-01) continua sendo o único ponto de configuração opcional, inalterado por este plano.

## Pending Human Verification (Nyquist)

O plano especifica um `<human-check>` no `<verify>` da Task 2, que requer uma escrita real de teste contra a loja de produção Talgui (produto `349886153`, mesmo produto usado no round-trip da Fase 1) para fechar o SC#1 do ROADMAP. Esta verificação **não foi executada neste plano** — envolve uma escrita real irreversível contra dados de produção e está fora do escopo de automação segura de um executor de plano (é uma confirmação humana explícita por design, não substituível por um comando determinístico). Passos documentados no `05-03-PLAN.md` (`<verify><human-check>`) para o usuário executar quando desejar:

1. Confirmar decisão `approved` real para o produto `349886153` (via `approval_queue`/painel, ou criar manualmente)
2. Rodar `node src/review-server.js` e `POST /review/349886153/write?dryRun=false` contra o servidor real
3. Inspecionar `write_log` e confirmar que `previous_value`/`written_value` batem com o valor lido do Metafield antes/depois da chamada

Isso não bloqueia o fechamento deste plano (WRTE-02/WRTE-04/WRTE-05 estão cobertos pela suíte automatizada, que é a evidência primária deste plano) — é uma confirmação adicional de produção que o usuário pode rodar a qualquer momento.

## Next Phase Readiness

- `write_log` agora recebe dados reais (sucesso/falha) gerados pelo fluxo de `POST /write` — Wave 3 (Planos 05-04/05-05, rollback e tela de auditoria) pode consumir esses dados sem trabalho adicional de instrumentação
- Gate `assertApproved` (D-25/APRV-03) permanece intacto e é reexercitado pela suíte — nenhum caminho de código chega ao efeito real sem aprovação
- Nenhum bloqueio para os próximos planos da Fase 5

---
*Phase: 05-grava-o-segura-em-produ-o*
*Completed: 2026-07-16*

## Self-Check: PASSED

- FOUND: app-partners-recomendados/src/review/write-executor.js
- FOUND: app-partners-recomendados/src/review/write-executor.test.js
- FOUND: app-partners-recomendados/src/review-server.js
- FOUND: app-partners-recomendados/src/review-server.test.js
- FOUND: a2c9b9e (Task 1 commit)
- FOUND: a23e158 (Task 2 commit)
