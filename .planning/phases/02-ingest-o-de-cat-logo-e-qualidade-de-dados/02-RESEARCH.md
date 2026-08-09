# Phase 2: Ingestão de Catálogo e Qualidade de Dados - Research

**Researched:** 2026-07-10
**Domain:** Nuvemshop (Tiendanube) API pública — leitura de catálogo/categoria/estoque multi-localização, rate limiting adaptativo, persistência local em SQLite com histórico versionado
**Confidence:** MEDIUM

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Escala e escopo da ingestão**
- **D-01:** A categoria piloto desta fase é **"Vestidos"** (628 produtos) — não a categoria "Novidades" (592 SKUs) usada como referência inicial no PROJECT.md, nem o catálogo completo. Justificativa do usuário: (1) já existe um projeto paralelo de ordenação de vitrine sendo testado na mesma categoria — validar aqui também serve para checar se os dois scripts coexistem sem conflito; (2) é a categoria líder de receita da loja — onde o benefício real do projeto é mais mensurável; (3) é uma das maiores categorias por volume, com tráfego/navegação diário constante — bom teste de estresse para um catálogo abrangente.
- **D-02:** O número "592 produtos" citado no PROJECT.md original refere-se apenas à categoria "Novidades", não ao catálogo completo da loja. O catálogo completo, somando todas as categorias, chega a aproximadamente 15 mil variações (SKUs, contando cada grade de tamanho). Os números exatos (quantidade de categorias, produtos por categoria, total de SKUs) **ainda não foram confirmados** — devem ser confirmados via leitura real da API (`GET /categories`, `GET /products`) durante a execução desta fase, não travados agora com base em estimativa.
- **D-03:** A loja opera com **localização única de estoque** — expedição feita por um Centro de Distribuição parceiro (Afterclick), responsável tanto pelo armazenamento quanto pela integração de saídas de pedidos. Não há necessidade de lógica de agregação multi-localização.

**Critério de "estoque disponível"**
- **D-04:** Estoque disponível é avaliado **por grade do produto**, não por variante isolada: um produto conta como "disponível" quando tem **3 ou mais tamanhos** com estoque > 0 (não basta 1 tamanho isolado ter estoque). Este é um refinamento concreto do critério "estoque disponível" já mencionado em RULE-01 (Fase 3) e deve ser lido/calculado já nesta fase via `inventory_levels[]` (DATA-01).
- **D-05:** Rate limit (2 req/s, buffer 40, leitura dinâmica dos headers `x-rate-limit-*`) fica a critério do planejamento técnico da fase — sem preferência específica de algoritmo de throttling do usuário, apenas a obrigação já travada em PLAT-02 de não assumir um valor fixo hardcoded.

**Tags de tecido (DATA-03)**
- **D-06:** Hoje, **nenhum produto da categoria Vestidos tem tag de tipo de tecido preenchida**. Não é um problema de "tags bagunçadas para normalizar" — é ausência quase total do dado no campo estruturado (o único lugar onde o tecido aparece hoje é na Descrição em texto livre, fonte pouco confiável e cara de parsear, já descartada como fonte primária).
- **D-07:** O usuário vai popular as tags de tecido da categoria Vestidos manualmente, via planilha + importação em massa pelo Partners Portal/admin da Nuvemshop — isso é trabalho do usuário, fora do escopo de código desta fase.
- **D-08:** O sistema **não precisa** gerar relatório/lista de produtos sem tag de tecido para ajudar a priorizar preenchimento manual — o usuário já vai popular tudo de uma vez via planilha. A responsabilidade da Fase 2 é validar/padronizar o que existir (após o preenchimento do usuário), não detectar ausências.
- **D-09:** Produtos sem tag de tecido válida simplesmente ficam fora do motor de recomendação (RULE-01, Fase 3, já exige match de tecido) — não é tratado como erro nesta fase.

**Armazenamento do catálogo ingerido**
- **D-10:** Armazenamento recomendado: **SQLite local** (já cotado em `01-RESEARCH.md`/`STACK.md` da Fase 1 — `better-sqlite3`), sem infraestrutura externa, hospedado junto com o backend na nuvem. Escala do piloto (628 produtos) e mesmo do catálogo completo (~15 mil SKUs) está bem dentro do que SQLite suporta confortavelmente.
- **D-11:** O catálogo ingerido precisa de **histórico versionado simples** (snapshots de estoque/tags ao longo do tempo, não só o estado mais recente) — não apenas para auditoria, mas como fundação para uma ideia futura descrita pelo usuário (ver Deferred Ideas). Nesta fase, o histórico cobre apenas mudanças de estoque/tags — sem cruzamento com dados de vendas/conversão.

**Baseline de recomendações atuais (DATA-02)**
- **D-12:** A leitura do estado atual dos Metafields de recomendação (antes de qualquer escrita futura da Fase 3+) é **apenas um registro informativo/ponto de partida** — não precisa de lógica de detecção de drift nesta fase (drift detection já está reservado para APRV-07, v2).

### Claude's Discretion
- Algoritmo exato de throttling/rate-limiting (respeitando D-05: leitura dinâmica dos headers, sem valor fixo).
- Schema exato do SQLite (tabelas, colunas, índices) para suportar D-10/D-11.
- Como estruturar o versionamento histórico (D-11) de forma que seja extensível depois para incluir dados de conversão sem redesenho completo.

### Deferred Ideas (OUT OF SCOPE)
- **Atribuição de conversão por recomendação (rastreamento de giro):** o usuário descreveu uma ideia de rastrear se um produto recomendado gerou uma venda de fato, e usar esse sinal para manter esse produto recomendado mesmo após reposição de estoque. Isso vai além de histórico versionado simples de catálogo (D-11) — precisa cruzar dados de exibição de recomendações com `/orders` (dados de venda). Relacionado a RANK-01 (v2, giro de vendas) mas mais específico (atribuição causal recomendação→venda, não só velocidade geral de vendas). Não implementar na Fase 2 — candidato a novo requisito v2 ou refinamento de RANK-01 quando essa fase for discutida.
- Números exatos do catálogo completo (categorias, produtos por categoria, ~15k SKUs) — usuário não tinha os números de cabeça; confirmar via leitura real da API durante a execução da Fase 2, atualizar PROJECT.md/REQUIREMENTS.md com os números reais depois de confirmados.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PLAT-02 | Sistema lê catálogo, variantes e estoque via API pública da Nuvemshop, respeitando rate limits (leitura dinâmica de `x-rate-limit-*`, sem valor fixo) | Ver `## Standard Stack`, `## Architecture Patterns > Pattern 2 (rate limiting adaptativo)`, `## Code Examples > Paginação de categoria/produtos` — endpoints, headers e algoritmo de throttling documentados com fonte oficial |
| DATA-01 | Sistema lê estoque via `inventory_levels[]` (não `variant.stock`, depreciado) | Ver `## Architecture Patterns > Pattern 1 (leitura de inventory_levels)` e `## Code Examples > Cálculo de estoque disponível (D-04)` — estrutura exata do array, mais o critério de negócio "grade ≥ 3 tamanhos" já travado em D-04 |
| DATA-02 | Sistema lê recomendações atuais de cada produto (Metafields) como baseline informativo | Ver `## Architecture Patterns > Pattern 4 (baseline de Metafields)` — reaproveita `getMetafields()` já existente em `client.js`, sem lógica nova de drift |
| DATA-03 | Sistema executa padronização/validação contínua das tags de tecido a cada execução (não limpeza pontual) | Ver `## Architecture Patterns > Pattern 3 (auditoria de taxonomia contínua)` e `## Don't Hand-Roll` — mapa canônico + tabela de frequência regenerados a cada execução, produtos não mapeados ficam fora do motor (D-09), sem geração de relatório de ausência (D-08) |
</phase_requirements>

