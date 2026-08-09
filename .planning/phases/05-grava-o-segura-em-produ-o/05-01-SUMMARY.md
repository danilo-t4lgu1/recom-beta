---
phase: 05-grava-o-segura-em-produ-o
plan: 01
subsystem: api
tags: [nuvemshop-api, metafields, rate-limit, webhook, vitest]

# Dependency graph
requires:
  - phase: 04-aprova-o-humana-obrigat-ria
    provides: assertApproved/executeApprovedWrite (gate de aprovação, stub de escrita) que este plano prepara para virar escrita real
provides:
  - findMetafield/updateMetafield/deleteMetafield em client.js (fundação de escrita reversível de Metafield)
  - createMetafield estendido com rate limit adaptativo (fecha Pitfall 3)
  - notifyWriteFailure (WRTE-05) — webhook de notificação de falha, nunca lança
  - .env.example (primeiro do repositório)
affects: [05-02, 05-03, 05-04, 05-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Stub de globalThis.fetch por teste (salvar/restaurar em afterEach) reutilizado em client.test.js e notify-failure.test.js — mesmo padrão de write-executor.test.js Test 10"
    - "notify-failure.js segue o padrão try/catch total (Pitfall 5): guarda de configuração ausente ANTES do try, todo o resto (rede + parsing) dentro de um único try/catch que nunca relança"

key-files:
  created:
    - app-partners-recomendados/src/nuvemshop-client/client.test.js
    - app-partners-recomendados/src/review/notify-failure.js
    - app-partners-recomendados/src/review/notify-failure.test.js
    - app-partners-recomendados/.env.example
  modified:
    - app-partners-recomendados/src/nuvemshop-client/client.js

key-decisions:
  - "findMetafield reutiliza getMetafields internamente (zero chamadas de rede novas) em vez de duplicar a lógica de busca"
  - "createMetafield mantém retrocompatibilidade total: limiter é opcional, chamadores existentes (roundtrip-metafield.js) continuam funcionando idênticos"
  - "notifyWriteFailure: guarda de webhook ausente fica FORA do try/catch (retorno cedo, sem fetch); todo o resto fica dentro de um único try/catch — garantia estrutural de que a função nunca lança"

patterns-established:
  - "Escrita de Metafield sempre via find-then-decide (PUT se existir, criar se não) — nunca upsert por POST repetido (Pitfall 1), disponível para o Plano 05-03 compor"

requirements-completed: [WRTE-02, WRTE-05]

# Metrics
duration: 20min
completed: 2026-07-16
status: complete
---

# Phase 05 Plan 01: Metafield CRUD + Webhook de Falha Summary

**client.js ganha findMetafield/updateMetafield/deleteMetafield com rate limit adaptativo, e notify-failure.js implementa notificação de falha via webhook que nunca lança (Pitfall 1/3/5 do 05-RESEARCH.md fechados)**

## Performance

- **Duration:** ~20 min
- **Tasks:** 2/2 completed
- **Files modified:** 5 (1 modificado, 4 criados)

## Accomplishments
- `findMetafield`/`updateMetafield`/`deleteMetafield` novos em `client.js`, todos via `fetchWithRateLimit`, reutilizando `getAccessToken`/`buildHeaders`/`assertOk` já existentes
- `createMetafield` estendido com `limiter` opcional, fecha o Pitfall 3 (rate limit) sem quebrar nenhum chamador existente
- `client.test.js` — primeira suíte de testes do módulo (Wave 0 gap fechado), 8 testes verdes
- `notify-failure.js` (`notifyWriteFailure`) implementa WRTE-05: nunca lança, degrada graciosamente sem webhook configurado, payload sem dados de autenticação
- `.env.example` documenta as 3 variáveis de ambiente do projeto (primeiro arquivo desse tipo no repositório)

## Task Commits

Each task was committed atomically:

1. **Task 1: client.js — findMetafield/updateMetafield/deleteMetafield + createMetafield com rate limit** - `03d6474` (feat)
2. **Task 2: notify-failure.js — webhook de notificação de falha (WRTE-05/D-39/D-40) + .env.example** - `389b15c` (feat)

**Plan metadata:** commit_docs desabilitado nesta configuração (`.planning/config.json`) — sem commit de metadados separado (ver seção "Deviations").

## Files Created/Modified
- `app-partners-recomendados/src/nuvemshop-client/client.js` - findMetafield/updateMetafield/deleteMetafield novos + createMetafield com rate limit
- `app-partners-recomendados/src/nuvemshop-client/client.test.js` - 8 testes cobrindo as 4 funções acima
- `app-partners-recomendados/src/review/notify-failure.js` - notifyWriteFailure, webhook de notificação de falha
- `app-partners-recomendados/src/review/notify-failure.test.js` - 4 testes cobrindo todos os comportamentos (incluindo prova direta do Pitfall 5)
- `app-partners-recomendados/.env.example` - documenta NUVEMSHOP_ACCESS_TOKEN, NUVEMSHOP_STORE_ID, WRITE_FAILURE_WEBHOOK_URL

## Decisions Made
- `findMetafield` reutiliza `getMetafields` (nenhuma chamada de rede nova), evitando duplicar lógica de busca
- `notifyWriteFailure` estrutura o corpo em duas fases: guarda de configuração ausente fora do try/catch (retorno cedo sem `fetch`), e todo o restante (mensagem + rede + checagem de status) dentro de um único `try/catch` — garantia estrutural do Pitfall 5, não apenas convenção

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Comentário em `notify-failure.js` causava falso-positivo no grep de acceptance criteria**
- **Found during:** Task 2, verificação de acceptance criteria
- **Issue:** O comentário de topo do arquivo mencionava literalmente a palavra "accessToken" ao DOCUMENTAR que o payload nunca a inclui — isso fazia `grep -c "accessToken\|Authorization\|Bearer"` retornar 1 em vez de 0, quebrando a acceptance criteria mesmo sem nenhum dado de autenticação real no código
- **Fix:** Reescrito o comentário para "credenciais/segredos de autenticação" (mesma intenção, sem a palavra literal que o grep buscava)
- **Files modified:** `app-partners-recomendados/src/review/notify-failure.js`
- **Verification:** `grep -c "accessToken\|Authorization\|Bearer" notify-failure.js` retorna 0; suíte completa (127/127) permanece verde
- **Committed in:** `389b15c` (parte do commit da Task 2)

**Nota sobre granularidade TDD:** cada task deste plano já bundlava a criação do módulo + seus testes em uma única unidade de trabalho (não estruturada como sub-tasks RED/GREEN separadas). Testes e implementação foram commitados juntos por task (`feat(05-01): ...`), consistente com a granularidade "1 commit por task" já usada nas fases anteriores deste projeto quando a task-plan não separa RED de GREEN explicitamente. Nenhum teste foi escrito para passar artificialmente — os 12 testes novos (8 + 4) foram escritos cobrindo o `<behavior>` de cada task e confirmados verdes antes do commit.

---

**Total deviations:** 1 auto-fixed (1 bug de falso-positivo em verificação)
**Impact on plan:** Correção cosmética em comentário, sem impacto funcional. Nenhum scope creep.

## Issues Encountered
None.

## User Setup Required

**Webhook de notificação de falha (WRTE-05) requer configuração manual para alertar de fato o operador.** Sem uma URL real configurada, o sistema funciona normalmente e apenas registra a falha localmente (`console.warn`), sem notificar ninguém.

- **Variável de ambiente:** `WRITE_FAILURE_WEBHOOK_URL` (em `.env`, nunca commitar o valor real)
- **Como obter:**
  - Slack: workspace → Apps → Incoming Webhooks → Add New Webhook to Workspace (copiar a URL gerada)
  - Discord: canal → Configurações → Integrações → Webhooks → Novo Webhook → Copiar URL do Webhook
- **Verificação:** com a URL configurada, qualquer chamada de `notifyWriteFailure` fará um POST real contendo `text`/`content` com a mensagem de falha — confirmar visualmente a mensagem chegando no canal Slack/Discord configurado

Este passo NÃO bloqueia o Plano 05-02/05-03 — o comportamento sem webhook configurado (`console.warn`, `{ notified: false, reason: 'webhook not configured' }`) já é o esperado e testado.

## Next Phase Readiness
- `findMetafield`/`updateMetafield`/`deleteMetafield`/`createMetafield`/`notifyWriteFailure` prontos para o Plano 05-03 compor a escrita real (captura de estado anterior + gravação + notificação de falha)
- Nenhum bloqueio para o Plano 05-02 (próximo da Wave 1)

---
*Phase: 05-grava-o-segura-em-produ-o*
*Completed: 2026-07-16*

## Self-Check: PASSED

All created files and both task commits (03d6474, 389b15c) verified present on disk/git log.
