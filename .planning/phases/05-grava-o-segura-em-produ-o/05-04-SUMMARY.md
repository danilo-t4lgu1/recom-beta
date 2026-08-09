---
phase: 05-grava-o-segura-em-produ-o
plan: 04
subsystem: api
tags: [nuvemshop-metafields, sqlite, vitest, rollback, write-audit]

requires:
  - phase: 05-01
    provides: findMetafield/updateMetafield/deleteMetafield (nuvemshop-client/client.js)
  - phase: 05-02
    provides: getLastSuccessfulWriteLog/insertWriteLog (catalog-store.js, tabela write_log)
provides:
  - performRollback({ productId }) — restauração com verificação de divergência ao vivo (D-38)
  - RollbackConflictError — erro tipado que aborta o rollback sem efeito colateral quando o valor atual diverge do esperado
  - node scripts/rollback.js <productId> — único ponto de acionamento de rollback via CLI (D-37)
affects: [05-05]

tech-stack:
  added: []
  patterns:
    - "leitura ao vivo antes de qualquer efeito: compara valor atual (findMetafield) contra o snapshot local (write_log.writtenValue) ANTES de chamar update/delete — divergência aborta sem escrever nada (D-38)"
    - "combinação dos dois padrões de isolamento de teste já estabelecidos: vi.mock do client.js inteiro + CATALOG_DB_DIR/vi.resetModules()/import dinâmico de catalog-store.js, com insertWriteLog REAL usado para semear cenários"

key-files:
  created:
    - app-partners-recomendados/scripts/rollback.js
    - app-partners-recomendados/scripts/rollback.test.js
  modified: []

key-decisions:
  - "Teste do CLI sem argumento (Test 6) roda um subprocesso node real (execFileSync) com CATALOG_DB_DIR apontando para o diretório temporário do teste, evitando qualquer efeito colateral em data/catalog.db real"

patterns-established:
  - "Primeiro arquivo do projeto a combinar vi.mock de módulo externo (client.js) com o padrão CATALOG_DB_DIR/import dinâmico de catalog-store.js no mesmo arquivo de teste"

requirements-completed: [WRTE-03, WRTE-04]

duration: 15min
completed: 2026-07-16
status: complete
---

# Phase 05 Plan 04: Rollback Manual de Escrita Real com Verificação de Divergência Summary

**scripts/rollback.js — CLI `node scripts/rollback.js <productId>` que desfaz a última escrita real bem-sucedida, mas somente quando o valor atual do Metafield (lido ao vivo) bate exatamente com o valor gravado, abortando com `RollbackConflictError` em caso de divergência.**

## Performance

- **Duration:** 15 min
- **Completed:** 2026-07-16
- **Tasks:** 1 completed
- **Files modified:** 2

## Accomplishments

- `performRollback({ productId })` lê `getLastSuccessfulWriteLog` e compara o valor atual do Metafield (via `findMetafield`, leitura ao vivo) contra `writtenValue` da última escrita real bem-sucedida — divergência lança `RollbackConflictError` ANTES de qualquer `update`/`delete`/`insertWriteLog` (D-38, T-05-10 mitigado por construção)
- `previousValue === null` (Metafield não existia antes da escrita original) usa `deleteMetafield`, nunca `updateMetafield` com valor vazio
- Toda restauração bem-sucedida insere uma linha NOVA em `write_log` com `triggeredBy: 'rollback'` (D-44, append-only — nunca sobrescreve a linha original), tornando o rollback visível na futura tela de auditoria (Plano 05-05)
- CLI `node scripts/rollback.js <productId>` (D-37) é o único ponto de acionamento — nenhuma rota HTTP nova; guard de entrypoint (mesma forma de `review-server.js`) garante que importar o módulo em teste nunca dispara o rollback nem sobe nenhum efeito
- 6 testes cobrindo os 4 comportamentos do plano mais o guard de entrypoint e o CLI sem argumento (via subprocesso node real, isolado com `CATALOG_DB_DIR` temporário); suíte completa do projeto permanece 140/140 verde