## Summary

Esta fase estende o `nuvemshop-client/client.js` já validado na Fase 1 (que hoje só sabe buscar um produto por ID e ler/escrever Metafields) para operações de leitura em lote: listar categorias, listar produtos por `category_id` com paginação, e ler `inventory_levels[]` por variante. A API pública da Nuvemshop documenta tudo que esta fase precisa com razoável precisão: `GET /categories` e `GET /products?category_id=` suportam paginação padrão via header `Link` (`rel="next"`) mais `x-total-count`, com `per_page` configurável até 200 — o que significa que os ~628 produtos da categoria Vestidos cabem em apenas 4 páginas de 200 (ou 7 de 100), não centenas de chamadas individuais. `inventory_levels[]` já vem embutido na resposta de `GET /products/{id}` e `GET /products/{id}/variants` — não é necessária uma chamada separada por variante, o que reduz drasticamente o volume de requisições em relação a uma implementação ingênua "1 request por variante". O rate limit é confirmado como leaky bucket (40 de burst, 2 req/s de vazamento) com três headers dedicados (`x-rate-limit-limit`, `x-rate-limit-remaining`, `x-rate-limit-reset` em milissegundos) — o suficiente para implementar throttling adaptativo real sem hardcoded, exatamente como PLAT-02/D-05 exigem.

Para persistência, `better-sqlite3` (já cotado na Fase 1) é a escolha correta e permanece assim: API síncrona, sem overhead de connection pool, e nativamente adequada para uma carga de leitura em lote seguida de escrita em transação única — o padrão idiomático da biblioteca (`db.transaction(fn)` envolvendo múltiplos `.run()`) é exatamente o que uma ingestão de ~628 produtos precisa para não fazer 628 transações separadas. Para o histórico versionado (D-11), o padrão de mercado mais citado (trigger-based history com tabela companion `_history` por tabela rastreada, coluna de bitmask indicando quais colunas mudaram) é elegante mas provavelmente complexidade desnecessária para o volume desta fase — a alternativa mais simples e igualmente extensível é uma tabela de snapshot append-only por execução (`ingestion_run` + linha por produto/variante por execução), que já é naturalmente extensível para incluir dados de conversão futuros (D-11 discretion) sem redesenho, porque cada execução vira uma linha de fato, e novos tipos de fato (vendas) só precisam de uma tabela irmã referenciando o mesmo `run_id`.

A tag de tecido (DATA-03) está hoje vazia para 100% dos produtos Vestidos (D-06) — isso muda o formato do "Don't Hand-Roll" desta fase: não se trata de normalizar strings sujas existentes, mas de construir a infraestrutura de validação contínua (mapa canônico + tabela de frequência) que vai processar o que o usuário popular manualmente depois (D-07), e continuar rodando a cada execução futura para pegar drift em produtos novos — sem gerar relatório de ausência (D-08 explicitamente não pede isso agora).

**Primary recommendation:** Estender `client.js` com `listCategories()`, `listProducts({categoryId, page, perPage})` (usando paginação real via `Link`/`x-total-count`, `per_page=200`) e ler `inventory_levels[]` diretamente da resposta de produto (sem chamada extra por variante); implementar um limiter adaptativo simples baseado nos três headers `x-rate-limit-*` (não uma biblioteca externa como `bottleneck`, que adiciona complexidade de configuração desnecessária para um volume de ~5-10 chamadas por execução); persistir em SQLite com schema normalizado (produtos/variantes/inventory) + tabela de execução (`ingestion_runs`) + tabela de fatos append-only (`catalog_snapshots`) referenciando `run_id`, preparada para extensão futura por dados de conversão.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Listagem de categorias e produtos (paginação) | API/Backend (job de ingestão) | — | Chamada server-side autenticada à API pública da Nuvemshop; nunca client-side |
| Leitura de `inventory_levels[]` por variante | API/Backend (job de ingestão) | — | Parte da mesma resposta de produto; sem tier adicional |
| Rate limiting adaptativo | API/Backend (cliente HTTP compartilhado) | — | Deve viver no wrapper único (`client.js`), não replicado por feature — mesmo princípio já usado no client existente |
| Padronização/validação de tags de tecido | API/Backend (job de ingestão) | Database/Storage (tabela de mapeamento canônico) | Lógica de mapeamento roda no job Node; a tabela de mapa canônico persiste no SQLite para ser consultável/auditável, não hardcoded em memória apenas |
| Persistência do catálogo normalizado + histórico | Database/Storage (SQLite local, `better-sqlite3`) | — | Fonte de verdade que a Fase 3 (motor de recomendação) vai consumir — não é cache, é o dado canônico pós-ingestão |
| Leitura de Metafields de recomendação (baseline DATA-02) | API/Backend (job de ingestão) | Database/Storage (registro do baseline) | Reaproveita `getMetafields()` já existente; grava snapshot informativo, sem lógica de comparação/drift |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `better-sqlite3` | 12.11.1 [VERIFIED: npm registry — nome já usado e cotado em 01-RESEARCH.md/STACK.md, não descoberto nesta sessão] | Persistência local do catálogo normalizado + histórico versionado | API síncrona sem overhead de pool/callback, ideal para um job batch que roda uma vez ao dia e não precisa de concorrência real; já era a recomendação de D-10/STACK.md |
| Node.js `fetch` nativo | nativo (Node ≥18, confirmado v24.17.0 no ambiente) [VERIFIED: node --version no ambiente] | Chamadas HTTP à API pública da Nuvemshop | Já é o padrão usado em `client.js` (Fase 1) — sem necessidade de `axios`/`node-fetch`; manter consistência com o código existente |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` | 4.4.3 [VERIFIED: npm registry] | Validar shape das respostas da API antes de persistir (produto, variante, inventory_levels) | Nuvemshop não garante tipagem forte na resposta; útil especialmente para blindar contra mudança de shape da API entre execuções — mas é discricionário: para o volume desta fase, validação manual simples (checagem de campos obrigatórios) também resolve sem dependência nova |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Rate limiter caseiro (leitura dos headers `x-rate-limit-*` + `sleep` proporcional) | `bottleneck` (já cotado em STACK.md da Fase 1) | `bottleneck` é robusto e testado, mas para ~5-10 chamadas por execução diária (628 produtos em ~4 páginas + poucas chamadas de metafield/categoria) o overhead de configurar reservoir/refresh não compensa; um limiter de ~30 linhas que lê os headers reais é mais simples de auditar e já satisfaz D-05 (leitura dinâmica, sem hardcode). Reconsiderar `bottleneck` se a Fase 6 (operação diária) precisar rodar catálogo completo (~15k SKUs) com concorrência real. |
| Tabela de histórico trigger-based (`_history` companion com bitmask, padrão simonwillison) | Tabela append-only simples (`catalog_snapshots` com `run_id` + timestamp) | O padrão trigger-based é mais espaço-eficiente para tabelas com muitas colunas de texto grande e alta frequência de updates, mas adiciona complexidade de manutenção de triggers SQL. Para uma ingestão diária de ~628-15k linhas, uma tabela de fatos simples (uma linha por produto/variante por execução) é mais fácil de entender, faz join trivial com `ingestion_runs`, e já é a estrutura mais natural para D-11's requisito de extensibilidade futura (dados de conversão viram uma tabela irmã referenciando o mesmo `run_id`) |
| `zod` para validação de resposta da API | Checagem manual de campos obrigatórios (`if (!product.id) throw ...`) | `zod` dá schemas reutilizáveis e mensagens de erro melhores, mas para ~5 campos por objeto (produto/variante) a checagem manual é suficiente e evita mais uma dependência. Decisão discricionária — ambos os caminhos são aceitáveis, escolher conforme preferência de manutenção do time |

**Installation:**
```bash
cd app-partners-recomendados
npm install better-sqlite3
npm install zod   # opcional, ver Alternatives Considered
```

**Version verification:** `better-sqlite3@12.11.1` (publicado 2026-06-15, pacote criado em 2016, 7,58M downloads/semana) confirmado via `npm view better-sqlite3 version time.modified time.created` em 2026-07-10. `zod@4.4.3` confirmado via `npm view zod version` na mesma data.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `better-sqlite3` | npm | Pacote criado em 2016-09-07; versão atual publicada em 2026-06-15 | 7,58M/semana | github.com/WiseLibs/better-sqlite3 | [SUS] (seam sinalizou "too-new" — falso positivo, ver nota) | Aprovado — o sinal "too-new" reflete a data de publicação da *versão* mais recente (12.11.1), não a idade real do pacote (10 anos, confirmado via `npm view time.created`); mantido, é o mesmo pacote já cotado em 01-RESEARCH.md/STACK.md |
| `bottleneck` | npm | Publicado pela última vez em 2019-08-03 (estável, sem releases recentes) | 12,03M/semana | github.com/SGrondin/bottleneck | [OK] | Não recomendado como dependência nesta fase (ver Alternatives Considered) mas aprovado se o planner decidir usá-lo |
| `zod` | npm | Versão atual publicada em 2026-05-04 | 215,73M/semana | github.com/colinhacks/zod | [OK] | Aprovado, uso discricionário |

**Packages removed due to [SLOP] verdict:** nenhum.
**Packages flagged as suspicious [SUS]:** `better-sqlite3` — sinalizado apenas por heurística de "too-new" que mede a data da última versão publicada, não a idade do pacote; confirmado maduro (10 anos, 7,58M downloads/semana, repositório oficial ativo). Não requer `checkpoint:human-verify` adicional — já era a escolha travada em D-10 e cotada em pesquisa anterior da Fase 1.

*Nomes de pacote descobertos nesta sessão (`zod`) foram confirmados via `npm view` mas descobertos originalmente via treinamento/conhecimento do domínio Node.js, não Context7 — tratados como `[ASSUMED]` até uso real confirmar compatibilidade, conforme regra de proveniência. `better-sqlite3` é reaproveitado de pesquisa anterior já rotulada `[VERIFIED: npm registry]` em 01-RESEARCH.md.*

## Architecture Patterns

### System Architecture Diagram

```
┌────────────────────────────┐
│  Job de ingestão (Node,     │   1. GET /categories (paginado)
│  novo módulo desta fase)    │──────────────────────────────►
│                              │   2. GET /products?category_id=X
│  - Descobre category_id     │      (per_page=200, paginado via
│    de "Vestidos" via nome   │       Link header + x-total-count)
│  - Lista produtos da        │◄──────────────────────────────
│    categoria (paginado)     │
│  - Lê inventory_levels[]    │   3. inventory_levels[] já vem
│    (já embutido na resposta │      embutido — sem chamada extra
│    de produto/variante)     │
│  - Lê tags de tecido        │
│  - Valida/mapeia tags via   │
│    taxonomia canônica       │   4. GET /metafields/products
│  - Lê baseline de Metafields│      ?owner_id=X&namespace=
│    de recomendação (DATA-02)│       recomendados (DATA-02,
│  - Respeita rate limit      │       reaproveita getMetafields()
│    (lê x-rate-limit-* a     │       já existente)
│    cada resposta, throttla  │
│    adaptativamente)         │
└──────────────┬───────────────┘
               │ 5. Persiste em transação única
               │    (better-sqlite3, db.transaction())
               ▼
