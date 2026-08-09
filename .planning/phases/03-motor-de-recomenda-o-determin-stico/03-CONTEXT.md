# Phase 3: Motor de Recomendação Determinístico - Context

**Gathered:** 2026-07-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Dado um snapshot normalizado do catálogo (as tabelas `products`/`variants`/`catalog_snapshots` do SQLite persistido pela Fase 2), calcular automaticamente até 8 produtos recomendados por produto, aplicando simultaneamente: mesma cor, mesmo tipo de tecido (canônico) e estoque disponível obrigatório (grade ≥3 tamanhos, D-04 da Fase 2). O motor é uma função pura — sem chamada de rede/API, 100% determinística, testável isoladamente com fixtures. Não inclui persistência do resultado nem escrita em Metafields (isso é Fase 5) nem UI de preview (Fase 4) — só o cálculo.

</domain>

<decisions>
## Implementation Decisions

### Desempate quando há mais de 8 elegíveis
- **D-13:** Como RANK-01 (giro de vendas) é v2 e está fora desta fase, o desempate entre candidatos elegíveis (mesma cor + mesmo tecido + estoque) segue uma cascata puramente baseada em estoque, nesta ordem:
  1. Maior estoque total (soma de `inventory_levels[]` entre todas as variantes do produto)
  2. Em caso de empate: maior distribuição de estoque entre as grades de tamanho (mais tamanhos com estoque > 0, não só volume bruto)
  3. Em caso de empate ainda: prioriza estoque nos tamanhos centrais (P/M/G, ou 36/38/40 quando a grade for numérica)
- **D-14:** Não existe conceito de "Grupo" de produtos no desempate — ideia descartada explicitamente pelo usuário. A cascata de estoque (D-13) é o critério completo e final.
- O usuário classificou como "muito improvável" que essa cascata precise chegar ao 3º nível (tamanhos centrais) na prática — é um refinamento de borda, não o caminho comum.

### Elegibilidade do produto-fonte e critério de tecido (RULE-01/D-09)
- **D-15:** O motor permanece **estrito**: "mesmo tipo de tecido" continua obrigatório sempre, tanto para o produto-fonte quanto para os candidatos, exatamente como travado em RULE-01/D-09 (Fase 2). Produto sem tag de tecido canônica válida fica fora do motor (nem como fonte, nem como candidato elegível).
- **Contexto operacional importante:** hoje (2026-07-11) **nenhum produto real da categoria Vestidos tem `fabric_tag_canonical` preenchido** (confirmado por leitura direta de `data/catalog.db` — 0 de 645 produtos). O usuário está bloqueado na importação em massa da planilha de tecidos pela própria Nuvemshop e só deve resolver isso na segunda-feira seguinte à data desta discussão.
- **D-16 (não confundir com D-15):** o usuário cogitou, só para essa janela de espera, uma "regra provisória" onde produtos sem tag caem para elegibilidade por cor+estoque apenas — **decisão final: não implementar isso no motor.** É só um workaround manual de teste do usuário nesta semana, não uma regra permanente de negócio. O motor construído nesta fase deve implementar SOMENTE a regra estrita (D-15); downstream agents não devem adicionar um modo de fallback "sem tecido" no código.
- **Implicação para testes:** como o catálogo real está sem tags de tecido no momento da Fase 3, a validação funcional do motor via Success Criteria #1 (produto de teste com candidatos elegíveis conhecidos) deve depender de fixtures com tags de tecido preenchidas manualmente — não do dump real de `catalog.db` enquanto a planilha não for importada.

### Formato de saída do motor
- **D-17:** A função é chamada **produto a produto** — recebe um `productId` específico (+ o snapshot/dados do catálogo necessários) e devolve as recomendações apenas daquele produto. Não processa o catálogo inteiro em uma única chamada (diferente do padrão de lote único usado na ingestão da Fase 2).
- **D-18:** Cada produto recomendado retornado é um **objeto rico**, não apenas um ID. Metadados obrigatórios em cada entrada:
  - `productId`
  - cor (valor usado no match)
  - tecido canônico (valor usado no match)
  - estoque total e distribuição por grade (os números usados no desempate, quando relevante)
