# Phase 2: Ingestão de Catálogo e Qualidade de Dados - Context

**Gathered:** 2026-07-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Ler o catálogo real da loja Talgui via API pública da Nuvemshop (estoque por `inventory_levels[]`, variantes, cor, tags de tecido), padronizar/validar as tags de tecido como verificação contínua (não limpeza pontual única), e persistir esse catálogo normalizado em um armazenamento local — a base de dados confiável que o motor determinístico da Fase 3 vai consumir. Escopo desta fase é focado na categoria piloto "Vestidos" (628 produtos), não no catálogo completo (~15 mil SKUs em todas as categorias) — validar a arquitetura de ingestão num recorte real e relevante antes de escalar.

</domain>

<decisions>
## Implementation Decisions

### Escala e escopo da ingestão
- **D-01:** A categoria piloto desta fase é **"Vestidos"** (628 produtos) — não a categoria "Novidades" (592 SKUs) usada como referência inicial no PROJECT.md, nem o catálogo completo. Justificativa do usuário: (1) já existe um projeto paralelo de ordenação de vitrine sendo testado na mesma categoria — validar aqui também serve para checar se os dois scripts coexistem sem conflito; (2) é a categoria líder de receita da loja — onde o benefício real do projeto é mais mensurável; (3) é uma das maiores categorias por volume, com tráfego/navegação diário constante — bom teste de estresse para um catálogo abrangente.
- **D-02:** O número "592 produtos" citado no PROJECT.md original refere-se apenas à categoria "Novidades", não ao catálogo completo da loja. O catálogo completo, somando todas as categorias, chega a aproximadamente 15 mil variações (SKUs, contando cada grade de tamanho). Os números exatos (quantidade de categorias, produtos por categoria, total de SKUs) **ainda não foram confirmados** — devem ser confirmados via leitura real da API (`GET /categories`, `GET /products`) durante a execução desta fase, não travados agora com base em estimativa.
- **D-03:** A loja opera com **localização única de estoque** — expedição feita por um Centro de Distribuição parceiro (Afterclick), responsável tanto pelo armazenamento quanto pela integração de saídas de pedidos. Não há necessidade de lógica de agregação multi-localização.

### Critério de "estoque disponível"
- **D-04:** Estoque disponível é avaliado **por grade do produto**, não por variante isolada: um produto conta como "disponível" quando tem **3 ou mais tamanhos** com estoque > 0 (não basta 1 tamanho isolado ter estoque). Este é um refinamento concreto do critério "estoque disponível" já mencionado em RULE-01 (Fase 3) e deve ser lido/calculado já nesta fase via `inventory_levels[]` (DATA-01).
- **D-05:** Rate limit (2 req/s, buffer 40, leitura dinâmica dos headers `x-rate-limit-*`) fica a critério do planejamento técnico da fase — sem preferência específica de algoritmo de throttling do usuário, apenas a obrigação já travada em PLAT-02 de não assumir um valor fixo hardcoded.

### Tags de tecido (DATA-03)
- **D-06:** Hoje, **nenhum produto da categoria Vestidos tem tag de tipo de tecido preenchida**. Não é um problema de "tags bagunçadas para normalizar" — é ausência quase total do dado no campo estruturado (o único lugar onde o tecido aparece hoje é na Descrição em texto livre, fonte pouco confiável e cara de parsear, já descartada como fonte primária).
- **D-07:** O usuário vai popular as tags de tecido da categoria Vestidos manualmente, via planilha + importação em massa pelo Partners Portal/admin da Nuvemshop — isso é trabalho do usuário, fora do escopo de código desta fase.
- **D-08:** O sistema **não precisa** gerar relatório/lista de produtos sem tag de tecido para ajudar a priorizar preenchimento manual — o usuário já vai popular tudo de uma vez via planilha. A responsabilidade da Fase 2 é validar/padronizar o que existir (após o preenchimento do usuário), não detectar ausências.
- **D-09:** Produtos sem tag de tecido válida simplesmente ficam fora do motor de recomendação (RULE-01, Fase 3, já exige match de tecido) — não é tratado como erro nesta fase.

### Amenda (2026-07-15, pós-fechamento da fase): D-32 — resolução de tecido por palavra-chave

