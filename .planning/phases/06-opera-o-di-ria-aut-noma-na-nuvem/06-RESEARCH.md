# Phase 6: Operação Diária Autônoma na Nuvem - Research

**Researched:** 2026-07-17
**Domain:** Agendamento serverless (GitHub Actions cron) + persistência SQLite via commit-back git + cache client-side (sessionStorage TTL)
**Confidence:** MEDIUM (arquitetura reaproveita 100% código já existente e testado nas Fases 2-5; a única peça genuinamente nova — o mecanismo de idempotência diária — não tem precedente no código, então a recomendação abaixo é uma decisão de design, não um fato verificado)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Persistência do banco SQLite entre execuções na nuvem**
- **D-45:** `data/catalog.db` (SQLite, better-sqlite3) sobrevive entre execuções efêmeras do GitHub Actions via commit-back para o repositório git ao final de cada execução bem-sucedida (`git add -f data/catalog.db` — hoje `data/*.db` é gitignored apenas para desenvolvimento local; o workflow de CI precisa forçar o add especificamente para esse arquivo, sem alterar o gitignore de dev). Mantém a stack 100% SQLite/git já estabelecida desde a Fase 2, sem introduzir serviço de banco hospedado novo, com histórico auditável via commits.
- **D-46:** Se o commit-back falhar (ex: conflito de push), o job deve logar erro claramente e falhar de forma visível (não mascarar) — a mesma disciplina de "nunca esconder falha" já estabelecida em WRTE-04/05 (Fase 5).