- O usuário não pediu explicitamente um campo textual de "motivo do desempate aplicado" (ex: "decidido no nível 2 da cascata") — não é obrigatório, mas fica à discretion de Claude incluí-lo se for barato/natural dado que os números de estoque já estarão no objeto (ver Claude's Discretion abaixo).

### Claude's Discretion
- Granularidade cor produto vs. variante (achado IN-03 da Fase 2): o usuário não escolheu discutir esta área. Hoje 0 produtos multi-cor existem no catálogo real (confirmado via `catalog.db`), então é seguro assumir 1 cor representativa por produto nesta fase — mas o pesquisador/planejador deve decidir de onde exatamente essa cor vem (tabela `variants`, que tem granularidade correta por variante, vs. `catalog_snapshots.color_value`, que é sabidamente não confiável para multi-cor per IN-03) sem precisar voltar a perguntar ao usuário, já que na prática o valor é o mesmo hoje.
- Se incluir ou não um campo textual explicando qual nível da cascata de desempate (D-13) decidiu cada escolha, dado que já é "muito improvável" de ocorrer na prática.
- Assinatura exata da função (nomes de parâmetros, tipos de retorno, se lança erro ou retorna lista vazia quando o produto-fonte não é elegível) — a forma exata de "produto sem tag / sem estoque não participa" é discricionária, desde que a semântica de D-15 seja respeitada.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requisitos e roadmap desta fase
- `.planning/REQUIREMENTS.md` — RULE-01, RULE-02 (requisitos desta fase); RANK-01/02/03 (v2, explicitamente fora de escopo, não mapeados a nenhuma fase ainda)
- `.planning/ROADMAP.md` — seção "Phase 3: Motor de Recomendação Determinístico", Success Criteria
- `.planning/PROJECT.md` — seção "Requirements > Active", primeiro item (motor determinístico) — nota: a menção a "priorizando maior giro" nesse bullet refere-se a RANK-01 (v2), não é requisito desta fase

### Dados e schema herdados da Fase 2 (input do motor)
- `app-partners-recomendados/src/db/schema.sql` — schema das tabelas `products`, `variants`, `catalog_snapshots` (fonte do snapshot que o motor consome); nota nos comentários do próprio arquivo sobre `catalog_snapshots.color_value` ser "primeira variante retornada pela API, não necessariamente representativa" (ver IN-03 abaixo)
- `app-partners-recomendados/src/db/catalog-store.js` — wrapper de leitura/escrita SQLite já existente; motor da Fase 3 provavelmente só precisa das funções de leitura (nenhuma delas ainda expõe uma query pronta "candidatos por cor+tecido+estoque" — precisa ser criada)
- `.planning/phases/02-ingest-o-de-cat-logo-e-qualidade-de-dados/02-CONTEXT.md` — decisões D-01 a D-12 da Fase 2, incluindo D-04 (critério de estoque, grade ≥3 tamanhos) e D-09 (produto sem tag válida fica fora do motor — reafirmado nesta fase como D-15)
- `.planning/phases/02-ingest-o-de-cat-logo-e-qualidade-de-dados/02-REVIEW.md` — achado IN-03 (`snapshots[].colorValue` derivado de `product.variants[0]`, não confiável para produtos multi-cor) — relevante para a decisão de "Claude's Discretion" sobre de onde ler a cor
- `app-partners-recomendados/src/ingestion/ingest-catalog.js` — lógica existente de extração de cor/tamanho por nome de atributo (`extractVariantValueByAttributeName`, WR-06) e de resolução de tag de tecido canônica (`fabricTagCanonical`) — mesma convenção de extração que o motor deve reaproveitar ao ler `variants`/`catalog_snapshots`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app-partners-recomendados/src/db/catalog-store.js`: já expõe padrão de módulo (funções nomeadas, nunca o objeto `db` cru) que o motor deve seguir se precisar de uma nova função de leitura (ex: `getEligibleCandidates`).
- `app-partners-recomendados/src/ingestion/stock-availability.js`: já implementa `hasAvailableGrade`/`getVariantStock` (D-04) — o motor deve reaproveitar essa lógica de estoque em vez de recalcular do zero, já que a cascata de desempate (D-13) também depende de estoque por grade.
- `app-partners-recomendados/src/ingestion/fabric-taxonomy.js`: lógica de canonicalização de tags de tecido já existe — o motor consome `fabric_tag_canonical` já persistido, não precisa reimplementar o mapeamento.

### Established Patterns
- Módulos de domínio como função pura testável isoladamente com Vitest (ver `stock-availability.test.js`, `fabric-taxonomy.test.js`) — mesmo padrão esperado para o motor de recomendação (Success Criteria #4 exige isso explicitamente).
- Nomes/constantes de regra de negócio sempre nomeados explicitamente no código (nunca valor mágico solto), ex: `MIN_SIZES_IN_STOCK = 3` em `ingest-catalog.js` — aplicar o mesmo padrão para o limite de 8 recomendados e para os nomes de tamanhos centrais (P/M/G, 36/38/40).

### Integration Points
- O motor desta fase consome o snapshot já persistido pela Fase 2 (`catalog.db`) — não recebe dados ao vivo da API Nuvemshop.
- A saída do motor (objetos ricos por recomendação, D-17/D-18) é o que a Fase 4 (preview/aprovação) vai consumir para montar o diff "antes vs. depois" — a forma escolhida aqui vira a interface de dados entre as duas fases.

</code_context>

<specifics>
## Specific Ideas

- Produto de teste de referência mencionado pelo usuário durante a discussão: um Vestido de cor preta — usado como exemplo mental para descrever a cascata de desempate (D-13), não necessariamente o fixture literal a ser usado nos testes (mas serve de inspiração de nome/cenário).
- Tamanhos "centrais" citados explicitamente pelo usuário como critério de 3º nível de desempate: **P/M/G** (grade em letra) ou **36/38/40** (grade em número) — downstream agents devem tratar ambas as convenções de grade, não assumir uma só.

</specifics>

<deferred>
## Deferred Ideas

- **Conceito de "Grupo" de produtos:** o usuário cogitou inicialmente priorizar produtos do "mesmo Grupo" no desempate, mas descartou explicitamente a ideia (D-14) antes de qualquer definição de dados ser necessária. Não há campo de "grupo/linha/modelo" mapeado no catálogo hoje — se essa ideia voltar no futuro, precisa de investigação de dados própria (provavelmente não existe hoje na Fase 2).
- **RANK-01 (giro de vendas)**, **RANK-02 (faixa de preço)**, **RANK-03 (tamanho específico do visitante)** — já documentados como v2 em REQUIREMENTS.md, reafirmados como fora de escopo nesta discussão (base do desempate D-13 é só estoque, não vendas).
- **Regra de fallback "sem tecido = cor+estoque"** — avaliada e rejeitada como regra permanente do motor (D-16); é só um procedimento manual de teste do usuário nesta semana enquanto a planilha de tecidos não é importada. Não deve virar código nem requisito futuro sem uma nova decisão explícita do usuário.

</deferred>

---

*Phase: 3-Motor de Recomendação Determinístico*
*Context gathered: 2026-07-11*
