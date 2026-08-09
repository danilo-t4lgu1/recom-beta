# Phase 3: Motor de Recomendação Determinístico - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-11
**Phase:** 3-Motor de Recomendação Determinístico
**Areas discussed:** Desempate acima de 8 elegíveis, Elegibilidade do produto-fonte, Formato de saída do motor

---

## Desempate acima de 8 elegíveis

| Option | Description | Selected |
|--------|-------------|----------|
| ID do produto (ordem crescente) | Mais simples e 100% estável, sem significado de negócio | |
| Nome do produto (ordem alfabética) | Estável, mas mais custoso de auditar e pode mudar se o nome for editado | |
| Maior estoque total primeiro | Proxy barato de "menos risco de esgotar logo", sem depender de dados de vendas (v2) | ✓ |

**User's choice:** Maior estoque total primeiro — refinado em seguida com uma cascata completa.

**Notes:** O usuário inicialmente mencionou priorizar produtos do "mesmo Grupo" antes do desempate por estoque. Perguntado para esclarecer o que "Grupo" significava nos dados, o usuário descreveu a cascata completa sem usar o conceito, e depois confirmou explicitamente ("Já é o critério completo de desempate mesmo, esqueça sobre o Grupo de produtos") que a ideia de "Grupo" foi descartada. Critério final (cascata, 3 níveis):
1. Maior estoque total
2. Maior distribuição de estoque entre as grades de tamanho (em caso de empate no nível 1)
3. Estoque nos tamanhos centrais — P/M/G ou 36/38/40 quando a grade for numérica (em caso de empate no nível 2)

Usuário classificou o nível 3 como "muito improvável" de ser necessário na prática.

---

## Elegibilidade do produto-fonte

| Option | Description | Selected |
|--------|-------------|----------|
| Motor pula o produto (sem entrada) | Produto sem tag/estoque nem é processado | |
| Motor retorna lista vazia explicitamente | Todo produto passa pelo motor, lista pode ficar vazia | |

**User's choice:** Nenhuma das duas opções foi escolhida diretamente — o usuário revelou uma questão mais fundamental: hoje nenhum produto real tem tag de tecido preenchida (bloqueio de importação de planilha na Nuvemshop, resolução prevista para a segunda-feira seguinte).

**Notes:** O usuário cogitou inicialmente uma regra de fallback: produto sem tag de tecido ainda seria elegível se tivesse cor + estoque compatível. Perguntado explicitamente se isso deveria ser um comportamento permanente do motor ou só um workaround temporário de teste desta semana, o usuário confirmou: **"Não, é só um workaround temporário"**. Decisão final: o motor implementa apenas a regra estrita (RULE-01/D-09 da Fase 2 — tag de tecido válida sempre obrigatória, tanto para fonte quanto para candidatos). O fallback mencionado não deve virar código. Validação funcional do motor deve depender de fixtures (não do catálogo real, que está sem tags no momento desta discussão).

---

## Formato de saída do motor

| Option | Description | Selected |
|--------|-------------|----------|
| Objeto rico (ID + metadados) | Inclui cor, tecido, indicadores de estoque — auditável sem re-consultar o banco | ✓ |
| Lista simples de IDs | Mais simples de testar, mas exige re-consulta na Fase 4 para explicar escolhas | |

**User's choice:** Objeto rico (ID + metadados)

**Notes:** Perguntas de refinamento e respostas:
- Escopo da chamada: "lote inteiro" vs "produto a produto" → usuário escolheu **produto a produto** (função recebe um `productId` específico).
- Metadados necessários (multiSelect): usuário escolheu **cor e tecido canônico** + **estoque total e distribuição por grade**; não selecionou "motivo do desempate aplicado" (fica à discretion de Claude incluir ou não).

---

## Claude's Discretion

- Granularidade de cor por produto vs. variante (achado IN-03 da Fase 2 sobre produtos multi-cor) — área não selecionada pelo usuário para discussão; 0 produtos multi-cor existem hoje no catálogo real, então tratado como resolvido na prática, com nota para o pesquisador sobre qual tabela ler.
- Incluir ou não um campo textual de "motivo do desempate aplicado" no objeto de saída.
- Assinatura exata da função (nomes de parâmetros, comportamento de retorno quando produto-fonte não é elegível).

## Deferred Ideas

- Conceito de "Grupo" de produtos no desempate — descartado explicitamente pelo usuário (não há campo de grupo/linha/modelo mapeado no catálogo hoje).
- RANK-01 (giro de vendas), RANK-02 (faixa de preço), RANK-03 (tamanho específico do visitante) — reafirmados como v2, fora de escopo desta fase.
- Regra de fallback "sem tecido = cor+estoque" — avaliada e rejeitada como regra permanente; é apenas um procedimento manual de teste do usuário nesta semana.
