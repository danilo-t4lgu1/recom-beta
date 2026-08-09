# Roadmap: Bot de Produtos Recomendados — Talgui

## Overview

Este roadmap parte de uma correção crítica de escopo: a premissa herdada do resumo executivo anterior ("viabilidade já confirmada") era falsa. A revalidação empírica de 2026-07-08 provou que o campo nativo "Produtos Relacionados" não é gravável por nenhuma API de app, e definiu a arquitetura real (Metafields via API pública + Script NubeSDK via App Partners renderizando um bloco customizado no storefront). Essa arquitetura ainda tem partes não comprovadas empiricamente: suporte do tema Talgui a NubeSDK, possibilidade de suprimir o bloco nativo, e o pipeline completo funcionando de ponta a ponta em produção.

**Por isso a Fase 1 não é uma fase de "fundação" genérica — é um spike decisivo e estreito.** Ela prova, em um único produto real da loja Talgui, a cadeia inteira: autenticar via App Partners → ler o produto → escrever uma recomendação (mesmo que trivial/hardcoded) em um Metafield via API pública → um Script NubeSDK (construído e implantado via Partners) lê esse Metafield → renderiza visivelmente na página do produto na loja real — resolvendo empiricamente, não por suposição, se o tema suporta NubeSDK e se o bloco nativo pode coexistir sem conflito visual. **Se a Fase 1 revelar que a arquitetura não funciona como esperado, o roadmap precisa ser revisto antes de qualquer investimento adicional nas fases seguintes.**

Só depois dessa prova de conceito é que o projeto avança para construir a esteira completa: leitura do catálogo real (592 produtos) com padronização contínua de tags, o motor de recomendação determinístico, o painel de aprovação humana, a gravação segura em produção com rollback e auditoria, e finalmente o funcionamento diário automático e autossustentado na nuvem — cada fase entregando uma fatia vertical funcional (MVP), não uma camada horizontal isolada.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Spike de Viabilidade End-to-End** - Prova, em um produto real, que ler → gravar Metafield → Script NubeSDK renderizar no storefront funciona de ponta a ponta, e resolve as incógnitas de tema e conflito com o bloco nativo (completed 2026-07-10)
- [x] **Phase 2: Ingestão de Catálogo e Qualidade de Dados** - Leitura completa e correta do catálogo/estoque real (592 produtos) com tags de tecido padronizadas e validadas continuamente (completed 2026-07-11)
- [x] **Phase 3: Motor de Recomendação Determinístico** - Cálculo automático de até 8 recomendados por produto (cor + tecido + estoque), sem IA/ML (completed 2026-07-15)
- [x] **Phase 4: Preview e Aprovação Humana** - Painel web onde toda mudança de recomendação é revisada e aprovada (ou simulada em dry-run) antes de qualquer escrita real (completed 2026-07-16)
- [x] **Phase 5: Gravação Segura em Produção** - Escritas aprovadas vão para a loja com snapshot prévio, rollback, auditoria completa e alerta de falha (completed 2026-07-16)
- [x] **Phase 6: Operação Diária Autônoma na Nuvem** - Sistema roda sozinho todo dia, recalcula, aprova e atualiza o storefront sem depender de máquina pessoal ligada (completed 2026-07-17)

## Phase Details

### Phase 1: Spike de Viabilidade End-to-End

**Goal**: Provar empiricamente, em um único produto real da loja Talgui, que a arquitetura completa (auth via App Partners → leitura de produto → escrita em Metafield via API pública → Script NubeSDK lê o Metafield → renderiza um bloco "Recomendados" visível no storefront) funciona de ponta a ponta — e resolver, com evidência real e não suposição, se o tema ativo da Talgui suporta NubeSDK e se o bloco nativo "Produtos Relacionados" pode coexistir sem conflito visual.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: PLAT-01, PLAT-03, PLAT-04, PLAT-05, WRTE-01, FRNT-01
**Success Criteria** (what must be TRUE):

  1. Um App Partners privado (não homologado, `write_scripts` + NubeSDK) está registrado e autentica com sucesso contra a loja real Talgui
  2. Um Metafield escrito via API pública em um produto de teste real é confirmado por leitura de volta (round-trip), provando que a gravação funciona sem depender do endpoint interno inacessível
  3. Um Script NubeSDK publicado via esse App Partners lê esse Metafield no navegador e renderiza um bloco "Recomendados" visível na página real do produto de teste na loja Talgui — confirmado por captura de tela/inspeção ao vivo, não apenas em ambiente local
  4. Está documentado, com evidência (não suposição), se o tema ativo da Talgui suporta NubeSDK e se o bloco nativo "Produtos Relacionados" pode ser suprimido/ocultado ou coexiste sem conflito visual com o bloco customizado
  5. Existe uma decisão explícita registrada: a arquitetura está confirmada viável para prosseguir, ou o roadmap precisa ser revisado antes de investir nas fases seguintes

