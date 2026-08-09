---
phase: 07-rollout-do-motor-no-catalogo-completo-todas-as-categorias-em
plan: 05
subsystem: infra
tags: [github-actions, cron, circuit-breaker, kill-switch, webhook, vitest, sqlite]

# Dependency graph
requires:
  - phase: 07-02
    provides: "getLastSuccessfulIngestionRunSummary + category_counts por-categoria (Defesa 1)"
  - phase: 07-03
    provides: "executeScheduledWrite (caminho scheduled + Defesa 2 D-67)"
  - phase: 07-01
    provides: "motor de 2 pesos + flag published consumido em recommendForProduct"
provides:
  - "Regime diário que INGERE, CALCULA e GRAVA automaticamente (muda D-47 -> D-61/D-68)"
  - "Kill switch operacional resolveWriteEnabled (D-62), default OFF (dry-run seguro)"
  - "Defesa 1 de integridade do snapshot evaluateSnapshotIntegrity (D-66)"
  - "Disjuntor churn/apagão puro tripBreaker + setsEqual (D-63)"
  - "Resumo diário via webhook notifyDailySummary (D-69)"
  - "Toggle WRITE_ENABLED/WRITE_OVERRIDE/FIRST_ROLLOUT no workflow do GitHub Actions"
affects: [07-06, 07-07, 07-08, rollout-supervisionado, operacao-diaria]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Quatro guardas em cadeia no orquestrador: kill switch -> Defesa 1 -> disjuntor -> Defesa 2"
    - "Módulo puro zero-import para lógica de decisão de batch (circuit-breaker.js)"
    - "Toggle operacional por env mapeado de vars.*/inputs do workflow (reuso do padrão MIN_SIZES_IN_STOCK)"

key-files:
  created:
    - app-partners-recomendados/src/review/circuit-breaker.js
    - app-partners-recomendados/src/review/circuit-breaker.test.js
  modified:
    - app-partners-recomendados/scripts/run-daily-job.js
    - app-partners-recomendados/scripts/run-daily-job.test.js
    - app-partners-recomendados/src/review/notify-failure.js
    - app-partners-recomendados/src/review/notify-failure.test.js
    - .github/workflows/daily-recompute.yml

key-decisions:
  - "Default OFF: ausência/valor inesperado de WRITE_ENABLED/WRITE_OVERRIDE => dry-run (A1/D-62)"
  - "Banda da Defesa 1 = 70% do total do último run bem-sucedido (à discrição D-66)"
  - "Limiares do disjuntor: churn 30% / apagão 10% (default D-63, ajustáveis por parâmetro)"
  - "Disjuntor mede o conjunto COMPLETO calculado (denominador correto), grava só os diffs (D-68)"
  - "previousSummary capturado ANTES da ingestão (o run recém-criado inutilizaria a banda)"

patterns-established:
  - "Cadeia de guardas fail-safe: cada uma aborta+notifica antes de escrita perigosa"
  - "tripBreaker/setsEqual puros e unit-testáveis; integração testada com client stubado (sem rede)"

requirements-completed: [RULE-03, FEED-01, APRV-03, WRTE-04, WRTE-05]

# Metrics
duration: ~25min
completed: 2026-07-22
status: complete
---

# Fase 7 Plano 05: Rollout do motor no regime diário (escrita automática guardada) Summary

**Job diário passa a ingerir/calcular/gravar automaticamente (D-61/D-68), cercado por kill switch (D-62), Defesa 1 de integridade (D-66), disjuntor churn/apagão (D-63) e Defesa 2 referencial (D-67), com resumo diário via webhook (D-69) — sem nenhum write de rede real nos testes.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-07-22T07:44:00Z (aprox.)
- **Completed:** 2026-07-22T08:09:00Z (aprox.)
- **Tasks:** 3 (todas TDD: RED -> GREEN)
- **Files modified:** 7 (2 criados, 5 modificados)

## Accomplishments
- **Kill switch (D-62):** `resolveWriteEnabled()` — `WRITE_OVERRIDE` (input do dispatch) tem prioridade; ausente/valor inesperado => `false` (dry-run seguro). Default OFF provado por teste.
- **Defesa 1 (D-66):** `evaluateSnapshotIntegrity()` aborta a escrita se alguma categoria voltar com 0 produtos, se o snapshot vier vazio, ou se o total cair abaixo de 70% do último run — notifica e retorna `aborted: 'integrity'` sem tocar a loja.
- **Disjuntor (D-63):** `circuit-breaker.js` puro (zero-import): `tripBreaker` dispara em churn>30% ou apagão>10%; 1º rollout (`FIRST_ROLLOUT`) isento. Trip + pass provados.
- **Escrita automática (D-61/D-68):** `runDailyJob` monta o conjunto elegível (grade+visível, D-54), roteia por `executeScheduledWrite` com `snapshotById` (Defesa 2, D-67) e `dryRun` do kill switch, gravando só os com diff real.
- **Resumo diário (D-69):** `notifyDailySummary` reusa o webhook (degrada sem config, nunca lança, sem credencial).
- **Workflow (D-62):** inputs `write`/`first_rollout` + env `WRITE_ENABLED`/`WRITE_OVERRIDE`/`FIRST_ROLLOUT`; cron/commit-back/MIN_SIZES_IN_STOCK inalterados.

## Task Commits

1. **Task 1: Kill switch resolveWriteEnabled + toggle no workflow (D-62)** - `2ac3f8d` (feat)
2. **Task 2: Defesa 1 integridade (D-66) + disjuntor churn/apagão (D-63)** - `3a70f2e` (feat)
3. **Task 3: Escrita automática (D-61/D-68) + Defesa 2 wiring (D-67) + resumo (D-69)** - `0d69a81` (feat)

