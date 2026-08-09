---
phase: 05
slug: grava-o-segura-em-produ-o
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-16
---

# Phase 05 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.10 |
| **Config file** | none — automatic discovery of `*.test.js` (same pattern as Phases 1-4) |
| **Quick run command** | `npx vitest run <changed-file>.test.js` |
| **Full suite command** | `npm test` (= `vitest run`) |
| **Estimated runtime** | ~5 seconds (current suite grows by ~4 new test files this phase) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run <changed-file>.test.js`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green, including a manual real-store confirmation (SC#1/SC#2)
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

*Task/Plan/Wave columns are TBD — this table is seeded pre-planning from RESEARCH.md's requirement-level test map. The planner assigns concrete task/plan/wave IDs and threat refs (`<threat_model>`, security contribution active) when PLAN.md files are created.*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | WRTE-02 | — | `findMetafield`/`updateMetafield`/`deleteMetafield` chamam a URL/verbo corretos (fetch mockado); nunca assumem upsert por POST (Pitfall 1) | unit | `npx vitest run src/nuvemshop-client/client.test.js` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | WRTE-02 | — | `previous_value` capturado via `findMetafield` ANTES do write real; `written_value` grava `JSON.stringify(approvedIds)` (D-43) | unit | `npx vitest run src/review/write-executor.test.js` | ❌ W0 (extend) | ⬜ pending |
| TBD | TBD | TBD | WRTE-03 | T-05-{tampering} | Rollback restaura só quando valor atual bate com `written_value`; aborta com `RollbackConflictError` caso contrário (D-38, nunca sobrescreve silenciosamente) | unit | `npx vitest run scripts/rollback.test.js` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | WRTE-03 | — | Rollback bem-sucedido insere linha `write_log` com `triggered_by: 'rollback'` (D-44), visível em `GET /audit` | unit + integration | `npx vitest run scripts/rollback.test.js` e `npx vitest run src/review-server.test.js` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | WRTE-04 | — | `insertWriteLog`/`getLastSuccessfulWriteLog`/`listWriteLog` persistem/leem corretamente; falhas reais também geram linha `status: 'failed'` (nunca só sucesso) | unit | `npx vitest run src/db/catalog-store.test.js` | ❌ W0 (extend) | ⬜ pending |
| TBD | TBD | TBD | WRTE-04 | T-05-{information-disclosure} | `GET /audit` renderiza lista cronológica (mais recente primeiro, D-42), sem token/segredo interpolado, `escapeHtml` aplicado a valores dinâmicos | integration | `npx vitest run src/review-server.test.js` | ❌ W0 (extend) | ⬜ pending |
| TBD | TBD | TBD | WRTE-05 | T-05-{repudiation} | Exceção forçada no caminho real de escrita dispara `fetch` para `WRITE_FAILURE_WEBHOOK_URL` com payload `{text, content, productId, error, timestamp}` | unit | `npx vitest run src/review/notify-failure.test.js` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | WRTE-05 | T-05-{denial-of-service} | Falha do próprio webhook (URL inválida/rede fora do ar) nunca propaga por cima do erro de escrita original (Pitfall 5); sem retry loop | unit | `npx vitest run src/review/notify-failure.test.js` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/nuvemshop-client/client.test.js` — módulo hoje SEM nenhum teste; cobre `findMetafield`/`updateMetafield`/`deleteMetafield` novos com `globalThis.fetch` stubado
- [ ] `scripts/rollback.test.js` — cobre `performRollback` extraída como função testável (D-38) e `RollbackConflictError`
- [ ] `src/review/notify-failure.test.js` — cobre `notifyWriteFailure`, incluindo "webhook não configurado" e "webhook responde erro"
- [ ] Extensões (não gaps de framework): `write-executor.test.js`, `catalog-store.test.js`, `review-server.test.js` já existem e seguem o mesmo padrão TDD — só precisam de casos novos para o comportamento desta fase

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|--------------------|
| Escrita real gravada e lida de volta idêntica na loja real | WRTE-02 (SC#1) | Requer chamada real contra a API pública da Nuvemshop com um produto de teste — endpoint de update (`PUT /metafields/{id}`) confirmado só via documentação nesta pesquisa, não testado ao vivo | Aprovar um produto de teste real, chamar `POST /review/:productId/write`, e confirmar via `getMetafields` que o valor gravado bate com o esperado |
| Rollback restaura o valor anterior e é confirmado por leitura direta na loja | WRTE-03 (SC#2) | Mesma razão acima — requer estado real da loja antes/depois do rollback, não apenas fixtures mockadas | Rodar `node scripts/rollback.js <productId>` após uma escrita real de teste e confirmar via `getMetafields` que o valor anterior foi restaurado |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
