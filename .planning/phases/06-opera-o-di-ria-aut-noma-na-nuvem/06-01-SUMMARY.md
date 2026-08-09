---
phase: 06-opera-o-di-ria-aut-noma-na-nuvem
plan: 01
subsystem: database
tags: [better-sqlite3, wal-checkpoint, idempotency, sqlite, orchestrator, node]

# Dependency graph
requires:
  - phase: 04-aprova-o-humana-e-fila-de-revis-o
    provides: "approval_queue (UNIQUE(product_id, run_id)), getBaselineForRun, upsertApprovalDecision, listApprovalQueueChanges"
  - phase: 03.1-grupo-de-produtos
    provides: "getLatestSnapshotProducts com productGroupCanonical, runIngestion({ categoryNames })"
provides:
  - "getSuccessfulRunForToday() — guard de idempotência diária (D-48/FEED-01/SC#2)"
  - "seedPendingApprovalQueue({ runId, queueEntries }) — seed automático da fila via ON CONFLICT DO NOTHING (nunca sobrescreve decisão humana)"
  - "checkpointAndCloseDb() — wal_checkpoint(TRUNCATE) + close(), obrigatório antes do commit-back em CI"
  - "runDailyJob({ categoryNames }) e scripts/run-daily-job.js — orquestrador testável do job agendado, nunca escreve na loja sozinho (D-47)"
affects: [06-02-github-actions-workflow, 06-03-storefront-cache-ttl]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Guard de dia-calendário via date(started_at) = date('now') do SQLite (ambos os lados em UTC, sem conversão) para idempotência diária"
    - "ON CONFLICT DO NOTHING (contraste deliberado com DO UPDATE de upsertApprovalDecision) para nunca sobrescrever decisão humana já registrada"
    - "Separação lógica testável (export) vs. bloco de CLI guardado por pathToFileURL(process.argv[1]) — mesmo padrão de rollback.js"

key-files:
  created:
    - app-partners-recomendados/scripts/run-daily-job.js
    - app-partners-recomendados/scripts/run-daily-job.test.js
  modified:
    - app-partners-recomendados/src/db/catalog-store.js
    - app-partners-recomendados/src/db/catalog-store.test.js

key-decisions:
  - "checkpointAndCloseDb() e process.exit() vivem exclusivamente no bloco de CLI de run-daily-job.js, nunca dentro de runDailyJob() — mesma disciplina de performRollback em rollback.js"
  - "runDailyJob() nunca importa nenhum módulo de escrita real de Metafield — só ingest-catalog.js, catalog-store.js, review-queue.js, notify-failure.js"

patterns-established:
  - "Pattern: guard de idempotência por dia-calendário (getSuccessfulRunForToday) verificado ANTES de qualquer chamada de rede/ingestão — retorno cedo sem side-effect"
  - "Pattern: checkpoint explícito do WAL como última operação de um processo Node efêmero antes de process.exit, para uso em CI/commit-back (Plano 06-02)"

requirements-completed: [RULE-03, FEED-01]

# Metrics
duration: 25min
completed: 2026-07-17
status: complete
---

# Phase 06 Plan 01: Idempotência Diária e Orquestrador do Job Agendado Summary

