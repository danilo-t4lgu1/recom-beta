# Phase 5: Gravação Segura em Produção - Research

**Researched:** 2026-07-16
**Domain:** Nuvemshop (Tiendanube) REST API write path + SQLite audit/rollback + webhook notifications (Node.js, zero new dependencies)
**Confidence:** MEDIUM

## Summary

Esta fase substitui o stub de `write-executor.js` por uma chamada real de escrita
ao Metafield `recomendados.produto_sugerido` do produto, mas o trabalho real não
é "fazer um POST" — é envolver essa chamada em quatro garantias operacionais que
já têm padrões estabelecidos no próprio código do projeto: captura de snapshot
(D-38 exige comparar contra o valor gravado, não o "antes" genérico), rollback
com verificação de divergência, log de auditoria centralizado numa única tabela
nova, e notificação via webhook nativo (`fetch`) em qualquer falha real.

A investigação técnica pedida pelo CONTEXT.md (upsert automático vs. update
explícito) tem resposta: a API pública da Nuvemshop **não documenta** upsert por
namespace+key — `POST /metafields` sempre cria um recurso novo com um `id` novo
(comportamento de `createMetafield` já existente), e atualizar um Metafield
existente exige `PUT /metafields/{id}` (endpoint diferente, sem `product_id` no
path, apenas `{id}` do próprio Metafield). Isso significa que a nova função
precisa **primeiro localizar** o Metafield existente (mesmo `namespace`+`key`,
via `getMetafields` já existente) antes de decidir entre `PUT` (atualizar) e
`POST` (criar pela primeira vez) — nunca pode assumir que repetir o `POST`
"apenas atualiza".

Um ponto crítico não coberto pelo CONTEXT.md e que a pesquisa expôs por leitura
direta do código: o Metafield `produto_sugerido` foi desenhado na Fase 1 (spike)
para guardar **um único ID de produto** (`value` é uma string simples, lida como
`match.value` em `src/api/recommendations.js`), mas o motor de recomendação
(RULE-01, emendado na Fase 03.1) já produz **até 8 produtos recomendados** por
produto, e `approval_queue.approved_recommendation_ids` já persiste esse
conjunto como array JSON. A Fase 5 herda essa lacuna: qual valor exatamente vai
para o campo `value` do Metafield quando há múltiplos ids aprovados? Isso é
tratado como uma **Assumption** nesta pesquisa (ver `## Assumptions Log`), não
uma decisão implícita — o planejador/discuss-phase deve confirmar antes de
travar a forma exata da função de escrita.

**Primary recommendation:** implementar `findMetafield` + `updateMetafield` +
`deleteMetafield` em `nuvemshop-client/client.js` (reusando
`buildHeaders`/`assertOk`/`fetchWithRateLimit`), uma única tabela SQLite nova
`write_log` que serve simultaneamente de snapshot e de log de auditoria (D-41),
um script CLI `scripts/rollback.js` que lê o Metafield ao vivo antes de decidir
restaurar (D-38), e um módulo `notify-failure.js` que faz `fetch` puro para uma
URL de webhook lida de `process.env.WRITE_FAILURE_WEBHOOK_URL`, com payload que
inclui tanto `text` (Slack) quanto `content` (Discord) para compatibilidade sem
branching por provedor.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Escrita real do Metafield (WRTE-01/02) | API/Backend (Node script/módulo) | Database/Storage (Nuvemshop remoto) | `write-executor.js` já é a camada de backend que orquestra o gate + efeito; o "storage" real do valor é a própria loja Nuvemshop (fora do nosso banco) |
| Snapshot antes da escrita (WRTE-02) | Database/Storage (SQLite local) | API/Backend (captura via `findMetafield`) | O valor anterior precisa ser persistido localmente ANTES do `PUT`/`POST` real, para sobreviver a uma falha no meio do caminho |
| Rollback (WRTE-03) | API/Backend (CLI script) | Database/Storage (leitura de `write_log`) | D-37: nunca um endpoint HTTP — script Node standalone, mas ainda pertence à camada de backend (mesmo processo/módulos) |
| Log de auditoria (WRTE-04) | Database/Storage (tabela `write_log`) | API/Backend (rota `GET /audit` somente leitura) | Persistência é SQLite; a exposição somente-leitura reusa a infra HTTP já existente de `review-server.js` |
| Notificação de falha (WRTE-05) | API/Backend (módulo `notify-failure.js`) | — (webhook externo é side-effect, não um tier da nossa arquitetura) | Disparado no mesmo caminho de código do write real, sem UI |

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-36:** Escrita real SOMENTE via `POST /review/:productId/write` (um produto por vez). Nenhum script de lote nesta fase (Fase 6). "Execução agendada" (WRTE-04/05) é tratada como o MESMO caminho de código do write manual — não um caminho separado.
- **D-37:** Rollback é CLI manual (`node scripts/rollback.js <productId>`), nunca endpoint HTTP nem botão no painel.
- **D-38:** Antes de restaurar, o script DEVE ler o valor atual do Metafield na loja (chamada real) e comparar com o valor que a escrita original gravou. Só restaura se baterem; caso contrário, aborta com erro tipado e avisa o operador — nunca sobrescreve silenciosamente.
- **Implicação de D-38:** o snapshot "antes" da escrita (WRTE-02) precisa registrar tanto o valor anterior quanto o valor gravado por aquela escrita específica.
- **D-39:** Canal de notificação é webhook (URL genérica via variável de ambiente), NÃO e-mail. Usa `fetch` nativo — zero dependência nova.
- **D-40:** Gatilho genérico — QUALQUER falha real de escrita dispara o webhook, testável forçando exceção via teste automatizado. Não existe caminho "agendado" separado nesta fase.
- **D-41:** Log de auditoria persistido em tabela(s) SQLite nova(s) seguindo a convenção de `schema.sql` (colunas explícitas, nunca booleano opaco) E exposto em `GET /audit` (somente leitura) no `review-server.js`.
- **D-42:** Tela de auditoria é lista cronológica simples (mais recente primeiro), SEM filtro por produto/data/status nesta fase.

