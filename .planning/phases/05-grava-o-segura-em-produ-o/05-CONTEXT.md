# Phase 5: Gravação Segura em Produção - Context

**Gathered:** 2026-07-16
**Status:** Ready for planning

<domain>
## Phase Boundary

As recomendações já aprovadas no painel da Fase 4 (registro em `approval_queue`, status `approved`, conjunto exato de ids em `approved_recommendation_ids`) passam a ser efetivamente gravadas nos Metafields reais da loja Nuvemshop, com quatro garantias operacionais obrigatórias:

1. O valor anterior do Metafield é sempre capturado (snapshot) imediatamente antes de qualquer escrita real.
2. Uma escrita já feita pode ser desfeita (rollback), restaurando o valor anterior — confirmado por leitura direta na loja.
3. Todo write real fica registrado num log de auditoria (o que mudou, quando, o que disparou).
4. Uma falha na escrita real dispara uma notificação (webhook) visível para o operador.

**Ponto de entrada único desta fase:** o endpoint já existente `POST /review/:productId/write` (`review-server.js`) e o `write-executor.js` que ele chama — hoje um stub proposital que nunca faz chamada de rede (`written: false, reason: 'stub — escrita real é Fase 5'`). Esta fase substitui esse stub pela chamada real ao Nuvemshop, mantendo o gate de aprovação (`assertApproved`) como primeira operação (D-25/APRV-03, já implementado e não deve ser reaberto).

**NÃO é escopo desta fase (é Fase 6):** agendamento real na nuvem (cron/GitHub Actions), recomputação diária automática, idempotência de múltiplas execuções no mesmo dia. Fase 5 constrói e testa o mecanismo de escrita segura — nenhum agendador real dispara o `/write` automaticamente ainda; a "execução agendada" mencionada em WRTE-04/05 é testada forçando falha manualmente no mesmo caminho de escrita que a Fase 6 vai reutilizar depois.

**Realidade operacional atual (herdada da Fase 4, 2026-07-14):** 0/645 produtos têm `fabric_tag_canonical` preenchido — a fila de aprovação pode estar vazia hoje. O mecanismo de escrita/rollback/auditoria/notificação precisa ser correto e testável com fixtures reais mesmo que a fila real esteja vazia no momento (mesma postura da Fase 4).

</domain>

<decisions>
## Implementation Decisions

### Trigger de escrita (escopo do gatilho)
- **D-36:** A escrita real acontece SOMENTE pelo endpoint já existente `POST /review/:productId/write`, chamado um produto de cada vez. Não é construído nesta fase nenhum script de lote que processe todos os aprovados pendentes de uma vez — isso fica para a Fase 6, quando o agendamento real existir. A "execução agendada" citada em WRTE-04 (log) e WRTE-05 (notificação) é tratada como o MESMO caminho de código do write real (não um caminho separado) — a Fase 6 reaproveita esse caminho sem redesenho, chamando o mesmo endpoint/função por produto.

### Rollback
- **D-37:** Rollback é acionado por um script/CLI manual (ex: `node scripts/rollback.js <productId>`), rodado por um operador — não é um endpoint HTTP nem um botão no painel. Mais simples, sem tocar em `review-server.js`/HTML.
- **D-38:** Antes de restaurar, o script DEVE ler o valor atual do Metafield na loja (chamada real à API) e comparar com o valor que a escrita original gravou (registrado no snapshot). Se o valor atual divergir do esperado, o rollback aborta e avisa o operador em vez de sobrescrever silenciosamente uma mudança mais recente (ex: outra execução, edição manual no admin). Só restaura se os valores baterem.
- **Implicação:** o snapshot "antes" da escrita (WRTE-02) precisa registrar não só o valor anterior, mas também o valor que foi gravado por aquela escrita específica — para o rollback ter algo a comparar contra o estado atual real (D-38 depende disso).