┌──────────────────────────────────────────┐
│  SQLite local (novo arquivo .db)          │
│                                             │
│  products / variants / inventory_levels    │  ← estado normalizado
│  fabric_tag_canonical_map                  │  ← taxonomia canônica
│  fabric_tag_audit (frequência por execução)│  ← auditoria contínua
│  ingestion_runs (1 linha por execução)     │  ← histórico versionado
│  catalog_snapshots (fato: produto x run)   │     (D-11, extensível)
│  recommendation_baseline (DATA-02)         │  ← baseline informativo
└────────────────────────────────────────────┘
               ▲
               │ 6. Fase 3 (motor de recomendação)
               │    consome esta base como fonte
               │    de verdade — não chama a API
               │    da Nuvemshop diretamente
```

O fluxo primário a rastrear: **descoberta de categoria (1) → listagem paginada de produtos (2) → leitura de estoque embutida (3) → validação de taxonomia de tecido → leitura de baseline de recomendações (4) → throttling adaptativo em cada chamada → persistência transacional (5) → Fase 3 consome o SQLite, nunca a API Nuvemshop diretamente (6)**.

### Recommended Project Structure
```
app-partners-recomendados/
├── src/
│   ├── nuvemshop-client/
│   │   └── client.js          # ESTENDER: listCategories(), listProducts({categoryId,...}),
│   │                           #   manter getProduct/getMetafields/createMetafield existentes
│   ├── rate-limit/
│   │   └── adaptive-limiter.js # NOVO: throttle baseado em x-rate-limit-* headers
│   ├── ingestion/
│   │   ├── ingest-catalog.js   # NOVO: orquestra listagem + leitura de estoque + persistência
│   │   ├── fabric-taxonomy.js  # NOVO: mapa canônico + validação de tags (DATA-03)
│   │   └── stock-availability.js # NOVO: cálculo "grade >= 3 tamanhos" (D-04)
│   ├── db/
│   │   ├── schema.sql          # NOVO: DDL das tabelas (ver Code Examples)
│   │   └── catalog-store.js    # NOVO: wrapper better-sqlite3 (prepared statements, transaction)
│   └── auth/
│       └── nuvemshop-auth.js   # REAPROVEITAR sem alteração
├── data/
│   └── catalog.db              # NOVO: arquivo SQLite (adicionar a .gitignore)
```

### Pattern 1: Leitura de `inventory_levels[]` (DATA-01)
**What:** `inventory_levels` é um array embutido em cada objeto de variante, já presente na resposta padrão de `GET /products/{id}` e `GET /products/{id}/variants` — não requer chamada adicional por variante. Formato: `[{ location_id: string, stock: integer }]`. `variant.stock` continua populado por compatibilidade retroativa mas está oficialmente depreciado (já documentado em PITFALLS.md Pitfall 3 — este achado confirma e detalha a estrutura exata).
**When to use:** Toda leitura de estoque desta fase deve iterar `variant.inventory_levels[]`, nunca ler `variant.stock` diretamente. Como D-03 já confirma localização única (Afterclick), a agregação multi-localização não é necessária — mas o código deve ler o array corretamente mesmo assim (não assumir posição fixa `[0]` sem validar `location_id`, para não quebrar silenciosamente se uma segunda localização for adicionada no futuro).
**Example:**
```javascript
// Fonte: tiendanube.github.io/api-documentation/guides/multi-inventory/products (WebFetch, 2026-07-10)
// Estrutura confirmada:
// variant.inventory_levels = [{ location_id: "01GQ2ZHK064BQRHGDB7CCV0Y6N", stock: 5 }]