**Guard de idempotência diária (D-48/FEED-01/SC#2) em catalog-store.js + orquestrador testável `run-daily-job.js` que compõe ingestão + fila de aprovação sem nunca escrever na loja sozinho (D-47), com checkpoint explícito do WAL (D-45/D-46) antes do fim do processo Node.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-07-17
- **Completed:** 2026-07-17
- **Tasks:** 2/2
- **Files modified:** 4 (2 criados, 2 modificados)

## Accomplishments
- `getSuccessfulRunForToday()`, `seedPendingApprovalQueue()`, `checkpointAndCloseDb()` adicionadas a `catalog-store.js` com 6 testes novos (22 no arquivo, todos verdes)
- `scripts/run-daily-job.js` criado: `runDailyJob()` exportada e testável + bloco de CLI separado, seguindo o mesmo padrão de `rollback.js` (nunca `run-ingestion.js`, cujo `main()` não é exportado)
- Rodar o job duas vezes no mesmo dia (UTC) comprovado por teste: NÃO chama `runIngestion` de novo, `ingestion_runs` permanece com 1 linha
- Diff real (D-16) comprovado por teste: produto com baseline não-nulo e sem tecido mapeado gera entrada `pending` em `approval_queue`
- Suíte completa do projeto: 154/154 testes verdes (144 pré-existentes + 6 de catalog-store.js + 4 de run-daily-job.js), sem regressão

## Task Commits

Cada task foi commitada atomicamente:

1. **Task 1: catalog-store.js — getSuccessfulRunForToday, seedPendingApprovalQueue, checkpointAndCloseDb** - `bbb39da` (feat)
2. **Task 2: scripts/run-daily-job.js — orquestrador do job agendado** - `656434b` (feat)

_Nenhuma task teve `tdd="true"` executado como RED/GREEN/REFACTOR separado em commits distintos — os testes foram escritos junto com a implementação em cada commit único (TDD "clássico" seguido internamente, mas commitado como um único `feat` por task, consistente com o padrão já usado nas Fases 4/5 deste projeto)._

**Plan metadata:** commit final de STATE/ROADMAP pulado (`commit_docs: false` em `.planning/config.json`) — ver seção "Configuração do usuário" abaixo.

## Files Created/Modified
- `app-partners-recomendados/src/db/catalog-store.js` - 3 funções novas (`getSuccessfulRunForToday`, `seedPendingApprovalQueue`, `checkpointAndCloseDb`) + 2 prepared statements novos
- `app-partners-recomendados/src/db/catalog-store.test.js` - 6 testes novos cobrindo os 3 comportamentos do plano, incluindo o caso de fronteira "run de dia anterior não conta"
- `app-partners-recomendados/scripts/run-daily-job.js` - orquestrador novo: `runDailyJob()` exportada + bloco de CLI guardado
- `app-partners-recomendados/scripts/run-daily-job.test.js` - 4 testes cobrindo primeira execução, segunda execução no mesmo dia, guard de import e diff real (D-16)

## Decisions Made
- Nenhuma decisão arquitetural nova além do que já estava especificado no plano — as 3 funções e o orquestrador seguem exatamente os contratos de interface (`@interfaces`) e a ação descrita em `06-01-PLAN.md`.
- `runDailyJob()` usa a mesma sequência de leitura já estabelecida em `GET /review` de `review-server.js` (`getLatestSnapshotProducts` → `getLatestSuccessfulRunId` → `getBaselineForRun`) em vez de reimplementar essa lógica, confirmando o padrão "Don't Hand-Roll" já em uso no projeto.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug/achado empírico] Teste de `checkpointAndCloseDb()` ajustado: `.db-wal` é REMOVIDO (unlink), não apenas truncado a 0 bytes, ao fechar a última conexão**
- **Found during:** Task 1 (teste do comportamento de `checkpointAndCloseDb`)
- **Issue:** O plano previa textualmente "o arquivo `.db-wal` fica com tamanho 0 bytes logo após a chamada". Comprovado empiricamente (reprodução isolada com `better-sqlite3` puro) que, após `wal_checkpoint(TRUNCATE)` seguido de `db.close()` — exatamente a sequência de `checkpointAndCloseDb()` — o SQLite remove o arquivo `.db-wal` do disco (ele deixa de existir) em vez de deixá-lo presente com 0 bytes. O teste original falhava com `ENOENT` ao chamar `statSync` diretamente.
- **Fix:** Ajustada a asserção do teste para aceitar os dois resultados observáveis (arquivo ausente OU 0 bytes), já que ambos provam a mesma garantia real exigida pelo plano — nenhum dado pendente sobrando fora do arquivo principal `.db` — usando `statSync(walPath, { throwIfNoEntry: false })?.size ?? 0`.
- **Files modified:** `app-partners-recomendados/src/db/catalog-store.test.js`
- **Verification:** Teste passa de forma determinística; a garantia funcional real (dados sobrevivem em uma nova conexão após `checkpointAndCloseDb()`) permanece comprovada pela outra asserção do mesmo teste (`SELECT` direto via `Database` independente).
- **Committed in:** `bbb39da` (parte do commit da Task 1)

**2. [Rule 3 - Blocking/acceptance criteria] Redução de menções literais a "checkpointAndCloseDb" nos comentários de `run-daily-job.js`**
- **Found during:** Task 2 (verificação do acceptance criteria de grep)
- **Issue:** O acceptance criteria do plano exige `grep -c "checkpointAndCloseDb" ... retorna exatamente 2` (1 import + 1 chamada). A primeira versão do arquivo tinha 4 ocorrências (2 comentários explicativos adicionais).
- **Fix:** Comentários reescritos para descrever o comportamento sem repetir o nome literal da função, preservando o mesmo conteúdo explicativo (D-45/D-46/Pitfall 1).
- **Files modified:** `app-partners-recomendados/scripts/run-daily-job.js`
- **Verification:** `grep -c "checkpointAndCloseDb" app-partners-recomendados/scripts/run-daily-job.js` retorna exatamente `2`.
- **Committed in:** `656434b` (parte do commit da Task 2)

---

**Total deviations:** 2 auto-fixed (1 achado empírico de comportamento de SO/SQLite, 1 ajuste de acceptance criteria literal)
**Impact on plan:** Nenhum impacto em escopo ou comportamento funcional — ambos os ajustes são correções de teste/comentário, não de lógica de produção. A garantia real de negócio (D-45/D-46, D-47/D-48) permanece intacta e comprovada por teste.

## Issues Encountered
None além dos 2 deviations documentados acima.

## User Setup Required

None - nenhuma configuração de serviço externo necessária neste plano (o commit final de STATE.md/ROADMAP.md foi pulado porque `.planning/config.json` tem `commit_docs: false` — comportamento intencional do usuário, não uma falha).

## Next Phase Readiness
- `node scripts/run-daily-job.js` está pronto para ser invocado diretamente pelo workflow do GitHub Actions do Plano 06-02, sem nenhum redesenho necessário — `checkpointAndCloseDb()` já garante que os dados sobrevivam ao fim do processo antes do commit-back.
- D-47 permanece travado por construção: nenhum caminho deste plano chama escrita real na loja; aprovação/escrita continuam exclusivamente manuais via painel web (Fase 4/5).
- Plano 06-03 (cache TTL do storefront) não depende deste plano — pode prosseguir em paralelo (Wave 1).

---
*Phase: 06-opera-o-di-ria-aut-noma-na-nuvem*
*Completed: 2026-07-17*

## Self-Check: PASSED

- FOUND: app-partners-recomendados/src/db/catalog-store.js
- FOUND: app-partners-recomendados/src/db/catalog-store.test.js
- FOUND: app-partners-recomendados/scripts/run-daily-job.js
- FOUND: app-partners-recomendados/scripts/run-daily-job.test.js
- FOUND: .planning/phases/06-opera-o-di-ria-aut-noma-na-nuvem/06-01-SUMMARY.md
- FOUND commit: bbb39da
- FOUND commit: 656434b
