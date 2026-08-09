# Phase 4: Preview e Aprovação Humana - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-14
**Phase:** 4-Preview e Aprovação Humana
**Areas discussed:** Curadoria manual, Escopo da fila, Unidade de aprovação
**Areas not selected (Claude's discretion):** Formato do diff

---

## Seleção de áreas

| Área | Discutida |
|------|-----------|
| Curadoria manual | ✓ |
| Formato do diff | (deixada à discrição) |
| Escopo da fila | ✓ |
| Unidade de aprovação | ✓ |

---

## Curadoria manual

### O humano pode editar a recomendação antes de aprovar?

| Opção | Descrição | Selecionada |
|-------|-----------|-------------|
| Só aprovar/rejeitar | Vê a proposta do motor e diz sim/não; edição vira feature futura | |
| Editar antes de aprovar | Remover/reordenar/adicionar os até 8 antes de aprovar | |
| Só remover itens | Tirar recs ruins, sem adicionar nem reordenar | ✓ |

**User's choice:** Só remover itens (→ D-19)

### Slot removido: backfill ou lista menor?

| Opção | Descrição | Selecionada |
|-------|-----------|-------------|
| Fica menor | Removeu, vai de 8 para 7 | |
| Backfill com o próximo | Entra o 9º candidato elegível para manter 8 | ✓ |
| Você decide | Discrição | |

**User's choice:** Backfill com o próximo (→ D-20). **Nota:** implica que o motor precisa expor candidatos ranqueados além do top-8.

### Item de backfill: revisável ou automático?

| Opção | Descrição | Selecionada |
|-------|-----------|-------------|
| Revisável (cascata) | Backfill também pode ser removido, puxando o próximo | |
| Automático | Entra direto para completar 8, sem re-review | ✓ |
| Você decide | Discrição | |

**User's choice:** Automático (→ D-21)

---

## Escopo da fila

### Quais produtos aparecem na fila?

| Opção | Descrição | Selecionada |
|-------|-----------|-------------|
| Só os que mudaram | Apenas produtos onde "depois" difere do baseline | ✓ |
| Todos os produtos | Lista os 645, mudaram ou não | |
| Mudaram + sem recomendação | Mudados mais os que ganharam recomendação pela 1ª vez | |

**User's choice:** Só os que mudaram (→ D-22). **Nota:** empty→something já conta como mudança, então está coberto.

### O que conta como "mudança"?

| Opção | Descrição | Selecionada |
|-------|-----------|-------------|
| Conjunto diferente | Algum id adicionado/removido; reordenação não conta | ✓ |
| Conjunto OU ordem | Qualquer diferença, incluindo só ordem | |
| Você decide | Discrição | |

**User's choice:** Conjunto diferente (→ D-23)

---

## Unidade de aprovação

### Qual a unidade de aprovação?

| Opção | Descrição | Selecionada |
|-------|-----------|-------------|
| Produto inteiro | Um voto aprovar/rejeitar por produto | |
| Por recomendação | Aprovar/rejeitar cada uma das até 8 | |
| Você decide | Discrição, preferência por produto inteiro | ✓ |

**User's choice:** Você decide (→ D-24, preferência: produto inteiro — a remoção já dá granularidade fina)

### O que uma aprovação produz?

| Opção | Descrição | Selecionada |
|-------|-----------|-------------|
| Registro 'aprovado' pendente | Registro persistido do conjunto aprovado, que a Fase 5 consome | ✓ |
| Aprovado + payload congelado | Além do registro, congela o payload contra recálculo | |
| Você decide | Discrição | |

**User's choice:** Registro 'aprovado' pendente (→ D-25; congelamento contra drift é APRV-07/v2)

### Como a Fase 4 entrega o gate de backend (SC#3)?

| Opção | Descrição | Selecionada |
|-------|-----------|-------------|
| Endpoint guardado, escrita stub | Endpoint já com gate; escrita real stub até Fase 5 | |
| Só a função de gate | Função "pode escrever?" + testes; Fase 5 envolve no endpoint | |
| Você decide | Discrição, desde que SC#3 demonstrável sem escrita real | ✓ |

**User's choice:** Você decide

### Como o dry-run se comporta na Fase 4?

| Opção | Descrição | Selecionada |
|-------|-----------|-------------|
| Flag que percorre o pipeline | Flag explícita, no-op comprovado, segue viva na Fase 5 | |
| Dry-run = padrão da Fase 4 | Como nunca escreve, a fase já é dry-run; modo real nasce na Fase 5 | |
| Você decide | Discrição, garantindo modo reutilizável e SC#4 satisfeito | ✓ |

**User's choice:** Você decide

---

## Claude's Discretion

- **Formato visual do diff "antes vs. depois"** — não selecionado para discussão; restrição: precisa mostrar "antes" E "depois", não só a lista final (SC#1).
- **Unidade de aprovação** — preferência registrada: produto inteiro.
- **Hospedagem/acesso do painel** — não discutido; provável ferramenta local sobre `catalog.db`, sem login (nuvem só na Fase 6).
- **Gate de backend (SC#3)** — mecanismo à discrição, desde que demonstrável sem escrita real.
- **Semântica do dry-run (SC#4)** — mecanismo à discrição, garantindo modo reutilizável na Fase 5.

## Deferred Ideas

- APRV-05 (aprovação em lote/bulk) — v2.
- APRV-06 (comentários/notas em aprovações) — v2.
- APRV-07 (detecção de drift antes de escrever) — v2; motivo de D-25 não congelar payload.
- Adicionar/reordenar itens na curadoria manual — fora (D-19 só permite remover).
- Editor de curadoria completo / painel na nuvem com autenticação — Fase 6.
