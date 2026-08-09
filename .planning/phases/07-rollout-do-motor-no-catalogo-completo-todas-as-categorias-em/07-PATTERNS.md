# Fase 7: Rollout do motor no catálogo completo — Mapa de Padrões

**Mapeado:** 2026-07-21
**Arquivos analisados:** 11 (novos + modificados)
**Analogs encontrados:** 10 / 11

Fase brownfield: quase todo artefato "novo" estende um dono existente no código. O padrão dominante é **flag persistido na ingestão + consumo puro no motor** e **orquestração no `run-daily-job.js`**. Todos os caminhos de escrita, notificação, diff e rollback já existem e são reaproveitados.

## Classificação de Arquivos

| Arquivo (novo/modificado) | Papel | Fluxo de dados | Analog mais próximo | Qualidade |
|---------------------------|-------|----------------|---------------------|-----------|
| `src/recommendation/recommendation-engine.js` (mod, D-55/56/57/58) | motor puro | transform | ele mesmo (refatorar `isEligibleCandidateInGroup`/`buildSortedPool`) | exato |
| `src/ingestion/ingest-catalog.js` (mod, D-58/D-66) | ingestão | file-I/O (API→DB) | ele mesmo (`snapshots.push` l.275) + `stock-availability.js` | exato |
| `src/db/schema.sql` + `catalog-store.js` (mod, D-58) | model/migração | CRUD | migração `product_group_canonical` (catalog-store.js l.38-43) | exato |
| `src/ingestion/stock-availability.js` (referência D-58) | utilitário | transform | ele mesmo (`hasAvailableGrade`) | exato |
| `src/review/write-executor.js` (mod, D-61/D-67) | serviço escrita | request-response | ele mesmo (`executeApprovedWrite`) | exato |
| `scripts/run-daily-job.js` (mod, D-61..D-69) | orquestrador | batch/event-driven | ele mesmo (`runDailyJob`) | exato |
| `scripts/rollback.js` (mod, CR-01) | serviço/CLI | request-response | ele mesmo (`performRollback`) | exato |
| `scripts/rollback-batch.js` (novo, D-65) | serviço/CLI batch | batch | `performRollback` + CLI de `rollback.js` | role-match |
| Disjuntor/circuit breaker (novo, D-63) | utilitário guarda | transform+event | `tripBreaker` (design) + baseline via `write_log` | role-match |
| Kill switch (novo, D-62) | config/orquestração | config | `resolveMinSizesInStock` + `vars.MIN_SIZES_IN_STOCK` no YAML | exato |
| Relatório de cobertura (novo, D-60) | script/report | batch read-only | `scripts/_scope.js` (protótipo) | role-match |

## Atribuições de Padrão

### `recommendation-engine.js` — modelo de 2 pesos + `published` (motor puro, transform)

**Analog:** o próprio arquivo. Motor puro, zero-import/zero-I/O (RULE-02). Refatorar 3 funções, **sem** tocar `composeGroupQuota`/`compareRecommendations`/cota 4+4.

**Padrão de elegibilidade a alterar** (`isEligibleCandidateInGroup`, l.144-163). O bloco de tecido atual (l.151-160) implementa o override 2026-07-17 que **exclui** candidato de tecido diferente quando ambos têm tecido — isso é o que D-55/D-57 substitui. Novo comportamento: tecido nunca exclui (vira peso 2); adicionar guarda de visibilidade:
```javascript
if (!candidate.hasAvailableGrade) return false;
if (candidate.published === false) return false;   // NOVO D-58 — só === false é oculto (nunca null)
if (candidate.colorValue == null) return false;
if (candidate.productGroupCanonical !== targetGroup) return false;
// remover o if(considerFabric){...bothHaveFabric...return false} — tecido não exclui mais
return normalizeMatchValue(candidate.colorValue) === normalizeMatchValue(source.colorValue);
```