### Claude's Discretion
- Nome e schema exatos da tabela de auditoria/snapshot (uma tabela `write_log` combinada ou duas separadas), desde que capture: product_id, valor anterior, valor gravado, timestamp, resultado (sucesso/falha).
- Função nova em `nuvemshop-client/client.js` para atualizar/ler Metafield por id — decisão de upsert automático vs. update explícito é investigação técnica (resolvida nesta pesquisa: update explícito via `PUT /metafields/{id}`, ver `## Summary`).
- Formato exato do payload do webhook (D-39): JSON mínimo com productId, erro, timestamp; formato exato compatível com Slack/Discord ou genérico é decisão do planejador.
- Variável de ambiente do webhook: nome e onde documentar (ex: `.env.example`), seguindo a convenção de `access_token`/`store_id` em `nuvemshop-auth.js`.

### Deferred Ideas (OUT OF SCOPE)
- Script de lote / execução em massa dos aprovados pendentes (D-36) — Fase 6.
- Endpoint HTTP ou botão no painel para rollback (D-37) — CLI manual nesta fase.
- Filtro por produto/data/status na tela de auditoria (D-42) — lista simples sem filtro nesta fase.
- Notificação por e-mail (D-39) — webhook escolhido para não introduzir dependência de e-mail.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| WRTE-02 | Sistema captura o estado anterior (snapshot) imediatamente antes de cada escrita | Tabela `write_log.previous_value` populada por `findMetafield` (leitura real) ANTES do `PUT`/`POST`; ver `## Architecture Patterns` Pattern 1 |
| WRTE-03 | Sistema permite desfazer (rollback) uma alteração, restaurando o snapshot anterior | `scripts/rollback.js` + `getLastSuccessfulWriteLog` + comparação D-38; ver Pattern 2 |
| WRTE-04 | Sistema registra log de auditoria de toda alteração: o que mudou, quando, disparado por execução agendada ou manual | `write_log.triggered_by` ('manual' hoje, 'scheduled' reservado para Fase 6) + `GET /audit`; ver Pattern 3 |
| WRTE-05 | Sistema notifica falha (e-mail/webhook) quando a execução agendada diária falha ou lança exceção | `notify-failure.js` chamado no `catch` de `executeApprovedWrite`; ver Pattern 4 |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js `fetch` global | Node ≥20.6 (runtime atual: v24.17.0) [VERIFIED: node -v local] | Todas as chamadas HTTP (Nuvemshop + webhook) | Zero dependência — já é a disciplina de `client.js`/`adaptive-limiter.js` |
| `better-sqlite3` | 12.11.1 [VERIFIED: npm registry] | Persistência de `write_log` | Já é a dependência única do projeto (`package.json`), síncrono, WAL já configurado |
| Vitest | 4.1.10 [VERIFIED: npm registry] | Testes unitários TDD | Já é o único devDependency, sem config própria (usa defaults) |

**Nenhum pacote novo é instalado nesta fase** — toda a fase é construída com Node.js nativo + `better-sqlite3` já existente, consistente com D-39 (zero dependência de HTTP/e-mail).

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| — | — | — | Não há bibliotecas de suporte novas — módulo de webhook é ~20 linhas de `fetch` puro |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `fetch` nativo para webhook | `node-fetch`, `axios` | Dependência nova desnecessária — Node ≥18 já tem `fetch` global; contradiz D-39 explicitamente |
| Tabela única `write_log` | Duas tabelas (`write_snapshots` + `audit_log`) separadas | Uma tabela única evita duplicar `product_id`/`timestamp` em dois lugares e simplifica a query de `GET /audit` (um único `SELECT ... ORDER BY written_at DESC`); a Claude's Discretion do CONTEXT permite ambas — esta pesquisa recomenda a tabela única por simplicidade, dado o volume baixo (D-42) |

**Installation:**
```bash
# Nenhuma instalação necessária — zero pacotes novos nesta fase.
```

**Version verification:** `better-sqlite3` (12.11.1) e `vitest` (4.1.10) confirmados via `npm view <pkg> version` contra o registry real, idênticos ao `package.json` já commitado — nenhuma atualização necessária.

## Package Legitimacy Audit

**Nenhum pacote novo é instalado nesta fase** — todas as funções novas (`updateMetafield`, `deleteMetafield`, rollback CLI, notificação webhook) usam exclusivamente `fetch` global do Node e `better-sqlite3` já auditado/instalado desde a Fase 2. Gate de legitimidade de pacotes não se aplica.

**Packages removed due to [SLOP] verdict:** none — nenhum pacote novo avaliado.
**Packages flagged as suspicious [SUS]:** none.

## Architecture Patterns

