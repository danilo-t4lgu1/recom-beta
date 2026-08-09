# Phase 6: Operação Diária Autônoma na Nuvem - Context

**Gathered:** 2026-07-17
**Status:** Ready for planning

<domain>
## Phase Boundary

O pipeline de cálculo (ingestão de catálogo → motor de recomendação → geração da fila de aprovação) roda sozinho na nuvem, num agendamento diário (ex: GitHub Actions), de forma idempotente (reexecutar no mesmo dia não duplica pedidos de aprovação pendentes). O Script do storefront ganha cache local (TTL) para não buscar dados a cada visualização de página.

**Fora de escopo desta fase:**
- Escrita automática na loja sem aprovação humana — permanece travado desde o PROJECT.md ("Out of Scope") e reforçado pelas Fases 4/5. O job diário termina em popular a fila de aprovação, nunca chama o endpoint de escrita real sozinho.
- Migração do painel de revisão (`review-server.js`) para hospedagem na nuvem com autenticação — a Fase 4 mencionou isso como possibilidade futura, mas os Success Criteria desta fase falam do MOTOR rodando na nuvem, não do painel. Painel continua local nesta fase.
- Reconstrução do Script de storefront em NubeSDK — débito de longo prazo já registrado em PROJECT.md, não é escopo desta fase (a fase só adiciona cache ao Script legado v.Alpha existente).

</domain>

<decisions>
## Implementation Decisions

### Persistência do banco SQLite entre execuções na nuvem
- **D-45:** `data/catalog.db` (SQLite, better-sqlite3) sobrevive entre execuções efêmeras do GitHub Actions via commit-back para o repositório git ao final de cada execução bem-sucedida (`git add -f data/catalog.db` — hoje `data/*.db` é gitignored apenas para desenvolvimento local; o workflow de CI precisa forçar o add especificamente para esse arquivo, sem alterar o gitignore de dev). Mantém a stack 100% SQLite/git já estabelecida desde a Fase 2, sem introduzir serviço de banco hospedado novo, com histórico auditável via commits.
- **D-46:** Se o commit-back falhar (ex: conflito de push), o job deve logar erro claramente e falhar de forma visível (não mascarar) — a mesma disciplina de "nunca esconder falha" já estabelecida em WRTE-04/05 (Fase 5).