**Plans:** 5/5 plans complete

Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Verificar compatibilidade de tema/NubeSDK (gate bloqueante, Wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-02-PLAN.md — Registrar App Partners, autenticar, gravar e confirmar round-trip do Metafield (Wave 2)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 01-03-PLAN.md — Endpoint próprio somente-leitura + build do Script NubeSDK (Wave 3)
- [x] 01-04-PLAN.md — Suprimir bloco nativo via CSS/layout no admin (Wave 3, paralelo)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 01-05-PLAN.md — Publicar Script, verificar renderização ao vivo, registrar decisão final (Wave 4)

### Phase 2: Ingestão de Catálogo e Qualidade de Dados

**Goal**: O sistema lê o catálogo completo real da Talgui (592 produtos, variantes e estoque) de forma correta e respeitosa aos limites da API, e as tags de tipo de tecido usadas pelo motor de recomendação estão padronizadas e continuamente validadas, não apenas limpas uma vez.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: PLAT-02, DATA-01, DATA-02, DATA-03
**Success Criteria** (what must be TRUE):

  1. Uma leitura completa dos 592 produtos (catálogo, variantes, estoque) é executada sem erros de rate limit, pausando/adaptando dinamicamente com base nos headers `x-rate-limit-*` reais da loja, sem valor fixo assumido
  2. Estoque é lido a partir de `inventory_levels[]`, não do campo depreciado `variant.stock`, e o comportamento é validado com um produto real
  3. O estado atual das recomendações geridas pelo sistema (Metafields) é lido corretamente para cada produto antes de qualquer nova computação
  4. Existe um relatório de auditoria de frequência de tags de tecido cobrindo todo o catálogo real, com uma tabela de mapeamento (taxonomia canônica) de variantes de tag para valor padronizado
  5. Produtos com tags não mapeáveis à taxonomia canônica são sinalizados explicitamente (não adivinhados), e essa checagem roda a cada execução (não é limpeza pontual única)

**Plans:** 3/3 plans complete

Plans:
**Wave 1**

- [x] 02-01-PLAN.md — Estender client.js (listCategories/listProducts paginados) + rate limiter adaptativo + resolução real de category_id (Wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 02-02-PLAN.md — Schema SQLite + cálculo de disponibilidade (D-04) + auditoria de taxonomia de tecido (DATA-03, com checkpoint de confirmação de origem da tag) + orquestrador transacional (Wave 2)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 02-03-PLAN.md — Baseline de recomendações via Metafields (DATA-02) + execução real completa contra a categoria Vestidos + checkpoint de verificação final (Wave 3)

### Phase 3: Motor de Recomendação Determinístico

**Goal**: Dado um snapshot normalizado do catálogo, o sistema calcula automaticamente até 8 produtos recomendados por produto, aplicando simultaneamente mesma cor, mesmo tipo de tecido (padronizado) e estoque disponível obrigatório — de forma 100% determinística, sem IA/ML, auditável e testável isoladamente.
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: RULE-01, RULE-02
**Success Criteria** (what must be TRUE):

  1. Para um produto de teste com candidatos elegíveis conhecidos, o motor retorna exatamente os produtos esperados (mesma cor + mesmo tecido + com estoque), até o limite de 8
  2. Produtos sem estoque disponível nunca aparecem como recomendados, mesmo que combinem em cor e tecido
  3. Rodar o motor duas vezes com o mesmo snapshot de entrada produz exatamente a mesma saída (determinismo comprovado, sem aleatoriedade nem chamada a modelo de IA/ML)
  4. O motor roda sem nenhuma chamada de rede/API — é uma função pura que recebe snapshot e devolve recomendações, testável com dados fixos (fixtures)

**Plans:** 2/2 plans complete

Plans:
**Wave 1**

- [x] 03-01-PLAN.md — Motor puro recommendForProduct: elegibilidade estrita (cor + tecido canônico + estoque, D-15/D-16) + cascata de desempate D-13 + objetos ricos D-18, TDD com fixtures (Wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 03-02-PLAN.md — Leitura do snapshot real (getLatestSnapshotProducts em catalog-store.js, cor via variants per IN-03) + CLI de preview determinístico recommend-cli.js (Wave 2)

### Phase 03.1: Criterio de Grupo de Produtos no motor de recomendacao (Look Inteiro / Partes de Cima / Partes de Baixo, mescla e cota fixa) (INSERTED)

**Goal**: Estender o motor de recomendação determinístico (Fase 3) com um quarto critério — Grupo de Produtos — para que Look Inteiro (Vestidos/Macacões/Macaquinhos) permaneça auto-contido e Partes de Cima/Partes de Baixo mesclem entre si dentro do cap de 8 (RULE-01), com cota fixa 4+4 e backfill simétrico, resolvendo o grupo já na ingestão (categoria Nuvemshop → grupo canônico) para que o motor continue puro e zero-I/O (RULE-02).
**Mode:** standard
**Depends on**: Phase 3
**Requirements**: RULE-01 (emendado nesta fase — ver REQUIREMENTS.md)
**Success Criteria** (what must be TRUE):

  1. Um produto-fonte de Look Inteiro (Vestidos/Macacões/Macaquinhos) nunca recebe recomendação de Partes de Cima ou Partes de Baixo, mesmo que cor/tecido/estoque coincidam (D-27)
  2. Um produto-fonte de Partes de Cima ou Partes de Baixo com candidatos suficientes recebe exatamente 4 recomendações do mesmo grupo (cor+tecido+estoque) e 4 do grupo cruzado (cor+estoque, tecido não considerado), bloco mesmo-grupo primeiro (D-28/D-35)
  3. Quando um dos dois lados da cota não tem 4 elegíveis, o outro lado preenche os slots vazios com backfill simétrico, respeitando seu próprio critério, até completar 8 ou esgotar os elegíveis de ambos os lados (D-29)
  4. A cascata de desempate por estoque (D-13, Fase 3) continua decidindo a ordem dentro de cada bloco sem nenhuma mudança de comparador (D-30)
  5. Uma fonte de Partes de Cima/Baixo sem tecido canônico ainda gera recomendações do bloco cruzado, mesmo sem gerar nenhuma do bloco mesmo-grupo (D-34)
  6. O motor (`recommendation-engine.js`) continua zero-import/zero-I/O — o grupo do produto já vem resolvido da ingestão, nunca lido de uma tabela em tempo de execução do motor (RULE-02)
  7. A ingestão suporta múltiplas categorias vivas no mesmo snapshot de trabalho (`runIngestion` aceitando mais de uma categoria sob o mesmo run_id), corrigindo a limitação estrutural que impedia testar a mescla com dados reais (D-33)

**Plans:** 4/4 plans complete

Plans:
**Wave 1**

- [x] 03.1-01-PLAN.md — Resolução de Grupo de Produtos por categoria (product-group.js): mapeamento fechado D-26, crossGroupOf, extração e auditoria de categoria não mapeada (Wave 1)
- [x] 03.1-02-PLAN.md — Motor: extensão de elegibilidade/pool/cota por grupo (D-27-D-30, D-34, D-35), Recommendation com productGroupCanonical (Wave 1)
- [x] 03.1-03-PLAN.md — Schema + persistência: category_raw/product_group_canonical em catalog_snapshots, migração idempotente (Pitfall 2), leitura estendida (Wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 03.1-04-PLAN.md — Ingestão: extração de categories[] + resolução de grupo, correção multi-categoria em um único run (D-33), CLI atualizado (Wave 2)

### Phase 4: Preview e Aprovação Humana

**Goal**: Antes de qualquer escrita real na loja, toda mudança de recomendação calculada é apresentada num painel web como um diff "antes vs. depois" revisável, e nenhuma gravação acontece sem aprovação humana explícita — regra aplicada no backend, não só na interface. O mesmo fluxo também suporta simulação completa (dry-run) sem tocar a loja.
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: APRV-01, APRV-02, APRV-03, APRV-04
**Success Criteria** (what must be TRUE):

  1. Para cada produto com recomendação alterada, o painel web mostra um preview claro do estado "antes" e "depois", não apenas a lista final
  2. Um humano consegue aprovar ou rejeitar a mudança de um produto específico diretamente no painel, sem precisar editar planilha ou arquivo
  3. Uma tentativa de gravação sem aprovação prévia é rejeitada pelo backend mesmo que alguém tente pular a interface (ex: chamada direta ao endpoint de escrita) — a regra não vive só na UI
  4. Ativar o modo de simulação (dry-run) mostra o mesmo preview de sempre, mas nenhuma chamada de escrita real é feita à loja — confirmado comparando o estado da loja antes e depois de rodar em dry-run

**Plans:** 5/5 plans complete

Plans:
**Wave 1**

- [x] 04-01-PLAN.md — Persistência: tabela approval_queue + leitura de baseline/run em catalog-store.js (Wave 1)
- [x] 04-02-PLAN.md — Domínio puro: review-queue.js (D-22/D-23) + diff.js (D-19/D-20/D-21, backfill via recomputação) (Wave 1, paralelo)
- [x] 04-03-PLAN.md — Domínio puro: approval-gate.js (APRV-03) + write-executor.js (APRV-04, dry-run) (Wave 1, paralelo)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 04-04-PLAN.md — review-server.js: rotas GET + HTML SSR per UI-SPEC, fila e diff antes/depois (Wave 2)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 04-05-PLAN.md — review-server.js: rotas POST approve/reject/write + gate + dry-run + checkpoint humano (Wave 3)

**UI hint**: yes

### Phase 5: Gravação Segura em Produção

**Goal**: Recomendações aprovadas são gravadas nos Metafields do produto via API pública com segurança operacional completa: o estado anterior é sempre capturado antes de sobrescrever, qualquer alteração pode ser desfeita (rollback), toda mudança fica registrada em log de auditoria, e falhas na execução automática disparam notificação.
**Mode:** mvp
**Depends on**: Phase 4
**Requirements**: WRTE-02, WRTE-03, WRTE-04, WRTE-05
**Success Criteria** (what must be TRUE):

  1. Antes de qualquer escrita, o valor anterior do Metafield do produto é capturado e persistido — verificável inspecionando o snapshot salvo antes de uma escrita real de teste
  2. É possível reverter (rollback) uma alteração já gravada e confirmar, por leitura direta na loja, que o valor anterior foi restaurado corretamente
  3. Todo write real gerado por execução agendada ou manual fica registrado num log de auditoria mostrando o que mudou, quando, e o que disparou a mudança
  4. Uma falha simulada na execução agendada (ex: exceção forçada) dispara uma notificação (e-mail ou webhook) visível para o operador

**Plans:** 5/5 plans complete

Plans:
**Wave 1**

- [x] 05-01-PLAN.md — Cliente Nuvemshop: findMetafield/updateMetafield/deleteMetafield + createMetafield com rate limit; notify-failure.js (webhook WRTE-05) + .env.example (Wave 1, paralelo)
- [x] 05-02-PLAN.md — Persistência: tabela write_log (snapshot + auditoria, D-41) + insertWriteLog/getLastSuccessfulWriteLog/listWriteLog (Wave 1, paralelo)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 05-03-PLAN.md — write-executor.js: escrita real com snapshot/log/notificação + review-server.js POST /write aguardando a escrita real (Wave 2)
- [x] 05-04-PLAN.md — scripts/rollback.js: CLI de rollback com verificação de divergência (D-38/D-44) (Wave 2, paralelo)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 05-05-PLAN.md — review-server.js: GET /audit — tela cronológica somente-leitura (D-41/D-42) (Wave 3)

### Phase 6: Operação Diária Autônoma na Nuvem

**Goal**: O sistema roda inteiramente na nuvem, todos os dias, sem depender de nenhuma máquina pessoal ligada: recalcula recomendações com base em estoque e disponibilidade atualizados, gera um novo ciclo de preview/aprovação de forma idempotente, e o Script no storefront exibe as recomendações mais recentes de forma performática (com cache local) para quem visita a loja.
**Mode:** mvp
**Depends on**: Phase 5
**Requirements**: RULE-03, FRNT-02, FEED-01
**Success Criteria** (what must be TRUE):

  1. O motor roda em um agendamento diário na nuvem (ex: GitHub Actions) sem qualquer intervenção manual e sem depender de um computador pessoal estar ligado
  2. Rodar a execução diária duas vezes no mesmo dia não duplica pedidos de aprovação pendentes (idempotência comprovada)
  3. Uma mudança real de estoque/cor/tecido entre um dia e outro se reflete automaticamente no novo ciclo de recomendações calculado no dia seguinte
  4. O Script do storefront usa cache local (ex: `asyncSessionStorage` com TTL) e não busca os dados a cada visualização de página — confirmado observando o número de chamadas de rede feitas pelo navegador durante navegação repetida na mesma sessão

**Plans:** 3/3 plans complete

Plans:
**Wave 1**

- [x] 06-01-PLAN.md — catalog-store.js (idempotência diária/D-48) + scripts/run-daily-job.js (orquestrador do job agendado) (Wave 1)
- [x] 06-03-PLAN.md — storefront-script/main.js: cache TTL de 24h via sessionStorage (FRNT-02/D-50) (Wave 1, paralelo)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 06-02-PLAN.md — .github/workflows/daily-recompute.yml + conexão do repositório GitHub remoto (RULE-03) (Wave 2)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Spike de Viabilidade End-to-End | 5/5 | Complete    | 2026-07-10 |
| 2. Ingestão de Catálogo e Qualidade de Dados | 3/3 | Complete    | 2026-07-11 |
| 3. Motor de Recomendação Determinístico | 2/2 | Complete   | 2026-07-15 |
| 03.1. Critério de Grupo de Produtos (INSERTED) | 4/4 | Complete    | 2026-07-15 |
| 4. Preview e Aprovação Humana | 5/5 | Complete    | 2026-07-16 |
| 5. Gravação Segura em Produção | 5/5 | Complete    | 2026-07-16 |
| 6. Operação Diária Autônoma na Nuvem | 3/3 | Complete   | 2026-07-17 |

### Phase 7: Rollout do motor no catalogo completo (todas as categorias em estoque), validacao de cobertura e fluxo recorrente de re-gravacao

**Goal:** Rollout real e supervisionado do motor sobre as 11 categorias da taxonomia (só produtos-fonte com estoque e visíveis): (1) o 1º run supervisionado (dry-run -> conferência -> escrita real); (2) validação de cobertura com motivo item-a-item das zeradas + caminho de reprocesso; (3) o ciclo diário passa a calcular E gravar automaticamente (reverte o portão prévio do APRV-03, D-61), guardado por kill switch (D-62), disjuntor (D-63) e Defesas de integridade (D-66/D-67).
**Requirements**: RULE-01, RULE-02, RULE-03, PLAT-02, APRV-03, WRTE-02, WRTE-03, WRTE-04, WRTE-05, FEED-01
**Depends on:** Phase 6
**Plans:** 7/8 plans executed

Plans:
**Wave 1**

- [x] 07-01-PLAN.md — Motor: modelo de 2 pesos (D-55/56/57) + consumo do flag published (D-58), motor puro (RULE-01/RULE-02)
- [x] 07-02-PLAN.md — Camada de dados: coluna published + baseline de conjunto (disjuntor) + contagem por-categoria (Defesa 1)
- [x] 07-03-PLAN.md — Escrita scheduled sem gate (D-61) + Defesa 2 referencial na escrita (D-67)
- [x] 07-04-PLAN.md — Rollback em lote + correção do bug CR-01 (D-65)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 07-05-PLAN.md — Orquestrador diário: kill switch (D-62) + Defesa 1 (D-66) + disjuntor (D-63) + escrita automática (D-61/D-68) + resumo diário (D-69)
- [x] 07-06-PLAN.md — Relatório de cobertura + caminho de reprocesso (D-59/D-60)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 07-07-PLAN.md — Atualizar PROJECT.md/REQUIREMENTS.md para a Opção B (D-61) + remover protótipos temporários (D-70)

**Wave 4** *(blocked on Wave 3 completion)*

- [ ] 07-08-PLAN.md — Rollout supervisionado do 1º run (D-64): dry-run -> conferência (cobertura + /audit) -> escrita real, disjuntor isento via FIRST_ROLLOUT

### Phase 8: App de vitrine de Recomendados no storefront (carrossel formato nativo, preco promocional, grade de tamanhos, preview de visualizacao)

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 7
**Plans:** 0 plans

Plans:

- [ ] TBD (run /gsd-plan-phase 8 to break down)

### Phase 9: Dashboard de Métricas Reais (GA4) — visualizações, carrinho, receita e conversão do bloco Recomendados

**Goal:** [To be planned] — instrumentar o storefront-script com eventos GA4 Enhanced Ecommerce (`view_item_list`/`select_item`/`add_to_cart` marcados com `item_list_name="Recomendados"`) e construir um dashboard de leitura via Google Analytics Data API (GA4) que isole visualizações, adições ao carrinho, receita e conversão atribuíveis especificamente ao bloco Recomendados — permitindo comprovar com dados reais (não estimativa) o impacto do projeto na conversão/receita da Talgui.
**Requirements**: TBD
**Depends on:** Phase 8
**Plans:** 0 plans

**Nota de viabilidade (2026-07-22):** tecnicamente viável, confirmado por leitura direta do código (zero integração de analytics existente hoje — `gtag`/`dataLayer`/GA4 ausentes em todo o storefront-script e endpoints). **Sem dados retroativos** — a atribuição só passa a existir a partir do dia em que os eventos forem instrumentados; não há como reconstruir atribuição de tráfego passado. Pré-requisitos a confirmar antes de planejar: (1) GA4 já está configurado/instalado na loja Talgui (`gtag.js` presente no tema); (2) acesso admin ao GA4 para criar uma conta de serviço Google Cloud com permissão de leitura (Viewer) na propriedade, usada pela Data API.

Plans:

- [ ] TBD (run /gsd-plan-phase 9 to break down)

### Phase 10: Migração para NubeSDK (prazo regulatório: bloqueio de novas instalações do Script legado em 30/08/2026, remoção progressiva a partir de 30/10/2026)

**Goal:** [To be planned] — migrar o motor de recomendação + cron diário (já validados em produção via Script API tradicional, Fase 7) e o front-end do carrossel Recomendados (Fase 8) para o NubeSDK antes do prazo de descontinuação da Nuvemshop, com o projeto operando em modo Beta até a comprovação de funcionamento pleno na loja real já migrada, priorizando primeiro a validação do motor+cron e só depois a validação de front-end.
**Requirements**: TBD
**Depends on:** Phase 8
**Plans:** 0 plans

**Nota de risco (2026-07-22, pesquisa DevHub Nuvemshop):** datas de descontinuação confirmadas por fonte oficial (dev.nuvemshop.com.br). Apps NubeSDK rodam isolados em Web Workers, sem acesso direto ao DOM — a UI é renderizada de forma declarativa em "slots pré-definidos" pelo tema, não por seletor CSS livre como o Script legado (D-03). Morelia é tema OFICIAL da Nuvemshop (não de terceiro), o que tende a favorecer suporte mais rápido, mas o posicionamento exato do carrossel construído na Fase 8 pode não ser 1:1 portável — depende do slot que o tema expuser para apps de terceiro na página de produto. Plano B avaliado: "Edição de CSS avançada" no Admin (Loja online > Layout) só estiliza, não injeta HTML novo; se o NubeSDK se provar limitado demais em posicionamento, a alternativa mais robusta é o acesso FTP/código-fonte via plano Impulso (~R$164/mês), que permite colar a tag do script diretamente no template do tema, independente do mecanismo de app da Nuvemshop (trade-off: a loja deixa de receber atualizações automáticas de layout).

Plans:

- [ ] TBD (run /gsd-plan-phase 10 to break down)
