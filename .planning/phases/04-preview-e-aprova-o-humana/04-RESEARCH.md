# Phase 4: Preview e Aprovação Humana - Research

**Researched:** 2026-07-16
**Domain:** Painel web de revisão humana (diff antes/depois) + gate de aprovação no backend + modo dry-run, sobre um motor de recomendação puro já existente (Fase 3/03.1)
**Confidence:** MEDIUM-HIGH (arquitetura e pitfalls verificados por leitura direta do código-fonte real; mecanismo web e padrões de segurança apoiados em fontes web CITED/LOW — ver Assumptions Log)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Curadoria manual (o que o humano pode editar)**
- D-19: O humano pode **remover** recomendações da lista proposta pelo motor antes de aprovar — não pode adicionar itens novos nem reordenar.
- D-20: Ao remover um item, o slot vazio é preenchido por **backfill** com o próximo candidato elegível ranqueado (o "9º"), mantendo até 8. O planejador decide se isso é (a) extensão do motor que devolve N candidatos ranqueados, ou (b) a Fase 4 re-executa a seleção excluindo os ids removidos. Qualquer caminho DEVE preservar determinismo e elegibilidade estrita (D-15).
- D-21: O item que entra por backfill entra **automaticamente** na lista aprovada — não é re-questionado.

**Escopo da fila de revisão**
- D-22: O painel mostra apenas produtos cuja proposta "depois" difere do baseline "antes". Produtos sem mudança não entram na fila.
- D-23: "Mudança" = **conjunto de ids recomendados diferente** (algum item adicionado ou removido). Reordenação pura do mesmo conjunto NÃO conta como mudança.

**Unidade de aprovação e o que a aprovação produz**
- D-24: unidade de aprovação = **produto inteiro** (um voto aprovar/rejeitar por produto, sobre a lista já eventualmente curada via remoção D-19).
- D-25: Aprovar produz um **registro persistido do conjunto aprovado** (ex.: tabela de aprovações no SQLite) marcando produto + conjunto exato de ids como "aprovado, pendente de escrita". A Fase 5 só pode escrever produtos com esse registro. O registro DEVE capturar o conjunto de ids aprovados, não apenas um booleano.

### Claude's Discretion