### System Architecture Diagram

```
Operador (browser)                     Operador (terminal)
      |                                        |
      | POST /review/:productId/write          | node scripts/rollback.js <productId>
      v                                        v
+-----------------------+          +---------------------------+
| review-server.js       |          | rollback.js (CLI)         |
| WRITE_PATH handler     |          | 1. getLastSuccessfulWrite  |
+-----------+-----------+          |    Log(productId)          |
            |                      | 2. findMetafield(productId)|
            v                      |    (leitura AO VIVO)       |
+-----------------------+          | 3. compara valor atual     |
| assertApproved()       |          |    vs written_value (D-38) |
| (gate, D-25, inalterado)|         +-------------+---------------+
+-----------+-----------+                        |
            v                          match? ----+---- no match?
+-----------------------+                |                |
| executeApprovedWrite() |                v                v
|  try {                 |     updateMetafield(       RollbackConflictError
|   findMetafield()      |      previous_value)       (aborta, nada é escrito)
|   [PUT|POST] Metafield |            |
|   insertWriteLog(ok)   |            v
|  } catch (err) {       |     insertWriteLog(
|   insertWriteLog(fail) |      triggered_by:'rollback')
|   notifyFailure(err) --+----> webhook (Slack/Discord/genérico)
|   rethrow              |
|  }                     |
+-----------+-----------+
            |
            v
   Nuvemshop API pública
   PUT/POST /metafields
            |
            v
+-----------------------+
| write_log (SQLite)     |  <---- GET /audit (somente leitura, D-42)
| snapshot + auditoria   |
+-----------------------+
```

### Recommended Project Structure
```
src/
├── nuvemshop-client/
│   └── client.js          # + findMetafield, updateMetafield, deleteMetafield (novas)
│   └── client.test.js      # NOVO — módulo hoje sem teste (Wave 0 gap)
├── review/
│   ├── write-executor.js   # troca o stub por chamada real (mesma assinatura + runId novo)
│   ├── write-executor.test.js  # extend com testes de escrita real (fetch mockado)
│   ├── notify-failure.js   # NOVO — módulo de webhook (D-39/D-40)
│   └── notify-failure.test.js  # NOVO
├── db/
│   ├── schema.sql          # + CREATE TABLE write_log
│   └── catalog-store.js    # + insertWriteLog, getLastSuccessfulWriteLog, listWriteLog
└── review-server.js         # + GET /audit (D-41, somente leitura)
scripts/
└── rollback.js              # NOVO — CLI (D-37), lógica extraída em função testável
```

### Pattern 1: Snapshot antes da escrita (WRTE-02)
**What:** Antes de qualquer `PUT`/`POST` real, localizar o Metafield existente
(se houver) e capturar seu `value` como `previous_value` — só depois disso
gravar o novo valor.
**When to use:** Toda vez que `executeApprovedWrite` executa o ramo real
(`!dryRun`).
**Example:**
```javascript
// Source: padrão inferido de client.js (getMetafields) + PUT /metafields/{id}
// confirmado em https://tiendanube.github.io/api-documentation/resources/metafields
export async function findMetafield({ ownerId, namespace = 'recomendados', key = 'produto_sugerido', limiter }) {
  const metafields = await getMetafields({ ownerId, limiter });
  return metafields.find((m) => m.namespace === namespace && m.key === key) || null;
}

export async function updateMetafield({ id, value, limiter }) {
  const { accessToken, storeId } = getAccessToken();
  const url = `${API_BASE}/${storeId}/metafields/${encodeURIComponent(id)}`;

  const response = await fetchWithRateLimit(
    url,
    { method: 'PUT', headers: buildHeaders(accessToken), body: JSON.stringify({ value }) },
    limiter
  );

  await assertOk(response, `PUT ${url}`);
  return response.json();
}
```
No `write-executor.js`, o fluxo real fica:
```javascript
const existing = await findMetafield({ ownerId: productId });
const previousValue = existing ? existing.value : null;

const result = existing
  ? await updateMetafield({ id: existing.id, value: newValue })
  : await createMetafield({ ownerId: productId, value: newValue }); // reusa função já existente

insertWriteLog({
  productId, runId, metafieldId: result.id,
  previousValue, writtenValue: newValue,
  triggeredBy: 'manual', status: 'success', errorMessage: null,
  writtenAt: new Date().toISOString(),
});
```

### Pattern 2: Rollback com verificação de divergência (WRTE-03/D-38)
**What:** Script CLI que só restaura se o valor ATUAL na loja bate com o valor
que a escrita original gravou — nunca sobrescreve uma mudança mais recente.
**When to use:** Operador roda manualmente após confirmar (fora do sistema) que
uma escrita real precisa ser desfeita.
**Example:**
```javascript
// scripts/rollback.js — lógica extraída para função testável (padrão de
// approval-gate.js: erro tipado, nunca throw genérico)
export class RollbackConflictError extends Error {
  constructor(productId, expected, actual) {
    super(`Produto ${productId}: valor atual ("${actual}") diverge do esperado ("${expected}") — rollback abortado.`);
    this.name = 'RollbackConflictError';
    this.productId = productId;
  }
}

export async function performRollback({ productId }) {
  const lastWrite = getLastSuccessfulWriteLog({ productId });
  if (!lastWrite) throw new Error(`Nenhuma escrita real registrada para o produto ${productId}.`);

  const existing = await findMetafield({ ownerId: productId });
  const currentValue = existing ? existing.value : null;

  if (currentValue !== lastWrite.writtenValue) {
    throw new RollbackConflictError(productId, lastWrite.writtenValue, currentValue);
  }

  const restoredValue = lastWrite.previousValue;
  const result = restoredValue == null
    ? await deleteMetafield({ id: existing.id }) // Metafield não existia antes desta escrita
    : await updateMetafield({ id: existing.id, value: restoredValue });

  insertWriteLog({
    productId, runId: lastWrite.runId, metafieldId: existing.id,
    previousValue: currentValue, writtenValue: restoredValue,
    triggeredBy: 'rollback', status: 'success', errorMessage: null,
    writtenAt: new Date().toISOString(),
  });

  return result;
}
```

