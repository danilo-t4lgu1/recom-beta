# Phase 7: Rollout do motor no catálogo completo — validação de cobertura e re-gravação recorrente - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-21
**Phase:** 7-rollout-do-motor-no-catalogo-completo-todas-as-categorias-em
**Areas discussed:** Escopo de categorias, O que é cobertura, Aprovar escala, Re-gravação (+ produtos ocultos, backup/rollback, defesas contra dados inconsistentes)

---

## Escopo de categorias

| Option | Description | Selected |
|--------|-------------|----------|
| As 11 da taxonomia | Exatamente as 11 categorias mapeadas para grupo (D-26) | ✓ |
| Todas as categorias vivas | Descobrir dinamicamente todas as categorias da loja | |
| Preciso ver a lista | Ver categorias e contagens antes de decidir | |

**User's choice:** As 11 da taxonomia (D-53).
**Notes:** Sub-decisão — produtos-fonte: só os **com estoque** recebem vitrine (D-54), coerente com "todas as categorias em estoque" do título.

---

## O que é cobertura

| Option | Description | Selected |
|--------|-------------|----------|
| Relatório diagnóstico | Relatório por produto com motivo dos zerados | |
| Só número global | Um agregado no log | |
| Relatório + reprocesso | Diagnóstico + caminho para corrigir lacunas | ✓ |

**User's choice:** Relatório + reprocesso (D-60).
**Notes:** O usuário introduziu o **modelo de 2 pesos** do motor (E+C+T prioritário → E+C backfill, piso E+C; D-55), mantendo **D-13** (D-56), com cor sempre obrigatória e Look Inteiro auto-contido (D-57). Cobertura **sem % fixo** (D-59). Modelo substitui/generaliza o override de 2026-07-17 e altera `recommendation-engine.js` (RULE-01).

---

## Aprovar escala → mudança de modelo (Opção B)

| Option | Description | Selected |
|--------|-------------|----------|
| A — Manter portão sem fricção | Motor calcula → aprovação em lote → grava | |
| B — Grava e depois confere | Motor grava automático; painel = verificação pós-escrita | ✓ |

**User's choice:** Opção B (D-61) — escrita automática, sem portão prévio.
**Notes:** Decisão deliberada, ciente de que **reverte a constraint permanente** do PROJECT.md e o APRV-03, e muda o D-47. Racional: motor determinístico se retroalimenta, não precisa de verificação constante. Pediu mecanismo de desligamento: kill switch reusando dry-run (D-62) + disjuntor automático (D-63, default >30% churn / >10% apagão, 1º rollout isento). 1º rollout supervisionado (D-64). Rollback em lote + correção CR-01 (D-65).

---

## Produtos ocultos (bug real levantado pelo usuário)

**User's input:** Produtos "Ocultos" (não visíveis na loja) estão sendo incluídos no bloco; clicar no link dá **404**. Devem ser excluídos enquanto ocultos; ao voltarem a "Visível", atendendo Cor + Estoque, são elegíveis de novo.
**Outcome:** Confirmado por inspeção que não há filtro de visibilidade no código. Registrado como D-58 — visibilidade vira critério de elegibilidade (candidato e fonte), lida na ingestão (`published`), persistida, consumida pelo motor puro.

---

## Backup / risco de layout

**User's question:** As mudanças no motor podem comprometer o layout/CSS? Precisa de backup para reverter?
**Outcome:** Motor é desacoplado da apresentação (dado vs. visual) — não há risco de quebrar layout/CSS; a fase não toca o script do storefront. Backup dos dados já existe (`write_log`/rollback, Fase 5); a fase adiciona rollback em lote e corrige CR-01 (D-65).

---

## Defesas contra dados inconsistentes

**User's request:** Incluir resumo diário (bônus) + 2 defesas contra dados inconsistentes.
**Outcome:** Resumo diário via webhook (D-69). Defesa 1 — guard de integridade do snapshot antes de gravar (D-66). Defesa 2 — validação referencial no momento da escrita (D-67).

---

## Princípio-guia

**User's framing:** Deixar o backend pronto e refinado para validação em loja real / catálogo completo, reaproveitável integralmente na migração NubeSDK; descartar o desnecessário do v.Alpha.
**Outcome:** Registrado como D-70.

## Claude's Discretion

- Limiar exato do disjuntor (default proposto, usuário ajusta) — D-63.
- Mecanismo exato do toggle no GitHub para o kill switch — D-62.
- Formato/localização do relatório de cobertura — D-60.
- Design do rollback em lote — D-65.
- Nome/semântica exatos do campo de visibilidade na API — D-58.

## Deferred Ideas

- Reconstrução do Script em NubeSDK (D-11) — aguarda tema Morelia.
- Migração do painel para a nuvem com auth (D-49).
- Categorias fora das 11 da taxonomia.
