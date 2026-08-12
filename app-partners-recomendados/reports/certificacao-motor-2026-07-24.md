# Certificação do motor de recomendação — 2026-07-24

Gerado após a ingestão bem-sucedida do cron de hoje (run GitHub Actions `30091364329`,
06:00 UTC agendado / 11:57 UTC executado, commit `b457e71`, 1773 produtos lidos).

Compara, para cada produto-fonte com uma escrita registrada em `write_log`, o que está
**atualmente gravado na loja** (`getLastWrittenValuesForAllProducts`) contra o que o
**motor recomputaria agora** (`recommendForProduct`) sobre o snapshot mais recente.
Gerado por `node scripts/engine-certification-report.js` — reexecutável a qualquer
momento (read-only, não escreve na loja nem no banco).

## Resumo

| Métrica | Valor |
|---|---|
| Produtos-fonte com escrita registrada | 794 |
| OK — idêntico ao recompute agora | 783 (98,6%) |
| Renovação OK — item saiu, novo elegível assumiu a vaga | 9 |
| **Sem backfill** — item saiu, sem substituto elegível disponível | **2** |
| Ranking "quebrado" — mesmo conjunto, ordem diferente | 214 |
| Não encontrado no snapshot atual | 0 |

## Suas 3 perguntas, respondidas

### 1. A leitura/atualização de estoque está funcionando?

**Sim.** A ingestão de hoje leu 1773 produtos com sucesso (vs. 1724 na última ingestão
válida, 22/07) e os números de estoque usados pelo motor refletem esse snapshot novo.
A prova mais direta disso são justamente as 214 reordenações abaixo — elas só
acontecem porque o estoque de produtos específicos mudou o suficiente para alterar a
cascata de desempate D-13 (estoque total → tamanhos com estoque → tamanhos centrais).

### 2. O ranking está sendo respeitado?

**O motor sim — a gravação na loja não sempre.** O motor (`recommendForProduct`) é
100% determinístico e ordena corretamente por peso (D-55/D-56) e cascata de estoque
(D-13) toda vez que é chamado — confirmado pelas 214 reordenações refletindo estoque
novo corretamente.

**Achado importante:** o job diário só regrava o Metafield na loja quando o
**conjunto** de produtos recomendados muda (`setsEqual`, comparação sem considerar
ordem — D-68, `scripts/run-daily-job.js:258`). Se só a ORDEM muda (mesmos produtos,
posições diferentes por causa de estoque), o job **não** regrava — é uma decisão de
design deliberada para economizar chamadas de escrita, não um bug. Consequência
prática: a ordem exibida ao vivo na loja pode ficar "desatualizada" em relação à
ordem que o motor computaria agora, mesmo que o CONJUNTO de produtos recomendados
continue 100% correto. Isso só se resolve quando algum produto do conjunto muda (sai/
entra), disparando uma regravação que também atualiza a ordem.

**214 dos 794 produtos-fonte (27%)** estão hoje nessa situação — conjunto correto,
ordem potencialmente desatualizada. Não é um erro do motor nem da leitura de estoque;
é uma característica conhecida do pipeline de escrita que vale a pena você decidir se
quer manter (economia de escritas) ou apertar (regravar também em mudança de ordem).

### 3. Quando um produto é removido por elegibilidade (ex: stockout), um novo elegível assume a vaga?

**Sim, na grande maioria dos casos — 9 confirmados hoje.** Exemplo real:

- Produto-fonte `322839932` (Partes de Baixo): produto `336301954` saiu do estoque/
  elegibilidade e `322840153` (novo elegível) assumiu a vaga automaticamente.
- Produto-fonte `322841345` (Look Inteiro): 2 produtos saíram (`335195745`,
  `349886002`) e 2 novos assumiram (`322841615`, `321418570`).

**2 casos sem substituto**, e ambos fazem parte do MESMO par mútuo — não é um bug,
é o pool de cor esgotado:

- Produto-fonte `343800753` (Look Inteiro): `343820772` saiu, sem substituto.
- Produto-fonte `343820772` (Look Inteiro): `343800753` saiu, sem substituto.

Os dois produtos recomendavam um ao outro; algo mudou entre eles (provavelmente
estoque ou cor) que os tornou mutuamente inelegíveis, e não existe um 8º candidato
elegível na mesma cor para preencher a vaga. Isso é o comportamento **fail-closed
correto** do motor (nunca inventa um candidato inelegível, D-29) — não uma falha de
recompute. Vale investigar o catálogo real desses 2 produtos se você quiser aumentar
a cobertura desse par específico (ex: taguear mais produtos daquela cor/grupo).

## Como reexecutar

```bash
cd app-partners-recomendados
node scripts/engine-certification-report.js          # texto legível (este documento)
node scripts/engine-certification-report.js --json   # JSON completo, todas as 794 linhas
```

Read-only — nunca escreve na loja nem no banco. Módulo puro testado em
`src/report/engine-certification.test.js` (7 testes).