_Nota: TDD conduzido RED->GREEN dentro de cada commit de task (test+impl atômicos, tree principal sequencial)._

## Files Created/Modified
- `src/review/circuit-breaker.js` (novo) - `tripBreaker` + `setsEqual` puros, zero-import (D-63)
- `src/review/circuit-breaker.test.js` (novo) - 11 testes de churn/apagão/isenção/limiares
- `scripts/run-daily-job.js` - `resolveWriteEnabled`, `evaluateSnapshotIntegrity`, cadeia de guardas + escrita scheduled + resumo
- `scripts/run-daily-job.test.js` - kill switch, Defesa 1 (pura + integração), roteamento de escrita, disjuntor
- `src/review/notify-failure.js` - `notifyDailySummary` (D-69)
- `src/review/notify-failure.test.js` - 3 testes de resumo (degrada/fetch único/nunca lança)
- `.github/workflows/daily-recompute.yml` - inputs + env do kill switch (D-62)

## Decisions Made
- **Banda da Defesa 1 = 70%** do total do último run bem-sucedido (D-66, discricionário) — documentado em `MIN_SNAPSHOT_BAND_RATIO`.
- **Denominador do disjuntor = conjunto COMPLETO calculado**, não só os diffs. Passar apenas os diffs tornaria o churn sempre ~100%; o disjuntor precisa medir a fração do catálogo que muda. Os writes, porém, iteram só os diffs (D-68).
- **`previousSummary` capturado ANTES de `runIngestion`** — após a ingestão, `getLastSuccessfulIngestionRunSummary` já apontaria para o run de hoje, quebrando a banda.
- **Fila de aprovação preservada** como histórico/verificação opcional (não é mais gate de escrita).

## Deviations from Plan

Nenhum desvio comportamental. Uma clarificação de design (documentada, não um desvio de escopo):

**Semântica de `toWrite` no disjuntor.** O plano nomeia `toWrite` ora como "conjunto só-diff" (para escrita, D-68), ora como o conjunto passado ao `tripBreaker`. Interpretei-os como conceitos distintos: `tripBreaker` recebe o **conjunto completo calculado** (denominador correto de churn/apagão), enquanto o **loop de escrita** filtra só os diffs. Sem isso, o churn seria sempre ~100% e o disjuntor dispararia em todo run. Nenhuma mudança de comportamento externo; apenas a interpretação correta da métrica.

**Estratégia de teste da banda (Defesa 1).** Como o guard de idempotência diária impede semear um "run anterior" de hoje, o teste de banda integra via uma conexão raw ao SQLite temporário inserindo um run bem-sucedido de ONTEM (`seedBackdatedSuccessfulRun`) — real, sem mockar o `catalog-store` (mocká-lo parcialmente quebrava o ciclo de vida da conexão singleton no Windows). O mesmo padrão semeia `write_log` para o teste de apagão intencional (`seedBackdatedProductWriteLog`).

---

**Total deviations:** 0 comportamentais / 2 clarificações de design documentadas.
**Impact on plan:** Nenhum scope creep. Guardas implementadas e provadas exatamente como especificado.

## Issues Encountered
- **Mock parcial do `catalog-store` quebrou o DB (`The database connection is not open`)** — `importOriginal` em cache mantinha a conexão fechada após o `closeDbForTests` de um teste anterior. Resolvido removendo o mock e injetando o "run anterior" via conexão raw backdated (mais fiel à integração real).
- **`makeProduct` sem `published`** fazia o snapshot gravar `published=0` (=> `false`), zerando as recomendações (fonte oculta). Ajustado o fixture para `published:true` por padrão + parâmetros `published`/`inStock`.

## Known Stubs
Nenhum. Scan por TODO/FIXME/placeholder nos arquivos entregues: limpo.

## Threat Flags
Nenhuma superfície nova além do previsto no `<threat_model>` do plano (T-07-13..T-07-17, T-07-22). O kill switch default-OFF, a Defesa 1 e o disjuntor mitigam T-07-13/14/15; `notifyDailySummary` não vaza credencial (T-07-16).

## User Setup Required
**Configuração externa necessária no GitHub (D-62):**
- Criar a repository variable `WRITE_ENABLED` em Settings > Secrets and variables > Actions > Variables. Ausente ou `false` => dry-run (o cron calcula e loga, NÃO grava). `true` => escrita real do regime diário.
- Confirmar `WRITE_FAILURE_WEBHOOK_URL` configurado para o disjuntor/Defesa 1/resumo notificarem (senão degradam para log local).
- **Pendência de segurança (STATE.md/T-07-22):** regenerar `NUVEMSHOP_ACCESS_TOKEN` no Partners Portal antes de habilitar a escrita real.

## Next Phase Readiness
- Regime automático de escrita pronto e guardado; falta apenas o 1º rollout supervisionado (D-64, Plano 07-08): dry-run real via `workflow_dispatch` (write=false, first_rollout=true), conferir cobertura + `/audit`, então ligar `WRITE_ENABLED`.
- Suíte completa verde: 224 testes (17->18 arquivos, +31 testes desta fase).

## Self-Check: PASSED
- Arquivos criados existem: `circuit-breaker.js`, `circuit-breaker.test.js` (FOUND)
- Commits existem: `2ac3f8d`, `3a70f2e`, `0d69a81` (FOUND)
- `npx vitest run` completo: 224/224 verde; comando de verificação do plano: 39/39 verde
- `circuit-breaker.js` zero-import: 0 (OK)

---
*Phase: 07-rollout-do-motor-no-catalogo-completo-todas-as-categorias-em*
*Completed: 2026-07-22*