### Notificação de falha (WRTE-05)
- **D-39:** Canal é webhook (ex: Slack/Discord/URL genérica via variável de ambiente), não e-mail. Usa `fetch` nativo do Node — sem nova dependência de pacote (consistente com o resto do projeto: zero deps de HTTP/e-mail hoje, `client.js` já comenta explicitamente "Sem dependências externas — usa fetch global do Node").
- **D-40:** O gatilho é genérico: QUALQUER falha real de escrita (exceção lançada pelo caminho real de `write-executor.js`/equivalente) dispara o webhook — não importa se foi chamado manualmente pelo painel hoje ou (no futuro, Fase 6) por um agendamento automático. Não existe um caminho "agendado" separado nesta fase (consistente com D-36) — a notificação cobre o caso real do dia a dia desde já e é testável forçando uma exceção via teste automatizado.

### Log de auditoria (WRTE-04)
- **D-41:** Persistido em tabela SQLite (nova tabela, seguindo a convenção de `schema.sql` — nomes de coluna explícitos, sem booleanos opacos) E exposto numa tela nova somente-leitura no painel (`GET /audit` em `review-server.js`).
- **D-42:** A tela de auditoria é uma lista cronológica simples (mais recente primeiro) de todas as escritas reais — produto, quando, o que mudou (valor antes/depois), o que disparou (manual/agendado, conforme D-36 é sempre o mesmo caminho). SEM filtro por produto/data/status nesta fase — volume baixo não justifica ainda. Filtro fica para se a necessidade aparecer na prática.

### Formato do valor gravado / visibilidade de rollback (resolvido pós-pesquisa)
- **D-43:** (confirmado pelo usuário em 2026-07-16, após `05-RESEARCH.md` Assumption A1/Pitfall 2) O valor gravado no Metafield `produto_sugerido` para múltiplos ids aprovados é `JSON.stringify(approvedRecommendationIds)` (array serializado como JSON), não um id único. Isso desalinha temporariamente o leitor público do storefront (`src/api/recommendations.js`, que hoje lê `match.value` como string única) — adaptar esse leitor é explicitamente FORA do escopo desta fase (fica para uma fase futura). `write_log.written_value` também grava esse mesmo JSON serializado.
- **D-44:** (confirmado pelo usuário em 2026-07-16, após `05-RESEARCH.md` Assumption A4) Rollback (D-37/D-38) SEMPRE insere uma linha nova em `write_log` com `triggered_by: 'rollback'` ao restaurar um valor anterior, mantendo o rollback visível na tela `GET /audit` (D-41/D-42) junto com writes reais.

### Claude's Discretion
- **Nome e schema exatos da tabela de auditoria/snapshot** — o planejador decide o desenho de coluna (ex: uma tabela `write_log` cobrindo snapshot antes/depois + auditoria, ou duas tabelas separadas), desde que capture: product_id, valor anterior, valor gravado, timestamp, e resultado (sucesso/falha). Deve seguir a convenção já usada em `approval_queue`/`catalog_snapshots` (nomes de coluna explícitos, nunca um objeto solto).
- **Função nova no `nuvemshop-client/client.js` para atualizar/ler Metafield por id** — hoje só existe `createMetafield` (POST, sempre cria um Metafield novo) e `getMetafields` (lista por owner). O planejador/pesquisador decide se a Nuvemshop faz upsert automático por namespace+key ao repetir o POST, ou se é preciso uma chamada de update explícita (ex: PUT `/metafields/{id}`) — isso é uma investigação técnica contra a API real, não uma escolha de produto. Qualquer caminho escolhido deve preservar o padrão do módulo (funções nomeadas, sem duplicar `buildHeaders`/`assertOk`).
- **Formato exato do payload do webhook (D-39)** — corpo JSON com productId, erro, timestamp é o mínimo esperado; o planejador decide o formato exato (compatível com Slack/Discord `content`/`text` ou um JSON genérico, conforme a URL configurada).
- **Variável de ambiente do webhook** — nome e onde documentar (ex: `.env.example`), a critério do planejador, seguindo a convenção já usada para `access_token`/`store_id` em `nuvemshop-auth.js`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requisitos e roadmap desta fase
- `.planning/REQUIREMENTS.md` — WRTE-02 (snapshot antes da escrita), WRTE-03 (rollback), WRTE-04 (log de auditoria), WRTE-05 (notificação de falha). WRTE-01 (grava em Metafields via API pública) já está `[x]` — confirmado desde a Fase 1, esta fase escala/opera o mesmo caminho, não o reimplementa do zero.
- `.planning/ROADMAP.md` — seção "Phase 5: Gravação Segura em Produção", Goal + as 4 Success Criteria (a redação exata dos SC governa a verificação).
- `.planning/PROJECT.md` — seção "Constraints": "nenhuma escrita na loja sem aprovação humana prévia; toda escrita deve capturar estado anterior e permitir rollback" — restrição de projeto, não apenas desta fase.

