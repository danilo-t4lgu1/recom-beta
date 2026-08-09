# Phase 2: Ingestão de Catálogo e Qualidade de Dados - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-10
**Phase:** 2-Ingestão de Catálogo e Qualidade de Dados
**Areas discussed:** Estratégia de leitura de estoque, Padronização de tags de tecido, Armazenamento do catálogo ingerido, Leitura de recomendações atuais (baseline)

---

## Estratégia de leitura de estoque

| Option | Description | Selected |
|--------|-------------|----------|
| Uma única localização | 'tem estoque' = soma de inventory_levels naquela única localização > 0 | ✓ |
| Múltiplas localizações | Precisa decidir agregação | |
| Não sei / preciso verificar | Descobrir durante pesquisa técnica | |

**User's choice:** Localização única — expedição via Centro de Distribuição parceiro (Afterclick), que também integra saídas de pedidos.

| Option | Description | Selected |
|--------|-------------|----------|
| Produto inteiro | Qualquer tamanho com estoque conta como disponível | |
| Variante específica | Só variante exata conta | |

**User's choice:** Nenhuma das duas literalmente — critério real é **grade ≥ 3 tamanhos disponíveis** (não "qualquer 1 tamanho", nem "variante exata única"). Junto com isso, confirmou os 3 fatores de composição do motor: (1) grade ≥3 tamanhos, (2) mesmo Tipo de Cor, (3) mesmo Tipo de Tecido.

**Notes:** Revelou que tags de tecido não existem hoje no catálogo de forma confiável (só na Descrição, fonte não usada) — decisão de implementar via campo `tags`, ainda pendente de preenchimento em massa. Também revelou correção de escala: 592 é só a categoria "Novidades", catálogo completo tem ~15 mil SKUs.

| Option | Description | Selected |
|--------|-------------|----------|
| Leitura dinâmica dos headers | Ajuste automático conforme x-rate-limit-* | |
| Você decide | Deixar a cargo do planejamento técnico | ✓ |

**User's choice:** Você decide (respeitando PLAT-02, já travado).

---

## Escala e categoria piloto (subárea que emergiu durante a discussão de estoque)

| Option | Description | Selected |
|--------|-------------|----------|
| 592 produtos, ~15k SKUs (variantes) | 592 = itens distintos; 15k = todas as variantes | |
| 592 estava errado/desatualizado | Catálogo real de produtos é maior | |
| Não tenho certeza agora | Confirmar via API real | ✓ (parcialmente) |

**User's choice:** Nem a primeira nem a segunda exatamente — 592 é o total de SKUs de **uma categoria específica** ("Novidades"), não do catálogo inteiro. Catálogo completo (todas categorias) ~15 mil variações. Números exatos ainda não confirmados — confirmar via API real durante a execução da fase.

| Option | Description | Selected |
|--------|-------------|----------|
| Focar num piloto (1 categoria) | Testar só numa categoria escolhida | ✓ |
| Sistema ajuda a sinalizar o que falta | Relatório de produtos sem tag | |
| Só validar o que já existe | Sem trabalho extra de população | |

**User's choice:** Piloto em 1 categoria — depois refinado para **"Vestidos" (628 produtos)**, não "Novidades" (592, opção originalmente sugerida por Claude como continuidade). Motivo: mesma categoria já testada pelo projeto paralelo de ordenação de vitrine (checar conflito entre scripts), categoria líder de receita, maior volume/tráfego.

**Notes:** Usuário validou explicitamente a escolha com raciocínio de negócio (receita + volume + teste de compatibilidade cross-projeto). Claude concordou com a lógica.

---

## Padronização de tags de tecido

**User's choice:** Nenhum produto da categoria Vestidos tem tag de tecido hoje. Usuário vai popular manualmente via planilha + importação em massa pelo portal da Nuvemshop — fora do escopo de código da fase.

| Option | Description | Selected |
|--------|-------------|----------|
| Sim, gerar lista de pendentes | Sistema sinaliza produtos sem tag | |
| Não, só validar o que já existe | Produtos sem tag ficam fora do motor | ✓ |

**User's choice:** Não gerar relatório de pendências — usuário já vai popular tudo de uma vez via planilha.

---

## Armazenamento do catálogo ingerido

| Option | Description | Selected |
|--------|-------------|----------|
| Banco local leve (SQLite) | Já cotado na pesquisa da Fase 1 | ✓ (recomendado por Claude) |
| Recalculado do zero a cada execução | Sem persistência | |
| Você decide | — | (usuário pediu recomendação) |

**User's choice:** "O que você recomenda?" — Claude recomendou SQLite, usuário aceitou implicitamente ao prosseguir.

| Option | Description | Selected |
|--------|-------------|----------|
| Só o snapshot mais recente | Sobrescreve a cada execução | |
| Histórico versionado | Guardar snapshots anteriores | ✓ |

**User's choice:** Histórico versionado — com justificativa que expandiu a ideia original para um conceito de atribuição de conversão (recomendação → venda). Claude identificou isso como scope creep além de "histórico simples" e propôs separar: histórico simples de catálogo (estoque/tags) nesta fase, atribuição de conversão como ideia diferida. Usuário concordou.

---

## Leitura de recomendações atuais (baseline)

| Option | Description | Selected |
|--------|-------------|----------|
| Só um registro informativo/ponto de partida | Lê o que existe, guarda como estado inicial | ✓ |
| Detectar mudanças entre execuções (drift) | Comparar com gravação anterior | |

**User's choice:** Só registro informativo — drift detection já reservado para APRV-07 (v2).

---

## Claude's Discretion

- Algoritmo exato de throttling/rate-limiting (respeitando leitura dinâmica dos headers x-rate-limit-*, PLAT-02).
- Schema exato do SQLite (tabelas, colunas, índices).
- Estrutura do versionamento histórico, pensada para ser extensível depois sem redesenho completo.

## Deferred Ideas

- **Atribuição de conversão por recomendação:** rastrear se uma recomendação gerou venda, usar isso para manter produtos "provados" recomendados mesmo após reposição de estoque. Relacionado a RANK-01 (v2) mas mais específico — candidato a novo requisito ou refinamento futuro, não implementado na Fase 2.
- **Números exatos do catálogo completo:** confirmar via leitura real da API durante a execução da Fase 2 (categorias, produtos por categoria, total real de SKUs), atualizar PROJECT.md/REQUIREMENTS.md depois.