**Escopo do job diário (nunca escreve sozinho)**
- **D-47:** O job agendado executa: `ingest-catalog.js` → `recommendation-engine.js` (via `recommend-cli.js` ou equivalente) → popula `approval_queue` (mesmo formato/tabela D-25 da Fase 4, mesmo `run_id` incremental já estabelecido). NÃO chama `write-executor.js`/`POST /review/:productId/write` automaticamente — a escrita real continua exigindo ação humana explícita via painel, consistente com o Out of Scope travado no PROJECT.md.
- **D-48:** Idempotência (SC#2 do ROADMAP): reexecutar o job duas vezes no mesmo dia não deve duplicar pedidos de aprovação pendentes. O padrão já existente de `UNIQUE(product_id, run_id)` + `ON CONFLICT DO UPDATE` em `approval_queue` (D-25/Fase 4) é reaproveitado — pesquisador/planejador devem confirmar se o `run_id` diário precisa de uma chave adicional (ex: data) para diferenciar execuções do mesmo dia vs. dias diferentes, ou se o mecanismo atual já cobre isso.

**Onde o painel de revisão roda**
- **D-49:** `review-server.js` continua rodando localmente (porta 127.0.0.1:3100, sem auth) nesta fase — não migra para hospedagem na nuvem. O operador sincroniza o banco atualizado (via `git pull`, dado D-45) e roda o painel localmente para aprovar/rejeitar/escrever como já faz desde a Fase 4. Migração do painel para a nuvem com autenticação fica para uma fase futura, fora deste escopo.

**Mecanismo de cache do Script (FRNT-02)**
- **D-50:** O requisito FRNT-02 cita `asyncSessionStorage` do NubeSDK como exemplo, mas o projeto ainda usa a Script API tradicional (D-11, Fase 1) — NubeSDK não está ativo. O cache usa `sessionStorage` nativo do navegador (chave por `productId`, valor com timestamp de gravação), com TTL de 24h verificado antes do `fetch` existente em `storefront-script/main.js:99` (`BACKEND_URL + '/api/recommendations/' + productId`). Quando o NubeSDK for aprovado, este mecanismo migra para `asyncSessionStorage` (mesmo débito já registrado em PROJECT.md para o Script como um todo).
- **D-51:** Confirmação de SC#4 (não busca a cada página vista) é feita observando o número de chamadas de rede do navegador durante navegação repetida na mesma sessão — não é um teste automatizado tradicional, é uma verificação comportamental (dev tools / network tab), a ser incluída na verificação da fase.

**Horário do agendamento**
- **D-52:** Cron diário roda uma vez por dia, horário fixo de baixo tráfego (ex: 3h BRT / equivalente UTC), sem necessidade de configuração pelo usuário nesta fase. Pesquisador/planejador confirmam a sintaxe cron exata do GitHub Actions (`schedule: cron:`) e documentam o horário escolhido.

### Claude's Discretion
- Nome/localização exata do workflow YAML do GitHub Actions (ex: `.github/workflows/daily-recompute.yml`) — a critério do planejador, seguindo convenção padrão do GitHub Actions.
- Mecanismo exato de detecção de mudança real de estoque/cor/tecido (SC#3) — o motor já recalcula do zero a cada execução (Fases 2/3), então "refletir automaticamente" pode já ser satisfeito pela natureza determinística do motor; planejador confirma se é necessário algum mecanismo de diff/notificação adicional ou se a recomputação diária já basta.
- Formato exato do log/output do job do GitHub Actions (para debugging futuro) — a critério do planejador.

### Deferred Ideas (OUT OF SCOPE)
- Migração do painel de revisão (`review-server.js`) para hospedagem na nuvem com autenticação — mencionada como possibilidade na Fase 4, decidida como fora de escopo nesta fase (D-49). Fica para uma fase futura caso o operador queira aprovar sem depender da própria máquina.
- Reconstrução do Script de storefront em NubeSDK (débito de longo prazo, D-11) — fora de escopo, aguarda aprovação do formulário de ativação do tema Morelia.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RULE-03 | Motor roda em lote diário agendado na nuvem (ex: GitHub Actions), sem depender de máquina pessoal ligada | Ver `## Architecture Patterns` (workflow YAML, cron, checkout+commit-back) e `## Common Pitfalls` (WAL checkpoint, node_modules nativo) |
| FRNT-02 | Script usa cache local (ex: `asyncSessionStorage`/`sessionStorage`, TTL) para evitar buscar dados a cada visualização de página | Ver `## Code Examples > Cache TTL no Script (D-50)` e `## Don't Hand-Roll` (dependency-injection de storage para testabilidade) |
| FEED-01 | Execução diária recalcula recomendações com base em critérios atualizados, gera novo ciclo de preview+aprovação, idempotente (não duplica pedidos pendentes) | Ver `## Architecture Patterns > Idempotência diária (D-48)` — achado central desta pesquisa: a fila de revisão atual é computada AO VIVO (nunca persistida como "pending"), o que muda a estratégia recomendada |
</phase_requirements>

## Summary

Esta fase não introduz nenhuma tecnologia nova de fundo — reaproveita 100% do pipeline já construído e testado (`ingest-catalog.js` → `recommendation-engine.js` → `catalog-store.js`/`review-queue.js`) e adiciona duas camadas finas ao redor dele: (1) um orquestrador de agendamento (GitHub Actions cron) que chama esse pipeline num processo Node efêmero e persiste o resultado via commit-back git, e (2) um cache TTL client-side no Script do storefront. A pesquisa nesta fase é mais "arqueologia de código existente" do que "avaliação de stack nova" — e essa arqueologia revelou um achado central que muda a estratégia de implementação: **a fila de revisão hoje (`GET /review`, `buildReviewQueue`) é computada 100% ao vivo comparando o baseline com uma nova chamada ao motor — ela nunca lê `approval_queue`, e nada no código atual insere linhas `status='pending'` nessa tabela.** Isso significa que a "duplicação de pedidos pendentes" que SC#2/FEED-01 pedem para evitar não é hoje um risco de linhas duplicadas na tabela (porque nada é inserido como pending) — o risco real é outro: cada nova ingestão cria um `run_id` novo (auto-increment), e como `getLatestSuccessfulRunId()` sempre aponta para o `run_id` mais recente, uma segunda execução no mesmo dia faria qualquer decisão de aprovação já tomada contra o `run_id` da primeira execução "sumir" (porque o lookup de decisão passa a consultar o `run_id` novo, que não tem decisão registrada) — o produto reapareceria como pendente, efetivamente desfazendo uma aprovação já dada. A recomendação desta pesquisa é um "guard" de dia-calendário na camada de orquestração (novo, ~10 linhas) que impede a criação de um segundo `run_id` bem-sucedido no mesmo dia — a solução mais simples possível, sem mudança de schema, que torna toda a cadeia downstream trivialmente idempotente por construção.

Um segundo achado crítico é uma pegadinha real do modo WAL do SQLite: o processo do job na CI é efêmero (`process.exit(0)` ao final) e nunca fecha a conexão do banco explicitamente — se o WAL não for feito checkpoint antes do `git add -f data/catalog.db`, o arquivo commitado pode ficar sem as escritas mais recentes (que ficam só no `.db-wal`, que é gitignored e nunca commitado). Isso é silencioso — não lança erro, só perde dado. A pesquisa recomenda um checkpoint explícito (`PRAGMA wal_checkpoint(TRUNCATE)`) antes de qualquer commit-back.

**Primary recommendation:** Reaproveitar o pipeline existente sem alterá-lo; adicionar (a) um script orquestrador novo (`scripts/run-daily-job.js`) com guard de "já rodou hoje" antes de chamar `runIngestion`, (b) checkpoint+close explícito do SQLite antes do commit-back, (c) um workflow GitHub Actions mínimo (`actions/checkout` → `actions/setup-node` Node 20 LTS → `npm ci` → rodar o orquestrador → `git add -f data/catalog.db` → commit com `[skip ci]` → push), e (d) um cache TTL de 24h em `sessionStorage` no Script, implementado como funções puras testáveis por injeção de dependência (sem jsdom).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Agendamento diário sem máquina pessoal (RULE-03) | CI/CD (GitHub Actions) | — | GitHub Actions é o único mecanismo de cron gratuito disponível no stack atual (Vercel não tem cron nativo gratuito equivalente para este caso, confirmado em 06-CONTEXT.md `<code_context>`) |
| Recálculo do motor + ingestão (RULE-03) | Backend (Node, dentro do runner CI) | — | Mesmo código Node já usado localmente (`ingest-catalog.js`, `recommendation-engine.js`), sem porte para outra linguagem/plataforma |
| Persistência do catálogo entre execuções (D-45) | Database/Storage (SQLite via git) | CI/CD (commit-back) | SQLite não é um serviço hospedado — a "camada de storage" nesta arquitetura É o próprio git, versionado via commits do CI |
| Idempotência diária / fila de aprovação (FEED-01/SC#2) | Backend (Node, `catalog-store.js`) | CI/CD (guard antes de rodar) | Regra de negócio pura (não duplicar por dia) pertence à camada de dados/orquestração, nunca à camada HTTP do painel |
| Painel de aprovação humana (D-49) | Frontend Server local (`review-server.js`) | — | Continua rodando na máquina do operador nesta fase, fora do escopo de nuvem |
| Cache de leitura no storefront (FRNT-02) | Browser/Client (`sessionStorage`) | — | TTL e armazenamento vivem inteiramente no navegador do visitante, sem envolver o backend |
| Endpoint de leitura pública (PLAT-05, já existente) | API/Backend (Vercel serverless) | — | Não modificado nesta fase — continua chamando a API da Nuvemshop ao vivo por requisição; é exatamente por isso que o cache client-side (FRNT-02) importa |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | 12.11.1 (já no `package.json`, `npm view` confirma) [VERIFIED: npm registry] | Persistência do catálogo/fila | Já em uso desde a Fase 2 — nenhuma mudança nesta fase, exceto o novo passo de checkpoint explícito |
| actions/checkout | v5 (majors atuais confirmados via busca web, ver Sources) [CITED: WebSearch] | Clonar o repo no runner antes de rodar o job | Action oficial do GitHub, único mecanismo padrão de checkout em workflows |
| actions/setup-node | v6, Node 20.x LTS recomendado | Instalar Node compatível com os binários prebuilt do better-sqlite3 (que cobre 20.x/22.x/23.x/24.x/25.x/26.x) [VERIFIED: npm registry — `npm view better-sqlite3 engines`] | Action oficial, evita compilação nativa via node-gyp no runner |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Nenhuma nova dependência npm necessária | — | O job diário e o cache client-side usam só APIs nativas (`git` CLI, `fetch`, `sessionStorage`, `better-sqlite3` já existente) | — |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `git add`/`commit`/`push` manuais no workflow | `stefanzweifel/git-auto-commit-action` (Action de terceiros popular, ~ampla adoção) | A Action de terceiros simplifica a sintaxe, mas adiciona uma dependência de supply-chain de CI com permissão de escrita no repo — dado que o projeto já evita dependências novas quando comandos nativos resolvem (postura observada em todas as fases anteriores), a recomendação é usar `git` CLI puro nos steps do workflow |
| Guard de "já rodou hoje" na camada de orquestração (recomendado) | Chave composta `(product_id, run_date)` em `approval_queue` (mudança de schema) | A chave composta resolveria o mesmo problema mas exige migração de schema E lógica de merge de decisões entre `run_id`s do mesmo dia — mais invasivo, sem benefício adicional para o MVP (um guard de orquestração é suficiente e mais simples) |
| `sessionStorage` nativo (D-50, já locked) | IndexedDB / cache HTTP (`Cache-Control` headers) | `sessionStorage` já é a decisão travada (D-50) — citado aqui só para registrar que IndexedDB seria overkill para um objeto JSON pequeno por produto, e cache HTTP não é controlável pelo Script (a resposta vem de um endpoint que o Script não configura headers de cache-control do lado do navegador para `fetch` simples sem revalidação) |

**Installation:**
```bash
# Nenhum novo pacote a instalar nesta fase.
# CI: npm ci (dentro de app-partners-recomendados/), reaproveitando package-lock.json existente.
```

**Version verification:** `better-sqlite3` confirmado via `npm view better-sqlite3 version` → `12.11.1`, publicado em 2026-06-15, e `npm view better-sqlite3 engines` → binários prebuilt cobrem Node `20.x || 22.x || 23.x || 24.x || 25.x || 26.x`. `actions/checkout`/`actions/setup-node` não são pacotes npm (são GitHub Actions do marketplace) — versões majors atuais (`v5`/`v6`) confirmadas via busca web (múltiplas fontes, incluindo páginas de release), não via Context7/doc oficial diretamente nesta sessão — tratar como MEDIUM confidence e confirmar a tag exata (`@v5` vs. `@v6`) no momento da implementação.

## Package Legitimacy Audit

Nenhum pacote npm novo é instalado nesta fase. Auditoria abaixo cobre a única dependência nativa cujo comportamento em CI é crítico para RULE-03 (já em uso desde a Fase 2, revalidada aqui por ser o ponto de falha mais provável de um ambiente CI novo):

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| better-sqlite3 | npm | anos (publicação atual 2026-06-15, projeto maduro) | 7.67M/semana | github.com/WiseLibs/better-sqlite3 | OK | Já aprovado (Fase 2), revalidado aqui |

**Packages removed due to [SLOP] verdict:** nenhum
**Packages flagged as suspicious [SUS]:** nenhum

## Architecture Patterns

### System Architecture Diagram

```
[GitHub Actions scheduler]
  cron dispara (D-52) ──► workflow "daily-recompute"
        │
        ▼
  actions/checkout (clona repo, INCLUINDO data/catalog.db do último commit-back)
        │
        ▼
  actions/setup-node (Node 20 LTS) + npm ci (dentro de app-partners-recomendados/)
        │
        ▼
  scripts/run-daily-job.js (NOVO)
        │
        ├─► guard: getSuccessfulRunForDate(hoje)?
        │      │
        │      ├─ SIM (já rodou hoje) ──► log + exit 0 (SC#2 satisfeito por construção)
        │      │
        │      └─ NÃO ──► continua:
        │
        ├─► runIngestion() [reaproveita ingest-catalog.js sem mudança]
        │      → cria novo ingestion_runs.id (run_id), grava snapshots/baseline
        │
        ├─► buildReviewQueue(catalog, baseline) [reaproveita review-queue.js sem mudança]
        │      → calcula quais produtos têm diff real (D-23)
        │
        ├─► seedPendingApprovalQueue({ runId, queueEntries }) [NOVO]
        │      → INSERT ... ON CONFLICT(product_id, run_id) DO NOTHING
        │        (nunca sobrescreve uma decisão approved/rejected já existente)
        │
        ├─► checkpointAndCloseDb() [NOVO] — PRAGMA wal_checkpoint(TRUNCATE) + db.close()
        │      → garante que data/catalog.db (arquivo principal) tem TODAS as escritas
        │        antes do commit-back (evita perda silenciosa via WAL não commitado)
        │
        └─► falha em qualquer etapa acima ──► notifyWriteFailure()-style webhook (D-46)
               + processo sai com exit code != 0 (falha visível, nunca mascarada)
        │
        ▼ (sucesso)
  git add -f data/catalog.db && git commit -m "chore: daily recompute run_id=N [skip ci]"
  && git push
        │
        ▼ (falha de push, ex: conflito) ──► workflow falha visivelmente (D-46), notificação dispara

─────────────────────────────────────────────────────────────────

[Operador humano, máquina local — D-49, inalterado desde Fase 4/5]
  git pull (traz data/catalog.db atualizado do commit-back acima)
        │
        ▼
  node src/review-server.js (127.0.0.1:3100)
        │
        ▼
  GET /review ──► buildReviewQueue() [AO VIVO, nunca lê approval_queue — achado desta pesquisa]
        │
        ▼
  aprova/rejeita/escreve (POST /review/:productId/approve|reject|write) — fluxo Fase 4/5, inalterado

─────────────────────────────────────────────────────────────────

[Visitante da loja, navegador]
  acessa página de produto ──► storefront-script/main.js
        │
        ├─► sessionStorage tem entrada para este productId com < 24h (D-50)?
        │      │
        │      ├─ SIM ──► renderiza direto, ZERO fetch (FRNT-02/SC#4)
        │      │
        │      └─ NÃO ──► fetch(BACKEND_URL + '/api/recommendations/' + productId)
        │             → Vercel serverless (api/recommendations/[productId].js, inalterado)
        │             → chama Nuvemshop API AO VIVO (getMetafields + getProduct)
        │             → grava resultado em sessionStorage com timestamp
        │             → renderiza bloco
```

### Recommended Project Structure
```
app-partners-recomendados/
├── scripts/
│   ├── run-ingestion.js         # já existe — chamado internamente por run-daily-job.js
│   └── run-daily-job.js         # NOVO — orquestrador do job agendado (guard + seed + checkpoint)
├── src/
│   ├── db/catalog-store.js      # + getSuccessfulRunForDate, seedPendingApprovalQueue, checkpointAndCloseDb
│   └── review/review-queue.js   # inalterado — reaproveitado pelo orquestrador
├── .github/
│   └── workflows/
│       └── daily-recompute.yml  # NOVO — workflow do job agendado
storefront-script/
└── main.js                      # + cache TTL sessionStorage (funções puras injetáveis)
```

### Pattern 1: Guard de idempotência diária (D-48, achado central desta pesquisa)
**What:** Antes de rodar uma nova ingestão, consulta se já existe um `ingestion_runs` com `status='success'` no dia corrente; se sim, sai sem fazer nada.
**When to use:** Sempre no início do orquestrador do job agendado — nunca dentro de `runIngestion()` (que deve continuar puro/reutilizável para uso manual/teste, sem guard embutido).
**Example:**
```js
// src/db/catalog-store.js — novo prepared statement + função exportada
const selectSuccessfulRunForTodayStmt = db.prepare(
  `SELECT id FROM ingestion_runs WHERE status = 'success' AND date(started_at) = date('now') ORDER BY id DESC LIMIT 1`
);

/**
 * Retorna o run_id de uma execução bem-sucedida já registrada HOJE (UTC, mesmo
 * fuso de started_at que é gravado via new Date().toISOString()), ou null se
 * nenhuma existir ainda. Base do guard de idempotência diária (D-48/SC#2) —
 * usado SOMENTE pelo orquestrador do job agendado, nunca por runIngestion()
 * em si (que continua podendo ser chamado manualmente/em teste sem guard).
 * @returns {number|null}
 */
export function getSuccessfulRunForToday() {
  const row = selectSuccessfulRunForTodayStmt.get();
  return row ? row.id : null;
}
```
```js
// scripts/run-daily-job.js (NOVO)
import { getSuccessfulRunForToday } from '../src/db/catalog-store.js';
import { runIngestion } from '../src/ingestion/ingest-catalog.js';
// ... seedPendingApprovalQueue, checkpointAndCloseDb (Pattern 2/3)

async function main() {
  const existingRunId = getSuccessfulRunForToday();
  if (existingRunId != null) {
    console.log(`Já existe execução bem-sucedida hoje (run_id=${existingRunId}) — pulando (SC#2).`);
    process.exit(0);
  }
  // ... segue fluxo normal: runIngestion -> buildReviewQueue -> seedPendingApprovalQueue -> checkpointAndCloseDb
}
```
**Por que este design, e não uma chave `(product_id, data)` em `approval_queue`:** a fila de revisão (`GET /review`) já é computada ao vivo a partir do `run_id` MAIS RECENTE (`getLatestSuccessfulRunId`) — nunca existe hoje um caminho de leitura que precise diferenciar "dois runs do mesmo dia" de "runs de dias diferentes". Ao impedir por construção que exista mais de um `run_id` bem-sucedido por dia, o problema de "decisão de aprovação órfã contra um `run_id` antigo" (ver `## Common Pitfalls`) desaparece inteiramente, sem tocar `review-server.js`/`approval-gate.js`/schema.

### Pattern 2: Persistência da fila de aprovação como registro auditável (D-47)
**What:** Depois de calcular `buildReviewQueue()`, grava uma linha `status='pending'` por produto com diff em `approval_queue`, usando `ON CONFLICT DO NOTHING` (nunca `DO UPDATE`) para nunca sobrescrever uma decisão humana já tomada.
**When to use:** Uma vez por execução bem-sucedida do job, depois do guard do Pattern 1 (logo, no máximo uma vez por dia).
**Example:**
```js
// src/db/catalog-store.js — nova função, mesma disciplina de upsertApprovalDecision
const seedPendingApprovalQueueStmt = db.prepare(
  `INSERT INTO approval_queue (product_id, run_id, status, approved_recommendation_ids, decided_at, created_at)
   VALUES (@productId, @runId, 'pending', NULL, NULL, @createdAt)
   ON CONFLICT(product_id, run_id) DO NOTHING`
);

/**
 * Registra em approval_queue, como histórico auditável, quais produtos entraram
 * na fila de revisão nesta execução (D-47). Nunca sobrescreve uma linha existente
 * (DO NOTHING, não DO UPDATE) — diferente de upsertApprovalDecision (Fase 4), que
 * É chamado para registrar uma decisão humana e portanto deve sobrescrever.
 * GET /review continua funcionando exatamente como hoje (buildReviewQueue ao vivo) —
 * esta função não é lida por nenhuma rota nesta fase, é só o registro de auditoria
 * que D-47 pede.
 * @param {{ runId: number, queueEntries: Array<{ productId: string }> }} params
 */
export function seedPendingApprovalQueue({ runId, queueEntries }) {
  const createdAt = new Date().toISOString();
  const seed = db.transaction(() => {
    for (const entry of queueEntries) {
      seedPendingApprovalQueueStmt.run({ productId: String(entry.productId), runId, createdAt });
    }
  });
  seed();
}
```

### Pattern 3: Checkpoint explícito do WAL antes do commit-back (D-45/D-46)
**What:** Força o SQLite a mesclar o conteúdo do `.db-wal` no arquivo principal `.db` antes de `git add -f`, e fecha a conexão.
**When to use:** Sempre, como última etapa Node antes de qualquer comando `git` no workflow.
**Example:**
```js
// src/db/catalog-store.js
/**
 * Força merge do WAL no arquivo principal (`PRAGMA wal_checkpoint(TRUNCATE)`) e
 * fecha a conexão. OBRIGATÓRIO antes de qualquer `git add -f data/catalog.db` em
 * CI (D-45) — sem isso, escritas recentes podem existir só em data/catalog.db-wal
 * (gitignored, nunca commitado), resultando em perda silenciosa de dado no
 * próximo checkout (Pitfall 1 desta pesquisa). Uso exclusivo do orquestrador do
 * job agendado — nunca chamado em uso normal local nem em testes (mesmo padrão
 * de isolamento de closeDbForTests(), mas com semântica de produção).
 * @returns {void}
 */
export function checkpointAndCloseDb() {
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.close();
}
```

### Pattern 4: Cache TTL client-side testável (FRNT-02, D-50)
**What:** Funções puras de get/set com TTL que recebem o objeto de storage como parâmetro, em vez de acessar `sessionStorage` global diretamente — mesmo padrão de injeção de dependência já usado em `approval-gate.js` (recebe `decision` como parâmetro, nunca lê o banco sozinho).
**When to use:** Sempre que a lógica precisa ser testável sem subir um ambiente de navegador (jsdom) — ver `## Don't Hand-Roll`.
**Example:**
```js
// storefront-script/main.js — adições dentro da IIFE existente
var CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h (D-50)
var CACHE_KEY_PREFIX = 'recomendados_cache_';

// Funções puras — recebem `storage` como parâmetro (nunca lêem window.sessionStorage
// diretamente), testáveis com um fake simples { getItem, setItem } em vitest sem jsdom.
function getCachedRecommendation(storage, productId, now) {
  try {
    var raw = storage.getItem(CACHE_KEY_PREFIX + productId);
    if (!raw) return null;
    var parsed = JSON.parse(raw);
    if (now - parsed.cachedAt > CACHE_TTL_MS) return null;
    return parsed.data;
  } catch (e) {
    return null; // JSON inválido ou storage indisponível — trata como cache miss
  }
}

function setCachedRecommendation(storage, productId, data, now) {
  try {
    storage.setItem(CACHE_KEY_PREFIX + productId, JSON.stringify({ data: data, cachedAt: now }));
  } catch (e) {
    // Safari modo privado (sessionStorage.setItem lança) ou quota excedida —
    // degrada graciosamente, nunca quebra a renderização (mesmo padrão de
    // fetchRecommendation().catch() já existente no arquivo).
  }
}

// No init(): usar window.sessionStorage como o `storage` real, Date.now() como `now`.
function init() {
  var productId = getCurrentProductId();
  if (!productId) return;

  var cached = getCachedRecommendation(window.sessionStorage, productId, Date.now());
  if (cached) {
    if (cached.recommendedProductId && cached.recommendedProduct) {
      renderRecommendationBlock(cached.recommendedProduct);
    }
    return; // SC#4: zero fetch em cache hit
  }

  fetchRecommendation(productId)
    .then(function (data) {
      setCachedRecommendation(window.sessionStorage, productId, data, Date.now());
      if (data && data.recommendedProductId && data.recommendedProduct) {
        renderRecommendationBlock(data.recommendedProduct);
      }
    })
    .catch(function (err) {
      console.warn('[recomendados-alpha] Falha ao buscar recomendacao:', err);
    });
}
```

### Anti-Patterns to Avoid
- **Colocar o guard de idempotência dentro de `runIngestion()`:** quebraria o uso já testado da função em `recommend-cli.js`/testes existentes, que esperam poder chamar `runIngestion()` livremente sem side-effect de "pular". O guard pertence só ao orquestrador novo (`run-daily-job.js`).
- **Usar `DO UPDATE` em `seedPendingApprovalQueue`:** sobrescreveria silenciosamente uma decisão humana já registrada (approved/rejected) de volta para `pending` se o job rodasse de novo no mesmo `run_id` — deve ser sempre `DO NOTHING`.
- **Introduzir jsdom só para testar o cache do Script:** desnecessário — a injeção de dependência (Pattern 4) já torna a lógica testável com um objeto fake simples, consistente com o resto do projeto (zero dependências de teste novas desde a Fase 1).
- **Confiar que `process.exit(0)` fecha a conexão SQLite corretamente:** não fecha — `better-sqlite3` não registra automaticamente um handler de saída; o checkpoint (Pattern 3) precisa ser uma chamada explícita antes da saída do processo.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Cron/agendamento na nuvem | Um servidor próprio com `node-cron`/`setInterval` rodando 24/7 | GitHub Actions `schedule: cron:` | Contradiria o próprio objetivo da fase ("sem depender de máquina pessoal ligada") — um servidor `node-cron` ainda precisa de uma máquina ligada 24/7 em algum lugar |
| Diff/curadoria de recomendação | Nova lógica de comparação dentro do job diário | `buildReviewQueue`/`computeDiff`/`recomputeAfterRemoval` já existentes (Fase 4) | Já testado, já é a fonte única de verdade da lógica de "o que mudou" — duplicar criaria dois caminhos de diff divergentes |
| Testar cache de navegador | Instalar jsdom + simular `window`/`document` completo | Funções puras com storage injetado (Pattern 4) | Projeto inteiro evita I/O em módulos de domínio (motor, diff, approval-gate) — o mesmo princípio se aplica ao Script |

**Key insight:** Todo "Don't Hand-Roll" desta fase é sobre reaproveitar código já escrito nas Fases 2-5, não sobre uma biblioteca externa — o risco real nesta fase é reimplementar por engano algo que já existe (ex: uma segunda função de diff dentro do orquestrador do job), não escolher a biblioteca errada.

## Common Pitfalls

### Pitfall 1: Perda silenciosa de dado por WAL não commitado (CRÍTICO, específico desta fase)
**What goes wrong:** O processo do job na CI roda em modo WAL (`journal_mode = WAL`, já configurado em `catalog-store.js`), termina com `process.exit(0)`/`process.exit(1)` sem fechar a conexão explicitamente. Se `git add -f data/catalog.db` rodar antes de um checkpoint, o arquivo commitado pode não conter as escritas mais recentes (que ficaram só em `data/catalog.db-wal`, arquivo gitignored para dev e nunca commitado por D-45).
**Why it happens:** SQLite em modo WAL só mescla (checkpoint) o `.db-wal` no arquivo principal automaticamente quando o WAL atinge ~1000 páginas (~4MB) OU quando a ÚLTIMA conexão aberta fecha de forma limpa. Um catálogo de ~600 produtos gera bem menos que 4MB de WAL por execução, então o checkpoint automático por tamanho provavelmente nunca dispara — e `process.exit()` não fecha a conexão de forma limpa (não dispara handlers de cleanup do Node).
**How to avoid:** Chamar `checkpointAndCloseDb()` (Pattern 3, `PRAGMA wal_checkpoint(TRUNCATE)` + `db.close()`) como última operação Node antes de qualquer comando `git` no workflow.
**Warning signs:** `data/catalog.db-wal` continua com tamanho > 0 bytes logo após o job terminar (verificável manualmente); ou um `git pull` local seguido de leitura mostra dados de uma execução anterior à que rodou por último na CI.

### Pitfall 2: Aprovação humana "desaparece" numa re-execução no mesmo dia
**What goes wrong:** Sem o guard do Pattern 1, uma segunda execução no mesmo dia cria um `run_id` novo; `getLatestSuccessfulRunId()` passa a apontar para ele; `getApprovalDecision({ productId, runId: novoRunId })` não encontra a decisão que foi registrada contra o `run_id` anterior (mesmo dia) — o produto reaparece como pendente no painel, mesmo tendo sido aprovado horas antes.
**Why it happens:** `approval_queue` é chaveada por `(product_id, run_id)`, e `run_id` é um auto-increment sem relação com data — nada no schema atual associa "dois runs do mesmo dia" entre si.
**How to avoid:** Pattern 1 (guard de dia-calendário) impede que um segundo `run_id` bem-sucedido seja criado no mesmo dia, eliminando a causa raiz.
**Warning signs:** Rodar o job manualmente duas vezes no mesmo dia (teste de SC#2) e ver um produto já aprovado voltar a aparecer em `GET /review`.

### Pitfall 3: node_modules commitado ou reaproveitado de outra plataforma
**What goes wrong:** `better-sqlite3` é um módulo nativo (binário compilado). Se o workflow reaproveitar um `node_modules` gerado numa máquina Windows (ambiente de dev atual) em vez de rodar `npm ci` fresco no runner Linux, o binário não vai carregar.
**Why it happens:** Binários prebuilt são específicos por plataforma/arquitetura (linux-x64 vs win32-x64) — `node_modules` já está no `.gitignore` do projeto (confirmado), então este pitfall só ocorreria se alguém alterasse essa configuração ou usasse cache de Actions mal configurado entre OSes.
**How to avoid:** Sempre `npm ci` fresco a cada execução do workflow (não usar `actions/cache` para `node_modules` entre um runner Windows e um Linux — se usar cache, chavear por `runner.os` + hash do lockfile, prática padrão do `actions/setup-node` com `cache: 'npm'`).
**Warning signs:** Erro `invalid ELF header` ou `not a valid Win32 application` ao rodar o job na CI.

### Pitfall 4: Loop infinito de workflow disparado pelo próprio commit-back
**What goes wrong:** Se o workflow também escutar `on: push` (ex: para rodar testes em todo push), o commit-back do job agendado dispararia esse segundo workflow, que poderia (dependendo de config futura) disparar outro commit, etc.
**Why it happens:** GitHub Actions dispara `on: push` para qualquer push, incluindo os feitos pelo próprio `GITHUB_TOKEN`/Actions bot, a menos que a mensagem de commit contenha `[skip ci]`/`[skip actions]` ou o workflow de push explicitamente ignore commits do bot.
**How to avoid:** Incluir `[skip ci]` na mensagem de commit do job agendado (`git commit -m "chore(daily): recompute run_id=N [skip ci]"`), e/ou usar `permissions: contents: write` mínimo (não usar um PAT com escopo mais amplo do que o necessário).
**Warning signs:** Workflows disparando repetidamente sem intervenção manual, contagem de execuções de Actions subindo sem novos cron ticks.

### Pitfall 5: `getLatestSnapshotProducts()` sem produtos elegíveis não é bug
**What goes wrong:** Confundir "a fila de revisão está vazia hoje" com "o job falhou".
**Why it happens:** Já documentado desde a Fase 3 (`recommend-cli.js`) — o motor retorna `[]` para produtos sem `fabric_tag_canonical` mapeado; isso é esperado até a planilha de tecidos ser importada, e continua sendo esperado na operação diária.
**How to avoid:** Não tratar `queueEntries.length === 0` como condição de falha no job — só falhas de exceção/rede/DB devem gerar exit code != 0.
**Warning signs:** Alertas de "falha" disparando todo dia mesmo com a ingestão funcionando corretamente.

## Code Examples

### Workflow GitHub Actions completo (RULE-03, D-45, D-46, D-52)
```yaml
# .github/workflows/daily-recompute.yml
name: Daily recompute (RULE-03)

on:
  schedule:
    # 06:00 UTC = 03:00 BRT (Brasil não observa horário de verão desde 2019) — D-52.
    # Confirmar no momento da implementação se o campo `timezone:` (adicionado
    # recentemente ao schedule trigger, ver Sources) já está disponível — se sim,
    # preferir `timezone: 'America/Sao_Paulo'` + `cron: '0 3 * * *'` em vez do
    # cálculo manual de UTC abaixo.
    - cron: '0 6 * * *'
  workflow_dispatch: {} # permite disparo manual para teste (SC#2: rodar 2x no mesmo dia)

permissions:
  contents: write # mínimo necessário para o commit-back (D-45)

jobs:
  recompute:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: app-partners-recomendados
    steps:
      - uses: actions/checkout@v5

      - uses: actions/setup-node@v6
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: app-partners-recomendados/package-lock.json

      - run: npm ci

      - name: Rodar job diário (ingestão + recompute + fila de aprovação)
        env:
          NUVEMSHOP_ACCESS_TOKEN: ${{ secrets.NUVEMSHOP_ACCESS_TOKEN }}
          NUVEMSHOP_STORE_ID: ${{ secrets.NUVEMSHOP_STORE_ID }}
          WRITE_FAILURE_WEBHOOK_URL: ${{ secrets.WRITE_FAILURE_WEBHOOK_URL }}
        run: node scripts/run-daily-job.js

      - name: Commit-back do catálogo atualizado (D-45)
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add -f data/catalog.db
          if git diff --cached --quiet; then
            echo "Nenhuma mudança em data/catalog.db (provavelmente guard de mesmo dia ativou) — nada a commitar."
            exit 0
          fi
          git commit -m "chore(daily): recompute automático [skip ci]"
          git push
```

### Uso de secrets do GitHub (env vars já existentes em `nuvemshop-auth.js`/`notify-failure.js`)
```
Secrets necessários no repositório GitHub (Settings > Secrets and variables > Actions):
  NUVEMSHOP_ACCESS_TOKEN       — mesmo valor já usado em .env local (getAccessToken())
  NUVEMSHOP_STORE_ID           — mesmo valor já usado em .env local
  WRITE_FAILURE_WEBHOOK_URL    — opcional (notify-failure.js já degrada graciosamente se ausente)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Rodar `run-ingestion.js` manualmente numa máquina local (Fases 2-5) | Rodar via GitHub Actions `schedule` num runner efêmero | Esta fase (Fase 6) | RULE-03 deixa de depender de qualquer máquina pessoal ligada |
| `data/catalog.db` só local, nunca versionado (gitignored) | `data/catalog.db` commitado de volta ao repo ao final de cada execução CI bem-sucedida (D-45) | Esta fase | O `.gitignore` de dev continua intacto — só o CI força o add deste arquivo específico |

**Deprecated/outdated:** nenhum — esta fase é aditiva, não substitui nenhum mecanismo anterior (o fluxo local continua funcionando identicamente para desenvolvimento/depuração).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `actions/checkout@v5` e `actions/setup-node@v6` são os majors atuais recomendados | Standard Stack, Code Examples | Se desatualizado, o workflow ainda funciona (GitHub mantém versões majors antigas ativas por um bom tempo), mas o planejador deve confirmar a tag exata no momento de escrever o YAML real, não confiar cegamente nesta pesquisa |
| A2 | 06:00 UTC corresponde a 03:00 BRT o ano todo (Brasil sem horário de verão desde 2019) | Code Examples (cron) | Se o Brasil reintroduzir horário de verão no futuro, o horário efetivo mudaria; risco baixo e não bloqueante para o MVP |
| A3 | O campo `timezone:` no `schedule` trigger do GitHub Actions já está disponível na conta/plano usado neste projeto | Code Examples (comentário no YAML) | Se ausente, o workflow já tem o fallback funcional (cron em UTC), então o risco é só "recurso mais conveniente não usado", não uma falha |
| A4 | Nenhuma proteção de branch em `master` bloqueia push direto do `GITHUB_TOKEN` do workflow (o repo ainda não tem remote GitHub configurado — ver `## Environment Availability`) | Common Pitfalls (Pitfall 4), Environment Availability | Se `master` tiver branch protection exigindo PR/review, o commit-back direto falharia — precisa ser confirmado quando o repo for criado/conectado ao GitHub |

**Se esta tabela estivesse vazia:** não está — as 4 entradas acima precisam de confirmação do usuário/planejador antes ou durante a implementação, principalmente A4 (ver Environment Availability abaixo, é o achado mais bloqueante desta pesquisa).

## Open Questions

1. **O repositório ainda não está conectado a um remote GitHub (`git remote -v` retorna vazio)**
   - What we know: o projeto é um repo git local (`master` como única branch), sem nenhum `origin` configurado — confirmado via `git remote -v`/`git config --get remote.origin.url` (exit code 1, nenhuma URL).
   - What's unclear: se o usuário já tem um repositório GitHub criado para este projeto (privado ou público) que só não foi conectado localmente, ou se precisa criar um novo do zero.
   - Recommendation: este é o PRIMEIRO passo prático da fase (antes de qualquer workflow YAML fazer sentido) — o planejador deve incluir uma task inicial (provavelmente `checkpoint:human-verify`, já que envolve decisão de visibilidade do repo/conta GitHub do usuário) para criar/conectar o repositório remoto e configurar os 2-3 secrets necessários antes que o restante da fase possa ser verificado de ponta a ponta.

2. **Mecanismo de detecção de mudança real de estoque/cor/tecido (SC#3) — precisa de algo além da recomputação diária?**
   - What we know: o motor (`recommendForProduct`) já é 100% determinístico e sem estado (RULE-02) — cada execução recalcula do zero a partir do snapshot mais recente (`getLatestSnapshotProducts()`), então qualquer mudança real de estoque/cor/tecido já ingerida automaticamente produz um resultado diferente na próxima chamada, sem nenhum mecanismo adicional.
   - What's unclear: nada tecnicamente — a arquitetura já satisfaz SC#3 por construção. A única coisa "nova" desta fase relacionada a SC#3 é garantir que a ingestão diária realmente rode (RULE-03) e que `buildReviewQueue` seja chamada com o snapshot novo (Pattern 2).
   - Recommendation: não introduzir nenhum mecanismo de diff/notificação adicional — SC#3 é satisfeito pela combinação de RULE-02 (determinismo) + RULE-03 (execução diária) + a fila já existente (`buildReviewQueue`). Confirmar isso explicitamente no plano evita trabalho desnecessário.

3. **Vercel vai re-deployar a cada commit-back do CI?**
   - What we know: o projeto Vercel (`app-partners-recomendados`) provavelmente está conectado ao mesmo repositório git para deploy automático da função serverless `api/recommendations/[productId].js`.
   - What's unclear: se um commit que só toca `data/catalog.db` (sem tocar nenhum arquivo servido pela função serverless) dispara um redeploy desnecessário na Vercel, e se isso tem algum custo/limite relevante no plano atual.
   - Recommendation: baixo risco/não bloqueante para o MVP — se incomodar, considerar `vercel.json` com `ignoreCommand` filtrando por path, ou aceitar o redeploy extra como custo operacional aceitável (a função não muda de comportamento).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Repositório conectado a um remote GitHub | RULE-03 (GitHub Actions só existe em repos hospedados no GitHub) | ✗ | — | Nenhum — bloqueante. Precisa ser criado/conectado antes que qualquer parte desta fase possa ser executada de ponta a ponta na nuvem real (ver Open Question 1) |
| Node.js (ambiente local, para desenvolver/testar antes do CI) | Desenvolvimento dos novos scripts | ✓ | v24.17.0 | — |
| `gh` CLI (GitHub CLI) | Conveniência para criar repo/secrets via linha de comando | ✗ | — | Criar repositório e secrets manualmente via github.com (interface web) |
| `npm test` (vitest) local | Validar novas funções (`getSuccessfulRunForToday`, `seedPendingApprovalQueue`, `checkpointAndCloseDb`, cache do Script) antes do commit | ✓ | vitest 4.1.10, 144/144 testes verdes atualmente (15 arquivos) | — |
| Secrets `NUVEMSHOP_ACCESS_TOKEN`/`NUVEMSHOP_STORE_ID`/`WRITE_FAILURE_WEBHOOK_URL` no GitHub | Job agendado autenticar contra a API da Nuvemshop | ✗ (repo ainda não existe no GitHub) | — | Nenhum — precisam ser cadastrados manualmente em Settings > Secrets assim que o repo for criado |

**Missing dependencies with no fallback:**
- Repositório conectado a um remote GitHub — sem isso, RULE-03 não pode ser demonstrado/verificado na nuvem real; é o item mais bloqueante desta fase e deve ser a primeira task do plano.
- Secrets do GitHub Actions (dependem do item acima existir primeiro).

**Missing dependencies with fallback:**
- `gh` CLI — pode ser feito manualmente pela interface web do GitHub sem perda de funcionalidade.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.10 (já configurado, `npm test` → `vitest run`) |
| Config file | nenhum arquivo `vitest.config.*` dedicado — usa defaults do vitest (ambiente `node`), consistente com os 15 arquivos de teste já existentes |
| Quick run command | `npm test -- <arquivo>.test.js` (dentro de `app-partners-recomendados/`) |
| Full suite command | `npm test` (144 testes, ~4-8s, confirmado rodando localmente nesta pesquisa) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RULE-03 | `getSuccessfulRunForToday()` retorna null antes de qualquer run bem-sucedido hoje, e o run_id depois de um run bem-sucedido | unit | `npx vitest run src/db/catalog-store.test.js` | ❌ Wave 0 (adicionar aos testes existentes de `catalog-store.test.js`) |
| FEED-01/SC#2 | Rodar `run-daily-job.js` (ou sua lógica de guard) duas vezes seguidas no mesmo dia simulado não cria um segundo `run_id` bem-sucedido nem duplica linhas em `approval_queue` | integration | `npx vitest run scripts/run-daily-job.test.js` (subprocesso node, mesmo padrão já usado para testar `recommend-cli.js`/CLIs sem argumento na Fase 5) | ❌ Wave 0 |
| FEED-01 | `seedPendingApprovalQueue` nunca sobrescreve uma linha `approved`/`rejected` já existente para o mesmo `(product_id, run_id)` | unit | `npx vitest run src/db/catalog-store.test.js` | ❌ Wave 0 |
| RULE-03/D-45 | `checkpointAndCloseDb()` não lança e o arquivo `.db` reflete escritas pendentes do WAL (verificável comparando tamanho/conteúdo antes/depois) | unit | `npx vitest run src/db/catalog-store.test.js` | ❌ Wave 0 |
| FRNT-02 | `getCachedRecommendation`/`setCachedRecommendation` respeitam TTL de 24h (hit dentro do TTL, miss fora do TTL, miss em storage vazio, miss em JSON corrompido, degrada graciosamente quando `storage.setItem` lança) | unit | `npx vitest run storefront-script/main.test.js` (storage fake `{getItem, setItem}` — sem jsdom, ver Pattern 4) | ❌ Wave 0 (primeiro teste automatizado deste arquivo, nunca testado desde a Fase 1) |
| FRNT-02/SC#4 | Zero chamadas de rede na segunda visualização dentro da mesma sessão | manual-only | N/A — verificação comportamental via dev tools/network tab (D-51, já documentado como não-automatizável nesta fase) | — |
| RULE-03/SC#1 | O motor roda no agendamento sem intervenção manual | manual-only (parcialmente) | Confirmação real requer aguardar/disparar o cron no GitHub real e observar a execução — `workflow_dispatch` permite testar o mesmo código sob demanda | — |

### Sampling Rate
- **Per task commit:** `npm test -- <arquivo tocado>.test.js`
- **Per wave merge:** `npm test` (suite completa, 144+ testes)
- **Phase gate:** Suite completa verde antes de `/gsd-verify-work`, mais a verificação comportamental manual (D-51) e a confirmação real de execução agendada (Open Question 1 resolvida)

### Wave 0 Gaps
- [ ] `src/db/catalog-store.test.js` — adicionar casos para `getSuccessfulRunForToday`, `seedPendingApprovalQueue`, `checkpointAndCloseDb`
- [ ] `scripts/run-daily-job.test.js` — novo arquivo, testa o orquestrador completo (guard + chamada de ingestão mockada/real contra banco de teste isolado, mesmo padrão `CATALOG_DB_DIR` já estabelecido)
- [ ] `storefront-script/main.test.js` — novo arquivo, primeiro teste automatizado deste script (funções puras de cache via injeção de storage fake, sem jsdom)
- Framework install: nenhum — vitest já está instalado e configurado

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | não (job CI não expõe nenhuma superfície de autenticação de usuário) | — |
| V3 Session Management | não | — |
| V4 Access Control | sim (parcial) | `permissions: contents: write` explícito e mínimo no workflow (nunca herdar permissões amplas por omissão); secrets do GitHub nunca logados em `console.log`/step outputs |
| V5 Input Validation | sim (já coberto, sem mudança) | Dados de catálogo (nome/tags) já passam por `escapeHtml` no painel (Fase 4) — o job diário não introduz novo ponto de entrada de dado não confiável além do que a ingestão já trata |
| V6 Cryptography | não (nenhuma criptografia nova; secrets ficam no cofre nativo do GitHub Actions, nunca hand-rolled) | — |

### Known Threat Patterns for {stack}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Vazamento de `NUVEMSHOP_ACCESS_TOKEN` em log de step do GitHub Actions | Information Disclosure | Usar `secrets.NUVEMSHOP_ACCESS_TOKEN` via `env:` (GitHub mascara automaticamente o valor em logs), nunca `echo`/`console.log` do valor bruto |
| Escalada de permissão via workflow com `permissions` amplo por padrão | Elevation of Privilege | Bloco `permissions: contents: write` explícito e restrito no nível do job (não usar `permissions: write-all`) |
| Loop de workflow disparado pelo próprio commit-back consumindo minutos de CI indefinidamente | Denial of Service (auto-infligido) | `[skip ci]` na mensagem de commit (Pitfall 4) |
| Push-back para um branch protegido falhando silenciosamente | Tampering (dado desatualizado sem aviso) | D-46 já exige falha visível — o step de push deve propagar o exit code de erro do `git push`, nunca `|| true`/mascarar |

## Sources

### Primary (HIGH confidence)
- Leitura direta do código-fonte existente: `app-partners-recomendados/src/db/catalog-store.js`, `src/review/review-queue.js`, `src/review-server.js`, `src/ingestion/ingest-catalog.js`, `src/db/schema.sql`, `storefront-script/main.js`, `src/review/write-executor.js`, `src/review/notify-failure.js`, `src/auth/nuvemshop-auth.js` — todos lidos integralmente nesta sessão de pesquisa.
- `npm view better-sqlite3 version` / `npm view better-sqlite3 engines` — executado ao vivo nesta sessão.
- `npm test` executado ao vivo (144/144 testes passando, 15 arquivos).
- `git remote -v` / `git config --get remote.origin.url` executado ao vivo (confirma ausência de remote).

### Secondary (MEDIUM confidence)
- Busca web (múltiplas fontes cruzadas) sobre sintaxe de `schedule`/`workflow_dispatch`/`[skip ci]` do GitHub Actions.
- Busca web sobre `stefanzweifel/git-auto-commit-action` e padrão de commit-back de banco SQLite gerado por workflow agendado (caso real citado no próprio README da Action: "at the start of each month a workflow updates a sqlite-database... git-auto-commit pushes the updated sqlite-database back to the repository").
- Busca web sobre binários prebuilt do `better-sqlite3` e comportamento em runners GitHub Actions (cross-referenciado com `npm view engines`, que é primário).
- Busca web sobre versões majors atuais de `actions/checkout`/`actions/setup-node` (v5/v6).

### Tertiary (LOW confidence)
- Nenhuma (todas as afirmações de busca web foram cross-referenciadas com pelo menos 2 fontes ou com verificação `npm view`, elevando para MEDIUM).

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH para `better-sqlite3` (verificado via `npm view`), MEDIUM para versões de GitHub Actions (busca web sem Context7/doc oficial direto nesta sessão)
- Architecture: MEDIUM — o design do guard de idempotência (Pattern 1) e da persistência auditável (Pattern 2) é uma recomendação de pesquisa/design, não um fato verificado em nenhuma documentação externa; é derivado de leitura cuidadosa do código-fonte real do projeto
- Pitfalls: MEDIUM-HIGH — o Pitfall 1 (WAL/checkpoint) é conhecimento geral bem estabelecido de SQLite, cross-referenciado com o comportamento real observado no código (`journal_mode = WAL` em `catalog-store.js:31`); o Pitfall 2 é derivado diretamente da leitura do schema/código real (`approval_queue` chaveada por `run_id`, não por data)

**Research date:** 2026-07-17
**Valid until:** 30 dias (stack estável — GitHub Actions/better-sqlite3 não mudam com frequência que invalide estas recomendações; revalidar versões majors das Actions se a implementação ocorrer muito depois desta data)