### Pattern 3: Log de auditoria centralizado (WRTE-04/D-41)
**What:** Uma única tabela `write_log` serve tanto de snapshot (WRTE-02) quanto
de log de auditoria (WRTE-04) — cada linha é "uma tentativa de escrita real"
(sucesso, falha, ou rollback), nunca sobrescrita.
**When to use:** Toda chamada real de escrita (write ou rollback) insere
exatamente uma linha nova (append-only, mesma disciplina de `catalog_snapshots`).
**Example:**
```sql
-- Source: convenção de schema.sql (colunas explícitas, nunca booleano opaco)
CREATE TABLE IF NOT EXISTS write_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id TEXT NOT NULL REFERENCES products(id),
  run_id INTEGER REFERENCES ingestion_runs(id),
  metafield_id TEXT,
  previous_value TEXT,
  written_value TEXT,
  triggered_by TEXT NOT NULL,  -- 'manual' | 'scheduled' | 'rollback'
  status TEXT NOT NULL,        -- 'success' | 'failed'
  error_message TEXT,
  written_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_write_log_product ON write_log(product_id, written_at);
```
`GET /audit` no `review-server.js` reusa `sendHtml`/`renderPage`/`escapeHtml` já
existentes, ordenando por `written_at DESC` (D-42, sem filtro).

### Pattern 4: Notificação de falha via webhook genérico (WRTE-05/D-39/D-40)
**What:** Módulo dedicado que faz `fetch` puro para uma URL lida de env, com
payload compatível tanto com Slack (`text`) quanto Discord (`content`) na mesma
mensagem — sem branch por provedor.
**When to use:** Chamado no `catch` de `executeApprovedWrite`, para QUALQUER
exceção real do caminho de escrita (D-40).
**Example:**
```javascript
// Source: payload mínimo confirmado por WebSearch (Slack Developer Docs /
// Discord Webhook Guide) — {"text": ...} e {"content": ...} são os campos
// mínimos aceitos por cada provedor respectivamente.
export async function notifyWriteFailure({ productId, error, triggeredBy }) {
  const webhookUrl = process.env.WRITE_FAILURE_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn(`WRITE_FAILURE_WEBHOOK_URL ausente — falha em ${productId} não notificada via webhook.`);
    return { notified: false, reason: 'webhook not configured' };
  }

  const message = `Falha ao gravar recomendação (produto ${productId}, gatilho ${triggeredBy}): ${error.message}`;
  const payload = {
    text: message,     // Slack incoming webhook
    content: message,  // Discord webhook
    productId, triggeredBy,
    error: error.message,
    timestamp: new Date().toISOString(),
  };

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    console.error(`notifyWriteFailure: webhook respondeu status ${response.status} — falha não foi comunicada.`);
    return { notified: false, reason: `webhook status ${response.status}` };
  }

  return { notified: true };
}
```
**Nunca** deixar uma falha no PRÓPRIO webhook (rede fora do ar, URL inválida)
derrubar a resposta HTTP original — envolver a chamada em seu próprio
try/catch, nunca propagar um erro de notificação para cima do erro de escrita
original.

### Anti-Patterns to Avoid
- **Assumir que `POST /metafields` faz upsert por namespace+key:** não é
  documentado pela API e o comportamento observado do `createMetafield`
  existente (usado desde a Fase 1) é sempre criar um recurso novo com `id`
  novo — repetir o `POST` sem localizar o Metafield existente primeiro
  provavelmente cria Metafields duplicados na loja real.
- **Rollback que sobrescreve sem comparar (D-38):** nunca restaurar
  `previous_value` sem antes ler o valor AO VIVO e compará-lo com
  `written_value` — isso apagaria silenciosamente uma edição manual feita no
  admin ou uma escrita mais recente.
- **`fetch` cru para a nova chamada de update/rollback:** `updateMetafield`
  DEVE usar `fetchWithRateLimit` (como `getMetafields`/`listProducts`), mesmo
  que `createMetafield` existente hoje use `fetch` cru (inconsistência
  pré-existente, ver `## Common Pitfalls`) — não repetir o padrão antigo em
  código novo.
- **Log de auditoria só para sucessos:** falhas reais também devem gerar uma
  linha em `write_log` (`status: 'failed'`) — senão o operador não teria como
  saber, pela tela de auditoria, que uma tentativa de escrita aconteceu e
  falhou.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Autenticação/headers da API Nuvemshop | Novo `fetch` com headers manuais | `buildHeaders`/`getAccessToken` já existentes em `client.js`/`nuvemshop-auth.js` | Evita duplicar `Authorization`/`User-Agent`, único ponto de verdade |