**Padrão de ranking a estender** (`buildSortedPool`, l.176-181). Hoje ordena só por `compareRecommendations` (cascata D-13). D-56 exige partição por peso ACIMA de D-13: mapear candidato → peso, `sort((a,b) => (a.weight-b.weight) || compareRecommendations(a.rec,b.rec))`. Peso 1 = E+C+T (ambos têm tecido e batem); peso 2 = resto. No bloco cruzado (`considerFabric:false`) tudo é peso 2.

**Guarda de fonte oculta** (`recommendForProduct`, após l.365 `if (source.colorValue == null) return []`): adicionar `if (source.published === false) return [];` (D-58 — fonte oculta não gera vitrine). Mesma disciplina fail-closed do bloco `sourceGroup == null` (l.371-372).

**Shape a estender** (`CatalogProductEntry` typedef l.53-61): adicionar `@property {boolean} published`. Mesma linha de `hasAvailableGrade` (l.59) — flag persistido, consumido pronto.

---

### `ingest-catalog.js` — persistir `published` (ingestão, API→DB)

**Analog:** o próprio `snapshots.push` (l.275-285) e `hasAvailableGrade` em `stock-availability.js`.

**Padrão de flag persistido** — estender o objeto de snapshot exatamente como `hasAvailableGrade` (l.277), com coerção defensiva idêntica (1/0):
```javascript
snapshots.push({
  productId,
  hasAvailableGrade: availableGrade ? 1 : 0,
  published: product.published === true ? 1 : 0,   // NOVO D-58 — campo boolean da API Nuvemshop
  sizesInStockCount,
  // ...demais campos
});
```
**Não** filtrar por `?published=true` na query (Pitfall 5 do RESEARCH): ingerir todos e persistir o flag, para o motor decidir candidato E fonte.

**Padrão de regra nomeada configurável por env** (`stock-availability.js` header l.4-8 + `hasAvailableGrade` l.35): estoque nunca é `stock>0` inline. A visibilidade segue o mesmo espírito — leitura na borda (ingestão), consumo puro no motor.

**Defesa 1 (D-66)** vive aqui + orquestrador: capturar `{ categoria: count }` antes do merge/dedup (Open Question 1 do RESEARCH — não é persistido hoje). Banda de total vs. run anterior lê `ingestion_runs.products_read`.

---

### `catalog-store.js` + `schema.sql` — migração de coluna (model, CRUD)

**Analog exato:** migração idempotente de `product_group_canonical` (catalog-store.js l.34-43). Copiar o padrão literal:
```javascript
const catalogSnapshotColumns = db.prepare('PRAGMA table_info(catalog_snapshots)').all();
const hasPublishedColumn = catalogSnapshotColumns.some((c) => c.name === 'published');
if (!hasPublishedColumn) {
  db.exec('ALTER TABLE catalog_snapshots ADD COLUMN published INTEGER');
}
```
Roda toda vez que o módulo abre o banco (idempotente). Produtos pré-migração ficam `NULL` até re-ingestão — o motor trata só `=== false` como oculto (Pitfall 2/A6). Adicionar `published` também ao `insertSnapshot` (l.60-68) e ao shape materializado em `getLatestSnapshotProducts` (l.277-283, ao lado de `hasAvailableGrade: row.has_available_grade === 1`).

**Baseline do disjuntor (D-63):** adicionar `getLastWrittenValuesForAllProducts()` (última linha `status='success'` por `product_id`, array JSON completo de `write_log.written_value`). NÃO usar `recommendation_baseline` (singular/legado — Anti-Pattern).

---

### `write-executor.js` — caminho `scheduled` + Defesa 2 (serviço, request-response)

**Analog exato:** `executeApprovedWrite` (l.36-87). O ponto único de escrita. Reaproveitar toda a mecânica de `findMetafield`→`updateMetafield`/`createMetafield`→`insertWriteLog` (l.46-63) e o `dryRun` early-return (l.39-41) que vira o kill switch.