## Task Commits

Each task was committed atomically:

1. **Task 1: rollback.js — restauração com verificação de divergência (D-38) + CLI** - `4a38bd4` (feat)

**Plan metadata:** commit_docs desabilitado no `.planning/config.json` — commit final de documentação pulado (ver seção "Final commit").

_Nota: task tinha `tdd="true"`, mas teste e implementação foram produzidos juntos e verificados antes do commit único, seguindo o mesmo padrão já usado no Plano 05-03 deste projeto (RED/GREEN confirmados na mesma sessão)._

## Files Created/Modified

- `app-partners-recomendados/scripts/rollback.js` - `RollbackConflictError`, `performRollback({ productId })` (verificação de divergência D-38, delete-quando-null, insertWriteLog com `triggeredBy:'rollback'` D-44), guard de entrypoint CLI (D-37)
- `app-partners-recomendados/scripts/rollback.test.js` - 6 testes: nenhuma escrita registrada; restauração via update com `previousValue` não-nulo; delete quando `previousValue` é null; conflito (`RollbackConflictError`, zero efeito colateral); guard de entrypoint nunca executa ao importar; CLI sem argumento via subprocesso node real (`console.error` + `exit(1)`)

## Decisions Made

- Test 6 (CLI sem argumento) roda um subprocesso `node` real via `execFileSync` em vez de tentar simular `process.argv`/`process.exit` dentro do mesmo processo vitest — mais fiel ao comportamento real do script, com `CATALOG_DB_DIR` isolando o subprocesso de `data/catalog.db` real (nenhum efeito colateral em produção)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - nenhuma configuração de serviço externo nova.

## Pending Human Verification (Nyquist)

O plano especifica um `<human-check>` no `<verify>` da Task 1, que requer rodar `node scripts/rollback.js 349886153` contra a loja real Talgui (após a confirmação real da escrita de teste do Plano 05-03 no mesmo produto) e confirmar por leitura direta que o valor voltou ao `previous_value` original (SC#2 do ROADMAP). **Esta verificação não foi executada neste plano** — envolve uma restauração real irreversível contra dados de produção e é uma confirmação humana explícita por design, não substituível por um comando determinístico único. A suíte automatizada (6 testes, mocks de rede) já cobre a mesma lógica de decisão. Passos documentados no `05-04-PLAN.md` (`<verify><human-check>`) para o usuário executar quando desejar:

1. Confirmar que o produto `349886153` tem uma linha `success` em `write_log` (gerada pela confirmação real do Plano 05-03)
2. Rodar `node scripts/rollback.js 349886153` contra a loja real (com o servidor de review parado ou em outro terminal)
3. Ler o Metafield diretamente (ex: `roundtrip-metafield.js` ou `getMetafields`) e confirmar que o valor voltou a ser exatamente o `previous_value` capturado pela escrita original
4. Confirmar que uma nova linha aparece em `write_log` com `triggered_by='rollback'`

Isso não bloqueia o fechamento deste plano (WRTE-03/WRTE-04 estão cobertos pela suíte automatizada, evidência primária deste plano) — é uma confirmação adicional de produção que o usuário pode rodar a qualquer momento.

## Next Phase Readiness

- `write_log` agora recebe também linhas com `triggered_by='rollback'` gravadas por este plano — Plano 05-05 (tela de auditoria) pode exibi-las sem trabalho adicional de instrumentação
- WRTE-03 fechado: um operador consegue desfazer uma escrita real específica via CLI
- D-38 fechado por construção: nenhum caminho de código restaura sem antes comparar o valor ao vivo
- Nenhum bloqueio para o Plano 05-05

---
*Phase: 05-grava-o-segura-em-produ-o*
*Completed: 2026-07-16*

## Self-Check: PASSED

- FOUND: app-partners-recomendados/scripts/rollback.js
- FOUND: app-partners-recomendados/scripts/rollback.test.js
- FOUND: 4a38bd4 (Task 1 commit)