**D-32:** Em 2026-07-15 o usuário implementou as tags de tecido em massa no campo `product.tags` do catálogo real (D-07 concluído, fora do escopo de código). Os valores reais aparecem como **strings compostas** (`"vestido malha midi"`, `"crepe liso azul marinho"`, `"vestido alfaiataria"`), nunca isoladas — confirmado por leitura direta de `fabric_tag_audit`. Isso supera a premissa de D-06 ("ausência quase total do dado") sem invalidá-la: D-06 estava correto para o estado do catálogo em 2026-07-10; o dado passou a existir depois, só que em formato composto.

O desenho original (D-09: match **exato** de string contra `fabric_tag_canonical_map`, nunca fuzzy) exigiria uma linha curada por variante composta — não escala. **D-32 substitui o mecanismo de resolução**: `resolveFabricTagFromTags()` (`fabric-taxonomy.js`) resolve por **contenção de palavra-chave conhecida** dentro da tag bruta (case-insensitive, substring exato contra a lista fechada `malha`, `crepe`, `alfaiataria`, `tricoline`, `tule`, `cetim`, `bengaline`) — isto **não é fuzzy-matching por similaridade** (Levenshtein etc., que T-02-07/Pitfall 6 continuam proibindo): é comparação exata de substring, determinística e auditável (RULE-02). `fabric_tag_canonical_map` deixa de ser o mecanismo de resolução (a lógica não lê mais essa tabela para decidir `fabricTagCanonical`), mas a tabela permanece no schema para referência/telemetria futura.

**Confirmado pelo usuário:** bengaline é um subtipo de malha — produtos `bengaline` canonicalizam para `"malha"`, tornando-os elegíveis entre si no motor.

**Validado ao vivo em 2026-07-15** (run_id 5, categoria Vestidos, 675 produtos reais): 354/675 (52%) produtos passaram a ter `fabric_tag_canonical` preenchido (de 0/645 antes). 69 produtos reais têm tecido + cor + estoque disponível simultaneamente. `recommend-cli.js` testado contra um produto real (321418552) devolveu 5 recomendações reais, ranqueadas corretamente pela cascata D-13, determinismo confirmado (duas execuções, diff vazio). Suíte completa permanece 32/32 verde.

**Impacto em D-16 (03-CONTEXT.md, Fase 3):** a afirmação "0/645 produtos reais têm tecido canônico hoje" está desatualizada — não invalida a decisão de negócio de D-16 (nenhum fallback cor+estoque foi ou deve ser adicionado ao motor), só o estado de dado que a motivou.

### Armazenamento do catálogo ingerido
- **D-10:** Armazenamento recomendado: **SQLite local** (já cotado em `01-RESEARCH.md`/`STACK.md` da Fase 1 — `better-sqlite3`), sem infraestrutura externa, hospedado junto com o backend na nuvem. Escala do piloto (628 produtos) e mesmo do catálogo completo (~15 mil SKUs) está bem dentro do que SQLite suporta confortavelmente.
- **D-11:** O catálogo ingerido precisa de **histórico versionado simples** (snapshots de estoque/tags ao longo do tempo, não só o estado mais recente) — não apenas para auditoria, mas como fundação para uma ideia futura descrita pelo usuário (ver Deferred Ideas). Nesta fase, o histórico cobre apenas mudanças de estoque/tags — sem cruzamento com dados de vendas/conversão.

### Baseline de recomendações atuais (DATA-02)
- **D-12:** A leitura do estado atual dos Metafields de recomendação (antes de qualquer escrita futura da Fase 3+) é **apenas um registro informativo/ponto de partida** — não precisa de lógica de detecção de drift nesta fase (drift detection já está reservado para APRV-07, v2).

### Claude's Discretion
- Algoritmo exato de throttling/rate-limiting (respeitando D-05: leitura dinâmica dos headers, sem valor fixo).
- Schema exato do SQLite (tabelas, colunas, índices) para suportar D-10/D-11.
- Como estruturar o versionamento histórico (D-11) de forma que seja extensível depois para incluir dados de conversão sem redesenho completo.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Contexto e requisitos do projeto
- `.planning/PROJECT.md` — nota: a seção "Requirements > Active" cita "592 produtos" como se fosse o catálogo completo; essa premissa está **corrigida** por D-01/D-02 desta fase (592 = só categoria Novidades; catálogo completo ~15k SKUs; piloto desta fase = Vestidos, 628 produtos)
- `.planning/REQUIREMENTS.md` — PLAT-02, DATA-01, DATA-02, DATA-03 (requisitos desta fase); RANK-01 (v2, giro de vendas — relacionado à ideia diferida de atribuição de conversão)
- `.planning/ROADMAP.md` — seção Phase 2, Success Criteria