**Mudança D-61 (aposenta gate APRV-03):** hoje `assertApproved` é a 1ª operação (l.37) e lança `ApprovalRequiredError`. O caminho `scheduled` **não** passa pelo gate. Não fabricar `{status:'approved'}` (Anti-Pattern / o que `_batch-write.js` faz). Gravar `triggeredBy:'scheduled'` no `write_log` (hoje hardcoded `'manual'`, l.59 e l.72).

**Padrão de erro + notificação a preservar** (l.66-86): try/catch grava linha `failed` em `write_log` E chama `notifyWriteFailure(...).catch(() => {})` sem mascarar o erro relançado. Manter idêntico no caminho `scheduled`.

**Defesa 2 (D-67)** filtra os IDs recomendados contra o snapshot atual (existe/visível/estoque/mesma cor) **antes** de `JSON.stringify(approvedIds)` (l.43). Conjunto vazio pós-filtro → lacuna registrada, nunca lixo.

---

### `run-daily-job.js` — orquestrador dos guardas (batch/event-driven)

**Analog exato:** `runDailyJob` (l.58-79) + bloco CLI ESM (l.84-109). É onde vivem idempotência (l.59-67), `runIngestion` (l.69), leitura de snapshot+baseline (l.71-74) e `buildReviewQueue` (l.74). Estender a sequência: Defesa 1 → motor → diff → disjuntor → kill switch → Defesa 2 → escrita → resumo diário.

**Padrão de disciplina de processo a preservar** (header l.19-23 + l.101): a função exportada NUNCA fecha a conexão nem chama `process.exit`; `checkpointAndCloseDb()` é a ÚLTIMA operação, só no bloco CLI. Testes importam a função sem efeito de rede/DB.

**Padrão de lista canônica** (l.37, l.90-91): as 11 categorias vêm de `ALL_TAXONOMY_CATEGORY_NAMES` (fonte única), nunca digitadas no YAML.

**Kill switch (D-62)** — espelhar `resolveMinSizesInStock` (ingest-catalog.js l.30-33) numa `resolveWriteEnabled()`; `WRITE_OVERRIDE` (dispatch input) tem prioridade sobre `WRITE_ENABLED` (var); ausente ⇒ dry-run seguro. `const dryRun = !resolveWriteEnabled()` passado a cada escrita.

**Resumo diário (D-69) e disjuntor (D-63)** reusam `notifyWriteFailure` — ver Padrões Compartilhados. Diff real via `computeDiff`/`hasChanged`/`buildReviewQueue` (não comparador ad-hoc).

---

### `rollback.js` — correção CR-01 (serviço/CLI, request-response)

**Analog exato:** `performRollback` (l.51-83). O bug: `existing` pode ser `null` no rollback duplo (Metafield já deletado), mas l.65-68 e l.73 dereferenciam `existing.id` incondicionalmente.

**Correção (após a guarda de conflito l.60-62):** tratar `existing == null` — se `restoredValue == null` → no-op; senão → `createMetafield` (recria, não `updateMetafield`). No `insertWriteLog` (l.70-80) usar `metafieldId: existing ? existing.id : (result && result.id) || null`, nunca `existing.id` cru. Ver Code Examples do RESEARCH (l.392-428). Preservar `RollbackConflictError` (l.28-36) e o idioma ESM CLI-only (l.88-100).

---

### `rollback-batch.js` (novo) — rollback em lote (serviço/CLI batch)

**Analog:** `performRollback` (envolver, não reescrever — mandatório reusar D-38) + idioma CLI de `rollback.js` (l.88-100). Iterar sobre produtos (ou `write_log` de um `run_id`), chamar `performRollback` por produto, **agregar** falhas/`RollbackConflictError` sem abortar o lote inteiro. Só usar após CR-01 corrigido.

---

### Relatório de cobertura (novo, D-60) — script read-only (batch)

