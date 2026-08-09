# Phase 7: Rollout do motor no catálogo completo — validação de cobertura e re-gravação recorrente - Context

**Gathered:** 2026-07-21
**Status:** Ready for planning

<domain>
## Phase Boundary

O pipeline inteiro (ingestão → motor → escrita em Metafield → script no storefront) já foi construído e validado nas Fases 1–6, mas quase sempre contra **uma única categoria** (Vestidos) e poucos produtos. O código já **suporta** o catálogo completo (`run-daily-job.js` sem args e `run-ingestion.js --all` ingerem as 11 categorias da taxonomia), porém isso **nunca** foi executado e validado de ponta a ponta contra o catálogo real inteiro.

Esta fase entrega três coisas, na loja real e no catálogo completo:
1. **Rollout real** do motor sobre as **11 categorias da taxonomia** (D-26), só para produtos-fonte **com estoque**, rodando ainda pelo Script v.Alpha legado (D-11).
2. **Validação de cobertura** — provar quantos produtos-fonte de fato recebem recomendação e, para os que ficam sem, o **motivo** — via relatório diagnóstico + caminho de reprocesso.
3. **Fluxo recorrente de re-gravação** — o ciclo diário passa a **calcular E gravar automaticamente** (mudança de modelo, ver D-58), com desligamento manual e automático, mantendo a vitrine sempre populada.

**Mudança de modelo desta fase (crítica):** a Fase 7 **reverte** a constraint permanente "nenhuma escrita sem aprovação humana prévia". Decisão explícita e deliberada do usuário (ver D-58). Isso muda PROJECT.md (Out of Scope), aposenta o portão prévio do APRV-03 e altera o D-47 (Fase 6).

**Fora de escopo desta fase:**
- Reconstrução do Script de storefront em **NubeSDK** — segue como débito de longo prazo (D-11), aguardando aprovação do tema Morelia. Esta fase apenas refina o **backend** (dados/motor/escrita) para reaproveitamento total na futura migração (ver princípio-guia D-66).
- Mudança de **layout/CSS** do bloco no storefront — o motor é desacoplado da apresentação (dado vs. visual); a fase não toca `storefront-script/main-partners.js` nem a CSS injetada.
- Novas categorias fora da taxonomia de 11 (D-26) — o rollout cobre exatamente essas 11.

</domain>

<decisions>
## Implementation Decisions

### Escopo do rollout
- **D-53:** O rollout cobre **exatamente as 11 categorias da taxonomia** (D-26): Look Inteiro (Vestidos, Macacões, Macaquinhos), Partes de Cima (Blusas, Croppeds, Corsets, Camisas e Coletes, Blazers e Jaquetas) e Partes de Baixo (Calças, Shorts, Saias). É o comportamento que `run-daily-job.js` sem args já executa. Categorias vivas fora dessa lista **não** entram nesta fase.
- **D-54 (escopo de fonte):** O motor calcula e grava recomendações **apenas para produtos-fonte com estoque disponível** (grade ≥ limiar D-04). Produto-fonte esgotado não recebe vitrine — coerente com "todas as categorias **em estoque**" do título e economiza escritas.

### Motor — modelo de 2 pesos (muda `recommendation-engine.js`, RULE-01)
- **D-55:** Elegibilidade passa a operar em **dois pesos**, dentro de cada bloco de grupo:
  - **1º peso (prioritário):** Estoque + Cor + **Tecido** (E+C+T) — preenche os slots primeiro.
  - **2º peso (backfill):** Estoque + Cor (E+C, tecido ignorado) — só entra para completar os slots que sobraram, **sempre ranqueado abaixo** do 1º peso.
  - Vale **inclusive para produtos que têm tecido**: se não houver E+C+T suficientes, completa com E+C. (Hoje o motor não faz esse backfill — um produto com tecido fica com menos recomendações.)
  - **Piso de elegibilidade = E + C.** Existindo ao menos Estoque + Cor, já conta como elegível.
  - Este modelo **substitui e generaliza** o override de 2026-07-17 ("tecido opcional quando falta em qualquer lado"): sob os 2 pesos, um produto sem tecido simplesmente não tem candidatos de 1º peso e preenche todo do 2º.
  - **Restrições de RULE-02 preservadas:** o motor continua **puro, zero-import, zero-I/O**; a lógica de Grupo/cota 4+4/backfill simétrico da Fase 03.1 (D-26 a D-35) é preservada; todos os testes existentes que codificavam o comportamento estrito/relaxado antigo devem ser atualizados para o novo modelo, sem regressão nos demais.
