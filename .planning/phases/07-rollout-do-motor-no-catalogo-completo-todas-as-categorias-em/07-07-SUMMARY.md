---
phase: 07-rollout-do-motor-no-catalogo-completo-todas-as-categorias-em
plan: 07
subsystem: docs
tags: [project-docs, requirements, decision-log, cleanup, D-61, D-47, D-70]

# Dependency graph
requires:
  - phase: 07-03
    provides: caminho scheduled de escrita sem gate (executeScheduledWrite)
  - phase: 07-05
    provides: rollback em lote + write_log/auditoria (rede de segurança da Opção B)
provides:
  - "PROJECT.md formaliza a Opção B (D-61): reversão da constraint de aprovação prévia para o caminho automático"
  - "REQUIREMENTS.md registra APRV-03 revertido no caminho automático e D-47 alterado (job diário calcula E grava)"
  - "Princípio-guia D-70 registrado (backend reaproveitável na migração NubeSDK)"
  - "Protótipos temporários _batch-write.js e _scope.js removidos do repositório"
affects: [08-app-de-vitrine, futuras-fases-de-operacao-diaria, milestone-audit]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Redação histórica preservada riscada (strikethrough) ao reverter constraints — rastreabilidade sem apagar decisão anterior"

key-files:
  created:
    - .planning/phases/07-rollout-do-motor-no-catalogo-completo-todas-as-categorias-em/07-07-SUMMARY.md
  modified:
    - .planning/PROJECT.md
    - .planning/REQUIREMENTS.md
  deleted:
    - app-partners-recomendados/scripts/_batch-write.js
    - app-partners-recomendados/scripts/_scope.js

key-decisions:
  - "D-61: motor grava automaticamente sem portão prévio (Opção B); aposenta gate do APRV-03 no caminho automático e altera D-47"
  - "D-70: refinar backend para reaproveitamento total na migração NubeSDK; nada acopla lógica de negócio à apresentação"
  - "Preservar toda a evolução da Fase 05 em PROJECT.md; adicionar a formalização D-61 por cima via edições pontuais"

patterns-established:
  - "Reversão de constraint documentada com strikethrough + nota de reversão citando a decisão (D-61) e a data — mantém a redação original auditável"

requirements-completed: [APRV-03, RULE-03]

# Metrics
duration: 3min
completed: 2026-07-22
status: complete
---

# Phase 07 Plan 07: Formalização da Opção B (D-61) e limpeza de protótipos (D-70) Summary

**PROJECT.md e REQUIREMENTS.md passam a refletir a escrita automática sem portão prévio (Opção B, D-61) — reversão da constraint de aprovação prévia no caminho automático, aposentamento do gate do APRV-03 e alteração do D-47 — com redação histórica preservada; protótipos `_batch-write.js`/`_scope.js` removidos (D-70).**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-07-22T11:22:09Z
- **Completed:** 2026-07-22T11:24:36Z
- **Tasks:** 2
- **Files modified:** 2 editados + 2 removidos

## Accomplishments
- PROJECT.md: §Constraints (item de segurança), §Out of Scope ("Escrita automática sem aprovação humana") e §Key Decisions (novas linhas D-61 e D-70) atualizados para a Opção B, com toda a evolução prévia da Fase 05 preservada intacta.
- REQUIREMENTS.md: APRV-03 anotado como portão prévio revertido para o caminho automático (painel/`GET /audit` vira verificação PÓS-escrita), item de "Escrita totalmente automática" saiu de Out of Scope, linha de Traceability e footer atualizados — redações originais mantidas riscadas para rastreabilidade.
- Protótipos temporários `scripts/_batch-write.js` e `scripts/_scope.js` removidos do disco (untracked), substituídos pelo caminho `scheduled` (07-03/07-05) e pelo relatório de cobertura (07-06). Nenhum `require`/`import` de código-fonte permanente dependia deles.

## Task Commits

Nenhum commit de código foi criado — este plano é documentação/limpeza e o projeto tem `commit_docs: false` com `.planning/` gitignorado. O trabalho vive **no disco**, conforme instruído.

1. **Task 1: Atualizar PROJECT.md e REQUIREMENTS.md para a Opção B (D-61/D-47)** — edições on-disk (sem commit; ver Deviations/commit_docs).
2. **Task 2: Remover protótipos _batch-write.js e _scope.js (D-70)** — remoção de arquivos untracked (nada para o git commitar).

**Plan metadata:** commit pulado (esperado — `commit_docs: false` + `.planning/` gitignorado).