function getVariantStock(variant) {
  // Soma todos os inventory_levels (mesmo com 1 única localização confirmada por D-03,
  // somar é mais robusto do que indexar [0] cegamente)
  const levels = variant.inventory_levels || [];
  return levels.reduce((total, level) => total + (level.stock || 0), 0);
}
```
Fonte: [CITED: tiendanube.github.io/api-documentation/guides/multi-inventory/products]

### Pattern 2: Rate limiting adaptativo (PLAT-02/D-05)
**What:** A API usa leaky bucket: `x-rate-limit-limit` (tamanho do bucket, 40 por padrão), `x-rate-limit-remaining` (requisições restantes), `x-rate-limit-reset` (milissegundos até o bucket esvaziar). Um throttler correto lê esses três headers em toda resposta e ajusta o próximo delay dinamicamente — nunca assume um valor fixo (ex: "sempre esperar 500ms"), que é exatamente o anti-padrão que PLAT-02 proíbe.
**When to use:** Em todo request feito pelo `client.js` estendido — deve envolver o `fetch()` numa função compartilhada que lê os headers da resposta anterior antes de decidir o timing do próximo request.
**Example:**
```javascript
// Fonte: tiendanube.github.io/api-documentation/intro (WebFetch, 2026-07-10)
// Headers confirmados: x-rate-limit-limit, x-rate-limit-remaining, x-rate-limit-reset (ms)

class AdaptiveRateLimiter {
  constructor() {
    this.remaining = null; // desconhecido até a primeira resposta real
    this.resetMs = null;
  }

  updateFromHeaders(headers) {
    const remaining = headers.get('x-rate-limit-remaining');
    const reset = headers.get('x-rate-limit-reset');
    if (remaining !== null) this.remaining = Number(remaining);
    if (reset !== null) this.resetMs = Number(reset);
  }

  async waitIfNeeded() {
    // Se não sabemos ainda (primeira chamada), não espera — deixa a API responder
    // e informar o estado real via headers antes de qualquer suposição de timing.
    if (this.remaining === null) return;

    // Buffer de segurança: nunca deixar o bucket chegar a 0 (evita 429 mesmo em
    // condições de corrida com outra execução concorrente do mesmo app/loja)
    if (this.remaining <= 2 && this.resetMs) {
      await new Promise((resolve) => setTimeout(resolve, this.resetMs));
    }
  }
}

// Uso no wrapper de fetch:
async function fetchWithRateLimit(url, options, limiter) {
  await limiter.waitIfNeeded();
  const response = await fetch(url, options);
  limiter.updateFromHeaders(response.headers);
  if (response.status === 429) {
    // Nunca assumir um valor de backoff fixo — usar o reset real informado
    const resetMs = Number(response.headers.get('x-rate-limit-reset')) || 2000;
    await new Promise((resolve) => setTimeout(resolve, resetMs));
    return fetchWithRateLimit(url, options, limiter); // retry após respeitar o reset real
  }
  return response;
}
```
Fonte: [CITED: tiendanube.github.io/api-documentation/intro]

### Pattern 3: Auditoria de taxonomia de tecido contínua (DATA-03)
**What:** Como D-06 confirma que hoje não há tags de tecido preenchidas, esta fase constrói a infraestrutura (mapa canônico + validação), não uma limpeza de dados sujos existentes. O padrão recomendado em PITFALLS.md Pitfall 6 já é o correto: uma tabela de mapeamento explícito (tag bruta → valor canônico), nunca fuzzy-matching heurístico. A diferença chave desta fase (vs. o pitfall genérico) é que a auditoria deve rodar **toda execução**, não uma vez — gerando uma tabela de frequência de tags brutas observadas a cada ingestão, para detectar tags novas/não mapeadas assim que aparecerem (produtos novos, ou o próximo lote de tags que o usuário importar).
**When to use:** Em toda execução do job de ingestão, depois de ler as tags de cada produto — nunca como script avulso rodado uma vez.
**Example:**
```javascript
// Padrão: tabela de mapa canônico explícito, sem heurística fuzzy (PITFALLS.md Pitfall 6)
// fabric_tag_canonical_map: raw_tag TEXT PRIMARY KEY, canonical_value TEXT, updated_at TEXT

function auditFabricTags(products, canonicalMap) {
  const frequency = new Map(); // raw_tag -> count nesta execução
  const unmapped = new Set();  // tags vistas mas ausentes do mapa canônico

  for (const product of products) {
    const fabricTags = (product.tags || '').split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    for (const rawTag of fabricTags) {
      frequency.set(rawTag, (frequency.get(rawTag) || 0) + 1);
      if (!canonicalMap.has(rawTag)) unmapped.add(rawTag);
    }
  }

  // D-08: não gera relatório de "produtos sem tag" — só audita o que existe.
  // D-09: produtos cuja tag não mapeia para canônico ficam fora do motor (Fase 3),
  //       não é tratado como erro aqui — apenas registrado na tabela de auditoria.
  return { frequency, unmapped };
}
```
**Nota:** o mapa canônico em si (quais valores são "válidos") não pode ser inventado pela pesquisa — como D-06/D-07 confirmam que as tags serão populadas manualmente pelo usuário via planilha, o conjunto real de valores canônicos só será conhecido quando essa planilha existir. O planner deve tratar a lista de tipos de tecido válidos como uma pergunta em aberto para o usuário confirmar durante a execução da fase (ex: perguntar quais nomenclaturas ele pretende usar na planilha antes de fixar o enum no código), não assumir um enum genérico de tecidos.

### Pattern 4: Baseline de recomendações atuais (DATA-02)
**What:** Reaproveitar `getMetafields({ ownerId })`, já existente e validado em `client.js`, para ler o Metafield `recomendados.produto_sugerido` de cada produto da categoria antes de qualquer escrita futura da Fase 3+. Persistir como registro informativo simples (uma linha por produto, valor lido, timestamp da leitura) — sem lógica de comparação/drift (D-12 explicitamente adia isso para APRV-07/v2).
**When to use:** Uma vez por execução de ingestão, como parte do mesmo job — não precisa ser um processo separado.
**Example:**
```javascript
// Reaproveita getMetafields() sem modificação (client.js, Fase 1)
import { getMetafields } from '../nuvemshop-client/client.js';

