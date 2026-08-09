# Requirements: Bot de Produtos Recomendados — Talgui

**Defined:** 2026-07-08
**Core Value:** A vitrine de "Recomendados" se mantém sempre curada e sem estoque zerado, sem trabalho manual — e sem depender de uma escolha de plataforma que se prove tecnicamente inviável a meio do caminho.

## v1 Requirements

### Plataforma e Fundação

- [x] **PLAT-01**: Sistema autentica com a loja Talgui via App Partners privado (não homologado, "Exclusivo para Lojistas Selecionados") com escopo `write_scripts` + NubeSDK
- [x] **PLAT-02**: Sistema lê catálogo, variantes e estoque (592 produtos) via API pública da Nuvemshop, respeitando rate limits (com leitura dinâmica dos headers `x-rate-limit-*`, sem assumir um valor fixo)
- [x] **PLAT-03**: Spike técnico valida se o tema ativo da Talgui suporta NubeSDK antes de comprometer o resto da arquitetura
- [x] **PLAT-04**: Spike técnico investiga se é possível esconder/ocultar o bloco nativo "Produtos Relacionados" via edição de layout/CSS no admin (evitando dois blocos de recomendação conflitantes na mesma página)
- [x] **PLAT-05**: Backend expõe um endpoint próprio, público e somente leitura, para o Script do storefront consultar as recomendações — o token OAuth da API da Nuvemshop nunca é embutido no Script client-side

### Leitura de Dados

- [x] **DATA-01**: Sistema lê estoque via `inventory_levels[]` (não o campo `variant.stock`, que é depreciado e quebra silenciosamente em lojas multi-localização)
- [x] **DATA-02**: Sistema lê recomendações atuais de cada produto (estado antes de qualquer alteração), a partir dos próprios Metafields que o sistema gerencia
- [x] **DATA-03**: Sistema executa padronização/limpeza das tags de tipo de tecido antes de rodar o motor de recomendação, como validação contínua (não só limpeza pontual única) — reavaliada a cada execução para não deixar produtos novos reintroduzirem inconsistência

### Motor de Recomendação

- [x] **RULE-01** (emendado na Fase 03.1, 2026-07-15): Motor seleciona até 8 produtos recomendados por produto, aplicando o critério de Grupo de Produtos (Look Inteiro — Vestidos/Macacões/Macaquinhos — auto-contido; Partes de Cima ↔ Partes de Baixo mesclam com cota fixa 4+4 e backfill simétrico), mesma cor (sempre obrigatória), mesmo tipo de tecido canônico (obrigatório dentro do mesmo grupo — não exigido no bloco de grupo cruzado) e estoque disponível (sempre obrigatório). Redação original (Fase 3, 2026-07-08): "Motor seleciona até 8 produtos recomendados por produto, aplicando simultaneamente: mesma cor, mesmo tipo de tecido, com estoque disponível (obrigatório)" — preservada aqui para rastreabilidade histórica.
- [x] **RULE-02**: Motor é 100% determinístico baseado em regras — sem IA/ML
- [x] **RULE-03**: Motor roda em lote diário agendado na nuvem (ex: GitHub Actions), sem depender de máquina pessoal ligada

### Preview e Aprovação

- [x] **APRV-01**: Sistema gera preview revisável "antes vs. depois" para cada produto com mudança de recomendação, antes de qualquer escrita na loja
- [x] **APRV-02**: Painel web (não planilha) exibe o preview e permite aprovação humana produto a produto
- [x] **APRV-03**: ~~Nenhuma escrita na loja acontece sem aprovação humana prévia — regra aplicada no backend, não só na interface~~ **(redação original preservada para rastreabilidade).** **Portão PRÉVIO REVERTIDO na Fase 7 (D-61, 2026-07-21) para o caminho automático/agendado:** o motor determinístico grava automaticamente no regime diário, sem aprovação prévia. Decisão explícita e deliberada do usuário. O painel `review-server.js`/`GET /audit` deixa de ser gate de aprovação e passa a ser **verificação/auditoria PÓS-escrita** (diff antes/depois vira conferência opcional). Consequência: o **D-47** (Fase 6) foi alterado — o job diário, que antes só populava a fila de aprovação, passa a **calcular E gravar**. A rede de segurança migra para snapshot/rollback/auditoria + kill switch (D-62), disjuntor (D-63) e Defesas D-66/D-67. O caminho manual (escrita disparada explicitamente por humano) permanece inalterado
- [x] **APRV-04**: Sistema oferece modo de simulação (dry-run) que reutiliza a mesma tela de preview, sem executar nenhuma escrita real

### Gravação e Segurança Operacional