### Ponto de entrada da escrita real (o que esta fase substitui)
- `app-partners-recomendados/src/review/write-executor.js` — `executeApprovedWrite`, hoje stub (`written: false`). O comentário no topo do arquivo já documenta explicitamente: "Fase 5 substitui esta linha por uma chamada real (ex: updateMetafield)" — é o ponto exato de extensão.
- `app-partners-recomendados/src/review/approval-gate.js` — `assertApproved`/`ApprovalRequiredError` (D-25/APRV-03). Chamado como primeira operação de `executeApprovedWrite` — não deve ser reaberto ou contornado nesta fase.
- `app-partners-recomendados/src/review-server.js` — rota `POST /review/:productId/write` (regex `WRITE_PATH`), já resolve `dryRun` da query string (`?dryRun=`) e chama `executeApprovedWrite`. É o único gatilho de escrita real desta fase (D-36) — a rota de rollback (D-37) e a tela de auditoria (D-41) NÃO reusam esta rota, mas o mesmo arquivo/servidor.
- `.planning/phases/04-preview-e-aprova-o-humana/04-CONTEXT.md` — D-24/D-25 (unidade de aprovação = produto inteiro, registro persistido do conjunto aprovado) e a nota de discrição da Fase 4: "O gate de backend criado aqui é o ponto onde a Fase 5 pluga a escrita real."

### Cliente Nuvemshop (o que precisa ser estendido)
- `app-partners-recomendados/src/nuvemshop-client/client.js` — `createMetafield` (POST, sempre cria), `getMetafields` (lista por owner_id + namespace). Nenhuma função de update/leitura-por-id existe hoje — ver "Claude's Discretion" acima.
- `app-partners-recomendados/src/auth/nuvemshop-auth.js` — `getAccessToken()`, convenção de onde token/store_id vêm; qualquer nova função de escrita/rollback reusa este mesmo padrão de autenticação.
- `app-partners-recomendados/src/rate-limit/adaptive-limiter.js` — `fetchWithRateLimit`, já usado em `listCategories`/`listProducts`/`getMetafields`. Qualquer nova chamada de escrita real (update de Metafield, leitura para verificação de rollback) deve respeitar o mesmo rate limit adaptativo, não uma chamada `fetch` crua.
- `.planning/phases/01-spike-de-viabilidade-end-to-end/01-CONTEXT.md` e `01-05-DECISAO.md` — WRTE-01 já confirmado via round-trip real (Metafield `recomendados.produto_sugerido`, produto `349886153`). Convenção de namespace/key já estabelecida (`namespace: 'recomendados'`, `key: 'produto_sugerido'`) — esta fase escreve no mesmo namespace/key, não cria um novo.