## Files Created/Modified
- `.planning/PROJECT.md` — reversão da constraint de segurança para o caminho automático (D-61); ajuste do item de Out of Scope; novas linhas de Key Decisions D-61 e D-70; footer atualizado. (Arquivo é tracked-mas-ignorado; editado no disco.)
- `.planning/REQUIREMENTS.md` — APRV-03 anotado (gate prévio revertido no caminho automático), item de Out of Scope revisto, Traceability e footer atualizados. (Untracked/ignorado; editado no disco.)
- `app-partners-recomendados/scripts/_batch-write.js` — REMOVIDO (protótipo untracked, substituído por `executeScheduledWrite`/`rollback-batch`).
- `app-partners-recomendados/scripts/_scope.js` — REMOVIDO (protótipo untracked, substituído por `coverage-report.js`).

## Decisions Made
- Seguido o plano como especificado. Preservada integralmente a evolução da Fase 05 no PROJECT.md e adicionada a formalização D-61 por cima com edições pontuais (nunca reescrita total).
- Reversões documentadas com strikethrough + nota de reversão citando D-61 e a data (2026-07-21) — mantém a decisão original auditável em vez de apagá-la.

## Deviations from Plan

### Notas de escopo (não são auto-fixes)

**1. Suíte `npm test` (acceptance de Task 2) não executada — por diretiva do orquestrador**
- **Contexto:** O acceptance criteria de Task 2 sugere `cd app-partners-recomendados && npm test`. A instrução do orquestrador (`scope_precision`) é explícita: "Do NOT run the app or any write path."
- **Racional:** A remoção afeta apenas dois arquivos untracked que **nenhum** módulo de código-fonte permanente importa (verificado: 0 matches para `require(...)/import ... (_batch-write|_scope)`). Portanto a deleção não pode alterar o resultado da suíte. Executar a suíte era desnecessário e potencialmente conflitante com a diretiva de não rodar. Optou-se por honrar a diretiva do orquestrador (autoridade superior ao plano).

**2. Referências textuais remanescentes aos protótipos são comentários históricos — deixadas intactas por escopo**
- **Contexto:** `src/review/write-executor.js`, `src/review/write-executor.test.js`, `scripts/coverage-report.js` e `src/report/coverage-report.js` ainda mencionam `_batch-write.js`/`_scope.js` em **comentários** (ex.: "Anti-Pattern do protótipo", "removido no Plano 07-07").
- **Racional:** São notas de documentação intencionais (não `require`/`import`). `scope_precision` proíbe tocar esses arquivos ("LEAVE ALONE ... source/test code"). O critério estrito de grep-por-nome casaria com esses comentários, mas o intento real do plano (nenhuma dependência de código) está satisfeito. Deixados intactos.

---

**Total deviations:** 0 auto-fixes (Regras 1-4). 2 notas de escopo documentadas acima.
**Impact on plan:** Objetivos e success criteria atingidos integralmente. Sem scope creep.

## Issues Encountered
- Descoberta de ambiente: `.gitignore` linha 1 ignora `.planning/` inteiro. `PROJECT.md` é tracked-mas-ignorado (commitado antes do gitignore); `REQUIREMENTS.md`/`ROADMAP.md`/`STATE.md` são untracked. Com `commit_docs: false`, isto é exatamente o comportamento esperado: as edições permanecem no disco e o helper de commit reporta skipped/nothing-to-commit. Não é falha.

## User Setup Required
None — nenhuma configuração de serviço externo requerida.

## Next Phase Readiness
- Documentação de projeto coerente com o código da Opção B (caminho `scheduled` sem gate de 07-03/07-05). Sem constraint revertida descrita como permanente.
- Débito de protótipo eliminado. Pronto para o Plano 07-08 e para futuras auditorias de milestone.

## Self-Check: PASSED

Verificações executadas:
- `grep -c 'D-61' .planning/PROJECT.md` = 4 (>= 1) ✓
- `grep -c 'D-70' .planning/PROJECT.md` = 2 (>= 1) ✓
- `grep -c 'D-61' .planning/REQUIREMENTS.md` = 4 (>= 1) ✓
- `test ! -f app-partners-recomendados/scripts/_batch-write.js` → removido ✓
- `test ! -f app-partners-recomendados/scripts/_scope.js` → removido ✓
- Nenhum `require`/`import` de `_batch-write`/`_scope` em código-fonte (0 matches) ✓
- SUMMARY.md criado neste caminho ✓

**Nota sobre commits:** esperado skip / nothing-to-commit — `commit_docs: false` e `.planning/` gitignorado. As edições e remoções estão no disco (fonte de verdade), não em novos commits.

---
*Phase: 07-rollout-do-motor-no-catalogo-completo-todas-as-categorias-em*
*Completed: 2026-07-22*