async function readRecommendationBaseline(productId) {
  const metafields = await getMetafields({ ownerId: productId });
  const match = Array.isArray(metafields)
    ? metafields.find((m) => m.namespace === 'recomendados' && m.key === 'produto_sugerido')
    : null;
  return {
    productId,
    currentValue: match ? match.value : null,
    readAt: new Date().toISOString(),
  };
}
```

### Anti-Patterns to Avoid
- **Ler `variant.stock` em vez de `inventory_levels[]`:** já documentado como depreciado; PITFALLS.md Pitfall 3 confirma que o campo continua populado por compatibilidade, então o erro não quebra visivelmente — apenas produz decisões de estoque potencialmente erradas.
- **Fazer 1 request por variante para buscar `inventory_levels`:** desnecessário — o array já vem embutido na resposta de `GET /products/{id}` e `GET /products/{id}/variants`. Uma implementação que itera variantes fazendo chamadas extras desperdiça o budget de rate limit sem necessidade.
- **Hardcodear valor de rate limit (ex: `sleep(500)` fixo entre chamadas):** viola PLAT-02 explicitamente. O throttling deve sempre derivar de `x-rate-limit-remaining`/`x-rate-limit-reset` lidos da resposta real.
- **Fuzzy-matching de tags de tecido com heurística de similaridade de string:** PITFALLS.md Pitfall 6 já rejeita isso explicitamente — reintroduziria o risco de "match silenciosamente errado" que o motor determinístico foi desenhado para evitar.
- **Gerar relatório de "produtos sem tag de tecido" para ajudar o usuário a priorizar preenchimento:** explicitamente fora de escopo por D-08 — o usuário já vai popular tudo de uma vez via planilha.
- **Assumir um enum fixo de tipos de tecido sem confirmar com o usuário:** o conjunto real de valores canônicos só existe quando a planilha de D-07 for criada — não travar um enum genérico (ex: "algodão, viscose, poliéster...") sem checar com o usuário durante a execução.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Paginação de listagem de produtos | Loop manual incrementando `page` até resposta vazia, sem checar `x-total-count` | Ler `Link` header (`rel="next"`) e/ou `x-total-count` para saber quando parar, com `per_page=200` para minimizar total de chamadas | Evita requisições desperdiçadas além do fim real da paginação e torna o número total de páginas previsível/logável |
| Rate limiting | Biblioteca de terceiros complexa (`bottleneck` com reservoir/refresh configurado) para um volume de poucas dezenas de chamadas por execução | Limiter caseiro simples (Pattern 2) que lê os 3 headers documentados | Volume desta fase (628 produtos ≈ 4 páginas + poucas chamadas de metafield) não justifica a superfície de configuração de uma lib de filas; reavaliar se a Fase 6 escalar para catálogo completo com maior concorrência |
| Histórico versionado / auditoria de mudanças | Sistema de migração de schema versionado, ou replicar o padrão de trigger SQL completo (bitmask por coluna) do zero sem necessidade | Tabela append-only simples (`catalog_snapshots` com `run_id`), suficiente para D-11 e mais fácil de entender/estender | Trigger-based history com bitmask é otimizado para tabelas com muitas colunas e alta frequência de update — não o caso aqui (ingestão é 1x/dia); a complexidade extra não compensa |
| Validação de tags de tecido | Normalização automática via similaridade de string/distância de Levenshtein | Tabela de mapa canônico explícito (raw → canonical), atualizada manualmente quando necessário | Já documentado em PITFALLS.md Pitfall 6 — fuzzy-matching reintroduz exatamente o risco de match silenciosamente errado que o projeto (determinístico, sem IA/ML) foi desenhado para evitar |

**Key insight:** Esta fase lida com volume real mas modesto (628 produtos, ~4-7 páginas de API). O maior risco não é performance/escala — é over-engineering: puxar bibliotecas (rate limiter complexo, trigger-based history) dimensionadas para um volume/frequência que este projeto não tem ainda. A infraestrutura deve ser simples o bastante para auditar visualmente, e extensível o bastante para não precisar de redesenho quando a Fase 6 escalar para o catálogo completo (~15k SKUs) ou quando dados de conversão (deferred idea) forem adicionados.

## Common Pitfalls

> As seguintes pitfalls já documentadas em `.planning/research/PITFALLS.md` (Pitfall 3, Pitfall 4, Pitfall 5, Pitfall 6) se aplicam diretamente a esta fase e não são re-derivadas aqui — apenas referenciadas com o refinamento específico desta fase.

### Pitfall A (refinamento de PITFALLS.md Pitfall 3): critério "estoque disponível" precisa da regra de negócio D-04, não só `inventory_levels[]` correto
**What goes wrong:** Ler `inventory_levels[]` corretamente (em vez de `variant.stock`) resolve o problema técnico, mas não resolve o problema de negócio — um produto com "estoque" tecnicamente correto (ex: 1 único tamanho com 50 unidades) ainda pode ser considerado "indisponível" pela regra real da Talgui (D-04: grade precisa de 3+ tamanhos com estoque > 0).
**Why it happens:** É fácil confundir "leitura tecnicamente correta do campo" com "cálculo correto da regra de disponibilidade" — são duas camadas distintas.
**How to avoid:** Implementar o cálculo de disponibilidade como uma função nomeada e isolada (ex: `hasAvailableGrade(product, { minSizesInStock: 3 })`), não uma checagem inline `stock > 0`, e nomear explicitamente o `3` como constante configurável (já recomendado em `<specifics>` do CONTEXT.md) — a regra pode mudar no futuro.
**Warning signs:** Produto com apenas 1-2 tamanhos em estoque aparecendo como "disponível" nos dados persistidos.

### Pitfall B (refinamento de PITFALLS.md Pitfall 4): orçamento real de chamadas para 628 produtos é pequeno, não motivo para negligenciar throttling
**What goes wrong:** Como o volume desta fase (628 produtos ≈ 4 páginas a `per_page=200`, mais 1 chamada de categorias, mais até 628 chamadas de Metafields para o baseline DATA-02) é pequeno comparado ao catálogo completo (~15k), pode parecer que rate limiting "não importa" nesta fase — mas a leitura de Metafields por produto (DATA-02) ainda soma ~628 chamadas extras, o que já se aproxima do burst de 40 e precisa de throttling real, não só a paginação de produtos.
**Why it happens:** É fácil calcular "chamadas de listagem" (poucas, por paginação) e esquecer que o baseline de Metafields (DATA-02) é 1 chamada por produto, não paginável da mesma forma.
**How to avoid:** Orçar o total real de chamadas por execução: ~4-7 (paginação de produtos) + ~628 (Metafields por produto, se não houver endpoint de listagem em lote de Metafields) + poucas de categoria. Confirmar durante a execução se existe uma forma de listar Metafields em lote (a pesquisa desta fase não encontrou um endpoint de listagem em lote de Metafields multi-produto na documentação consultada — ver Open Questions) para não assumir que DATA-02 é "barato" só porque é informativo.
**Warning signs:** Job de ingestão demorando muito mais que o estimado, ou recebendo 429 apenas na fase de leitura de Metafields, não na fase de listagem de produtos.

### Pitfall C (novo, específico desta fase): descoberta do `category_id` de "Vestidos" não pode ser hardcoded sem confirmação
**What goes wrong:** D-01 nomeia a categoria pelo nome ("Vestidos"), não pelo ID numérico — o `category_id` real só é conhecido chamando `GET /categories` e filtrando por nome/handle. Hardcodear um ID assumido (sem antes confirmar via chamada real) arrisca apontar para a categoria errada silenciosamente, especialmente se houver subcategorias ou uma categoria "Vestidos" arquivada/duplicada.
**Why it happens:** É tentador, ao planejar, já escrever `category_id: 12345` porque "provavelmente" é esse — mas essa é exatamente a suposição que D-02 já pede para não travar sem confirmação real de API.
**How to avoid:** Primeira ação do job de ingestão: chamar `GET /categories`, localizar a categoria "Vestidos" pelo campo `name`/`handle`, e usar o `id` retornado — nunca hardcoded. Logar o `category_id` resolvido para auditoria (para detectar se o nome mudar no futuro).
**Warning signs:** Contagem de produtos ingeridos divergindo significativamente de 628 (o número esperado por D-01) sem explicação.

## Code Examples

### Paginação de categoria/produtos (PLAT-02)
```javascript
// Fonte: tiendanube.github.io/api-documentation/resources/category,
//        tiendanube.github.io/api-documentation/resources/product,
//        tiendanube.github.io/api-documentation/intro (WebFetch, 2026-07-10)

async function listAllProductsInCategory(categoryId, { fetchWithRateLimit, limiter }) {
  const products = [];
  let page = 1;
  const perPage = 200; // máximo documentado

  while (true) {
    const url = `${API_BASE}/${storeId}/products?category_id=${categoryId}&page=${page}&per_page=${perPage}`;
    const response = await fetchWithRateLimit(url, { headers: buildHeaders(accessToken) }, limiter);
    await assertOk(response, `GET ${url}`);

    const pageProducts = await response.json();
    products.push(...pageProducts);

    // Parar quando a página retornar menos que perPage (última página) OU
    // quando não houver mais rel="next" no header Link
    const linkHeader = response.headers.get('link') || '';
    const hasNext = linkHeader.includes('rel="next"');
    if (!hasNext || pageProducts.length < perPage) break;

    page += 1;
  }

  return products;
}
```

### Descoberta de `category_id` por nome (Pitfall C)
```javascript
// Fonte: tiendanube.github.io/api-documentation/resources/category (WebFetch, 2026-07-10)