### Escopo do job diário (nunca escreve sozinho)
- **D-47:** O job agendado executa: `ingest-catalog.js` → `recommendation-engine.js` (via `recommend-cli.js` ou equivalente) → popula `approval_queue` (mesmo formato/tabela D-25 da Fase 4, mesmo `run_id` incremental já estabelecido). NÃO chama `write-executor.js`/`POST /review/:productId/write` automaticamente — a escrita real continua exigindo ação humana explícita via painel, consistente com o Out of Scope travado no PROJECT.md.
- **D-48:** Idempotência (SC#2 do ROADMAP): reexecutar o job duas vezes no mesmo dia não deve duplicar pedidos de aprovação pendentes. O padrão já existente de `UNIQUE(product_id, run_id)` + `ON CONFLICT DO UPDATE` em `approval_queue` (D-25/Fase 4) é reaproveitado — pesquisador/planejador devem confirmar se o `run_id` diário precisa de uma chave adicional (ex: data) para diferenciar execuções do mesmo dia vs. dias diferentes, ou se o mecanismo atual já cobre isso.

### Onde o painel de revisão roda
- **D-49:** `review-server.js` continua rodando localmente (porta 127.0.0.1:3100, sem auth) nesta fase — não migra para hospedagem na nuvem. O operador sincroniza o banco atualizado (via `git pull`, dado D-45) e roda o painel localmente para aprovar/rejeitar/escrever como já faz desde a Fase 4. Migração do painel para a nuvem com autenticação fica para uma fase futura, fora deste escopo.

### Mecanismo de cache do Script (FRNT-02)
- **D-50:** O requisito FRNT-02 cita `asyncSessionStorage` do NubeSDK como exemplo, mas o projeto ainda usa a Script API tradicional (D-11, Fase 1) — NubeSDK não está ativo. O cache usa `sessionStorage` nativo do navegador (chave por `productId`, valor com timestamp de gravação), com TTL de 24h verificado antes do `fetch` existente em `storefront-script/main.js:99` (`BACKEND_URL + '/api/recommendations/' + productId`). Quando o NubeSDK for aprovado, este mecanismo migra para `asyncSessionStorage` (mesmo débito já registrado em PROJECT.md para o Script como um todo).
- **D-51:** Confirmação de SC#4 (não busca a cada página vista) é feita observando o número de chamadas de rede do navegador durante navegação repetida na mesma sessão — não é um teste automatizado tradicional, é uma verificação comportamental (dev tools / network tab), a ser incluída na verificação da fase.

### Horário do agendamento
- **D-52:** Cron diário roda uma vez por dia, horário fixo de baixo tráfego (ex: 3h BRT / equivalente UTC), sem necessidade de configuração pelo usuário nesta fase. Pesquisador/planejador confirmam a sintaxe cron exata do GitHub Actions (`schedule: cron:`) e documentam o horário escolhido.

### Claude's Discretion
- Nome/localização exata do workflow YAML do GitHub Actions (ex: `.github/workflows/daily-recompute.yml`) — a critério do planejador, seguindo convenção padrão do GitHub Actions.
- Mecanismo exato de detecção de mudança real de estoque/cor/tecido (SC#3) — o motor já recalcula do zero a cada execução (Fases 2/3), então "refletir automaticamente" pode já ser satisfeito pela natureza determinística do motor; planejador confirma se é necessário algum mecanismo de diff/notificação adicional ou se a recomputação diária já basta.
- Formato exato do log/output do job do GitHub Actions (para debugging futuro) — a critério do planejador.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requisitos e roadmap
- `.planning/REQUIREMENTS.md` — RULE-03, FRNT-02, FEED-01 (texto completo dos 3 requisitos desta fase)
- `.planning/ROADMAP.md` §"Phase 6: Operação Diária Autônoma na Nuvem" — goal, mode (mvp), 4 success criteria

### Decisões herdadas de fases anteriores (não reabrir)
- `.planning/phases/05-grava-o-segura-em-produ-o/05-CONTEXT.md` — D-36/D-40: "execução agendada" reusa o MESMO caminho de código do write manual (endpoint `POST /review/:productId/write`), nenhum caminho separado foi construído na Fase 5; Fase 6 reaproveita sem redesenho
- `.planning/phases/04-preview-e-aprova-o-humana/04-CONTEXT.md` — painel local sem auth explicitamente aceito para Fase 4, migração para nuvem deferida "para quando a Fase 6 existir" — esta fase decide (D-49) que a migração do painel ainda não acontece aqui, só o pipeline de cálculo
- `.planning/PROJECT.md` §"Out of Scope" — "Escrita automática sem aprovação humana" (constraint travada desde o início do projeto)
- `.planning/PROJECT.md` §"Key Decisions" — D-11 (Script v.Alpha via Script API tradicional, não NubeSDK, débito de reconstrução futuro)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app-partners-recomendados/scripts/run-ingestion.js` — CLI já existente que roda `ingest-catalog.js` contra o catálogo real; o job diário do GitHub Actions provavelmente invoca este script (ou equivalente) diretamente.
- `app-partners-recomendados/src/db/catalog-store.js` — `upsertApprovalDecision`, `getLatestSuccessfulRunId`, padrão `UNIQUE(product_id, run_id)` + `ON CONFLICT DO UPDATE` (D-25) — base para a idempotência do job diário (D-48).
- `app-partners-recomendados/src/review/notify-failure.js` — webhook de notificação de falha (Fase 5) já reutilizável se o job agendado falhar (mesmo padrão do write real).

### Established Patterns
- SQLite (better-sqlite3) como única camada de persistência em todo o projeto (Fases 2-5) — nenhuma fase introduziu banco hospedado; D-45 mantém essa consistência via commit-back git em vez de migrar para serviço novo.
- `run_id` incremental como chave de execução (Fases 2-5) — D-48 reaproveita para idempotência diária.
- Vercel já hospeda funções serverless (`api/recommendations/[productId].js`) e os webhooks LGPD (Fase 1) no mesmo projeto `app-partners-recomendados` — GitHub Actions é um mecanismo de execução agendada separado do Vercel (Vercel não tem cron nativo gratuito equivalente ao GitHub Actions para este caso).

### Integration Points
- `storefront-script/main.js:99` — ponto exato onde o cache (D-50) precisa envolver o `fetch` existente para `/api/recommendations/:productId`.
- `app-partners-recomendados/src/db/catalog-store.js` — ponto onde o job diário grava `approval_queue`, mesma tabela que `review-server.js` já lê (Fase 4).

</code_context>

<specifics>
## Specific Ideas

Nenhuma referência específica adicional além do que já está registrado no ROADMAP/REQUIREMENTS — discussão em modo `--auto`, decisões resolvidas com a opção recomendada em cada área cinzenta (ver `<decisions>` acima).

</specifics>

<deferred>
## Deferred Ideas

- Migração do painel de revisão (`review-server.js`) para hospedagem na nuvem com autenticação — mencionada como possibilidade na Fase 4, decidida como fora de escopo nesta fase (D-49). Fica para uma fase futura caso o operador queira aprovar sem depender da própria máquina.
- Reconstrução do Script de storefront em NubeSDK (débito de longo prazo, D-11) — fora de escopo, aguarda aprovação do formulário de ativação do tema Morelia.

### Reviewed Todos (not folded)
None — nenhum todo pendente encontrado com correspondência para esta fase (`todo.match-phase` retornou 0 matches).

</deferred>

---

*Phase: 6-Operação Diária Autônoma na Nuvem*
*Context gathered: 2026-07-17*
