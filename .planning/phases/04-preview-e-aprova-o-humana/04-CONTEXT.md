# Phase 4: Preview e Aprovação Humana - Context

**Gathered:** 2026-07-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Um painel web onde toda mudança de recomendação calculada pelo motor determinístico (Fase 3) é apresentada como um diff **"antes vs. depois"** por produto, revisada e aprovada/rejeitada **produto a produto** por um humano, com a regra "nada é gravável sem aprovação prévia" **imposta no backend** (não só na UI), mais um modo **dry-run** (simulação) que reusa a mesma tela sem tocar a loja.

**Input "depois":** saída do motor da Fase 3 (`recommendForProduct`) — objetos ricos, até 8 recomendados com cor/tecido/estoque (D-18).
**Input "antes":** tabela `recommendation_baseline` (`current_recommended_product_id`, hoje 1 id por produto — herança do campo nativo lido na Fase 2).

**NÃO é escopo desta fase (é Fase 5):** a escrita real dos Metafields na loja Nuvemshop, snapshot prévio do valor anterior, rollback, log de auditoria e alerta de falha. A Fase 4 produz a **fila de aprovados** que a Fase 5 consome. Também fora de escopo: operação diária/idempotência na nuvem (Fase 6).

**Realidade operacional atual (2026-07-14):** 0/645 produtos têm `fabric_tag_canonical` preenchido (planilha de tecidos pendente, D-16). Com a regra estrita do motor (D-15), `recommendForProduct` devolve `[]` para todo produto real hoje — o painel precisa se comportar corretamente nesse estado vazio (fila vazia / "nada a revisar"), sem tratar isso como bug.

</domain>

<decisions>
## Implementation Decisions

### Curadoria manual (o que o humano pode editar)
- **D-19:** O humano pode **remover** recomendações da lista proposta pelo motor antes de aprovar — **não** pode adicionar itens novos nem reordenar. Meio-termo escolhido explicitamente sobre "só aprovar/rejeitar" (estrito demais) e "editor completo" (escopo grande demais). Isso satisfaz a menção do PROJECT.md a "mecanismo de intervenção manual humana na curadoria" sem construir um editor de curadoria completo nesta fase.
- **D-20:** Ao remover um item, o slot vazio é preenchido por **backfill** com o próximo candidato elegível ranqueado (o "9º"), mantendo até 8. **Implicação de interface obrigatória:** o motor da Fase 3 hoje corta em 8 (`recommendForProduct`) — a Fase 4 precisa de acesso aos candidatos elegíveis **além** do top-8, respeitando a mesma ordem determinística (cascata D-13). O planejador deve decidir se isso é: (a) uma extensão do motor que devolve N candidatos ranqueados, ou (b) a Fase 4 re-executa a seleção excluindo os ids removidos. Qualquer caminho DEVE preservar o determinismo e a elegibilidade estrita (cor + tecido canônico + estoque, D-15) — nunca introduzir um candidato que o motor não elegeria.
- **D-21:** O item que entra por backfill entra **automaticamente** na lista aprovada — não é re-questionado nesta rodada (sem cascata de re-review). Menos cliques; aceito o trade-off de o humano poder aprovar um backfill sem inspecioná-lo item a item.

### Escopo da fila de revisão (quais produtos aparecem)
- **D-22:** O painel mostra **apenas produtos cuja proposta "depois" difere do baseline "antes"** — foco no que realmente mudou (alinhado com APRV-01, "produto com mudança de recomendação"). Produtos sem mudança não entram na fila. No estado vazio de hoje, a fila fica vazia / "nada a revisar".
- **D-23:** "Mudança" é definida como **conjunto de ids recomendados diferente** (algum item adicionado ou removido em relação ao baseline). **Reordenação pura do mesmo conjunto NÃO conta** como mudança e não surge na fila. Um produto que vai de *sem recomendação* (baseline vazio) para *com recomendação* também é uma mudança (subconjunto de "conjunto diferente").
- Nota prática: como o baseline legado guarda só 1 id por produto e o motor gera até 8, na primeira rodada quase todo produto elegível vai contar como "mudado" — a definição converge no início; a distinção fina importa nas rodadas seguintes.