async function resolveCategoryIdByName(targetName) {
  const url = `${API_BASE}/${storeId}/categories?per_page=200`;
  const response = await fetch(url, { headers: buildHeaders(accessToken) });
  await assertOk(response, `GET ${url}`);
  const categories = await response.json();

  const match = categories.find(
    (c) => (c.name?.pt || '').trim().toLowerCase() === targetName.trim().toLowerCase()
  );

  if (!match) {
    throw new Error(
      `Categoria "${targetName}" não encontrada via GET /categories — confirme o nome exato no admin antes de prosseguir.`
    );
  }

  return match.id;
}
```

### Schema SQLite (D-10/D-11 — discricionário, exemplo de ponto de partida)
```sql
-- Fonte: better-sqlite3 docs (github.com/WiseLibs/better-sqlite3, WebFetch 2026-07-10) +
--        padrão de tabela de fatos append-only (Alternatives Considered acima)

CREATE TABLE IF NOT EXISTS ingestion_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  category_id TEXT NOT NULL,
  category_name TEXT NOT NULL,
  products_read INTEGER,
  status TEXT NOT NULL DEFAULT 'running' -- running | success | failed
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,          -- product_id da Nuvemshop
  name TEXT,
  handle TEXT,
  canonical_url TEXT,
  last_seen_run_id INTEGER REFERENCES ingestion_runs(id)
);

CREATE TABLE IF NOT EXISTS variants (
  id TEXT PRIMARY KEY,          -- variant_id da Nuvemshop
  product_id TEXT NOT NULL REFERENCES products(id),
  sku TEXT,
  color_value TEXT,
  size_value TEXT,
  stock_total INTEGER,          -- soma de inventory_levels[].stock
  last_seen_run_id INTEGER REFERENCES ingestion_runs(id)
);