### Schema e persistência (base da tabela nova)
- `app-partners-recomendados/src/db/schema.sql` — convenção de nomes de coluna explícitos (nunca booleano opaco, ver comentário sobre `approval_queue`). Tabela nova de snapshot/auditoria (D-41) segue esta mesma convenção. `approval_queue` (D-25) é a fonte de quais produtos têm aprovação válida — a escrita real só acontece para produtos com `status = 'approved'`.
- `app-partners-recomendados/src/db/catalog-store.js` — padrão de módulo já estabelecido (funções nomeadas, nunca o objeto `db` cru exposto). Qualquer função nova de leitura/escrita de snapshot/auditoria segue este padrão.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `write-executor.js`/`approval-gate.js`: a forma da função (`{ productId, decision, dryRun }` → gate primeiro, depois efeito) já está pronta — Fase 5 troca só o corpo do `if (!dryRun)` por uma chamada real, sem redesenhar a assinatura.
- `nuvemshop-client/client.js`: `buildHeaders`/`assertOk`/`fetchWithRateLimit` já resolvem autenticação, erro HTTP e rate limit — qualquer função nova (update de Metafield, leitura para comparação de rollback) reusa esses helpers em vez de duplicar.
- `db/catalog-store.js`: padrão de módulo (funções nomeadas) para a tabela nova de snapshot/auditoria.

### Established Patterns
- Erros tipados e nomeados (`ApprovalRequiredError` como exemplo) — o rollback com verificação (D-38) deve seguir o mesmo padrão (ex: um erro tipado quando o valor atual diverge do esperado, não um `throw new Error` genérico).
- Zero dependências externas de HTTP/e-mail — todo I/O de rede usa `fetch` nativo (`client.js`, `adaptive-limiter.js`). O webhook de notificação (D-39) segue a mesma disciplina.
- Testes TDD com Vitest para cada módulo de domínio antes de integrar ao servidor HTTP (ver `write-executor.test.js`, `approval-gate.test.js`) — o mesmo padrão se aplica à extensão real desta fase.

### Integration Points
- **Entrada:** `approval_queue` com `status = 'approved'` (Fase 4) é o único conjunto de produtos elegíveis para escrita real.
- **Saída:** a tabela nova de snapshot/auditoria (D-41) é o que a Fase 6 vai consultar/estender quando o agendamento real existir — desenhar pensando que o "disparado por manual/agendado" (WRTE-04) precisa distinguir a origem mesmo com um único caminho de código hoje (D-36/D-40).
- **Rollback (D-37)** é um script novo, fora do `review-server.js` — não precisa de rota HTTP nem toca no HTML/SSR existente.
- **Auditoria (D-41)** é uma rota nova em `review-server.js` (`GET /audit`), reaproveitando a mesma infra HTTP nativa (porta 3100, bind 127.0.0.1) já usada por `GET /review`.

</code_context>

<specifics>
## Specific Ideas

- O comentário já existente no topo de `write-executor.js` prevê literalmente o que esta fase faz: "Fase 5 substitui esta linha por uma chamada real (ex: updateMetafield)" — é a âncora concreta do escopo desta fase.
- O rollback precisa comparar o valor atual da loja contra o valor que a própria escrita gravou (não contra o valor "antes" genérico) — se alguém mudou o Metafield depois da escrita que se quer desfazer, o script aborta em vez de arriscar apagar essa mudança mais recente (D-38).

</specifics>

<deferred>
## Deferred Ideas

- **Script de lote / execução em massa dos aprovados pendentes:** avaliado e deixado fora (D-36) — fica para a Fase 6, quando o agendamento real na nuvem existir. Nesta fase, o caminho de escrita real continua sendo por produto via `POST /write`.
- **Endpoint HTTP ou botão no painel para rollback:** avaliado e deixado fora (D-37) — rollback é CLI manual nesta fase. Se o operador precisar de rollback direto na tela do painel no futuro, é uma decisão explícita separada.
- **Filtro por produto/data/status na tela de auditoria:** avaliado e deixado fora (D-42) — lista simples sem filtro é suficiente com o volume atual. Retomar se o volume de escritas reais crescer a ponto de a lista completa não ser mais navegável.
- **Notificação por e-mail:** avaliado e deixado fora (D-39) — webhook escolhido para não introduzir a primeira dependência de e-mail/provedor externo no projeto.

</deferred>

---

*Phase: 5-Gravação Segura em Produção*
*Context gathered: 2026-07-16*