- **D-56 (ranking):** **D-13 mantido sem alteração** (cascata: estoque total → nº de tamanhos com estoque → tamanhos centrais → guarda de determinismo por productId). A **partição por peso fica ACIMA de D-13**; D-13 ordena **dentro** de cada peso. A intuição de "grade completa > 4 > 3 > 2 > 1" já é, na prática, o 2º nível da cascata.
- **D-57 (regras duras preservadas):** **Cor sempre obrigatória** — não existe 3º peso que largue a cor. **Look Inteiro permanece auto-contido** (D-27) — nunca pesca em Partes. Consequência aceita: um produto só fica **zerado** quando não há nenhum par mesma-cor-com-estoque no grupo dele (o relatório de cobertura explica item a item). **Trade-off aceito:** o 2º peso pode trazer candidato de **tecido diferente** (populado > tecido perfeito).

### Exclusão de produtos ocultos (bug real confirmado)
- **D-58:** **Visibilidade vira critério de elegibilidade.** Confirmado por inspeção: hoje **não existe** nenhum filtro de visibilidade no client/ingestão/motor, então produtos ocultos são ingeridos e podem aparecer como recomendação → **link dá 404**. Correção: um produto precisa estar **visível/publicado** para ser elegível, tanto como **candidato** (não recomendar quem dá 404) quanto como **fonte** (não calcular vitrine para página oculta). A visibilidade é lida **na ingestão** (campo `published` da API Nuvemshop — pesquisador confirma o nome/semântica exatos) e **persistida** no snapshot; o motor consome o flag já pronto (permanece puro, igual ao `hasAvailableGrade`). Quando a equipe **desmarca "Oculto"**, a próxima ingestão diária o torna elegível de novo automaticamente se atender Cor + Estoque — sem ação extra.

### Validação de cobertura
- **D-59:** **Sem % fixo de meta.** Um produto-fonte conta como "coberto" se recebeu ≥1 recomendação via 1º **ou** 2º peso. A barra é: *todo produto-fonte com estoque que tenha ≥1 par mesma-cor-com-estoque no grupo recebe recomendação; o restante é justificado item a item.* Manchete opcional para acompanhamento: ≥90%.
- **D-60 (entregável):** A fase produz um **relatório diagnóstico** cobrindo o catálogo inteiro: total de fontes com estoque, quantas receberam ≥1 recomendação, e para as **zeradas** o **motivo** (sem candidato mesma-cor-em-estoque no grupo elegível; fonte sem cor; etc.). **Mais** um **caminho de reprocesso**: sinalizar produtos sem tecido canônico para o usuário taguear e rerodar (fecha a lacuna que reduz cobertura de 1º peso). Formato/localização exatos ficam a critério do planejador.