-- Fato append-only: uma linha por produto por execução (D-11, base do histórico)
CREATE TABLE IF NOT EXISTS catalog_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL REFERENCES ingestion_runs(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  has_available_grade INTEGER NOT NULL, -- 0/1, resultado de D-04 (>=3 tamanhos em estoque)
  sizes_in_stock_count INTEGER NOT NULL,
  fabric_tag_raw TEXT,
  fabric_tag_canonical TEXT,     -- NULL se não mapeado (D-09: fora do motor, não erro)
  color_value TEXT,
  snapshot_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_snapshots_product ON catalog_snapshots(product_id, snapshot_at);

-- Extensível para dados de conversão futuros (deferred idea) sem redesenho:
-- uma tabela irmã (ex: order_attributions) referenciando o mesmo run_id/product_id.

CREATE TABLE IF NOT EXISTS fabric_tag_canonical_map (
  raw_tag TEXT PRIMARY KEY,
  canonical_value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fabric_tag_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL REFERENCES ingestion_runs(id),
  raw_tag TEXT NOT NULL,
  occurrence_count INTEGER NOT NULL,
  is_mapped INTEGER NOT NULL -- 0/1
);

CREATE TABLE IF NOT EXISTS recommendation_baseline (
  product_id TEXT NOT NULL,
  run_id INTEGER NOT NULL REFERENCES ingestion_runs(id),
  current_recommended_product_id TEXT,
  read_at TEXT NOT NULL,
  PRIMARY KEY (product_id, run_id)
);
```

### Transação de persistência em lote (better-sqlite3)
```javascript
// Fonte: github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md (WebFetch, 2026-07-10)

import Database from 'better-sqlite3';

const db = new Database('data/catalog.db');
db.pragma('journal_mode = WAL'); // recomendado para leitura concorrente durante escrita

const insertProduct = db.prepare(
  `INSERT INTO products (id, name, handle, canonical_url, last_seen_run_id)
   VALUES (@id, @name, @handle, @canonicalUrl, @runId)
   ON CONFLICT(id) DO UPDATE SET name=excluded.name, handle=excluded.handle,
     canonical_url=excluded.canonical_url, last_seen_run_id=excluded.last_seen_run_id`
);

const insertSnapshot = db.prepare(
  `INSERT INTO catalog_snapshots
     (run_id, product_id, has_available_grade, sizes_in_stock_count,
      fabric_tag_raw, fabric_tag_canonical, color_value, snapshot_at)
   VALUES (@runId, @productId, @hasAvailableGrade, @sizesInStockCount,
      @fabricTagRaw, @fabricTagCanonical, @colorValue, @snapshotAt)`
);

// Toda a ingestão de uma execução vira UMA transação — evita 628 transações
// separadas e garante atomicidade (ou tudo persiste, ou nada, em caso de erro no meio)
const persistIngestion = db.transaction((records) => {
  for (const record of records) {
    insertProduct.run(record.product);
    insertSnapshot.run(record.snapshot);
  }
});

persistIngestion(allRecordsFromThisRun);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `variant.stock` como fonte de estoque | `variant.inventory_levels[]` (multi-inventory) | Já em vigor — `variant.stock` mantido só por compatibilidade retroativa | Confirma achado já documentado em PITFALLS.md; nesta pesquisa a estrutura exata do array foi confirmada com fonte oficial |
| Iterar produtos individualmente sem paginação real | `Link` header + `x-total-count` + `per_page` até 200 | Documentado como padrão atual da API | Reduz drasticamente o número de chamadas necessárias para ler 628 produtos (de centenas para ~4-7) |

**Deprecated/outdated:**
- `variant.stock`: mantido por compatibilidade, mas não deve ser usado como fonte de verdade nesta fase (já coberto em PITFALLS.md).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Não existe endpoint de listagem em lote de Metafields multi-produto (só `GET /metafields/products?owner_id=X`, um produto por vez) | Common Pitfalls > Pitfall B, Code Examples | Médio — se um endpoint em lote existir e não foi encontrado nesta pesquisa (a documentação consultada não cobriu esse caso especificamente), o orçamento de chamadas para DATA-02 estimado (~628 chamadas) estaria superestimado, mas não incorreto na direção conservadora (pior caso, não risco de subestimar rate limit) |
| A2 | `bottleneck` é desnecessário para o volume desta fase e um limiter caseiro é suficiente | Standard Stack > Alternatives Considered, Don't Hand-Roll | Baixo — é uma recomendação de simplicidade, não um requisito travado; se o planner preferir usar `bottleneck` por outros motivos (ex: reuso em fases futuras de maior volume), não há conflito técnico |
| A3 | Uma tabela de fatos append-only simples é suficiente para D-11, em vez do padrão trigger-based com bitmask | Standard Stack > Alternatives Considered, Don't Hand-Roll | Baixo-médio — decisão de discretion explícita do usuário (D-11 discretion); se o volume de execuções crescer muito (múltiplas vezes ao dia por longos períodos) o espaço em disco pode crescer mais rápido que com o padrão bitmask, mas para 1x/dia é irrelevante na escala desta fase |
| A4 | O campo de tag de tecido está no campo padrão `tags` (string separada por vírgula) da API de produtos, não em um Metafield customizado | Architecture Patterns > Pattern 3 | Médio-alto — CONTEXT.md/PITFALLS.md referem-se a "tags" de forma genérica sem confirmar se é o campo nativo `tags` da Nuvemshop ou um Metafield customizado; o planner/execução deve confirmar isso via inspeção real de um produto Vestidos com tag preenchida (ou perguntar ao usuário) antes de fixar a implementação — se for Metafield, a leitura muda de `product.tags` para uma chamada adicional de `getMetafields()` |
| A5 | O multiplicador "10x para planos Next/Evolution" no rate limit não foi verificado para a loja Talgui especificamente | Architecture Patterns > Pattern 2, Standard Stack | Baixo — já documentado como incerteza em STACK.md/PITFALLS.md da Fase 1; a implementação de Pattern 2 já é adaptativa (lê os headers reais), então não depende de saber esse número de antemão — apenas relevante para dimensionar expectativa de runtime |

**Se esta tabela estiver vazia:** não se aplica — há itens genuinamente assumidos nesta pesquisa, listados acima.

## Open Questions

1. **(RESOLVED — 02-01-PLAN.md Task 3)** Qual o `category_id` real de "Vestidos" na loja Talgui?
   - What we know: D-01/D-02 confirmam que é um nome de categoria real, com 628 produtos, mas o ID numérico não está registrado em nenhum documento de planejamento.
   - What's unclear: o ID exato, e se existe mais de uma categoria com nome similar (subcategoria, categoria arquivada).
   - Recommendation: primeira ação de execução do job de ingestão — chamar `GET /categories`, resolver por nome (ver Code Examples > "Descoberta de category_id"), logar o resultado para auditoria. Não travar um ID hardcoded no plano.
   - Resolution: coberto por `resolveCategoryIdByName()` em 02-01-PLAN.md Task 3 (`resolve-category.js`), resolvido em runtime contra a loja real — nunca hardcoded.

2. **(RESOLVED via blocking checkpoint — 02-02-PLAN.md Task 0)** O campo de tag de tecido é o campo nativo `tags` da Nuvemshop, ou um Metafield/atributo customizado?
   - What we know: CONTEXT.md e PITFALLS.md mencionam "tags de tecido" de forma genérica; a API de produtos tem um campo nativo `tags` (string separada por vírgula, confirmado na estrutura do produto nesta pesquisa).
   - What's unclear: se o tipo de tecido é armazenado nesse campo nativo (misturado com outras tags) ou em um campo/Metafield dedicado — isso muda a implementação de leitura.
   - Recommendation: confirmar inspecionando um produto real da categoria Vestidos via API (`GET /products/{id}`) antes de escrever a lógica de parsing — ou perguntar diretamente ao usuário, já que D-07 menciona que ele vai popular via planilha e provavelmente sabe onde esses dados vão cair.
   - Resolution: 02-02-PLAN.md abre com um `checkpoint:human-verify` bloqueante que resolve esta questão antes de implementar `fabric-taxonomy.js` — inspeção confirmou o campo nativo `tags`, alinhado com a expectativa acima.

3. **(RESOLVED — orçamento conservador aplicado, 02-03-PLAN.md Task 1)** Existe endpoint de listagem em lote de Metafields (múltiplos produtos numa única chamada)?
   - What we know: a documentação consultada mostra apenas `GET /metafields/products?owner_id={id}` (um produto por vez), já usado em `client.js`.
   - What's unclear: se existe uma variante que aceita múltiplos `owner_id` ou lista todos os Metafields de um namespace de uma vez, o que reduziria o custo de DATA-02 de ~628 chamadas para poucas.
   - Recommendation: verificar diretamente na documentação de Metafields (`tiendanube.github.io/api-documentation/resources/metafields`) durante a execução, ou testar empiricamente contra a loja real; se não existir, aceitar o custo de ~628 chamadas paginadas/throttladas (ainda dentro do orçamento diário, apenas mais lento).
   - Resolution: 02-03-PLAN.md Task 1 orça o caso conservador (sem endpoint em lote, ~628 chamadas throttladas via `AdaptiveRateLimiter`) — se um endpoint em lote for descoberto na execução real, é uma otimização futura, não um bloqueio.

4. **(DEFERRED to user, by design — D-07/D-08)** Qual o conjunto real de valores canônicos de tipo de tecido que o usuário pretende usar na planilha (D-07)?
   - What we know: nenhum valor está definido ainda — D-06 confirma que o campo está vazio hoje.
   - What's unclear: a nomenclatura exata que o usuário vai adotar (ex: "Viscose" vs "viscose lisa" como categorias distintas ou não), o que determina o formato da tabela `fabric_tag_canonical_map`.
   - Recommendation: esta é uma pergunta para o usuário, não pesquisável — o planner deve considerar perguntar isso antes ou durante a execução (possivelmente via `checkpoint:human-verify` ou uma pergunta direta), já que a estrutura de dados de validação depende dela.
   - Resolution: 02-02-PLAN.md constrói a infraestrutura de `fabric_tag_canonical_map` vazia/populável, sem hardcodear valores assumidos — o preenchimento real fica para quando o usuário criar a planilha (D-07), fora do escopo de código desta fase (D-08 confirma que não é bloqueante).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Job de ingestão, todas as chamadas de API | ✓ | v24.17.0 | — |
| npm | Instalação de `better-sqlite3`/`zod` | ✓ | 11.13.0 | — |
| `better-sqlite3` (pacote) | Persistência do catálogo (D-10) | ✗ (não instalado ainda) | — | Nenhum necessário — instalação faz parte do trabalho desta fase (`npm install better-sqlite3`), já validado no registry |
| Acesso à API pública Nuvemshop (token do App Partners) | Toda leitura de catálogo | ✓ (reaproveitado de `.env`, Fase 1) | — | — |
| Escopos de leitura (`read_products`, possivelmente `read_locations`) no App Partners existente | `GET /categories`, `GET /products`, `GET /locations` (se necessário confirmar D-03) | Presumido ✓ (mesmo app da Fase 1, mas não confirmado explicitamente para `read_locations`) | — | Confirmar no Partners Portal se o escopo do app já cobre leitura de categorias/produtos/localizações; se não, reautorizar o app com escopo adicional antes de escrever código |

**Missing dependencies with no fallback:**
- Nenhuma — `better-sqlite3` não instalado ainda é esperado (parte do trabalho da própria fase), sem risco de bloqueio.

**Missing dependencies with fallback:**
- Confirmação de escopo `read_locations`: se o app atual não tiver esse escopo e D-03 (localização única) precisar de confirmação via `GET /locations`, pode ser necessário reautorizar o app — mas como D-03 já é uma decisão travada pelo usuário (não uma pergunta em aberto), essa chamada é opcional/informativa, não bloqueante.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Nenhum configurado ainda no projeto — `app-partners-recomendados/package.json` não lista `vitest`/`jest`/dependências de teste; nenhum arquivo `*.test.js`/`*.spec.js` encontrado |
| Config file | none — ver Wave 0 Gaps |
| Quick run command | A definir na fase — recomendado `vitest` (leve, ESM-first, compatível com `"type": "module"` já usado no `package.json`) para testes unitários de `stock-availability.js` e `fabric-taxonomy.js`, que são lógica pura testável sem rede |
| Full suite command | `npx vitest run` (a confirmar após setup) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PLAT-02 | Listagem paginada respeita `per_page`/`Link` header e throttling adaptativo lê headers reais | integration (contra API real ou mock de resposta) | `npx vitest run src/nuvemshop-client` (a criar) | ❌ Wave 0 |
| DATA-01 | Cálculo "grade ≥ 3 tamanhos em estoque" (D-04) a partir de `inventory_levels[]` | unit (lógica pura, sem rede) | `npx vitest run src/ingestion/stock-availability.test.js` (a criar) | ❌ Wave 0 |
| DATA-02 | Leitura de baseline de Metafields não lança erro quando Metafield ausente (produto sem recomendação prévia) | integration (contra API real, produto de teste da Fase 1) | script manual/smoke reutilizando `roundtrip-metafield.js` já existente como referência | ❌ Wave 0 |
| DATA-03 | Mapeamento de tag bruta → canônica; tags não mapeadas ficam de fora sem erro (D-09) | unit (lógica pura) | `npx vitest run src/ingestion/fabric-taxonomy.test.js` (a criar) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** rodar `npx vitest run` para os módulos de lógica pura (`stock-availability`, `fabric-taxonomy`) sempre que alterados.
- **Per wave merge:** executar o job de ingestão real contra a categoria Vestidos completa (628 produtos) e validar contagem de produtos ingeridos, ausência de 429, e schema SQLite populado corretamente.
- **Phase gate:** ingestão completa da categoria Vestidos rodando sem erro, com histórico versionado gravado (D-11) e baseline de Metafields lido (DATA-02), antes de `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] Nenhum framework de teste configurado no projeto — instalar `vitest` (`npm install -D vitest`) como primeira ação de Wave 0, dado que a lógica de disponibilidade de estoque (D-04) e mapeamento de tags (DATA-03) são unidades puramente testáveis sem rede e se beneficiam de testes automatizados desde o início, diferente do spike da Fase 1 que era majoritariamente validação manual/visual
- [ ] `src/db/schema.sql` e wrapper `catalog-store.js` ainda não existem — criar como parte do Wave 0/primeira wave de implementação
- [ ] Diretório `data/` (para o arquivo `.db`) precisa ser criado e adicionado ao `.gitignore` (confirmar se `.gitignore` do projeto já cobre `*.db`/`data/`)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | não (reaproveita) | Token do App Partners já gerenciado por `nuvemshop-auth.js` (Fase 1) — nenhuma mudança nesta fase |
| V3 Session Management | não | Job batch server-side, sem sessão de usuário final |
| V4 Access Control | sim | O arquivo SQLite (`data/catalog.db`) não deve ser exposto por nenhum endpoint público — é dado interno consumido apenas pelo job de ingestão e, futuramente, pelo motor de recomendação (Fase 3), nunca diretamente pelo Script do storefront |
| V5 Input Validation | sim | Validar shape das respostas da API (produto, variante, `inventory_levels`) antes de persistir — especialmente `category_id` resolvido (Pitfall C) e valores de `stock` (garantir que são inteiros não-negativos antes de gravar) |
| V6 Cryptography | não diretamente | Nenhuma mudança em relação à Fase 1 — token continua em `.env`, nunca no SQLite |

### Known Threat Patterns for este stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Injeção SQL via dados de produto vindos da API (nome de produto, tag) usados em query construída por concatenação de string | Tampering | Usar exclusivamente prepared statements do `better-sqlite3` (`db.prepare(...).run(params)`), nunca concatenar valores de produto diretamente em SQL — já é o padrão idiomático da biblioteca, mas deve ser reforçado explicitamente já que dados vêm de fonte externa (API) |
| Arquivo `.db` local commitado acidentalmente no git (contém catálogo completo, não é segredo mas é dado operacional que não deveria estar versionado) | Information Disclosure (leve) | Adicionar `data/*.db` ao `.gitignore` antes da primeira execução real |
| Falha silenciosa na leitura de `inventory_levels[]` ausente ou malformado (ex: produto sem variantes) causando cálculo de disponibilidade incorreto sem erro visível | Tampering (integridade de dado) | Validar explicitamente a presença de `inventory_levels` antes de calcular disponibilidade; logar/marcar produtos com estrutura inesperada em vez de assumir "disponível" ou "indisponível" por default silencioso |

## Sources

### Primary (HIGH confidence)
- Nenhuma fonte desta pesquisa atingiu HIGH — mesmo ambiente da Fase 1 (Context7 indisponível, MCPs de busca dedicados desabilitados em `.planning/config.json`), pesquisa conduzida via `WebFetch`/`WebSearch` nativos.

### Secondary (MEDIUM confidence)
- [Category | Nuvemshop API](https://tiendanube.github.io/api-documentation/resources/category) — `GET /categories`, parâmetros de filtro/paginação — WebFetch direto, 2026-07-10
- [Product | Nuvemshop API](https://tiendanube.github.io/api-documentation/resources/product) — `GET /products`, `category_id`, shape de produto/variante — WebFetch direto, 2026-07-10
- [Getting Started with Nuvemshop API | Nuvemshop API](https://tiendanube.github.io/api-documentation/intro) — paginação (`Link`, `x-total-count`, `per_page` até 200), rate limit (headers `x-rate-limit-*`, leaky bucket 40/2req-s) — WebFetch direto, 2026-07-10
- [Multi Inventory Guide | Nuvemshop API](https://tiendanube.github.io/api-documentation/guides/multi-inventory/products) — estrutura exata de `inventory_levels[]`, deprecação de `variant.stock`, endpoints afetados, comportamento de escrita — WebFetch direto, 2026-07-10
- [Location | Nuvemshop API](https://tiendanube.github.io/api-documentation/resources/location) — `GET /locations`, escopo `read_locations` — WebFetch direto, 2026-07-10
- [better-sqlite3 API docs | GitHub](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md) — `Database` constructor, `db.transaction()`, `db.pragma('journal_mode = WAL')`, prepared statements — WebFetch direto, 2026-07-10
- npm registry (`npm view better-sqlite3/bottleneck/zod version time.modified time.created repository.url`) — versões, idade real do pacote (`better-sqlite3` criado em 2016), downloads/semana — verificado diretamente em 2026-07-10

### Tertiary (LOW confidence)
- [sqlite-history (Simon Willison)](https://simonwillison.net/2023/Apr/15/sqlite-history/) — padrão trigger-based de histórico versionado com bitmask — usado apenas para triangulação/comparação de alternativas de design, não como recomendação final desta pesquisa (a recomendação final é a tabela append-only mais simples, ver Alternatives Considered)
- Resultados gerais de WebSearch sobre "SQLite schema design best practices" (sqliteforum.com, moldstud.com, bytebase.com) — usados apenas como contexto geral de normalização de schema, não como fonte de fatos específicos citados no corpo do documento

## Metadata

**Confidence breakdown:**
- Standard Stack: MEDIUM — `better-sqlite3` reaproveitado de pesquisa anterior já rotulada; nomes/versões confirmados via `npm view` nesta sessão
- Architecture (endpoints Nuvemshop, paginação, rate limit, inventory_levels): MEDIUM-ALTA — todas as afirmações de API vêm de WebFetch direto da documentação oficial (`tiendanube.github.io/api-documentation`), com fontes citadas por página específica; é o achado mais bem verificado desta pesquisa
- Padrão de histórico versionado SQLite (D-11 discretion): MEDIUM — decisão de design argumentada com base em tradeoffs claros, não uma "resposta certa" única; o schema proposto é um ponto de partida razoável, não uma prescrição rígida
- Taxonomia de tags de tecido (DATA-03): BAIXA quanto ao conteúdo real do mapa canônico (valores ainda não existem — ver Open Questions #4) — ALTA quanto ao padrão de infraestrutura (mapa explícito + auditoria contínua), que já vem confirmado de PITFALLS.md

**Research date:** 2026-07-10
**Valid until:** 14 dias — a documentação de API consultada é estável (não há indício de mudança iminente nos endpoints de produto/categoria/inventário, ao contrário do NubeSDK que está em transição ativa), mas o Open Question #2 (onde a tag de tecido realmente mora) e #4 (valores canônicos) dependem de confirmação com o usuário/loja real e devem ser resolvidos antes ou durante a execução, não deixados para depois

---

**Nota de metodologia:** Nesta sessão de pesquisa, os MCPs de busca configurados no projeto (`brave_search`, `firecrawl`, `exa_search`, `tavily_search`) estavam todos desabilitados em `.planning/config.json` (mesmo estado da Fase 1), e nenhum MCP Context7/Ref/Jina estava disponível no ambiente de execução. A pesquisa foi conduzida via `WebFetch` (built-in) direto de páginas de documentação oficial da Nuvemshop (`tiendanube.github.io/api-documentation`) e do repositório oficial de `better-sqlite3` no GitHub, complementada por `WebSearch` (built-in) para padrões gerais de schema SQLite (Simon Willison, comunidade). O seam `gsd-tools query research-plan` roteou todos os itens para o provider `websearch` (nenhum cache hit, nenhum provider dedicado disponível); a execução real usou `WebFetch` sempre que uma URL de documentação oficial específica era conhecida, elevando a confiança de LOW (piso do seam para `websearch`) para MEDIUM nas afirmações verificadas contra a fonte primária, seguindo o mesmo padrão de proveniência já estabelecido em `01-RESEARCH.md`.