| Rate limiting adaptativo | Novo delay/retry manual | `fetchWithRateLimit`/`AdaptiveRateLimiter` já existentes | Já lê `x-rate-limit-*` reais e já trata 429 com teto de tentativas (WR-02) |
| Verificação de erro HTTP | `if (!response.ok) throw ...` duplicado | `assertOk(response, context)` já existente | Mensagem de erro consistente em todo o módulo |
| Erro tipado para estado inválido | `throw new Error('...')` genérico | Classe de erro nomeada (`RollbackConflictError`, mesmo padrão de `ApprovalRequiredError`) | Permite ao chamador HTTP/CLI distinguir o caso com `instanceof`, sem parsear mensagem |
| Escrita SQL parametrizada | Concatenação de string SQL | `db.prepare(...).run(params)` (mesma disciplina de `catalog-store.js`, T-02-04) | `product_id`/`error_message` podem conter dado vindo de fonte externa (mensagem de erro HTTP) |

**Key insight:** todo helper necessário para esta fase (auth, rate limit, erro
HTTP, erro tipado, prepared statement) já existe no código do projeto — a
implementação real desta fase é 100% composição de padrões já provados, não
construção de infraestrutura nova.

## Common Pitfalls

### Pitfall 1: Upsert de Metafield assumido sem verificação
**What goes wrong:** Código novo chama `createMetafield` (POST) repetidamente
achando que "atualiza" o Metafield existente, e a loja acumula múltiplos
Metafields com o mesmo `namespace`/`key` (nenhum removido), quebrando a leitura
de `src/api/recommendations.js` (que usa `.find()`, pegando o primeiro
encontrado — que pode não ser o mais recente).
**Why it happens:** A API não documenta o comportamento de duplicata, e o
`createMetafield` existente não expõe nenhum aviso sobre isso.
**How to avoid:** Sempre chamar `findMetafield` primeiro; só usar `POST`
(criar) quando não existir nenhum Metafield com aquele `namespace`+`key` para
aquele `owner_id`; usar `PUT /metafields/{id}` para todo update subsequente.
**Warning signs:** `getMetafields` retornando mais de um resultado para o
mesmo `namespace`+`key` em um mesmo produto.

### Pitfall 2: Formato do `value` gravado (múltiplos ids vs. Metafield legado de valor único)
**What goes wrong:** `approval_queue.approved_recommendation_ids` já é um
array (até 8 ids, RULE-01 pós-03.1), mas o Metafield `produto_sugerido` foi
desenhado na Fase 1 para um único valor de string, e `src/api/recommendations.js`
lê `match.value` como um ID único (não um array/JSON). Gravar
`JSON.stringify(approvedIds)` sem atualizar o leitor público quebraria
silenciosamente o storefront (FRNT-01) — que está fora do escopo desta fase.
**Why it happens:** O schema do Metafield nunca foi revisitado depois que o
motor evoluiu de "1 recomendação" (Fase 1, spike) para "até 8" (Fase 3/03.1).
**How to avoid:** Tratado como Assumption nesta pesquisa (ver
`## Assumptions Log` A1) — o planejador deve decidir explicitamente (idealmente
confirmando com o usuário via discuss-phase) se: (a) grava
`JSON.stringify(approvedIds)` e aceita que o leitor público fica desatualizado
até uma fase futura o adaptar, ou (b) grava apenas o primeiro id do array como
valor único (comportamento legado preservado, mas perde os demais aprovados).
Esta pesquisa recomenda (a) por ser tecnicamente correta e não exigir
redesenho do schema, com o aviso explícito de que o consumo pelo storefront
público fica desalinhado até uma fase seguinte tratar isso.
**Warning signs:** Testes de round-trip que gravam array e leem de volta como
string única sem `JSON.parse`.

### Pitfall 3: `createMetafield` existente não usa rate limit
**What goes wrong:** Código novo que reusa `createMetafield` tal como está
(sem passar `limiter`) para o caminho de "criar pela primeira vez" (Pattern 1)
herda a falta de rate limiting da função existente — inconsistente com
`updateMetafield` novo, que deve respeitar o `limiter`.
**Why it happens:** `createMetafield` foi escrito na Fase 1 (spike de um único
produto de teste) antes do rate limiter adaptativo existir (Fase 2).
**How to avoid:** Ou (a) estender `createMetafield` para aceitar `limiter`
opcional e usar `fetchWithRateLimit` (mudança pequena, retrocompatível — todos
os chamadores existentes não passam `limiter`, então o comportamento default
não muda), ou (b) documentar explicitamente que o caminho de criação
(primeira escrita) tem esse gap conhecido. Esta pesquisa recomenda (a): é uma
mudança de uma linha, consistente com o Anti-Pattern já documentado acima.
**Warning signs:** Chamadas de escrita real gerando 429 sem retry/backoff.

### Pitfall 4: `write_log.run_id` sem thread do run atual
**What goes wrong:** `executeApprovedWrite({ productId, decision, dryRun })`
não recebe `runId` hoje — sem esse parâmetro, `write_log.run_id` fica sempre
`NULL`, perdendo a rastreabilidade de "esta escrita corresponde a qual ciclo
de ingestão/aprovação".
**Why it happens:** A assinatura da função foi fixada na Fase 4 antes de
`write_log` existir.
**How to avoid:** Adicionar `runId` como novo parâmetro explícito (mesma
disciplina de `dryRun` — nunca lido de `process.env` dentro do módulo);
`review-server.js` já calcula `runId = getLatestSuccessfulRunId()` na rota
`WRITE_PATH` e pode simplesmente passá-lo adiante.
**Warning signs:** `write_log` com `run_id` sempre `NULL` na tabela real.