### Escrita — Opção B: automática, sem portão prévio
- **D-61:** **O motor grava automaticamente, sem necessidade de aprovação prévia.** Decisão explícita e deliberada do usuário (2026-07-21), ciente de que **reverte a constraint permanente** do PROJECT.md ("nenhuma escrita sem aprovação humana prévia"), **aposenta o portão prévio do APRV-03** e **muda o D-47** (job diário da Fase 6, que hoje só popula a fila de aprovação, passa a calcular **e gravar**). Justificativa do usuário: sendo determinístico, o motor se retroalimenta e é assertivo dentro dos critérios; verificação constante deixa de ser necessária. O painel deixa de ser "aprovação" e vira **verificação/auditoria pós-escrita** (o `GET /audit` da Fase 5 já faz o histórico; o diff antes/depois vira conferência opcional).
- **D-62 (kill switch — desligamento manual):** Um flag lido **antes de gravar**, reaproveitando o **dry-run já existente (APRV-04)**: com o flag "off", o job **ingere e calcula** (e loga o que gravaria) mas **não escreve**. Como roda no GitHub Actions, o toggle é uma *repository variable* / `env` (mais o botão nativo "disable workflow" como parada dura) — sem depender da máquina do usuário.
- **D-63 (disjuntor — desligamento automático / circuit breaker):** Antes de efetivar as escritas de um **run diário**, aborta a escrita **e notifica** (via `notify-failure.js`, Fase 5) se a execução iria (default proposto, usuário ajusta depois):
  - mudar as recomendações de **mais de 30% dos produtos** de uma vez (churn em massa), **ou**
  - **zerar (→ vitrine vazia) mais de 10% dos produtos que antes tinham** recomendação (apagão em massa).
  - **Exceção:** o **1º rollout é supervisionado e isento** (baseline vazio muda ~100% por natureza).
- **D-64 (1º rollout supervisionado):** Como não há mais portão prévio, o **primeiro** rollout completo é operado manualmente: roda em **dry-run primeiro** (D-62), confere pelo relatório de cobertura (D-60) + `/audit`, e só então habilita a escrita real desse run inicial. O regime diário automático vale a partir daí.
- **D-65 (rollback em lote + CR-01):** Hoje o rollback é **por produto** via CLI (D-37). Para escala de catálogo, a fase precisa de um **rollback em lote**, e a correção do bug conhecido **CR-01** (null-pointer em rollback duplo sobre metafield já deletado) antes de qualquer uso em massa.

### Defesas contra dados de entrada inconsistentes
- **D-66 (Defesa 1 — integridade do snapshot antes de gravar):** Antes de qualquer escrita, o job confirma que a ingestão leu um catálogo **plausível e completo** — nenhuma das 11 categorias voltou com 0 produtos, e o total lido está dentro de uma banda esperada vs. o último run bem-sucedido. Se a leitura parecer **truncada/parcial** (falha de paginação, rate-limit abortando no meio), **aborta o run inteiro e notifica** — impede que leitura incompleta seja lida como "produtos sumiram → apagar recomendações". (Distinto do disjuntor, que olha magnitude de mudança; este olha completude da entrada.)
- **D-67 (Defesa 2 — validação referencial no momento da escrita):** Como portão final, cada conjunto recomendado é reconferido contra o snapshot atual — todo ID recomendado precisa **existir, estar visível, com estoque e mesma cor**. Qualquer um que falhe é **descartado** (defesa em profundidade contra o bug de oculto/404 e corridas); se o conjunto ficar vazio por isso, vira **lacuna de cobertura registrada**, nunca lixo gravado.

### Re-gravação recorrente
- **D-68:** O ciclo permanente = job diário (03h, D-52) → ingere → calcula → **grava automaticamente** (guardado por kill switch D-62 + disjuntor D-63 + defesas D-66/D-67) → só produtos com **diff real** vs. baseline mudam de fato (o `diff.js` já isola isso).
- **D-69 (resumo diário):** Um **resumo diário** do que mudou (nº de produtos alterados, zerados, novos) chega pelo mesmo webhook de notificação — dá visibilidade sem exigir conferência manual do painel todo dia.

### Princípio-guia da fase
- **D-70:** Refinar o **backend** (dados + motor + escrita) para reaproveitamento **total** na futura migração NubeSDK. A arquitetura já é desacoplada (motor → Metafield → script); quando o NubeSDK for aprovado, só a **camada de apresentação** (Script v.Alpha) é reconstruída/descartada, e todo o miolo funcional migra intacto. Nada nesta fase deve acoplar lógica de negócio à apresentação atual.

