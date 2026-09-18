# Análise de Co-Compra — Produtos que os Clientes Compram Juntos

**Data:** 16/09/2026
**Escopo:** Motor de Recomendação de Produtos — Talgui
**Base analisada:** 51.776 pedidos lidos via API, 41.284 pedidos pagos e não-cancelados (base real de análise), 100.533 itens de pedido

---

## Resumo executivo

Hoje o motor de recomendação da Talgui sugere produtos por **similaridade** (mesma cor,
mesmo tecido, disponibilidade de estoque). Essa análise buscou responder uma pergunta
diferente: **quais produtos os clientes realmente compram juntos, na prática, segundo o
histórico real de pedidos?**

A resposta é clara e estatisticamente robusta: **existe um padrão de compra conjunta
forte e consistente**, especialmente entre Partes de Cima e Partes de Baixo (o clássico
"look completo"), mas também um segundo padrão não previsto — clientes comprando **a
mesma peça em duas cores diferentes** no mesmo pedido.

Nenhum desses dois padrões é hoje considerado pelo motor de recomendação. Este
documento traz os achados como base para decidirmos, na próxima etapa, como
incorporá-los.

---

## Metodologia (resumo)

- Dados extraídos via API de Pedidos da Nuvemshop (escopo `read_orders`, autorizado em
  16/09/2026), cobrindo o histórico completo de pedidos da loja.
- Considerado "pedido válido" para a análise: `status ≠ cancelado` e `pagamento = pago`
  — carrinhos abandonados e pedidos cancelados não entram na contagem.
- Para cada par de produtos que apareceu no mesmo pedido, calculamos três métricas
  (metodologia de "cesta de compras", a mesma usada por grandes varejistas para decisão
  de cross-sell):
  - **Contagem (count):** em quantos pedidos distintos os dois produtos apareceram
    juntos. É a métrica mais confiável — evidência bruta e direta.
  - **Confiança:** das vezes que o produto A foi comprado, em quantos % dos casos o
    produto B também estava no pedido.
  - **Lift:** o quanto a combinação acontece acima do que o acaso explicaria. É útil
    para confirmar que a relação não é coincidência, mas é sensível a produtos de
    baixíssimo volume de venda — por isso priorizamos `count` como critério principal
    de decisão, não lift isoladamente.

---

## Achado 1 — Looks completos validados por dados reais (Partes de Cima ↔ Partes de Baixo)

Os pares abaixo são as combinações de "cima + baixo" com maior número de pedidos reais
em comum — evidência direta de que os clientes já estão montando esses looks sozinhos,
sem nenhuma sugestão do site:

| Peça de Cima | Peça de Baixo | Pedidos em comum | Lift |
|---|---|---:|---:|
| Blusa Tina Em Poá Marrom | Saia Eloá Midi Em Poá Marrom | **232** | 99 |
| Blusa Tina Em Poá Preta | Saia Eloá Midi Em Poá Preta | **143** | 108 |
| Blusa Kairi Em Malha Preta | Saia Inara Midi Em Malha Preta | **109** | 81 |
| Cropped Aldeite Preto | Shorts Kalina Em Alfaiataria Preto | **100** | 130 |
| Colete Zelita Em Alfaiataria Verde | Calça Silvia Em Alfaiataria Verde | 66 | 153 |
| Blusa Tayla Em Alfaiataria Lisa Rosa | Shorts Saia Jany Em Alfaiataria Lisa Rosa | 59 | 102 |
| Blusa Alcione Em Alfaiataria Rosa | Calça Lenilda Em Alfaiataria Lisa Rosa | 51 | 175 |
| Cropped Aldeite Rosa | Shorts Kalina Em Alfaiataria Rosa | 46 | 325 |
| Blusa Lucimar Em Alfaiataria Lisa Amarelo | Saia Heleninha Midi Em Alfaiataria Lisa Amarela | 45 | 137 |
| Blusa Kairi Em Malha Amarelo | Saia Inara Midi Em Malha Amarelo | 44 | 166 |

**Destaque:** as combinações **Blusa Tina + Saia Eloá** e **Blusa Kairi + Saia Inara**
(replicadas em várias cores) são, de longe, os "conjuntos" mais vendidos da loja em
volume absoluto — candidatos naturais tanto para o motor quanto para uma vitrine
editorial dedicada ("Looks Combinados").

---

## Achado 2 — Um padrão não esperado: a mesma peça, em duas cores

Um segundo padrão apareceu com força equivalente e não tem relação com "cima + baixo":
clientes comprando **o mesmo modelo de peça em duas cores diferentes**, no mesmo
pedido.