**Analog:** `scripts/_scope.js` (protótipo TEMP, l.1-27) — já lê snapshot em estoque por grupo (`has_available_grade=1 AND product_group_canonical IS NOT NULL`) e conta `recommendForProduct(...).length > 0` por grupo. Promover a código permanente: adicionar **motivo item-a-item das zeradas** (sem par mesma-cor-em-estoque no grupo; fonte sem cor; oculta) e **flag de reprocesso** (sem tecido canônico → taguear e rerodar). Leitura pura sobre snapshot + motor. Formato à discrição.

## Padrões Compartilhados

### Flag persistido consumido pelo motor puro (D-58)
**Fonte:** `stock-availability.js` `hasAvailableGrade` + `ingest-catalog.js` `snapshots.push` (l.277) + `catalog-store.js` shape (l.281).
**Aplicar a:** motor + ingestão. Leitura na borda, coerção 1/0, consumo puro. `published` é o segundo flag, idêntico ao `hasAvailableGrade`.

### Migração de schema idempotente
**Fonte:** `catalog-store.js` l.34-43 (`PRAGMA table_info` + `ALTER TABLE` condicional).
**Aplicar a:** coluna `published` em `catalog_snapshots`.

### Notificação/degradação graciosa (disjuntor D-63, resumo diário D-69)
**Fonte:** `notify-failure.js` `notifyWriteFailure` (l.19-59) — nunca lança, degrada sem webhook, payload sem credencial.
**Aplicar a:** disparo do disjuntor (`notifyWriteFailure({ productId:'daily-job', error:new Error(reason), triggeredBy:'scheduled' })`) e resumo diário. Sempre `.catch(() => {})` no call site (ver write-executor l.83).

### Toggle operacional via `vars.*` → env
**Fonte:** `daily-recompute.yml` l.35-45 (`MIN_SIZES_IN_STOCK: ${{ vars.MIN_SIZES_IN_STOCK }}`) + `resolveMinSizesInStock` (ingest-catalog.js l.30-33).
**Aplicar a:** `WRITE_ENABLED` (var persistente) + `write` (workflow_dispatch input) para o kill switch. Ausente ⇒ dry-run. Não usar secret (não é legível de volta).

### Idioma ESM CLI-only + disciplina de conexão
**Fonte:** `rollback.js` l.88-100 e `run-daily-job.js` l.84-109.
**Aplicar a:** todo script novo (`rollback-batch.js`, relatório). Corpo CLI atrás de `import.meta.url === pathToFileURL(process.argv[1]).href`; `checkpointAndCloseDb`/`process.exit` só no bloco CLI.

### Diff / mudança real (D-68) — não reconstruir
**Fonte:** `diff.js` `computeDiff` (l.72), `review-queue.js` `hasChanged` (l.28) / `buildReviewQueue` (l.53).
**Aplicar a:** orquestrador só itera sobre a fila de mudanças reais (baixo volume).

## Sem Analog Encontrado

| Arquivo | Papel | Fluxo | Motivo |
|---------|-------|-------|--------|
| Disjuntor / circuit breaker (D-63) | utilitário guarda | transform+event | Nenhum guard de magnitude de batch existe hoje; só há guarda de idempotência (run-daily-job l.59-67) e de conflito por-produto (`RollbackConflictError`). Design em RESEARCH Code Examples (`tripBreaker`, l.463-484); baseline via novo `getLastWrittenValuesForAllProducts()`. Reusa `notifyWriteFailure` para o disparo. |

## Metadados

**Escopo de busca:** `app-partners-recomendados/{src,scripts,.github/workflows}`
**Arquivos lidos integralmente:** rollback.js, write-executor.js, stock-availability.js, run-daily-job.js, notify-failure.js, recommendation-engine.js, _scope.js, daily-recompute.yml
**Leituras direcionadas:** catalog-store.js (migração l.34-90, shape l.113-284), ingest-catalog.js (l.30-37, l.275-294), diff.js/review-queue.js (assinaturas exportadas)
**Data:** 2026-07-21
