# Phase 5: Gravação Segura em Produção - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-16
**Phase:** 5-Gravação Segura em Produção
**Areas discussed:** Trigger de escrita, Rollback, Notificação de falha, Log de auditoria

---

## Trigger de escrita

| Option | Description | Selected |
|--------|-------------|----------|
| Só o endpoint por produto | Mantém o POST /write existente como único caminho de escrita real. "Execução agendada" (WRTE-04/05) é conceitual nesta fase — a notificação de falha é testada forçando uma exceção nesse mesmo caminho, sem criar um script de lote novo. | ✓ |
| Endpoint + script de lote novo | Cria um script (ex: scripts/run-batch-write.js) que processa todos os approval_queue pendentes de uma vez, escrevendo cada um via o mesmo write-executor. Esse script é o que a Fase 6 vai agendar no GitHub Actions — Fase 5 já o testa manualmente. | |

**User's choice:** Só o endpoint por produto
**Notes:** Consolidado em D-36. A "execução agendada" das SC de WRTE-04/05 é tratada como o mesmo caminho de código do write real, sem caminho separado — a Fase 6 reaproveita depois.

---

## Rollback

| Option | Description | Selected |
|--------|-------------|----------|
| Script/CLI manual | Um comando de linha de comando (ex: node scripts/rollback.js <productId>) que o operador roda manualmente, lendo o snapshot salvo e restaurando o valor anterior. Mais simples, sem tocar no review-server.js. | ✓ |
| Endpoint HTTP dedicado | Uma rota nova (ex: POST /review/:productId/rollback) no mesmo review-server.js, reaproveitando a infra HTTP já existente do painel. | |
| Botão na tela do painel | Além do endpoint, adiciona um botão visível na tela de review para o operador clicar — mais fricção de implementação (toca HTML/SSR), mas nenhum comando de terminal necessário no dia a dia. | |

**User's choice:** Script/CLI manual
**Notes:** Consolidado em D-37. Follow-up decidiu que o script DEVE verificar o valor atual na loja contra o valor gravado pela escrita original antes de restaurar (D-38) — opção "Verifica antes de restaurar" escolhida sobre "Restaura direto, sem checagem", para evitar apagar silenciosamente uma mudança mais recente.

---

## Notificação de falha

| Option | Description | Selected |
|--------|-------------|----------|
| Webhook (Slack/Discord/genérico) | Só precisa de uma URL de webhook configurada via env var — usa fetch nativo, sem dependência nova de pacote. Mais simples e consistente com o resto do projeto (zero deps de HTTP). | ✓ |
| E-mail | Precisa de um provedor configurado (ex: Resend, SendGrid) com API key — adiciona a primeira dependência de e-mail ao projeto. | |

**User's choice:** Webhook (Slack/Discord/genérico)
**Notes:** Consolidado em D-39. Follow-up decidiu o escopo do gatilho: "Qualquer falha de escrita real" (manual ou futura-agendada) escolhida sobre "Só no caminho agendado simulado" (D-40) — mais simples de testar agora e já cobre o caso real do dia a dia.

---

## Log de auditoria

| Option | Description | Selected |
|--------|-------------|----------|
| Só tabela SQLite | Suficiente para provar a Success Criteria #3 sem construir UI nova. Consulta via script quando precisar auditar. | |
| Tabela + tela no painel | Além da tabela, uma rota GET /audit no review-server.js lista o histórico de escritas — mais visível no dia a dia, mais escopo de implementação nesta fase. | ✓ |

**User's choice:** Tabela + tela no painel
**Notes:** Consolidado em D-41. Follow-up decidiu que a tela é uma lista cronológica simples, sem filtro por produto/data/status (D-42) — opção "Lista simples, sem filtro" escolhida sobre "Com filtro por produto", volume baixo não justifica ainda.

---

## Claude's Discretion

- Nome e schema exatos da tabela de auditoria/snapshot (deve capturar product_id, valor anterior, valor gravado, timestamp, resultado).
- Função nova em `nuvemshop-client/client.js` para atualizar/ler Metafield por id — investigação técnica contra a API real (upsert automático vs. update explícito), não escolha de produto.
- Formato exato do payload do webhook.
- Nome da variável de ambiente do webhook e onde documentá-la.

## Deferred Ideas

- Script de lote / execução em massa dos aprovados pendentes — fica para a Fase 6 (agendamento real na nuvem).
- Endpoint HTTP ou botão no painel para rollback — CLI manual é suficiente nesta fase.
- Filtro por produto/data/status na tela de auditoria — retomar se o volume de escritas reais crescer.
- Notificação por e-mail — webhook escolhido para não introduzir dependência de provedor externo.
