---
phase: 6
slug: opera-o-di-ria-aut-noma-na-nuvem
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-17
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.10 (já configurado, `npm test` → `vitest run`) |
| **Config file** | nenhum arquivo `vitest.config.*` dedicado — usa defaults do vitest (ambiente `node`), consistente com os 15 arquivos de teste já existentes |
| **Quick run command** | `npm test -- <arquivo>.test.js` (dentro de `app-partners-recomendados/`) |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~4-8 segundos (144 testes hoje) |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- <arquivo tocado>.test.js`
- **After every plan wave:** Run `npm test` (suite completa)
- **Before `/gsd-verify-work`:** Full suite must be green, mais verificação comportamental manual (D-51) e confirmação real de execução agendada (Open Question 1)
- **Max feedback latency:** ~8 segundos

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 06-XX-XX | TBD | TBD | RULE-03 | T-06-XX | `getSuccessfulRunForToday()` retorna null antes de qualquer run bem-sucedido hoje, run_id depois | unit | `npx vitest run src/db/catalog-store.test.js` | ❌ W0 | ⬜ pending |
| 06-XX-XX | TBD | TBD | FEED-01/SC#2 | T-06-XX | Rodar o job duas vezes no mesmo dia não cria segundo run_id nem duplica approval_queue | integration | `npx vitest run scripts/run-daily-job.test.js` | ❌ W0 | ⬜ pending |
| 06-XX-XX | TBD | TBD | FEED-01 | T-06-XX | `seedPendingApprovalQueue` nunca sobrescreve linha approved/rejected existente | unit | `npx vitest run src/db/catalog-store.test.js` | ❌ W0 | ⬜ pending |
| 06-XX-XX | TBD | TBD | RULE-03/D-45 | T-06-XX | `checkpointAndCloseDb()` não lança, arquivo .db reflete escritas do WAL | unit | `npx vitest run src/db/catalog-store.test.js` | ❌ W0 | ⬜ pending |
| 06-XX-XX | TBD | TBD | FRNT-02 | T-06-XX | Cache TTL 24h: hit dentro do TTL, miss fora, miss storage vazio/corrompido, degrada se storage lança | unit | `npx vitest run storefront-script/main.test.js` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Planejador preenche Task ID/Plan/Wave/Threat Ref exatos ao gerar os PLAN.md.*

---

## Wave 0 Requirements

- [ ] `src/db/catalog-store.test.js` — adicionar casos para `getSuccessfulRunForToday`, `seedPendingApprovalQueue`, `checkpointAndCloseDb`
- [ ] `scripts/run-daily-job.test.js` — novo arquivo, testa o orquestrador completo (guard + ingestão contra banco de teste isolado, padrão `CATALOG_DB_DIR` da Fase 5)
- [ ] `storefront-script/main.test.js` — novo arquivo, primeiro teste automatizado deste script (funções puras de cache via storage fake injetado, sem jsdom)
- Framework install: nenhum — vitest já instalado e configurado

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Zero chamadas de rede na segunda visualização dentro da mesma sessão | FRNT-02/SC#4 | Verificação comportamental via dev tools/network tab, não automatizável (D-51) | Abrir a página do produto, navegar, reabrir a mesma página na mesma sessão e confirmar 0 chamadas novas a `/api/recommendations/:productId` no Network tab |
| Motor roda no agendamento sem intervenção manual | RULE-03/SC#1 | Requer aguardar/disparar o cron real no GitHub Actions e observar a execução | Após deploy do workflow, disparar via `workflow_dispatch` ou aguardar o horário agendado; confirmar no log do Actions que o job completou e o commit-back aconteceu |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
