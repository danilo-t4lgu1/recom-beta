---
status: testing
phase: 06-opera-o-di-ria-aut-noma-na-nuvem
source: [06-VERIFICATION.md]
started: 2026-07-17T11:25:00Z
updated: 2026-07-17T11:25:00Z
---

## Current Test

number: 1
name: Execução real do workflow agendado na nuvem (RULE-03/SC#1)
expected: |
  Job completa com sucesso (ingestão + fila de aprovação + commit-back de data/catalog.db),
  sem intervenção manual além do disparo, comprovando RULE-03/SC#1 na infraestrutura real.
awaiting: user response

## Tests

### 1. Execução real do workflow agendado na nuvem (RULE-03/SC#1)
expected: Disparar o workflow .github/workflows/daily-recompute.yml via workflow_dispatch na aba Actions de github.com/danilo-t4lgu1/recom-beta e observar o log completo. Job completa com sucesso (ingestão + fila de aprovação + commit-back de data/catalog.db), sem intervenção manual além do disparo.
result: [pending]

### 2. Cache local do Script — zero fetch em cache hit (FRNT-02/SC#4)
expected: Abrir a página de um produto real, navegar e reabrir a mesma página na mesma sessão do navegador; inspecionar DevTools > Network. Zero chamadas novas a /api/recommendations/:productId na segunda visualização.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
