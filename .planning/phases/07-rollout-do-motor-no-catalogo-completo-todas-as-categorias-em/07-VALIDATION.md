---
phase: 7
slug: rollout-do-motor-no-catalogo-completo-todas-as-categorias-em
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-21
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^4.1.10 (confirmado em `app-partners-recomendados/package.json`) |
| **Config file** | none — usa os defaults do vitest (`npm test` = `vitest run`) |
| **Quick run command** | `cd app-partners-recomendados && npx vitest run <arquivo alvo>` |
| **Full suite command** | `cd app-partners-recomendados && npm test` |
| **Estimated runtime** | ~15 segundos (suíte completa; 64+ testes verdes hoje) |

---

## Sampling Rate

- **After every task commit:** Run `cd app-partners-recomendados && npx vitest run <arquivo alvo>` (o comando quick do módulo tocado)
- **After every plan wave:** Run `cd app-partners-recomendados && npm test`
- **Before `/gsd-verify-work`:** Full suite verde **e** um dry-run real do job (D-64) conferido pelo relatório de cobertura + `GET /audit` antes de habilitar a escrita (Plano 07-08)
- **Max feedback latency:** ~15 segundos

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 7-01-01 | 01 | 1 | RULE-01, RULE-02 | T-07-02 / T-07-03 | Modelo de 2 pesos; motor permanece zero-import (grep `^import` == 0), zero-I/O | unit | `cd app-partners-recomendados && npx vitest run src/recommendation/recommendation-engine.test.js` | ✅ (existente, atualizado) | ⬜ pending |
| 7-01-02 | 01 | 1 | RULE-01 | T-07-01 / T-07-02 | Candidato/fonte `published === false` excluído; `null`/`undefined` NÃO-oculto (Pitfall 2) | unit | `cd app-partners-recomendados && npx vitest run src/recommendation/recommendation-engine.test.js` | ✅ (novos casos no arquivo existente) | ⬜ pending |
| 7-02-01 | 02 | 1 | PLAT-02, RULE-02 | T-07-04 | Migração idempotente `ALTER TABLE` não corrompe o DB real; `published` tri-estado (true/false/null) | unit | `cd app-partners-recomendados && npx vitest run src/db/catalog-store.test.js` | ✅ (existente, estendido) | ⬜ pending |
| 7-02-02 | 02 | 1 | RULE-03 | T-07-06 | Baseline de conjunto vem de `write_log` (último `written_value` success), nunca `recommendation_baseline` singular | unit | `cd app-partners-recomendados && npx vitest run src/db/catalog-store.test.js` | ✅ (existente, estendido) | ⬜ pending |
| 7-02-03 | 02 | 1 | PLAT-02 | T-07-05 | Ingere todos os produtos sem filtro `?published=true`; SQL só com params nomeados (V5) | unit | `cd app-partners-recomendados && npx vitest run src/ingestion/ingest-catalog.test.js` | ✅ (existente, estendido) | ⬜ pending |
| 7-03-01 | 03 | 1 | APRV-03, WRTE-02 | T-07-07 | Defesa 2 descarta id oculto/sem estoque/cor errada antes de gravar (D-67) | unit | `cd app-partners-recomendados && npx vitest run src/review/write-executor.test.js` | ✅ (existente, estendido) | ⬜ pending |
| 7-03-02 | 03 | 1 | APRV-03, WRTE-04 | T-07-08 / T-07-09 | Caminho `scheduled` grava sem gate, `triggered_by:'scheduled'`; gate manual (APRV-03) preservado | unit | `cd app-partners-recomendados && npx vitest run src/review/write-executor.test.js` | ✅ (existente, estendido) | ⬜ pending |
| 7-04-01 | 04 | 1 | WRTE-03 | T-07-10 | CR-01: rollback duplo sobre Metafield deletado NÃO lança; recria via `createMetafield` | unit | `cd app-partners-recomendados && npx vitest run scripts/rollback.test.js` | TDD (Test 7 novo no arquivo existente) | ⬜ pending |
| 7-04-02 | 04 | 1 | WRTE-03 | T-07-11 / T-07-12 | Rollback em lote agrega falhas sem abortar; `RollbackConflictError` (D-38) preservado | unit | `cd app-partners-recomendados && npx vitest run scripts/rollback-batch.test.js` | TDD (arquivo novo) | ⬜ pending |
| 7-05-01 | 05 | 2 | RULE-03, APRV-03 | T-07-15 | Kill switch: `WRITE_ENABLED` off (ou `WRITE_OVERRIDE=false`) → dry-run, zero escrita real (D-62) | unit | `cd app-partners-recomendados && npx vitest run scripts/run-daily-job.test.js` | TDD (arquivo novo) | ⬜ pending |
| 7-05-02 | 05 | 2 | WRTE-05, FEED-01 | T-07-13 / T-07-14 | Defesa 1 (categoria 0 / total fora da banda) aborta+notifica; disjuntor churn>30%/apagão>10%; 1º rollout isento | unit | `cd app-partners-recomendados && npx vitest run scripts/run-daily-job.test.js src/review/circuit-breaker.test.js` | TDD (`circuit-breaker` novo; `run-daily-job` novo) | ⬜ pending |
| 7-05-03 | 05 | 2 | FEED-01, WRTE-04, WRTE-05 | T-07-16 / T-07-17 / T-07-22 | Escrita `scheduled` só diff/elegível; resumo diário sem credencial no payload; WAL checkpoint | unit | `cd app-partners-recomendados && npx vitest run scripts/run-daily-job.test.js src/review/notify-failure.test.js` | ✅ (`notify-failure` existente) / TDD (`run-daily-job`) | ⬜ pending |
| 7-06-01 | 06 | 2 | RULE-01 | T-07-19 | `buildCoverageReport` puro: coberto = `recommendForProduct(...).length > 0`; zerada com motivo; reprocesso | unit | `cd app-partners-recomendados && npx vitest run src/report/coverage-report.test.js` | TDD (arquivo novo) | ⬜ pending |
| 7-06-02 | 06 | 2 | RULE-01 | T-07-18 | CLI read-only produz relatório contra o DB real; guard ESM (não executa ao importar) | smoke | `cd app-partners-recomendados && node scripts/coverage-report.js` | TDD (arquivo novo) | ⬜ pending |
| 7-07-01 | 07 | 3 | APRV-03 | T-07-20 | PROJECT.md/REQUIREMENTS.md refletem a reversão (D-61); redação histórica preservada | doc | `grep -c 'D-61' .planning/PROJECT.md && grep -c 'D-61' .planning/REQUIREMENTS.md` | N/A (doc) | ⬜ pending |
| 7-07-02 | 07 | 3 | RULE-03 | T-07-21 | Protótipos `_batch-write.js`/`_scope.js` removidos; suíte completa verde | integration | `cd app-partners-recomendados && npm test` | N/A (remoção) | ⬜ pending |
| 7-08-01 | 08 | 4 | APRV-03 | T-07-22 | Pré-condição: token vazado regenerado no Partners Portal + secret/webhook/`WRITE_ENABLED` no CI | manual | (manual — ver Manual-Only) | N/A (checkpoint) | ⬜ pending |
| 7-08-02 | 08 | 4 | RULE-01 | T-07-23 | Run inicial em DRY-RUN das 11 categorias (kill switch off, `FIRST_ROLLOUT`) + relatório de cobertura; zero escrita real | smoke | `cd app-partners-recomendados && node scripts/coverage-report.js` | TDD (depende 07-06) | ⬜ pending |
| 7-08-03 | 08 | 4 | RULE-01, APRV-03 | T-07-23 | Conferência humana: relatório de cobertura (07-06) + `GET /audit` (Fase 5) antes de habilitar | manual | (manual — ver Manual-Only) | N/A (checkpoint) | ⬜ pending |
| 7-08-04 | 08 | 4 | APRV-03 | T-07-23 / T-07-24 | Habilitar escrita real do run inicial (disjuntor isento via `FIRST_ROLLOUT` não-persistente); conferir `/audit` pós-escrita | manual | (manual — ver Manual-Only) | N/A (checkpoint) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Legenda de File Exists: **✅** = arquivo de teste já existe (estendido/atualizado); **TDD** = arquivo de teste criado test-first dentro da própria tarefa (todas as tarefas de código são `tdd="true"`, RED→GREEN); **N/A** = tarefa doc/remoção/checkpoint sem teste unitário. Não há referência MISSING que exija uma tarefa Wave 0 separada — cada tarefa de código cria seu próprio teste antes da implementação.*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