- [x] **WRTE-01**: Sistema grava recomendações aprovadas em Metafields do produto via API pública (não depende do endpoint interno inacessível a apps)
- [x] **WRTE-02**: Sistema captura o estado anterior (snapshot) imediatamente antes de cada escrita
- [x] **WRTE-03**: Sistema permite desfazer (rollback) uma alteração, restaurando o snapshot anterior
- [x] **WRTE-04**: Sistema registra log de auditoria de toda alteração: o que mudou, quando, disparado por execução agendada ou manual
- [x] **WRTE-05**: Sistema notifica falha (e-mail/webhook) quando a execução agendada diária falha ou lança exceção

### Storefront

- [x] **FRNT-01**: Script NubeSDK, injetado via App Partners, consulta o endpoint próprio de leitura (PLAT-05) e renderiza o bloco "Recomendados" customizado na página do produto
- [x] **FRNT-02**: Script usa cache local (ex: `asyncSessionStorage` do NubeSDK, com TTL) para evitar buscar os dados a cada visualização de página, já que os dados só mudam uma vez por dia

### Retroalimentação Automática

- [x] **FEED-01**: Execução diária recalcula recomendações com base em critérios atualizados de estoque e disponibilidade de cor/tecido, gerando novo ciclo de preview + aprovação automaticamente (idempotente — reexecutar no mesmo dia não duplica pedidos de aprovação)

## v2 Requirements

Adiado para depois do MVP validado.

### Ranqueamento e Refinamento

- **RANK-01**: Motor prioriza, entre os elegíveis, os produtos de maior giro (velocidade de vendas) — requer investigar fonte de dado de histórico de vendas (`/orders`), já que a API de produtos não expõe isso diretamente
- **RANK-02**: Critério adicional de faixa de preço na correspondência
- **RANK-03**: Correspondência por disponibilidade de tamanho específico (não só "tem estoque", mas "o tamanho provável do visitante tem estoque")

### Eficiência de Aprovação

- **APRV-05**: Aprovação/rejeição em lote (bulk) de múltiplos produtos de uma vez
- **APRV-06**: Comentários/notas em decisões de aprovação
- **APRV-07**: Detecção de "drift" no meio do ciclo — revalida uma recomendação aprovada-mas-não-gravada contra dados de estoque atualizados antes de escrever

### Observabilidade

- **MNTR-01**: Monitoramento tipo "dead man's switch" (alerta se a execução diária simplesmente não rodou, não só se falhou)
- **MNTR-02**: Dashboard de qualidade de tags (sinaliza variantes prováveis de duplicata/erro de digitação para revisão humana)
- **MNTR-03**: Histórico versionado de diffs (não só o último snapshot, navegável)

## Out of Scope

Explicitamente excluído. Documentado para prevenir scope creep.