- **Formato visual do diff antes/depois** — livre, desde que deixe claro o estado "antes" E "depois" (não só a lista final, SC#1).
- **Hospedagem e acesso do painel** — provável e coerente com a arquitetura atual: ferramenta **local** sobre `data/catalog.db`, sem login/auth (uso interno de um operador). Mecanismo web (reaproveitar `server.js`/`api/` vs. novo) é discricionário.
- **Como a Fase 4 entrega o gate de backend (APRV-03/SC#3)** — discricionário, desde que SC#3 seja demonstrável sem escrita real na loja: (a) endpoint/função de escrita já com o gate ativo e a escrita real como stub/no-op até a Fase 5, ou (b) apenas a função reutilizável "pode escrever?" + testes, que a Fase 5 envolve no endpoint real.
- **Semântica do dry-run (APRV-04/SC#4)** — discricionário, garantindo um mecanismo/flag **reutilizável** que continue significativo na Fase 5.

### Deferred Ideas (OUT OF SCOPE)

- APRV-05 — aprovação/rejeição em lote (bulk).
- APRV-06 — comentários/notas em decisões de aprovação.
- APRV-07 — detecção de "drift" (revalidar aprovado-mas-não-gravado contra estoque atualizado antes de escrever).
- Adicionar/reordenar itens na curadoria manual (D-19 permite só remover).
- Editor de curadoria completo / painel na nuvem com autenticação (Fase 6).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| APRV-01 | Preview revisável "antes vs. depois" por produto com mudança, antes de qualquer escrita | Ver `## Architecture Patterns` (diff builder, set-comparison D-23) e `## Code Examples` |
| APRV-02 | Painel web (não planilha) exibe o preview e permite aprovação humana produto a produto | Ver `## Standard Stack` (mecanismo web nativo) e `## Recommended Project Structure` |
| APRV-03 | Nenhuma escrita sem aprovação prévia — regra no backend, não só na UI | Ver `## Don't Hand-Roll` (approval gate) e `## Common Pitfalls` (Pitfall 3) |
| APRV-04 | Modo dry-run reutiliza a mesma tela, sem escrita real | Ver `## Architecture Patterns` (write-executor com flag) e `## Common Pitfalls` (Pitfall 6) |
</phase_requirements>

## Summary

A Fase 4 não introduz nenhuma tecnologia nova: o projeto já tem tudo que esta fase precisa — `better-sqlite3` para persistência, um servidor `node:http` nativo sem framework para HTTP, e `vitest` para testes. O trabalho real desta fase é de **composição** sobre módulos já existentes: (1) juntar o "antes" (`recommendation_baseline`, 1 id legado) com o "depois" (`recommendForProduct`, até 8 ids ricos) num diff testável; (2) persistir decisões de aprovação numa tabela nova seguindo o padrão único de wrapper SQLite já estabelecido em `catalog-store.js`; (3) expor esse fluxo via um servidor HTTP local **separado** do `server.js` público existente; (4) implementar o gate de aprovação como função pura testável, chamada tanto pelo endpoint de escrita (stub nesta fase) quanto, futuramente, pela Fase 5.

A descoberta mais importante desta pesquisa (verificada por leitura direta do código, não suposição) é que **a extensão "trivial" do motor para expor candidatos além do top-8 (D-20, opção "a") não funciona para produtos de Partes de Cima/Baixo**: `composeGroupQuota` tem a cota de 4+4 hard-coded independente do `cap`/`maxRecommendations` passado, então aumentar esse parâmetro nunca revela um "9º candidato" nesses casos. A opção (b) do CONTEXT.md — **re-executar `recommendForProduct` com os ids removidos filtrados fora do array `catalogProducts` de entrada** — é não só mais simples, é a única que funciona corretamente para os três grupos (Look Inteiro, Partes de Cima, Partes de Baixo) sem tocar em `recommendation-engine.js`. Isso também preserva RULE-02 (motor continua zero-import) porque a exclusão vive inteiramente no módulo da Fase 4, nunca no motor.

**Primary recommendation:** implementar o backfill do D-20 recomputando `recommendForProduct(productId, catalogProducts.filter(p => !removedIds.includes(p.productId)))` a partir da Fase 4 (nunca modificar o motor da Fase 3/03.1); hospedar o painel num processo HTTP nativo **novo e separado** do `server.js` público (que serve a vitrine); modelar o gate de aprovação como uma função pura (`assertApproved`) chamada por um endpoint de escrita real (mesmo que stub) para que SC#3 seja demonstrável via chamada HTTP direta, não só via teste unitário.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Cálculo do diff antes/depois | API/Backend | Database (leitura) | Combina `recommendation_baseline` (DB) + `recommendForProduct` (motor puro); lógica de negócio, não pertence à UI |
| Definição de "mudou" (D-23, set de ids) | API/Backend | — | Regra de negócio testável isoladamente, nunca decidida no cliente |
| Backfill pós-remoção (D-20) | API/Backend | — | Recomputação determinística; reusa o motor puro da Fase 3, não duplica cascata |
| Renderização do painel (cards antes/depois) | Frontend Server (SSR) | Browser | HTML gerado no servidor via template strings; nenhuma SPA necessária para um painel interno de baixo volume |
| Ações de aprovar/rejeitar/remover item | Browser (form) | API/Backend | Formulário HTML simples faz POST; a decisão de negócio (validar subset, persistir) vive só no backend |
| Persistência da fila de aprovação | Database | API/Backend | Nova tabela SQLite seguindo o wrapper único (`catalog-store.js`) |
| Gate "pode escrever?" (APRV-03) | API/Backend | — | **Nunca** no browser/UI — é exatamente o que SC#3 exige testar via chamada direta ao endpoint |
| Modo dry-run | API/Backend | — | Flag explícita threading através da função de execução de escrita; nunca um estado escondido na UI |
| Escrita real na loja (Nuvemshop) | Fora de escopo (Fase 5) | — | Fase 4 só produz o registro de aprovação que a Fase 5 consome |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `better-sqlite3` | ^12.11.1 (já instalado, [VERIFIED: npm registry] via `npm view`) | Persistência da fila de aprovação (`approval_queue`) | Já é o único mecanismo de persistência do projeto; nova tabela segue o wrapper único de `catalog-store.js` |
| `node:http` (nativo) | Node ≥20.6 (runtime local confirmado: v24.17.0) | Servir o painel de revisão e as rotas de ação (approve/reject/remove) | Já é o padrão do projeto (`src/server.js`); nenhuma dependência nova necessária para roteamento simples com poucas rotas |
| `vitest` | ^4.1.10 (já instalado, [VERIFIED: npm registry]) | Testes das funções de domínio (diff, gate, fila) e testes de integração HTTP via `fetch()` nativo | Único framework de teste já usado no projeto; sem config file — descoberta automática de `*.test.js` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `fetch()` global (Node nativo, disponível desde Node 18) | runtime | Testes de integração HTTP contra o servidor de revisão sem subir dependência nova (substitui `supertest`) | Ao testar SC#2/SC#3 fim-a-fim (chamada HTTP real contra um servidor `node:http` iniciado em porta efêmera dentro do teste) |
| `node:crypto` (nativo, opcional) | runtime | Gerar um token de idempotência/nonce se o painel algum dia precisar prevenir double-submit de formulário | Só se double-submit se mostrar um problema real; não é requisito desta fase |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `node:http` nativo + template strings | Express + EJS/Handlebars | Express adicionaria a primeira dependência de framework web do projeto; para ~5 rotas e um painel interno de baixo tráfego, o custo de manutenção de uma dependência nova não se paga. Reavaliar se a Fase 6 exigir mais rotas/middlewares |
| `fetch()` nativo em testes | `supertest` | `supertest` é mais ergonômico para asserts encadeados, mas exige nova devDependency; `fetch()` nativo já resolve o caso de uso (poucos endpoints) sem custo de dependência |
| Re-executar o motor com catálogo filtrado (D-20 opção b) | Estender `recommendForProduct` para aceitar `N` e devolver candidatos ranqueados além do top-8 (D-20 opção a) | Opção (a) exigiria reescrever `composeGroupQuota` para escalar a cota com `N` (hoje fixa em 4+4) — risco real de regressão em RULE-01/RULE-02 e teste duplicado da cascata D-13. Opção (b) reusa o motor tal como está, zero mudança em código já testado (28/28 verde) |

**Installation:**
```bash
# Nenhum pacote novo é necessário nesta fase.
```

**Version verification:** `better-sqlite3` (12.11.1) e `vitest` (4.1.10) confirmados via `npm view <pkg> version` contra o registry real, idênticos ao `package.json` — sem drift de versão a corrigir.

## Package Legitimacy Audit

**Nenhum pacote externo novo é introduzido nesta fase.** O painel de revisão, o gate de aprovação e o dry-run são construídos inteiramente sobre `node:http`, `node:crypto`/`fetch()` nativos e as dependências já instaladas e auditadas em fases anteriores (`better-sqlite3`, `vitest`). Não há tabela de auditoria a preencher — o Package Legitimacy Gate não se aplica.

**Packages removed due to [SLOP] verdict:** none (nenhum pacote avaliado)
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                         ┌─────────────────────────────┐
                         │   data/catalog.db (SQLite)   │
                         │  products / variants /       │
                         │  catalog_snapshots /          │
                         │  recommendation_baseline       │
                         │  + approval_queue (NOVA)       │
                         └───────────┬─────────────────┘
                                     │ getLatestSnapshotProducts()
                                     │ getBaselineForProduct()
                                     │ getApprovalDecision()
                                     ▼
   ┌────────────────────────────────────────────────────────────┐
   │  src/review/ (módulos de domínio puros, zero I/O)           │
   │                                                               │
   │  buildReviewQueue(catalog, baselines)                        │
   │    → filtra por D-22/D-23 (set de ids difere)                │
   │                                                               │
   │  computeDiff(productId, catalog, baseline)                   │
   │    → { before: [...], after: recommendForProduct(...) }      │
   │                                                               │
   │  recomputeAfterRemoval(productId, catalog, removedIds)        │
   │    → recommendForProduct(id, catalog.filter(...))  (D-20 b)   │
   │                                                               │
   │  assertApproved(productId) → lança se não houver registro     │
   │    aprovado (APRV-03/SC#3, chamado ANTES de qualquer escrita) │
   └───────────────────────┬──────────────────────────────────────┘
                            │ (funções nomeadas, importadas)
                            ▼
   ┌────────────────────────────────────────────────────────────┐
   │  src/review-server.js  (node:http nativo, NOVO processo,     │
   │  porta própria — separado do server.js público)              │
   │                                                               │
   │  GET  /review              → lista fila (D-22)                │
   │  GET  /review/:productId   → diff antes/depois + form curadoria│
   │  POST /review/:productId/approve  → valida subset, persiste   │
   │  POST /review/:productId/reject   → persiste rejeição         │
   │  POST /review/:productId/write    → assertApproved() + stub   │
   │       write (Fase 5 troca o stub pela chamada real Nuvemshop) │
   │       aceita ?dryRun=true|false (default true nesta fase)     │
   └───────────────────────┬──────────────────────────────────────┘
                            │ HTML renderizado no servidor
                            ▼
                    ┌───────────────┐
                    │ Browser humano │  (form POST, sem JS obrigatório)
                    └───────────────┘

   (Fora de escopo desta fase: chamada real à API Nuvemshop —
    o endpoint /write chama apenas um stub que registra a intenção.)
```

### Recommended Project Structure
```
app-partners-recomendados/
├── src/
│   ├── review/                      # domínio novo desta fase
│   │   ├── review-queue.js          # buildReviewQueue (D-22/D-23), função pura
│   │   ├── review-queue.test.js
│   │   ├── diff.js                  # computeDiff, recomputeAfterRemoval (D-20 opção b)
│   │   ├── diff.test.js
│   │   ├── approval-gate.js         # assertApproved / canWrite, função pura
│   │   ├── approval-gate.test.js
│   │   ├── write-executor.js        # executeApprovedWrite({ productId, dryRun }) — stub nesta fase
│   │   └── write-executor.test.js
│   ├── review-server.js             # servidor HTTP separado (novo processo/porta)
│   ├── review-server.test.js        # integração via fetch() nativo contra porta efêmera
│   └── db/
│       └── catalog-store.js         # GANHA novas funções nomeadas (não um arquivo novo):
│                                     #   upsertApprovalDecision, getApprovalDecision,
│                                     #   listApprovalQueueChanges (segue o wrapper único já existente)
├── schema.sql                       # GANHA a tabela approval_queue (ver Code Examples)
└── scripts/
    └── seed-fixtures.js             # (se necessário) popula fabric_tag_canonical fictício
                                      # para exercitar o caminho não-vazio do diff em dev
```

### Pattern 1: Recomputação em vez de extensão do motor (D-20)
**What:** para backfill após remoção manual, filtrar os ids removidos do array `catalogProducts` de entrada e chamar `recommendForProduct` de novo — nunca alterar `composeGroupQuota`/`buildSortedPool` no motor.
**When to use:** sempre que a Fase 4 precisar do "próximo candidato ranqueado" após uma remoção (D-20), para qualquer um dos três grupos de produto (D-26).
**Example:**
```javascript
// Source: leitura direta de recommendation-engine.js (Fase 3/03.1) — [VERIFIED: source code inspection]
// src/review/diff.js (módulo NOVO da Fase 4 — importa o motor, ao contrário do motor em si)
import { recommendForProduct } from '../recommendation/recommendation-engine.js';

/**
 * Recomputa a recomendação para `productId` excluindo `removedIds` do pool de
 * candidatos. Como `recommendForProduct` é puro e sem estado (nenhuma mutação,
 * nenhum I/O), filtrar o catálogo de ENTRADA reproduz fielmente "rodar a
 * seleção de novo sem esses candidatos" — preserva D-13 (cascata), D-15
 * (elegibilidade estrita) e D-26/D-28/D-29 (grupo + cota + backfill simétrico)
 * sem duplicar nenhuma linha de lógica do motor.
 *
 * NÃO usar `{ maxRecommendations: N }` maior que 8 esperando revelar o "9º
 * candidato": para Partes de Cima/Baixo isso não funciona — a cota de 4+4
 * (`GROUP_QUOTA_PER_SIDE`) é fixa dentro de `composeGroupQuota`, independente
 * do cap passado (verificado lendo o código-fonte; ver Common Pitfalls #1).
 */
export function recomputeAfterRemoval(productId, catalogProducts, removedIds) {
  const removed = new Set(removedIds.map(String));
  const filteredCatalog = catalogProducts.filter((p) => !removed.has(String(p.productId)));
  return recommendForProduct(productId, filteredCatalog);
}
```

### Pattern 2: Comparação de "mudou" por conjunto, não por array (D-23)
**What:** comparar os ids "antes" e "depois" como conjuntos (Set), ignorando ordem, para decidir se um produto entra na fila de revisão.
**When to use:** em `buildReviewQueue`/`computeDiff` — em qualquer lugar que decida "este produto mudou?" (D-22/D-23).
**Example:**
```javascript
// src/review/review-queue.js
/**
 * D-23: reordenação pura do MESMO conjunto de ids NÃO conta como mudança.
 * Comparação ingênua via array (JSON.stringify ou === posição a posição)
 * marcaria reordenação como mudança incorretamente — ver Common Pitfalls #4.
 */
export function hasChanged(beforeIds, afterIds) {
  const before = new Set(beforeIds.map(String));
  const after = new Set(afterIds.map(String));
  if (before.size !== after.size) return true;
  for (const id of before) {
    if (!after.has(id)) return true;
  }
  return false;
}
```

### Pattern 3: Gate de aprovação como função pura, chamada pelo endpoint real (APRV-03/SC#3)
**What:** `assertApproved` lança um erro tipado se não houver registro de aprovação; o endpoint de escrita (mesmo stub) chama essa função ANTES de qualquer outra coisa.
**When to use:** todo caminho de escrita, hoje (stub) e na Fase 5 (real).
**Example:**
```javascript
// src/review/approval-gate.js
export class ApprovalRequiredError extends Error {
  constructor(productId) {
    super(`Produto ${productId} não tem aprovação registrada — escrita recusada.`);
    this.name = 'ApprovalRequiredError';
    this.productId = productId;
  }
}

/**
 * Lança ApprovalRequiredError se não houver registro 'approved' para
 * `productId` em approval_queue. Retorna o conjunto de ids aprovados (D-25)
 * quando existe. Função pura em relação ao CHAMADOR — recebe a leitura do
 * banco já feita (getApprovalDecision), não abre conexão própria, o que a
 * torna testável sem SQLite real (mock simples do parâmetro `decision`).
 */
export function assertApproved(productId, decision) {
  if (!decision || decision.status !== 'approved') {
    throw new ApprovalRequiredError(productId);
  }
  return decision.approvedRecommendationIds;
}
```

### Pattern 4: Escrita como stub com flag de dry-run explícita (APRV-04/SC#4, reutilizável na Fase 5)
**What:** uma única função `executeApprovedWrite` recebe `dryRun` como parâmetro explícito (nunca lido de um global escondido); nesta fase, AMBOS os ramos (`dryRun: true` e `dryRun: false`) resolvem para o mesmo stub, porque a chamada real à Nuvemshop só existe na Fase 5.
**When to use:** ponto único de entrada para "escrever a recomendação aprovada" — a Fase 5 troca apenas o corpo do ramo `dryRun === false`.
**Example:**
```javascript
// src/review/write-executor.js
import { assertApproved } from './approval-gate.js';

/**
 * Nesta fase, escrever de verdade na Nuvemshop está fora de escopo (Fase 5) —
 * por isso os dois ramos abaixo produzem o mesmo resultado (stub). O que
 * importa aqui é a FORMA da função: `dryRun` é parâmetro explícito, nunca
 * lido de process.env dentro da função (isso viveria na camada HTTP, que lê
 * ?dryRun= ou uma env var UMA VEZ e passa o valor já resolvido). A Fase 5
 * substitui apenas o corpo do `if (!dryRun)` por uma chamada real de API —
 * a assinatura e o gate (assertApproved) não mudam.
 */
export function executeApprovedWrite({ productId, decision, dryRun }) {
  const approvedIds = assertApproved(productId, decision); // lança se não aprovado

  if (!dryRun) {
    // Fase 5 substitui esta linha por uma chamada real (ex: updateMetafield).
    // Nesta fase: stub — nenhuma chamada de rede é feita.
  }

  return { productId, approvedIds, dryRun, written: false, reason: 'stub — escrita real é Fase 5' };
}
```

### Anti-Patterns to Avoid
- **Aumentar `maxRecommendations` esperando revelar candidatos além do top-8 em produtos de Partes de Cima/Baixo:** não funciona — `composeGroupQuota` fixa a cota em `GROUP_QUOTA_PER_SIDE` (4) por lado, independente do `cap` recebido. Use recomputação com catálogo filtrado (Pattern 1).
- **Persistir só um booleano `approved: true/false`:** viola D-25 explicitamente — a Fase 5 precisa saber EXATAMENTE quais ids foram aprovados (a lista pode ter sido curada via remoção D-19).
- **Colocar o gate de aprovação só na renderização do botão/HTML:** viola APRV-03/SC#3 diretamente — o gate tem que estar no handler do endpoint de escrita, chamado antes de qualquer efeito, e testável via chamada HTTP direta sem passar pela página.
- **Misturar as rotas mutantes do painel de revisão no mesmo `server.js`/porta que serve o endpoint público PLAT-05:** aumenta a superfície de risco do endpoint público (que hoje é GET-only e sem auth por design, servindo o storefront) sem necessidade — o painel é uma ferramenta interna local (Claude's Discretion do CONTEXT.md), deve viver em processo/porta separados.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Comparação de "mudou" (D-23) | Comparação de array/string ingênua | Comparação por `Set` (Pattern 2) | Array/string comparison é sensível a ordem; reordenação pura não deve contar como mudança (D-23 explícito) |
| Backfill pós-remoção (D-20) | Reimplementação da cascata de desempate D-13/composição de grupo D-26-31 dentro da Fase 4 | Recomputação via `recommendForProduct` com catálogo filtrado (Pattern 1) | Duplicar a cascata cria dois lugares para o mesmo bug e quebra a garantia de "mesma ordem determinística" entre Fase 3 e Fase 4 |
| Parsing de corpo de requisição JSON | Middleware customizado tentando replicar `express.json()` | Acumulação `req.on('data')`/`req.on('end')` + `JSON.parse` em `try/catch`, com um limite de tamanho de corpo | Padrão nativo simples e suficiente para poucas rotas; um limite de bytes evita esgotamento de memória por corpo malicioso/gigante (nenhuma lib expõe isso "de graça" sem trazer um framework inteiro) |
| Validação de que a lista aprovada é subconjunto do que o motor calculou | Confiar no payload do formulário/POST | Recalcular `recommendForProduct` no servidor e validar `approvedIds ⊆ computedIds` antes de persistir | Nunca confiar em dado vindo do cliente para decidir o que é "elegível" — é exatamente o tipo de bypass que APRV-03/D-19 precisam impedir mesmo que a UI nunca permita enviar isso |

**Key insight:** quase todo "não reinvente a roda" desta fase aponta para a mesma direção: reusar o motor determinístico da Fase 3 como fonte única de verdade sobre o que é elegível/ranqueado, e nunca deixar o cliente (browser) decidir isso — só o backend recalcula e valida.

## Common Pitfalls

### Pitfall 1: Assumir que `maxRecommendations` maior revela o "9º candidato" em Partes de Cima/Baixo
**What goes wrong:** chamar `recommendForProduct(id, catalog, { maxRecommendations: 16 })` esperando ver os candidatos 9-16 para um produto de Partes de Cima/Baixo — o resultado continua limitado a 8 (ou menos).
**Why it happens:** `composeGroupQuota` recebe `cap` mas usa `quota = GROUP_QUOTA_PER_SIDE` (4) fixo para decidir quantos itens tirar de cada pool e quanto backfill aplicar; o `cap` só corta o resultado final, nunca amplia a cota por lado. [VERIFIED: source code inspection, `recommendation-engine.js` linhas 190-207 e 384-387]
**How to avoid:** usar Pattern 1 (recomputação com catálogo filtrado) em vez de tentar "pedir mais" do motor.
**Warning signs:** um teste que espera 9 itens de retorno para um produto de Partes de Cima/Baixo com `maxRecommendations` alto continua recebendo no máximo 8.

### Pitfall 2: Confiar no payload do cliente para o conjunto de ids aprovados
**What goes wrong:** o endpoint de aprovação persiste literalmente o array de ids que veio no `POST`, sem revalidar contra o que o motor calculou para aquele produto.
**Why it happens:** parece mais simples "só salvar o que o formulário mandou".
**How to avoid:** no handler de `/approve`, recalcular `recommendForProduct` (ou reusar o resultado já computado na mesma request do diff) e verificar que o conjunto submetido é subconjunto do conjunto calculado (D-19: só remoção é permitida) antes de persistir.
**Warning signs:** um teste de integração que faz `POST /review/:id/approve` com um id que o motor nunca elegeria para aquele produto é aceito silenciosamente.

### Pitfall 3: Demonstrar SC#3 só com um teste unitário da função de gate, sem endpoint real
**What goes wrong:** a redação de SC#3 é explícita — "uma tentativa de gravação sem aprovação prévia é rejeitada... mesmo que alguém tente pular a interface (ex: chamada direta ao endpoint de escrita)". Se a Fase 4 só entregar a função pura `assertApproved` testada isoladamente (opção b do CONTEXT.md), não existe "endpoint de escrita" para chamar diretamente — SC#3 fica não-verificável do jeito que foi escrito.
**Why it happens:** a opção (b) é tecnicamente mais simples e válida como *discretion*, mas o texto do próprio SC#3 pressupõe um endpoint alcançável via HTTP.
**How to avoid:** implementar a opção (a) do CONTEXT.md — um endpoint real de escrita (mesmo com o corpo stub) que chama `assertApproved` antes de tudo, e testar via `fetch()` direto contra esse endpoint sem aprovação prévia, esperando 403/409.
**Warning signs:** verificação de SC#3 no plano se resume a `expect(() => assertApproved(...)).toThrow()`, sem nenhuma chamada HTTP real.

### Pitfall 4: Comparação "mudou" sensível a ordem
**What goes wrong:** usar `JSON.stringify(sortedOrUnsortedArray)` ou comparação posição-a-posição para decidir se um produto entra na fila — uma reordenação pura do mesmo conjunto de ids passa a contar como "mudança", inflando a fila incorretamente e violando D-23.
**Why it happens:** comparação de array é o primeiro instinto; comparação de conjunto exige um passo extra deliberado.
**How to avoid:** usar Pattern 2 (comparação por `Set`).
**Warning signs:** um teste que reordena os mesmos 8 ids (sem adicionar/remover nenhum) e espera fila vazia falha.

### Pitfall 5: Esperar uma diferença dramática de comportamento entre dry-run e não-dry-run nesta fase
**What goes wrong:** interpretar SC#4 ("nenhuma chamada de escrita real é feita à loja... confirmado comparando o estado da loja antes e depois") como exigindo uma escrita real condicional que a Fase 4 simplesmente não tem escopo para implementar (WRTE-01/escrita segura é Fase 5).
**Why it happens:** a redação do SC#4 é escrita pensando no sistema completo (Fase 4+5), não isoladamente.
**How to avoid:** nesta fase, tanto `dryRun: true` quanto `dryRun: false` resolvem para o MESMO stub (nenhum dos dois toca a API Nuvemshop) — a demonstração de SC#4 no Wave desta fase é: (1) rodar o fluxo completo com a flag ligada, (2) confirmar via leitura real (`getMetafields`, já existente do PLAT-05) que o Metafield do produto no ambiente de teste não mudou. O valor entregue não é "um comportamento visivelmente diferente hoje", é a FORMA da função (`executeApprovedWrite({ dryRun })`, Pattern 4) que a Fase 5 vai reusar sem redesenho.
**Warning signs:** o plano tenta construir uma chamada real condicional à API Nuvemshop dentro da Fase 4 "só para testar o dry-run" — isso duplica WRTE-01/escrita segura fora de ordem, sem os cuidados de snapshot/rollback que são objeto explícito da Fase 5.

### Pitfall 6: Corpo de requisição JSON sem limite de tamanho no parser nativo
**What goes wrong:** o padrão `req.on('data', chunk => body += chunk)` acumula indefinidamente; sem um limite de bytes, uma requisição gigante (ou um loop de chunks malformado) consome memória do processo sem limite.
**Why it happens:** o exemplo mais comum encontrado em busca não inclui limite de tamanho por padrão. [CITED: resultado de busca web, ver Sources]
**How to avoid:** abortar a conexão (ou responder 413) se `body.length` exceder um limite nomeado (ex.: `MAX_BODY_BYTES = 10_000`, generoso para um payload de aprovação de poucos ids) antes de acumular mais.
**Warning signs:** nenhum limite explícito no handler de `POST` do `review-server.js`.

## Code Examples

Verificados a partir do código-fonte real do repositório (não documentação externa, já que o mecanismo é 100% código já existente no projeto):

### Parsing de corpo POST nativo com limite de tamanho
```javascript
// Source: padrão geral confirmado via busca web [CITED: ver Sources] + limite de
// tamanho adicionado como prática defensiva (não presente no exemplo original).
const MAX_BODY_BYTES = 10_000;

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let bytes = 0;
    req.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        reject(new Error('Corpo da requisição excede o limite permitido'));
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new Error('JSON inválido no corpo da requisição'));
      }
    });
    req.on('error', reject);
  });
}
```

### Tabela `approval_queue` (D-25, segue as convenções de `schema.sql` existente)
```sql
-- Source: convenções de schema.sql (Fase 2/3) — [VERIFIED: source code inspection]
-- D-25: registro captura o conjunto EXATO de ids aprovados (JSON array em texto),
-- nunca só um booleano. run_id referencia o run de ingestão cujo snapshot gerou
-- o "depois" mostrado no momento da decisão (rastreabilidade, mesmo padrão de
-- recommendation_baseline).
CREATE TABLE IF NOT EXISTS approval_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id TEXT NOT NULL REFERENCES products(id),
  run_id INTEGER NOT NULL REFERENCES ingestion_runs(id),
  status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  approved_recommendation_ids TEXT,       -- JSON array de productId, NULL se rejected/pending
  decided_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_approval_queue_product ON approval_queue(product_id, run_id);