### Pesquisa técnica herdada da Fase 1
- `.planning/phases/01-spike-de-viabilidade-end-to-end/01-RESEARCH.md` — seção Standard Stack (menção a `better-sqlite3` como opção de armazenamento já cotada)
- `.planning/research/STACK.md` — avaliação de stack técnica do projeto
- `.planning/research/PITFALLS.md` — inclui achados sobre `variant.stock` depreciado (base de DATA-01) e inconsistência de tags (base de DATA-03)

### Evidência técnica da Fase 1 (reaproveitável)
- `app-partners-recomendados/src/nuvemshop-client/client.js` — wrapper de API pública já validado contra a loja real (auth, getProduct, getMetafields) — Fase 2 estende esse client para leitura de catálogo/estoque em lote, não recomeça do zero
- `app-partners-recomendados/src/auth/nuvemshop-auth.js` — módulo de auth reaproveitável

### Projeto paralelo (relevante para D-01)
- Projeto de ordenação automática de vitrine (mesma loja Talgui, mesma categoria "Vestidos") — mencionado por D-01 como motivo de testar nesta categoria; não há documentação formal desse projeto neste repositório, apenas conhecimento do usuário. Downstream agents devem tratar como um sistema externo cujo comportamento não é totalmente conhecido — ver nota em `<specifics>`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app-partners-recomendados/src/nuvemshop-client/client.js`: já expõe `getProduct(productId)` e `getMetafields({ownerId})` contra a API pública real — a leitura de catálogo/estoque em lote desta fase deve estender este módulo (ex: adicionar `listProducts({categoryId})`, `getInventoryLevels(productId)`), não recriar um client HTTP paralelo.
- `app-partners-recomendados/src/auth/nuvemshop-auth.js`: `getAccessToken()` já funcional, reaproveitável sem alteração.

### Established Patterns
- Backend minimalista sem framework HTTP externo (Node `http` nativo) — padrão já estabelecido na Fase 1, manter a menos que a complexidade desta fase (leitura em lote de centenas de produtos + persistência SQLite) justifique reconsiderar.
- `.env` com `NUVEMSHOP_ACCESS_TOKEN`/`NUVEMSHOP_STORE_ID`, nunca commitado — mesmo padrão de segredo já em uso.

### Integration Points
- Esta fase alimenta a Fase 3 (motor de recomendação) com o catálogo normalizado persistido em SQLite — o schema definido aqui é a interface de dados que a Fase 3 vai consumir.

</code_context>

<specifics>
## Specific Ideas

- Categoria piloto "Vestidos" foi escolhida deliberadamente para também servir como teste de compatibilidade com o projeto paralelo de ordenação de vitrine já rodando na mesma categoria (ver D-01) — vale um teste explícito de que os dois scripts (recomendações + ordenação de vitrine) não conflitam, mesmo estando em áreas de página distintas.
- Critério de estoque "grade ≥ 3 tamanhos disponíveis" (D-04) é uma decisão de negócio específica da Talgui, não um valor genérico — deve ser configurável/nomeado claramente no código (não hardcoded sem contexto), já que pode mudar no futuro.

</specifics>

<deferred>
## Deferred Ideas

- **Atribuição de conversão por recomendação (rastreamento de giro):** o usuário descreveu uma ideia de rastrear se um produto recomendado gerou uma venda de fato, e usar esse sinal para manter esse produto recomendado mesmo após reposição de estoque. Isso vai além de histórico versionado simples de catálogo (D-11) — precisa cruzar dados de exibição de recomendações com `/orders` (dados de venda). Relacionado a RANK-01 (v2, giro de vendas) mas mais específico (atribuição causal recomendação→venda, não só velocidade geral de vendas). Não implementar na Fase 2 — candidato a novo requisito v2 ou refinamento de RANK-01 quando essa fase for discutida.
- Números exatos do catálogo completo (categorias, produtos por categoria, ~15k SKUs) — usuário não tinha os números de cabeça; confirmar via leitura real da API durante a execução da Fase 2, atualizar PROJECT.md/REQUIREMENTS.md com os números reais depois de confirmados.

</deferred>

---

*Phase: 2-Ingestão de Catálogo e Qualidade de Dados*
*Context gathered: 2026-07-10*