### Pitfall 5: Falha no próprio webhook mascarando o erro original
**What goes wrong:** Se `notifyWriteFailure` lançar (URL inválida, rede fora
do ar) e essa exceção não for contida, o `catch` de `executeApprovedWrite`
pode acabar propagando o erro do webhook em vez do erro real da escrita —
confundindo o operador sobre a causa raiz.
**Why it happens:** Encadear `await notifyWriteFailure(...)` direto dentro do
`catch` sem seu próprio `try/catch`.
**How to avoid:** `notifyWriteFailure` deve capturar suas próprias exceções
internamente e retornar `{ notified: false, reason }` em vez de lançar —
nunca lançar de dentro de uma notificação de falha.
**Warning signs:** Teste força uma exceção de escrita E stub o webhook para
lançar — se o teste falhar reportando o erro do webhook em vez do erro de
escrita original, o pitfall está presente.

## Code Examples

### Ler Metafield existente por namespace+key (base de `findMetafield`)
```javascript
// Source: composição de getMetafields (já existente) — sem chamada nova de rede
const metafields = await getMetafields({ ownerId: productId, limiter });
const existing = metafields.find((m) => m.namespace === 'recomendados' && m.key === 'produto_sugerido');
```

### DELETE de Metafield (para o caso de rollback quando `previous_value` é null)
```javascript
// Source: endpoint confirmado em https://tiendanube.github.io/api-documentation/resources/metafields
export async function deleteMetafield({ id, limiter }) {
  const { accessToken, storeId } = getAccessToken();
  const url = `${API_BASE}/${storeId}/metafields/${encodeURIComponent(id)}`;

  const response = await fetchWithRateLimit(
    url,
    { method: 'DELETE', headers: buildHeaders(accessToken) },
    limiter
  );

  await assertOk(response, `DELETE ${url}`);
  return response.json().catch(() => ({}));
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `write-executor.js` stub (`written: false`, nenhuma chamada de rede) | Chamada real via `findMetafield` + `updateMetafield`/`createMetafield` | Fase 5 (esta fase) | Primeira escrita real em produção desde o spike da Fase 1 (produto único de teste) |
| `recommendation_baseline`/leitura pública tratando recomendação como valor único | Motor produz até 8 ids (RULE-01 pós-03.1), mas Metafield/leitor público ainda são desenhados para 1 valor | Não resolvido ainda — ver Pitfall 2 / Assumption A1 | Risco de incompatibilidade entre o que é aprovado (array) e o que o storefront consegue exibir hoje (1 produto) |

**Deprecated/outdated:**
- Nenhuma API ou biblioteca foi deprecada nesta pesquisa — o gap identificado é de design interno do projeto (schema de valor único vs. motor multi-recomendação), não de uma dependência externa desatualizada.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | O valor gravado no Metafield para múltiplos ids aprovados será `JSON.stringify(approvedRecommendationIds)` (array serializado), não um id único | Pattern 1, Pitfall 2 | Se o usuário/planejador preferir manter o formato de valor único (ex: só o primeiro aprovado), a implementação de `write-executor.js` e o schema do `write_log.written_value` mudam de forma; também afeta se/quando o storefront público (`api/recommendations.js`) precisa ser adaptado para fazer `JSON.parse` |
| A2 | `POST /metafields` NUNCA faz upsert automático por namespace+key (sempre cria um recurso novo) | Summary, Pitfall 1 | Documentação oficial não confirma nem nega isso explicitamente — se a API na verdade fizer upsert silencioso, o padrão `findMetafield`-primeiro ainda funciona corretamente (é estritamente mais seguro), mas se PUT falhar por algum motivo (`id` inexistente após limpeza manual na loja), o fallback para POST precisa ser testado contra a API real antes de confiar cegamente |
| A3 | O nome da variável de ambiente do webhook será `WRITE_FAILURE_WEBHOOK_URL` e um `.env.example` novo será criado (não existe hoje no repositório) | Pattern 4, Standard Stack | Nome é só uma convenção — sem impacto funcional se o planejador escolher outro nome, desde que documentado consistentemente em `.env`/código |
| A4 | O rollback, ao restaurar, também insere uma linha nova em `write_log` (`triggered_by: 'rollback'`) para manter o rollback visível na tela de auditoria | Pattern 2/3 | Se o planejador decidir que rollback NÃO deve aparecer em `GET /audit` (só WRTE-04 registra "write" real, não "undo"), a UI/schema simplificam, mas a rastreabilidade de quem desfez o quê se perde |

**Se esta tabela parecesse vazia:** não é o caso aqui — há 4 decisões de design que dependem de confirmação humana antes de travar a implementação, recomendado tratar A1 e A4 explicitamente no discuss-phase/plan-phase (ambos afetam o schema de `write_log` e a assinatura de `write-executor.js`).

## Open Questions

1. **Formato do `value` gravado quando há múltiplos ids aprovados (A1)**
   - What we know: `approval_queue` já guarda um array (até 8 ids); o Metafield historicamente guarda 1 string; o leitor público (`api/recommendations.js`) só sabe ler 1 valor.
   - What's unclear: se o valor gravado deve ser `JSON.stringify(array)` (tecnicamente correto, mas quebra compatibilidade com o leitor público até uma fase futura) ou se esta fase deve preservar o formato legado de valor único (perdendo parte do que foi aprovado).
   - Recommendation: confirmar com o usuário antes do plano travar a assinatura exata de `write-executor.js`/`write_log.written_value`; esta pesquisa recomenda `JSON.stringify` por ser o caminho tecnicamente correto e mais fácil de auditar, aceitando o desalinhamento temporário com o storefront (fora do escopo desta fase per CONTEXT.md).

2. **`createMetafield` deveria ganhar `limiter` opcional nesta fase? (Pitfall 3)**
   - What we know: a função existe desde a Fase 1 sem rate limit; `updateMetafield` novo deve ter rate limit desde o início.
   - What's unclear: se ajustar `createMetafield` (função já em uso por `roundtrip-metafield.js`) está dentro do escopo desta fase ou é um debito técnico separado.
   - Recommendation: ajuste pequeno e retrocompatível — recomendado incluir no plano desta fase, já que o caminho de "criar Metafield pela primeira vez" também é uma escrita real coberta por WRTE-01/02.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js `fetch` global | Chamadas HTTP reais (Metafield + webhook) | ✓ | v24.17.0 (≥18 requerido) | — |
| `better-sqlite3` | Tabela `write_log` | ✓ | 12.11.1 (instalado, `npm view` confirmado) | — |
| Nuvemshop API pública (token real) | Escrita real de teste (SC#1/SC#2) | ✓ (mesmo `.env` já usado desde a Fase 1/2, `NUVEMSHOP_ACCESS_TOKEN`/`NUVEMSHOP_STORE_ID` presentes) | — | — |
| URL de webhook real (Slack/Discord) | Notificação de falha real (SC#4) | ✗ (nenhuma `WRITE_FAILURE_WEBHOOK_URL` configurada ainda no `.env`) | — | Testável via `fetch` mockado nos testes automatizados (D-40 já prevê isso); operador configura a URL real antes de depender da notificação em produção |

**Missing dependencies with no fallback:**
- Nenhuma — a fila de aprovação real pode estar vazia hoje (0/645 produtos com `fabric_tag_canonical`, herdado da Fase 4), mas isso não bloqueia construir/testar o mecanismo com fixtures, mesma postura da Fase 4.

**Missing dependencies with fallback:**
- `WRITE_FAILURE_WEBHOOK_URL`: sem valor real configurado, `notifyWriteFailure` deve degradar graciosamente (`console.warn` + `{notified:false}`), nunca lançar por falta de configuração — testável via mock de `fetch` independente da URL real existir.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10 [VERIFIED: npm registry] |
| Config file | none — usa defaults do Vitest (descoberta automática de `*.test.js`) |
| Quick run command | `npx vitest run src/review/write-executor.test.js` (ou o arquivo específico do módulo alterado) |
| Full suite command | `npm test` (== `vitest run`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WRTE-02 | `previous_value` capturado antes de sobrescrever (via `findMetafield` mockado) | unit | `npx vitest run src/review/write-executor.test.js` | ❌ Wave 0 (extend arquivo existente) |
| WRTE-02 | `findMetafield`/`updateMetafield`/`deleteMetafield` chamam a URL/verbo corretos (fetch mockado) | unit | `npx vitest run src/nuvemshop-client/client.test.js` | ❌ Wave 0 (arquivo não existe) |
| WRTE-03 | Rollback restaura só quando valor atual bate com `written_value`; aborta com `RollbackConflictError` caso contrário | unit | `npx vitest run scripts/rollback.test.js` | ❌ Wave 0 |
| WRTE-04 | `GET /audit` renderiza lista cronológica; `insertWriteLog`/`getLastSuccessfulWriteLog`/`listWriteLog` persistem/leem corretamente | unit + integration | `npx vitest run src/db/catalog-store.test.js` e `npx vitest run src/review-server.test.js` | ❌ Wave 0 (extend arquivos existentes) |
| WRTE-05 | Exceção forçada no caminho real de escrita dispara `fetch` para a URL de webhook com o payload esperado | unit | `npx vitest run src/review/notify-failure.test.js` | ❌ Wave 0 (arquivo não existe) |

### Sampling Rate
- **Per task commit:** `npx vitest run <arquivo do módulo alterado>`
- **Per wave merge:** `npm test` (suite completa)
- **Phase gate:** Full suite green antes de `/gsd-verify-work`, incluindo confirmação manual contra a loja real (SC#1/SC#2, mesma disciplina de round-trip real já usada na Fase 1)

### Wave 0 Gaps
- [ ] `src/nuvemshop-client/client.test.js` — módulo hoje SEM nenhum teste (Wave 0 real, não apenas gap incremental); cobre `findMetafield`/`updateMetafield`/`deleteMetafield` novos, com `globalThis.fetch` stubado (mesmo padrão de `write-executor.test.js` Test 10)
- [ ] `scripts/rollback.test.js` — cobre `performRollback` extraída como função testável (D-38)
- [ ] `src/review/notify-failure.test.js` — cobre `notifyWriteFailure`, incluindo o caso "webhook não configurado" e "webhook responde erro"
- [ ] Extensões (não gaps de framework): `write-executor.test.js`, `catalog-store.test.js`, `review-server.test.js` já existem e seguem o mesmo padrão TDD — só precisam de testes novos para o comportamento desta fase

*(Framework Vitest já instalado e configurado — nenhuma instalação nova necessária)*

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | não diretamente (nenhuma auth de usuário nova nesta fase) | `getAccessToken()` já existente, token nunca logado |
| V3 Session Management | não | — |
| V4 Access Control | sim (rollback CLI é local, `GET /audit` é somente leitura, mesmo bind `127.0.0.1` do `review-server.js`) | Nenhuma auth adicional prevista — mesma postura de confiança local já estabelecida no projeto (ASVS nível 1) |
| V5 Input Validation | sim | `productId` do CLI/rota sempre tratado como string, nunca concatenado em SQL (`db.prepare(...).run(params)`); `escapeHtml` reusado em `GET /audit` para qualquer valor dinâmico interpolado |
| V6 Cryptography | não (nenhum dado sensível novo persistido; token já vem de `.env`, nunca gravado em `write_log`) | — |

### Known Threat Patterns for este stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| SQL injection via `product_id`/`error_message` (mensagem de erro HTTP pode conter texto arbitrário da API) | Tampering | `db.prepare(...).run(params)` com parâmetros nomeados, nunca concatenação (T-02-04, já disciplina do projeto) |
| Token/segredo vazando no payload do webhook | Information Disclosure | `notifyWriteFailure` NUNCA inclui `accessToken`/headers de autenticação no `payload` — só `productId`/`error.message`/`timestamp` |
| Rollback restaurando um valor obsoleto sobre uma edição manual mais recente | Tampering | D-38: leitura ao vivo + comparação obrigatória antes de qualquer `PUT`/`DELETE` de restauração |
| Falha real "desaparecendo" sem rastro (nem log, nem notificação) | Repudiation | `write_log` grava `status: 'failed'` mesmo quando a escrita real falha, ANTES ou durante o disparo do webhook — nunca só um `console.error` |
| Loop de retry infinito no webhook de notificação (URL fora do ar) | Denial of Service | `notifyWriteFailure` faz uma única tentativa (sem retry loop) — mesma disciplina de teto explícito já usada em `fetchWithRateLimit` (`MAX_429_RETRIES`), mas aqui simplesmente não há retry: uma falha de notificação só é logada localmente (`console.error`), nunca re-tentada indefinidamente |

## Sources

### Primary (HIGH confidence)
- Leitura direta do código-fonte do projeto: `client.js`, `write-executor.js`, `approval-gate.js`, `review-server.js`, `catalog-store.js`, `schema.sql`, `adaptive-limiter.js`, `nuvemshop-auth.js`, `write-executor.test.js`, `diff.js`, `review-queue.js`, `api/recommendations.js` — todas as convenções de código citadas nesta pesquisa vêm de leitura real dos arquivos, não de suposição.
- `npm view better-sqlite3 version` / `npm view vitest version` — confirmado contra o registry real: 12.11.1 e 4.1.10, idênticos ao `package.json`.

### Secondary (MEDIUM confidence)
- [Metafields | Nuvemshop API](https://tiendanube.github.io/api-documentation/resources/metafields) — endpoints GET/POST/PUT/DELETE, campos do objeto Metafield, escopo de `owner_resource` (products/product_variants/categories/pages). Comportamento de upsert por namespace+key NÃO documentado (confirmado por busca cruzada, ver Assumption A2).
- [Sending messages using incoming webhooks | Slack Developer Docs](https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks/) — payload mínimo `{"text": "..."}`.
- [Discord Webhook Guide — curl](https://birdie0.github.io/discord-webhooks-guide/tools/curl.html) — payload mínimo `{"content": "..."}`, resposta 204.

### Tertiary (LOW confidence)
- WebFetch direto de `tiendanube.github.io/api-documentation/resources/metafields` (sumarização por modelo pequeno) — usado para extrair os detalhes exatos de path/verbo (`PUT /metafields/{id}`), mas classificado LOW pelo seam de confiança do provider `webfetch`; tratado nesta pesquisa como `[CITED: tiendanube.github.io/api-documentation/resources/metafields]` por vir de documentação oficial, mas o planejador deve considerar uma verificação empírica real contra a API (ex: um teste manual de `PUT` antes de confiar 100% no path exato em produção).

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — zero pacotes novos, versões existentes confirmadas via `npm view` real.
- Architecture (client.js extensions, write_log schema, rollback CLI, webhook module): MEDIUM — endpoints de update/delete confirmados via documentação oficial (não testados ao vivo nesta pesquisa); schema/nomes de tabela são recomendação desta pesquisa dentro da Claude's Discretion do CONTEXT.md.
- Pitfalls: MEDIUM-HIGH — Pitfalls 1, 3, 4, 5 derivados de leitura direta do código real (alta confiança); Pitfall 2 (formato do value) é uma lacuna de design genuína, não uma suposição de risco baixo — está refletida como Assumption A1, não como fato.

**Research date:** 2026-07-16
**Valid until:** 2026-08-15 (30 dias — API pública estável, mas o endpoint de update de Metafield não foi testado ao vivo nesta pesquisa; se um teste manual de `PUT /metafields/{id}` revelar comportamento diferente do documentado, esta pesquisa deve ser revisada antes de confiar no Pattern 1/2 em produção)