- vitest ^4.1.10 já instalado e validado (64+ testes verdes nas Fases 2–6); `npm test` = `vitest run`, sem config dedicada.
- Nenhuma dependência nova é instalada nesta fase (RESEARCH §Standard Stack / §Package Legitimacy Audit: N/A).
- Os arquivos de teste novos (`rollback-batch.test.js`, `run-daily-job.test.js`, `circuit-breaker.test.js`, `coverage-report.test.js`) e os casos novos em arquivos existentes são criados **test-first dentro de cada tarefa TDD** — não são um bloqueio de Wave 0 separado, pois o framework e os fixtures já existem.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Pré-condição de segurança do rollout (D-64) | APRV-03 | Regenerar o token no Partners Portal não tem CLI; secret/variable vivem na UI do GitHub | Regenerar `NUVEMSHOP_ACCESS_TOKEN` no Partners Portal → atualizar o secret no GitHub → confirmar `WRITE_FAILURE_WEBHOOK_URL` → confirmar/criar `vars.WRITE_ENABLED` |
| Conferência do 1º rollout supervisionado (D-64) | RULE-01, APRV-03 | Requer loja real + julgamento humano sobre a cobertura | dry-run → conferir relatório de cobertura (`coverage-report.js`) + `GET /audit` → autorizar a escrita real |
| Habilitar a escrita real do run inicial (D-64/D-63) | APRV-03 | Toggle vive no CI; disjuntor isento via `FIRST_ROLLOUT` exige supervisão | disparar `workflow_dispatch` com `write=true` + `first_rollout=true` → conferir `/audit` pós-escrita → confirmar volta do disjuntor ao regime diário |
| Kill switch no GitHub Actions (D-62) | RULE-03 | Toggle vive no ambiente do CI | alternar `vars.WRITE_ENABLED`, disparar run, confirmar que não gravou |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (tarefas de código são TDD e criam o teste test-first; tarefas manuais do Plano 07-08 estão documentadas em Manual-Only)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (as tarefas manuais de 07-08 não excedem 2 consecutivas; 7-08-02 tem verify automatizado entre elas)
- [x] Wave 0 covers all MISSING references (criação test-first em cada tarefa TDD; framework + fixtures já presentes)
- [x] No watch-mode flags (todos os comandos usam `vitest run`, nunca `vitest --watch`)
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved — 2026-07-21