| Feature | Reason |
|---------|--------|
| Recomendação por IA/ML (collaborative filtering, embeddings) | Contradiz o objetivo central: motor determinístico, auditável e barato. Também incompatível com o modelo de aprovação humana (saídas de ML não são plenamente explicáveis a um aprovador) |
| Personalização por visitante (recomendações diferentes por comprador) | Exige infraestrutura de tracking comportamental em tempo real; incompatível com o modelo de aprovação (não dá para pré-aprovar permutações infinitas por visitante) |
| Recomputação em tempo real/contínua | Quebra o fluxo de aprovação (nada para aprovar se grava instantaneamente); multiplica exposição ao rate limit sem benefício real em um catálogo de 592 SKUs |
| Edição de tema/Script via App Sob Medida | Confirmado tecnicamente inviável — App Sob Medida não expõe escopo de Script/tema. Resolvido via arquitetura Partners + Metafields + NubeSDK |
| ~~Escrita totalmente automática sem aprovação, mesmo após meses de histórico confiável~~ **REVERTIDO na Fase 7 (D-61)** | ~~Excluído permanentemente por constraint do projeto...~~ **Revisto por decisão explícita do usuário (2026-07-21):** sendo o motor determinístico e assertivo dentro dos critérios, a escrita automática no regime diário foi adotada (Opção B, D-61). Auditabilidade preservada por `write_log`/`GET /audit` PÓS-escrita, rollback em lote (D-65) e guardas D-62/D-63/D-66/D-67. Redação original mantida riscada para rastreabilidade |
| PIM completo (enriquecimento, sincronização multi-canal, DAM) | Overkill para 592 SKUs em um único canal; o problema real é normalização pontual de tags de tecido, já coberto por DATA-03 |
| Pin/override manual (forçar produto específico numa vaga de recomendação) | Expande escopo de "automação + aprovação" para "automação + aprovação + merchandising manual" — um produto diferente |
| Aprovação parcial por slot dentro de um produto | Adiciona complexidade real ao modelo de dados; só vale a pena se aprovação por produto inteiro se mostrar grosseira demais na prática |
| Regras de sazonalidade | ROI incerto para loja de marca única sem forte variação sazonal conhecida no catálogo |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PLAT-01 | Phase 1: Spike de Viabilidade End-to-End | Complete |
| PLAT-02 | Phase 2: Ingestão de Catálogo e Qualidade de Dados | Complete |
| PLAT-03 | Phase 1: Spike de Viabilidade End-to-End | Complete |
| PLAT-04 | Phase 1: Spike de Viabilidade End-to-End | Complete |
| PLAT-05 | Phase 1: Spike de Viabilidade End-to-End | Complete |
| DATA-01 | Phase 2: Ingestão de Catálogo e Qualidade de Dados | Complete |
| DATA-02 | Phase 2: Ingestão de Catálogo e Qualidade de Dados | Complete |
| DATA-03 | Phase 2: Ingestão de Catálogo e Qualidade de Dados | Complete |
| RULE-01 | Phase 3: Motor de Recomendação Determinístico + Phase 03.1 (emenda) | Complete |
| RULE-02 | Phase 3: Motor de Recomendação Determinístico | Complete |
| RULE-03 | Phase 6: Operação Diária Autônoma na Nuvem | Complete |
| APRV-01 | Phase 4: Preview e Aprovação Humana | Complete |
| APRV-02 | Phase 4: Preview e Aprovação Humana | Complete |
| APRV-03 | Phase 4: Preview e Aprovação Humana (portão prévio) → **revertido na Phase 7 para o caminho automático (D-61)** | Complete (gate prévio aposentado no caminho automático) |
| APRV-04 | Phase 4: Preview e Aprovação Humana | Complete |
| WRTE-01 | Phase 1: Spike de Viabilidade End-to-End | Complete |
| WRTE-02 | Phase 5: Gravação Segura em Produção | Complete |
| WRTE-03 | Phase 5: Gravação Segura em Produção | Complete |
| WRTE-04 | Phase 5: Gravação Segura em Produção | Complete |
| WRTE-05 | Phase 5: Gravação Segura em Produção | Complete |
| FRNT-01 | Phase 1: Spike de Viabilidade End-to-End | Complete |
| FRNT-02 | Phase 6: Operação Diária Autônoma na Nuvem | Complete |
| FEED-01 | Phase 6: Operação Diária Autônoma na Nuvem | Complete |

**Coverage:**

- v1 requirements: 23 total (contagem corrigida — o total de "25" anteriormente listado não refletia os REQ-IDs de fato enumerados neste documento)
- Mapeados a fases: 23/23 ✓
- Não mapeados: 0

**Nota sobre requisitos que aparecem provados no spike (Fase 1) e depois operacionalizados:** PLAT-01, PLAT-05, WRTE-01 e FRNT-01 são comprovados tecnicamente já na Fase 1 (num único produto de teste), porque são exatamente o que o spike de viabilidade precisa demonstrar. Fases posteriores (2, 5 e 6) reutilizam esse mesmo caminho já provado e o escalam/operacionalizam para o catálogo completo (592 produtos) e para a rotina diária — não o reimplementam do zero.

**Nota sobre a emenda de RULE-01 (Fase 03.1, 2026-07-15):** a Fase 03.1 (inserção urgente entre a Fase 3 e a Fase 4) amenda RULE-01 in-place em vez de criar um novo ID (ex: RULE-04) — decisão registrada em `03.1-RESEARCH.md` (`## Phase Requirements`): "Grupo de Produtos" é tratado como uma dimensão do MESMO critério de elegibilidade de RULE-01 (mesma cor + mesmo tecido + estoque + grupo), não uma regra de negócio separada, consistente com D-14/D-31 (o "Grupo" nunca foi um nível de desempate à parte, nem na Fase 3 nem na 03.1). RULE-01 permanece um único ID rastreável através das duas fases que juntas descrevem seu comportamento completo e final.

---
*Requirements defined: 2026-07-08*
*Last updated: 2026-07-22 — Fase 07: APRV-03 revertido para o caminho automático/agendado (D-61); D-47 alterado (job diário calcula E grava); item "Escrita totalmente automática sem aprovação" saiu de Out of Scope. Redações originais preservadas riscadas para rastreabilidade.*
*Anterior: 2026-07-15 — RULE-01 emendado pela Fase 03.1 (Critério de Grupo de Produtos)*