### Claude's Discretion
- Limiar exato do disjuntor (D-63) — default proposto (>30% churn / >10% apagão), usuário ajusta se necessário.
- Mecanismo exato do toggle no GitHub (repository variable vs. secret vs. workflow input) para o kill switch (D-62).
- Formato e localização exatos do relatório de cobertura (D-60) — tela no painel, CSV, arquivo, ou saída de log.
- Design exato do rollback em lote (D-65) — CLI novo, flag no `rollback.js` existente, etc.
- Nome/semântica exatos do campo de visibilidade na API Nuvemshop (D-58) — pesquisador confirma (`published` é o candidato).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requisitos, roadmap e constraints de projeto
- `.planning/ROADMAP.md` §"Phase 7" — título/boundary da fase (goal ainda "[To be planned]"; o título É o escopo).
- `.planning/REQUIREMENTS.md` — RULE-01 (motor, emendado na 03.1), RULE-02 (pureza/zero-I/O), RULE-03/FRNT-02/FEED-01 (operação diária), APRV-03 (portão de aprovação — **revertido nesta fase**, ver D-61).
- `.planning/PROJECT.md` §"Out of Scope" — "Escrita automática sem aprovação humana": constraint **explicitamente revertida** nesta fase (D-61). O planejador deve atualizar PROJECT.md na transição.
- `.planning/PROJECT.md` §"Key Decisions" — D-11 (Script v.Alpha, não NubeSDK); A4 (tecido no `product.tags` nativo); D-41 (`write_log` snapshot+auditoria); D-38 (rollback só com valor batendo); bug **CR-01** (rollback duplo).

### Decisões herdadas (não reabrir)
- `.planning/phases/03.1-criterio-de-grupo-de-produtos-no-motor-de-recomendacao-look-/03.1-CONTEXT.md` — D-26 a D-35: grupos (Look Inteiro auto-contido, Partes de Cima/Baixo mesclam), cota 4+4, backfill simétrico. **Preservar** sob o novo modelo de 2 pesos.
- `.planning/phases/04-preview-e-aprova-o-humana/04-CONTEXT.md` — APRV-03 (gate no backend) e o painel `review-server.js`; o painel é **repurposed** para verificação/auditoria pós-escrita (D-61).
- `.planning/phases/05-grava-o-segura-em-produ-o/05-CONTEXT.md` — WRTE-02..05: `write_log` (D-41), rollback (`scripts/rollback.js`, D-37/D-38), `GET /audit` (D-41/D-42), `notify-failure.js` (WRTE-05). Base do kill switch/disjuntor/defesas.
- `.planning/phases/06-opera-o-di-ria-aut-noma-na-nuvem/06-CONTEXT.md` — D-45/D-46 (commit-back git do SQLite), D-47 (**alterado** aqui: job passa a gravar), D-48 (idempotência diária), D-52 (cron 03h).

### Código a ler antes de implementar
- `app-partners-recomendados/src/recommendation/recommendation-engine.js` — motor puro; alvo de D-55/D-56/D-57; contém o override de 2026-07-17 a ser substituído.
- `app-partners-recomendados/src/ingestion/ingest-catalog.js` — ingestão; alvo de D-58 (visibilidade) e das defesas D-66.
- `app-partners-recomendados/src/ingestion/product-group.js` — `ALL_TAXONOMY_CATEGORY_NAMES` (D-53), resolução de grupo.
- `app-partners-recomendados/src/ingestion/stock-availability.js` — `hasAvailableGrade` (D-04), padrão de flag persistido consumido pelo motor.
- `app-partners-recomendados/scripts/run-daily-job.js` — orquestrador diário; passa a incluir a escrita automática (D-61/D-68), guardas D-62/D-63/D-66/D-67.
- `app-partners-recomendados/src/review/write-executor.js` — escrita real + dry-run (reusado pelo kill switch D-62).
- `app-partners-recomendados/src/review/diff.js` — isola mudança real vs. baseline (D-68).
- `app-partners-recomendados/src/review/notify-failure.js` — webhook (disjuntor D-63, resumo diário D-69).
- `app-partners-recomendados/scripts/rollback.js` — rollback por produto; alvo de D-65 (lote + CR-01).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `run-daily-job.js` / `run-ingestion.js --all`: já ingerem as 11 categorias sob um único `run_id` (D-33) — base do rollout completo (D-53), falta apenas rodar/validar na loja real e acoplar a escrita automática.
- `write-executor.js`: escrita real + dry-run (APRV-04) já prontos — dry-run vira o kill switch (D-62); escrita real vira o passo automático do job diário (D-61).
- `write_log` + `rollback.js` (Fase 5): snapshot/auditoria/rollback por produto — base para o rollback em lote (D-65) e rede de segurança que torna a Opção B aceitável.
- `notify-failure.js` (Fase 5): webhook reutilizável para disjuntor (D-63) e resumo diário (D-69).
- `diff.js` (Fase 4): isola diffs reais — sustenta o regime recorrente de baixo volume (D-68).
- `GET /audit` (Fase 5): histórico cronológico — vira a tela de verificação pós-escrita (D-61).