### Unidade de aprovação e o que a aprovação produz
- **D-24 (Claude's Discretion, preferência registrada):** unidade de aprovação = **produto inteiro** (um voto de aprovar/rejeitar por produto, sobre a lista já eventualmente curada via remoção D-19). Preferência sobre "por recomendação" porque a remoção de itens (D-19) já fornece a granularidade fina — rejeitar uma rec individual seria redundante com removê-la. APRV-02 pede "aprovação humana produto a produto", o que reforça essa unidade.
- **D-25:** Aprovar produz um **registro persistido do conjunto aprovado** (ex.: nova tabela de aprovações no SQLite) marcando aquele produto + conjunto exato de ids como "aprovado, pendente de escrita". A Fase 5 só pode escrever produtos que tenham esse registro. A Fase 4 entrega a fila de aprovados; a Fase 5 a consome. **Não** foi escolhido o "payload congelado contra recálculo" — a reconciliação de drift entre aprovar-e-escrever é APRV-07 (v2, deferida). Mesmo assim, o registro DEVE capturar o conjunto de ids aprovados (a lista curada), não apenas um booleano — senão a Fase 5 não sabe o que escrever.

### Claude's Discretion
- **Formato visual do diff "antes vs. depois"** — o usuário optou por NÃO discutir esta área. À discrição do planejador/pesquisador: cards lado a lado, destaque de adicionados/removidos, quanto detalhe do produto (imagem, cor, tecido, estoque) mostrar. Restrição: precisa deixar claro o estado "antes" E "depois", não só a lista final (SC#1 exige "não apenas a lista final").
- **Hospedagem e acesso do painel** — não discutido. Provável e coerente com a arquitetura atual: ferramenta **local** rodando sobre `data/catalog.db` (better-sqlite3), sem login/auth (uso interno de um operador), já que a migração para a nuvem só acontece na Fase 6. O planejador decide o mecanismo web (o repo já tem um `server.js` HTTP nativo e funções serverless em `api/` no Vercel — reaproveitar vs. novo é discricionário).
- **Como a Fase 4 entrega o gate de backend (APRV-03/SC#3)** — à discrição do planejador, desde que SC#3 seja **demonstrável sem escrita real na loja**: uma tentativa de gravação sem aprovação registrada é recusada no backend (não só na UI), mesmo via chamada direta ao endpoint/função de escrita. Opções válidas: (a) endpoint/função de escrita já com o gate ativo e a escrita real na Nuvemshop como stub/no-op até a Fase 5; (b) apenas a função reutilizável "pode escrever este produto?" (checa registro de aprovação) + testes, que a Fase 5 envolve no endpoint real.
- **Semântica do modo dry-run (APRV-04/SC#4)** — à discrição do planejador, garantindo um modo de simulação **reutilizável** (a mesma flag/mecanismo deve continuar válido e significativo na Fase 5, onde faz a diferença real entre escrever e não escrever) e que SC#4 seja satisfeito: mesmo preview, zero escrita, confirmado por comparação do estado da loja antes/depois.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requisitos e roadmap desta fase
- `.planning/REQUIREMENTS.md` — APRV-01 (preview antes vs. depois), APRV-02 (painel web, aprovação produto a produto), APRV-03 (gate no backend, não só UI), APRV-04 (dry-run reusa a mesma tela). APRV-05/06/07 estão listados como v2/deferidos (bulk approve, comentários, detecção de drift) — fora de escopo desta fase.
- `.planning/ROADMAP.md` — seção "Phase 4: Preview e Aprovação Humana", Goal + os 4 Success Criteria (a redação exata dos SC governa a verificação).
- `.planning/PROJECT.md` — seção "Requirements > Active": itens de painel de aprovação, aprovação humana obrigatória e "intervenção manual humana na curadoria" (base do D-19).

### Interface de dados herdada da Fase 3 (input "depois" do preview)
- `app-partners-recomendados/src/recommendation/recommendation-engine.js` — assinatura e formato de saída de `recommendForProduct` (objetos ricos D-18: `productId`, `colorValue`, `fabricTagCanonical`, `stockTotal`, `sizesWithStock`, `centralSizesStock`, `stockBySize`). É a estrutura que o diff da Fase 4 consome. **A extensão para expor candidatos além do top-8 (D-20) toca este arquivo ou sua fronteira.**
- `app-partners-recomendados/src/recommendation/recommend-cli.js` — primeiro consumidor real do motor (snapshot real → motor → JSON); prenúncio explícito do preview da Fase 4. Bom ponto de partida para entender o fluxo de dados sem rede.
- `.planning/phases/03-motor-de-recomenda-o-determin-stico/03-CONTEXT.md` — decisões D-13 a D-18 (cascata de desempate, elegibilidade estrita, formato de saída). D-13 (ordem de desempate) é o que define o ranqueamento usado no backfill (D-20).

### Estado "antes" e leitura do catálogo (input do baseline)
- `app-partners-recomendados/src/db/catalog-store.js` — `getLatestSnapshotProducts()` (materializa o snapshot que o motor consome) e demais funções nomeadas de leitura SQLite. Padrão do módulo: sempre funções nomeadas, nunca o objeto `db` cru.
- `app-partners-recomendados/src/db/schema.sql` — tabela `recommendation_baseline` (`product_id`, `run_id`, `current_recommended_product_id`, `read_at`) = fonte do estado "antes". Qualquer tabela nova de aprovações (D-25) segue as convenções deste schema.
- `.planning/phases/02-ingest-o-de-cat-logo-e-qualidade-de-dados/02-CONTEXT.md` — contexto do baseline (DATA-02) e do critério de estoque (D-04); relevante para entender o que o "antes" representa.

### Infra web existente (candidata a reaproveitamento)
- `app-partners-recomendados/src/server.js` — servidor HTTP nativo (módulo `node:http`, sem framework) já usado para `GET /recommendations/:productId`; padrão GET-only com 405 para outros métodos.
- `app-partners-recomendados/api/recommendations/[productId].js` e `app-partners-recomendados/src/api/recommendations.js` — funções serverless Vercel + handler; padrão de endpoint somente-leitura sem vazar token.
- `app-partners-recomendados/package.json` — stack: Node ESM (`type: module`, Node ≥20.6), `better-sqlite3`, testes com `vitest`. Sem framework web instalado hoje.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/db/catalog-store.js`: já expõe `getLatestSnapshotProducts()` e o padrão de módulo (funções nomeadas). A Fase 4 provavelmente adiciona funções de leitura/escrita para a fila de aprovações (D-25) seguindo o mesmo padrão.
- `src/recommendation/recommendation-engine.js`: a saída rica (D-18) alimenta diretamente o diff. Precisa ser estendida ou re-invocada para o backfill além do top-8 (D-20).
- `src/server.js` + `api/`: infra web já existente (HTTP nativo local + serverless Vercel). O painel pode reaproveitar essa base ou justificar um novo mecanismo — decisão do planejador.

### Established Patterns
- Módulos de domínio como função pura testável isoladamente com Vitest (ver `stock-availability.test.js`, `recommendation-engine.test.js`). O gate de aprovação (APRV-03) deve nascer como função pura testável — é o caminho natural para provar SC#3 sem escrita real.
- Constantes de regra de negócio sempre nomeadas explicitamente (ex.: limite de 8). Aplicar ao limite do carrossel e a estados de aprovação (`pending`/`approved`/`rejected`).
- Endpoints somente-leitura com contrato mínimo e sem vazar credenciais (`src/api/recommendations.js`) — o gate de escrita da Fase 4/5 deve seguir a mesma disciplina de controle de acesso por método (GET-only vs. o novo caminho de mutação guardado).

### Integration Points
- **Entrada:** a Fase 4 consome o snapshot já persistido (`catalog.db`) + a saída do motor da Fase 3. Não fala com a API Nuvemshop nesta fase (leitura ao vivo é Fase 2; escrita é Fase 5).
- **Saída:** a fila de aprovados (registro D-25) é a interface de dados que a Fase 5 (gravação segura) consome. O formato desse registro é o contrato entre as duas fases — defini-lo bem aqui evita retrabalho na Fase 5.
- **Gate de backend (APRV-03):** a função "pode escrever?" criada aqui é o ponto onde a Fase 5 pluga a escrita real. Projetar como fronteira limpa reutilizável.

</code_context>

<specifics>
## Specific Ideas

- O `recommend-cli.js` (Fase 3) é descrito no próprio código como "prenúncio do preview da Fase 4" — o mesmo fluxo `catalog.db → motor → resultado` deve reaparecer no painel, agora com o eixo "antes" (baseline) somado ao "depois".
- Estado vazio é o caso real de hoje (0/645 com tag de tecido): o painel DEVE demonstrar comportamento correto com fila vazia, não só com dados populados. Fixtures com tags preenchidas (como na Fase 3) serão necessárias para exercitar o diff/curadoria de verdade.

</specifics>

<deferred>
## Deferred Ideas

- **APRV-05 — aprovação/rejeição em lote (bulk)** de múltiplos produtos de uma vez: v2, fora desta fase (aprovação é produto a produto aqui, D-24).
- **APRV-06 — comentários/notas** em decisões de aprovação: v2, fora desta fase.
- **APRV-07 — detecção de "drift"**: revalidar uma recomendação aprovada-mas-não-gravada contra estoque atualizado antes de escrever. v2/deferida — por isso D-25 optou por registro simples, sem congelar payload contra recálculo. Se o drift entre aprovar e escrever virar problema real, retomar aqui.
- **Adicionar/reordenar itens na curadoria manual:** avaliado e deixado fora (D-19 permite só remover). Se o operador precisar inserir uma recomendação que o motor não elegeu, ou mudar a ordem do carrossel manualmente, isso é uma feature futura com decisão explícita própria.
- **Editor de curadoria completo / painel na nuvem com autenticação:** hospedagem local sem login é o suficiente para esta fase; a migração para a nuvem (e o que isso exige de auth/acesso) é a Fase 6.

</deferred>

---

*Phase: 4-Preview e Aprovação Humana*
*Context gathered: 2026-07-14*