```

### Teste de integração HTTP com `fetch()` nativo (sem `supertest`)
```javascript
// src/review-server.test.js
// Source: padrão idiomático dado que Node >=20.6 expõe fetch() globalmente —
// [ASSUMED, prática comum não verificada contra documentação oficial nesta sessão].
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from './review-server.js'; // deve exportar uma factory, não iniciar sozinho no import

let server;
let baseUrl;

beforeAll(async () => {
  server = createServer();
  await new Promise((resolve) => server.listen(0, resolve)); // porta efêmera
  baseUrl = `http://localhost:${server.address().port}`;
});

afterAll(() => server.close());

it('SC#3: recusa escrita sem aprovação prévia via chamada HTTP direta', async () => {
  const res = await fetch(`${baseUrl}/review/999999/write`, { method: 'POST' });
  expect(res.status).toBe(409); // ou 403 — status exato é decisão do planejador
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| N/A — esta fase não substitui nenhuma abordagem legada do projeto | Continua o padrão zero-framework já estabelecido nas Fases 1-3 (`node:http` nativo, `better-sqlite3`, `vitest`) | — | Nenhuma mudança de stack; apenas extensão dos mesmos padrões para um novo domínio (revisão/aprovação) |

**Deprecated/outdated:** nenhum.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Painel roda sem autenticação/login (uso interno local) | Architectural Responsibility Map, Standard Stack | Se o painel algum dia rodar acessível fora de `localhost` sem login, qualquer pessoa na rede poderia aprovar/rejeitar produtos e (na Fase 5) disparar escritas reais — mitigar exigindo que o binding do servidor seja explicitamente `127.0.0.1`, nunca `0.0.0.0`, enquanto essa decisão não for revisitada na Fase 6 |
| A2 | `fetch()` global do Node é adequado e suficiente para testes de integração HTTP, sem necessidade de `supertest` | Standard Stack, Code Examples | Baixo — se `fetch()` nativo se mostrar insuficiente (ex.: streaming, cookies complexos), adicionar `supertest` como devDependency é um ajuste de baixo custo, não uma reescrita |
| A3 | Status codes sugeridos (403/409) para "escrita recusada sem aprovação" são uma recomendação, não uma convenção já estabelecida no projeto (o projeto só usa 404/405/500 hoje) | Common Pitfalls #3, Code Examples | Baixo — é só uma escolha de contrato HTTP; qualquer código de erro claro e documentado (não 200) satisfaz SC#3 |
| A4 | O padrão de acumular `req.on('data')`/`req.on('end')` para corpo JSON é a forma idiomática recomendada para `node:http` nativo sem framework | Code Examples, Common Pitfalls #6 | Baixo — é um padrão amplamente documentado (múltiplas fontes concordantes na busca), risco de estar desatualizado é mínimo |

**Se esta tabela estivesse vazia:** não está — A1 em particular deveria ser confirmado explicitamente com o usuário durante o discuss-phase/plan-review antes de travar como decisão (já está registrado como "Claude's Discretion" no CONTEXT.md, então tecnicamente já é uma preferência registrada, não uma decisão travada).

## Open Questions

1. **Qual código de status HTTP exato para "escrita recusada por falta de aprovação"?**
   - What we know: precisa ser um código de erro claro, não 200; o projeto hoje só usa 404 (rota não encontrada) e 405 (método não permitido) em `server.js`.
   - What's unclear: 403 (Forbidden) vs. 409 (Conflict) — ambos são defensáveis (403 = "não autorizado a fazer isso agora", 409 = "estado atual não permite esta operação").
   - Recommendation: usar 409 Conflict — comunica melhor "o estado do produto não permite isso ainda" do que "você não tem permissão", já que não há conceito de identidade/permissão nesta fase (painel sem login).

2. **O painel deve ter alguma proteção contra double-submit de formulário (aprovar duas vezes)?**
   - What we know: `approval_queue` grava uma nova linha por decisão (append, não upsert único por produto) se seguir o padrão append-only de `catalog_snapshots`; ou pode fazer upsert por `(product_id, run_id)` como `recommendation_baseline` já faz.
   - What's unclear: se múltiplos POSTs de aprovação para o mesmo produto/run devem ser idempotentes (upsert) ou gerar histórico (append, com "última decisão vence" na leitura).
   - Recommendation: seguir o padrão `recommendation_baseline` (upsert por `product_id, run_id`) para simplicidade — a Fase 4 não pede histórico de decisões (isso seria mais próximo de MNTR-03/v2, fora de escopo). Se o planejador preferir append-only por auditabilidade futura, isso é uma extensão pequena, não uma mudança estrutural.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js runtime | Todo o backend/servidor de revisão | ✓ | v24.17.0 (≥20.6 exigido) | — |
| `better-sqlite3` | Persistência de `approval_queue` | ✓ (já instalado) | 12.11.1 | — |
| `vitest` | Testes de domínio e integração HTTP | ✓ (já instalado) | 4.1.10 | — |
| `fetch()` global | Testes de integração HTTP sem `supertest` | ✓ (nativo desde Node 18) | runtime | Adicionar `supertest` como devDependency se necessário |

**Missing dependencies with no fallback:** nenhuma.
**Missing dependencies with fallback:** nenhuma (tudo já disponível).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.10 |
| Config file | nenhum — descoberta automática de `*.test.js` (mesmo padrão de todas as fases anteriores) |
| Quick run command | `npx vitest run src/review/<arquivo>.test.js` |
| Full suite command | `npm test` (= `vitest run`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| APRV-01 | Diff antes/depois calculado corretamente por produto, incluindo baseline vazio | unit | `npx vitest run src/review/diff.test.js` | ❌ Wave 0 |
| APRV-01 | Comparação "mudou" ignora reordenação pura (D-23) | unit | `npx vitest run src/review/review-queue.test.js` | ❌ Wave 0 |
| APRV-02 | Fluxo completo HTTP: listar fila → ver diff → aprovar produto → persistido em `approval_queue` | integration (fetch nativo) | `npx vitest run src/review-server.test.js` | ❌ Wave 0 |
| APRV-02 | Remoção de item (D-19) dispara backfill correto (D-20) para os 3 grupos de produto | unit | `npx vitest run src/review/diff.test.js` | ❌ Wave 0 |
| APRV-03 | Chamada direta ao endpoint de escrita sem aprovação prévia é recusada | integration (fetch nativo) | `npx vitest run src/review-server.test.js` | ❌ Wave 0 |
| APRV-03 | Payload de aprovação com id não elegível é rejeitado no backend (nunca confiar no cliente) | integration | `npx vitest run src/review-server.test.js` | ❌ Wave 0 |
| APRV-04 | `executeApprovedWrite({ dryRun: true })` nunca chama a API real; estado do Metafield de teste inalterado antes/depois | unit + smoke (getMetafields real, ambiente de teste) | `npx vitest run src/review/write-executor.test.js` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run <arquivo alterado>.test.js`
- **Per wave merge:** `npm test` (suite completa)
- **Phase gate:** suite completa verde antes de `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/review/review-queue.test.js` — cobre APRV-01 (D-22/D-23)
- [ ] `src/review/diff.test.js` — cobre APRV-01/APRV-02 (D-19/D-20/D-21)
- [ ] `src/review/approval-gate.test.js` — cobre APRV-03
- [ ] `src/review/write-executor.test.js` — cobre APRV-03/APRV-04
- [ ] `src/review-server.test.js` — cobre APRV-02/APRV-03 fim-a-fim via `fetch()` nativo
- [ ] Fixture com `fabric_tag_canonical` preenchido para pelo menos alguns produtos de teste — necessário para exercitar o caminho não-vazio do diff/curadoria (hoje 0/645 produtos reais têm tecido preenchido, D-16); sem isso todos os testes de integração caem no caminho "fila vazia"

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | Não (decisão registrada: painel local, sem login, uso interno) | — (ver Assumption A1: bind explícito a `127.0.0.1`) |
| V3 Session Management | Não | — |
| V4 Access Control | Sim | Roteamento por método HTTP (GET-only nas rotas de leitura, mesmo padrão 405 já usado em `server.js`); gate `assertApproved` no servidor, nunca na UI — decisão de autorização (APRV-03) sempre no "trusted service layer" [CITED: OWASP ASVS V4, ver Sources] |
| V5 Input Validation | Sim | Validar que `productId` corresponde a um produto real do catálogo; validar que o conjunto de ids aprovados submetido é subconjunto do conjunto calculado pelo motor (nunca confiar no payload do cliente, D-19); escapar valores dinâmicos (nome do produto) ao montar HTML no servidor, prevenindo XSS refletido |
| V6 Cryptography | Não | Nenhum dado sensível/segredo é manipulado nesta fase |

### Known Threat Patterns for {node:http nativo + SQLite local}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Bypass da UI via chamada HTTP direta ao endpoint de escrita sem aprovação | Elevation of Privilege | `assertApproved` chamado no handler do endpoint, antes de qualquer outro efeito (Pattern 3) — é literalmente o que SC#3 pede para ser testado |
| Payload de aprovação com ids que o motor nunca elegeu (tampering do conjunto aprovado) | Tampering | Recalcular e validar subset no servidor antes de persistir (Pitfall 2) |
| XSS refletido via nome de produto renderizado sem escape no HTML do painel | Tampering / Information Disclosure | Função `escapeHtml()` nomeada e testada, aplicada a todo valor dinâmico inserido em template strings de HTML |
| Esgotamento de memória via corpo de requisição POST sem limite | Denial of Service | Limite de bytes explícito no parser de corpo (Pitfall 6, Code Examples) |
| Injeção SQL via `product_id`/ids aprovados | Tampering | Continuar a convenção já estabelecida em `catalog-store.js`: exclusivamente `db.prepare(...).run(params)` com parâmetros nomeados, nunca concatenação de string |

## Sources

### Primary (HIGH confidence)
- `app-partners-recomendados/src/recommendation/recommendation-engine.js` — leitura direta do código-fonte real (motor determinístico, D-13 a D-35); base da descoberta sobre `composeGroupQuota`/cota fixa 4+4 (Pitfall 1)
- `app-partners-recomendados/src/recommendation/recommend-cli.js` — fluxo `catalog.db → motor → resultado`, prenúncio explícito do preview da Fase 4
- `app-partners-recomendados/src/db/catalog-store.js` e `schema.sql` — padrão de wrapper SQLite único, convenção de escrita parametrizada, migração idempotente (Pitfall 2 da Fase 03.1, mesma disciplina a seguir para `approval_queue`)
- `app-partners-recomendados/src/db/catalog-store.test.js` — padrão de teste de integração SQLite com `CATALOG_DB_DIR`/`closeDbForTests()` (Windows EPERM), a ser reaplicado para testes de `approval_queue`
- `app-partners-recomendados/src/server.js`, `src/api/recommendations.js`, `api/recommendations/[productId].js` — padrão de servidor HTTP nativo GET-only + separação domínio/transporte já estabelecida
- `app-partners-recomendados/package.json` — stack real confirmada (Node ESM ≥20.6, `better-sqlite3` ^12.11.1, `vitest` ^4.1.10, zero framework web)
- `npm view better-sqlite3 version` / `npm view vitest version` — [VERIFIED: npm registry] confirmando versões instaladas idênticas ao registry, sem drift

### Secondary (MEDIUM confidence)
- OWASP ASVS V4 (Access Control), via busca web — [CITED: github.com/OWASP/ASVS/blob/master/4.0/en/0x12-V4-Access-Control.md] — decisões de autorização para operações que mudam estado devem ser aplicadas no backend/trusted service layer, nunca decididas só no cliente

### Tertiary (LOW confidence)
- Padrão de parsing de corpo POST em `node:http` nativo via busca web — [CITED: kompulsa.com/how-to-accept-and-parse-post-requests-in-node-js, betterstack.com/community/questions/post-data-node-js] — padrão amplamente replicado em múltiplas fontes, mas não confirmado contra a documentação oficial do Node.js nesta sessão (marcar A4 no Assumptions Log)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero pacotes novos, tudo confirmado por `npm view` contra o registry real e leitura do `package.json`
- Architecture: HIGH — arquitetura, pitfalls e o achado sobre `composeGroupQuota` vêm de leitura direta do código-fonte real do motor, não suposição
- Pitfalls: HIGH para os pitfalls de código (1, 2, 4 — verificados por leitura de código); MEDIUM para os pitfalls de segurança/HTTP (3, 5, 6 — apoiados em raciocínio sobre os Success Criteria + fontes web CITED)

**Research date:** 2026-07-16
**Valid until:** 2026-08-15 (30 dias — stack e decisões estáveis, sem dependência de versões de pacote voláteis)