### Established Patterns
- Motor **puro, zero-import/zero-I/O** (RULE-02): tudo que o motor precisa (estoque via `hasAvailableGrade`, grupo via `productGroupCanonical`, e agora **visibilidade**) vem **persistido pela ingestão**, nunca lido em runtime. D-58 segue esse padrão (novo flag `published`/visível persistido).
- SQLite (better-sqlite3) + commit-back git (D-45) como única persistência; `run_id` incremental; idempotência diária (D-48).
- Rate limiter adaptativo (lê `x-rate-limit-*` reais, nunca hardcoded) — relevante para o rollout completo de 592 produtos e para a Defesa 1 (D-66, detectar leitura truncada por rate-limit).

### Integration Points
- `ingest-catalog.js`: onde entram o flag de visibilidade (D-58) e o guard de integridade do snapshot (D-66).
- `run-daily-job.js`: onde a escrita automática é acoplada (D-61) e onde vivem kill switch (D-62), disjuntor (D-63), defesa referencial (D-67) e resumo diário (D-69).
- `recommendation-engine.js`: onde entra o modelo de 2 pesos (D-55) preservando D-13 (D-56) e a lógica de grupo 03.1.
- `.github/workflows/daily-recompute.yml`: onde o kill switch é exposto como variável/toggle (D-62).

</code_context>

<specifics>
## Specific Ideas

- Bug observado ao vivo pelo usuário: produtos **ocultos** aparecendo no bloco e levando a **404** ao clicar — motivador direto de D-58.
- Enquadramento estratégico do usuário: "deixar tudo pronto para validação em loja real, catálogo completo... refinado o suficiente até chegar a etapa de implementação do NubeSDK... reaproveitamos tudo o que estiver funcional para migração e descartamos o desnecessário" — capturado como princípio-guia D-70.
- Racional do usuário para a Opção B: "sendo determinístico, a ideia é que se retroalimente automaticamente e isso nem seja uma área que precisa de verificação constante. Sendo assertivo sempre dentro desses critérios, já é válido."

</specifics>

<deferred>
## Deferred Ideas

- Reconstrução do Script de storefront em **NubeSDK** (D-11) — fora de escopo; aguarda aprovação do tema Morelia. Esta fase prepara o backend para essa migração (D-70).
- Migração do painel (`review-server.js`) para a nuvem com autenticação (deferida desde a Fase 6, D-49) — não entra aqui; com a Opção B o painel vira verificação/auditoria, e sua hospedagem pode ser reavaliada numa fase futura.
- Expansão do rollout para categorias **fora** das 11 da taxonomia — não nesta fase (D-53).

### Reviewed Todos (not folded)
None — `todo.match-phase` retornou 0 matches para a Fase 7.

</deferred>

---

*Phase: 7-Rollout do motor no catálogo completo — validação de cobertura e re-gravação recorrente*
*Context gathered: 2026-07-21*