| Produto A | Produto B | Pedidos em comum | Lift |
|---|---|---:|---:|
| Regata Daniele Em Malha Off White | Regata Daniele Em Malha Preta | **72** | 79 |
| Blusa Debora Em Malha Off White | Blusa Debora Em Malha Preta | **69** | 36 |
| Regata Daniele Em Malha Marrom | Regata Daniele Em Malha Preta | 55 | 84 |
| Blusa Mariane Em Malha Marrom | Blusa Mariane Em Malha Preta | 52 | 30 |
| Blusa Debora Em Malha Marrom | Blusa Debora Em Malha Preta | 50 | 39 |
| Blusa Kairi Em Malha Preta | Blusa Kairi Em Malha Bege | 47 | 32 |
| Blusa Maria Clara Em Malha Rosa | Blusa Maria Clara Em Malha Azul | 46 | 40 |
| Blusa Thailan Em Malha Off White | Blusa Thailan Em Malha Preta | 42 | 33 |
| Blusa Kairi Em Malha Azul | Blusa Kairi Em Malha Amarelo | 38 | 58 |
| Vestido Nanci Midi Em Malha Petróleo | Vestido Nanci Midi Em Malha Marrom | 32 | 23 |
| Casaco Raquel Em Alfaiataria Lisa Bege | Casaco Raquel Em Alfaiataria Lisa Marrom | 31 | 57 |

**Leitura de negócio:** modelos como "Blusa Debora", "Blusa Kairi", "Regata Daniele" e
"Blusa Mariane" têm um público que gosta da modelagem e leva mais de uma cor na mesma
compra. Isso sugere uma vitrine complementar do tipo **"Leve também nesta cor"** — um
mecanismo diferente de "combine com", e que o motor atual não cobre de forma alguma
(hoje ele só recomenda produtos da MESMA cor, nunca cores diferentes do mesmo modelo).

**Observação sobre vestidos/macacões:** nos dados reais, peças "Look Inteiro" (vestidos,
macacões, macaquinhos) praticamente não aparecem combinadas com peças avulsas no mesmo
pedido — o único padrão relevante encontrado para essa categoria foi também
"mesmo modelo, cor diferente" (ex: Vestido Nanci). Isso valida uma decisão já existente
no motor atual, que trata "Look Inteiro" como categoria autocontida.

---

## Um exemplo detalhado, para ilustrar a leitura correta dos números

Par: **Calça Ingrid Amarelo Claro** + **Blusa Dalva Amarela Claro**
(este par tem o maior "lift" da base — 3.931 — mas o menor volume: apenas 6 pedidos em comum)

- A Calça Ingrid apareceu em apenas 7 pedidos no período todo.
- A Blusa Dalva apareceu em 9 pedidos no período todo.
- As duas apareceram juntas em 6 desses pedidos.
- Confiança: 6 ÷ 7 = **85,7%** das vezes que a calça foi comprada, a blusa também estava no carrinho.
- **Porém:** essa cor específica de ambos os produtos já está esgotada/despublicada na loja hoje — é um sinal histórico real, mas não acionável neste momento sem repor estoque.

Esse exemplo mostra por que a **contagem absoluta de pedidos (`count`)** é o critério
mais confiável para priorizar decisões de negócio — o "lift" alto de itens raros pode
parecer mais impressionante, mas representa pouca evidência real.

---

## Situação atual do motor frente a esses achados

Verificamos, rodando o motor de produção contra o catálogo atual, que **o sinal de
co-compra hoje está ausente do motor**. Nos 14 principais pares de "look completo"
testados diretamente na engine:

- Apenas **1 par** já se recomenda mutuamente hoje.
- **2 pares** se recomendam em uma única direção.
- **11 pares** — incluindo casos com estoque disponível dos dois lados e mesma cor —
  **não se recomendam em nenhuma direção**, porque o motor atual escolhe candidatos do
  bloco cruzado (Cima↔Baixo) só por cor + estoque, com apenas 4 vagas por lado, sem
  nenhum conhecimento de qual produto realmente vende junto.

---

## Próximos passos propostos

1. Persistir os pares de co-compra validados (com piso mínimo de `count` a definir com
   o time) numa tabela nova do banco, recalculada periodicamente (ex: semanal — pedidos
   não mudam tão rápido quanto estoque).
2. Dar prioridade máxima a esses pares dentro do motor de recomendação, **sempre
   condicionado à grade de estoque disponível** — um par historicamente forte nunca é
   exibido se o produto estiver esgotado ou despublicado.
3. Tratar os dois achados (looks cross-group e "mesma peça, cor diferente") como dois
   mecanismos de recomendação complementares, já que respondem a comportamentos de
   compra diferentes.
4. Avaliar destaque editorial manual (fora do motor) para os pares de maior volume
   absoluto (Blusa Tina + Saia Eloá, Blusa Kairi + Saia Inara), como vitrine/coleção
   dedicada de curto prazo, independente do prazo de implementação técnica no motor.

---

*Relatório gerado a partir de dados reais extraídos da API de Pedidos da Nuvemshop em
16/09/2026. Metodologia e código reexecutáveis em `src/recommendation/co-purchase-analysis.js`
e `scripts/report-co-purchase.js`.*
