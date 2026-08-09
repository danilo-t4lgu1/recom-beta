---
phase: 02-ingest-o-de-cat-logo-e-qualidade-de-dados
plan: 02
subsystem: database
tags: [better-sqlite3, sqlite, vitest, nuvemshop, ingestion, tdd]

# Dependency graph
requires:
  - phase: 02-01
    provides: "listCategories()/listProducts() paginados em client.js, AdaptiveRateLimiter/fetchWithRateLimit, category_id de Vestidos confirmado (36839648) via loja real"
provides:
  - "Schema SQLite completo (ingestion_runs, products, variants, catalog_snapshots, fabric_tag_canonical_map, fabric_tag_audit, recommendation_baseline) em src/db/schema.sql"
  - "catalog-store.js: startIngestionRun/persistIngestionBatch/finishIngestionRun exportados, nunca expõe o objeto db cru, escreve exclusivamente via prepared statements"
  - "stock-availability.js: getVariantStock/hasAvailableGrade — regra D-04 'grade >= 3 tamanhos em estoque' isolada e testada via TDD"
  - "fabric-taxonomy.js: auditFabricTags() lendo o campo NATIVO product.tags (decisão confirmada por checkpoint humano, Open Question A4), sem fuzzy-matching"
  - "ingest-catalog.js: runIngestion() orquestrador validado contra a categoria Vestidos real (645 produtos, 2 execuções consecutivas confirmadas)"
affects: [02-03, motor de recomendação Fase 3, qualquer leitura futura de tags de tecido]

# Tech tracking
tech-stack:
  added: [better-sqlite3@12.11.1]
  patterns:
    - "catalog-store.js aplica schema.sql via db.exec(readFileSync(...)) na abertura, caminho resolvido via import.meta.url/fileURLToPath (independente do cwd)"
    - "persistIngestionBatch() envolve todos os inserts (produtos/variantes/snapshots/auditoria/baseline) em uma única db.transaction()"
    - "auditFabricTags() roda uma vez por lote inteiro dentro de runIngestion(), nunca por produto"
    - "ingestion_runs sempre finalizado via try/catch: sucesso chama finishIngestionRun('success'), qualquer exceção chama finishIngestionRun('failed') antes de relançar"

key-files:
  created:
    - app-partners-recomendados/src/db/schema.sql
    - app-partners-recomendados/src/db/catalog-store.js
    - app-partners-recomendados/src/ingestion/stock-availability.js
    - app-partners-recomendados/src/ingestion/stock-availability.test.js
    - app-partners-recomendados/src/ingestion/fabric-taxonomy.js
    - app-partners-recomendados/src/ingestion/fabric-taxonomy.test.js
    - app-partners-recomendados/src/ingestion/ingest-catalog.js
  modified:
    - app-partners-recomendados/.gitignore
    - app-partners-recomendados/package.json

key-decisions:
  - "CHECKPOINT (Task 0, Open Question A4): tag de tecido vive no campo NATIVO product.tags, não em Metafield customizado — resposta direta do usuário ('Tags nativas'), registrada abaixo com rationale completo"
  - "Tabela append-only catalog_snapshots confirmada como correta para D-11: 2 execuções reais produziram 1290 linhas (645 x 2), preservando histórico, enquanto products/variants permanecem em 645 (upsert de estado mais recente)"
  - "fabric_tag_audit confirmada como regenerada a cada execução (não só na primeira): 366 tags distintas auditadas tanto em run_id=1 quanto run_id=2"
  - "gitignore original (data/*.db) não cobria os arquivos sidecar WAL/SHM do modo journal_mode=WAL do better-sqlite3 — corrigido para incluir data/*.db-wal e data/*.db-shm antes de qualquer commit acidental (Rule 2)"

patterns-established:
  - "Pattern: módulos puros de regra de negócio (stock-availability.js, fabric-taxonomy.js) desenvolvidos via TDD (RED commit -> GREEN commit), sem I/O, colocated com *.test.js"
  - "Pattern: toda escrita SQL usa db.prepare(...).run(params) com parâmetros @nomeados — nunca concatenação de string com dado de produto (T-02-04)"

requirements-completed: [DATA-01, DATA-03]

# Metrics
duration: 55min
completed: 2026-07-10
status: complete
---

# Phase 2 Plan 2: Schema SQLite, disponibilidade de estoque e auditoria de tags de tecido Summary

**Catálogo real da categoria Vestidos (645 produtos, 3268 variantes) ingerido e persistido em SQLite via transação única, com regra "grade >= 3 tamanhos" (D-04) e auditoria contínua de tags nativas (DATA-03) validadas contra 2 execuções reais consecutivas.**

## Checkpoint Resolvido (Task 0 — Open Question A4)

**Pergunta:** A tag de tipo de tecido vive no campo nativo `product.tags` (lista de strings separadas por vírgula, compartilhada com outras tags de marketing/SEO) ou em um Metafield customizado dedicado (e, se sim, qual namespace/key)?

**Resposta do usuário:** "Tags nativas" — o campo `product.tags` existente será usado, misturando valores de tipo de tecido com as tags de marketing/SEO já existentes (ex: "moda fashion", "vestido", "ziper", "abertura" — confirmados via inspeção real de 5 produtos e, depois, via ingestão real de 645 produtos).

**Rationale:** Nenhum produto real inspecionado tinha tag de tecido nem Metafield customizado preenchido hoje (D-06 confirmado empiricamente: a auditoria real encontrou 366 tags distintas, nenhuma delas reconhecível como tipo de tecido — são todas tags de marketing/SEO). Essa é uma decisão arquitetural prospectiva para a futura importação via planilha (D-07): quando o usuário popular as tags de tecido, elas entrarão no mesmo campo `tags`, não em um Metafield separado.

**Impacto na implementação:** `fabric-taxonomy.js` foi implementado lendo `product.tags` diretamente (`.split(',').map(trim).filter(Boolean)`), exatamente como o "Caminho A" já previsto em `02-RESEARCH.md ## Architecture Patterns > Pattern 3`. Nenhuma chamada extra a `getMetafields()` foi necessária para a leitura de tags de tecido.

## Performance

- **Duration:** 55 min
- **Started:** 2026-07-10T~19:50Z (aprox., retomada pós-checkpoint)
- **Completed:** 2026-07-10T~20:45Z (aprox.)
- **Tasks:** 3 (+ Task 0 checkpoint resolvido)
- **Files modified:** 9 (7 criados, 2 modificados)

## Accomplishments
- `hasAvailableGrade`/`getVariantStock` implementados via TDD (RED->GREEN), cobrindo os 6 comportamentos do plano incluindo resiliência a produto malformado (T-02-06)
- `auditFabricTags` implementado via TDD (RED->GREEN), cobrindo os 5 comportamentos incluindo ausência de fuzzy-matching (T-02-07)
- Schema SQLite completo criado com as 7 tabelas especificadas em RESEARCH.md, `catalog-store.js` expondo apenas funções nomeadas (nunca o objeto `db` cru), toda escrita via prepared statements
- `runIngestion()` executado 2 vezes contra a categoria Vestidos real (não simulação): 645 produtos, 3268 variantes, `category_id=36839648` (mesmo valor confirmado em 02-01), `ingestion_runs.status='success'` em ambas as execuções
- Confirmado empiricamente que `catalog_snapshots` é append-only corretamente (1290 linhas após 2 execuções = 645x2) enquanto `products`/`variants` refletem apenas o estado mais recente (upsert, ainda 645/3268)
- Confirmado empiricamente que `fabric_tag_audit` é regenerada a cada execução (366 tags distintas auditadas em `run_id=1` e novamente em `run_id=2`, não deixado estático da primeira execução)

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): failing test for stock availability grade rule** - `91b8cf1` (test)
2. **Task 1 (GREEN): stock-availability.js implementation** - `26d8f72` (feat)
3. **Task 2 (RED): failing test for fabric tag taxonomy audit** - `5e2d9fe` (test)
4. **Task 2 (GREEN): fabric-taxonomy.js implementation (native product.tags)** - `5e2d948` (feat)
5. **Task 3: schema.sql, catalog-store.js, ingest-catalog.js orchestrator** - `740d4aa` (feat)
6. **Deviation fix: gitignore WAL/SHM sidecar files** - `7e461e1` (fix)

**Plan metadata:** (este commit, a seguir)

## Files Created/Modified
- `app-partners-recomendados/src/ingestion/stock-availability.js` - `getVariantStock`/`hasAvailableGrade`, regra D-04 nomeada e configurável
- `app-partners-recomendados/src/ingestion/stock-availability.test.js` - 6 comportamentos, vitest
- `app-partners-recomendados/src/ingestion/fabric-taxonomy.js` - `auditFabricTags` lendo `product.tags` nativo (decisão do checkpoint), sem fuzzy-matching
- `app-partners-recomendados/src/ingestion/fabric-taxonomy.test.js` - 5 comportamentos, vitest
- `app-partners-recomendados/src/db/schema.sql` - DDL das 7 tabelas (ingestion_runs, products, variants, catalog_snapshots, fabric_tag_canonical_map, fabric_tag_audit, recommendation_baseline)
- `app-partners-recomendados/src/db/catalog-store.js` - wrapper better-sqlite3, funções nomeadas, prepared statements, transação única
- `app-partners-recomendados/src/ingestion/ingest-catalog.js` - `runIngestion()` orquestrador completo
- `app-partners-recomendados/.gitignore` - adiciona `data/*.db`, `data/*.db-wal`, `data/*.db-shm`
- `app-partners-recomendados/package.json` - adiciona `better-sqlite3@^12.11.1` como dependency

## Decisions Made
- Checkpoint A4 resolvido: tags nativas de `product.tags`, não Metafield (ver seção dedicada acima)
- Tabela append-only simples (não trigger-based/bitmask) confirmada suficiente para D-11 em execução real
- Auditoria de tags roda 1x por lote inteiro dentro de `runIngestion()`, não por produto individual (evita custo redundante e mantém a semântica "frequência do lote inteiro" do plano)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] gitignore não cobria arquivos sidecar WAL/SHM do SQLite**
- **Found during:** Verificação manual pós-Task 3 (execução real de `runIngestion()`)
- **Issue:** O plano especificava apenas `data/*.db` no `.gitignore`. Como `catalog-store.js` ativa `journal_mode = WAL`, o better-sqlite3 cria também `data/catalog.db-wal` e `data/catalog.db-shm` — arquivos que o padrão `data/*.db` não cobre, o que teria vazado esses sidecars para o controle de versão no primeiro `git add` acidental (T-02-05, Information Disclosure).
- **Fix:** Adicionadas as linhas `data/*.db-wal` e `data/*.db-shm` ao `.gitignore`.
- **Files modified:** `app-partners-recomendados/.gitignore`
- **Verification:** `git status --short --ignored app-partners-recomendados/data/` confirma que todo o conteúdo do diretório (incluindo os 3 arquivos reais gerados pela execução) está marcado `!!` (ignorado).
- **Commit:** `7e461e1`

---

**Total deviations:** 1 auto-fixed (1 missing critical/security)
**Impact on plan:** Necessário para cumprir integralmente a intenção de T-02-05 (nunca vazar arquivo operacional de banco de dados). Sem scope creep — mesma superfície (`.gitignore`), apenas mais completa.

## Issues Encountered
None além da deviation acima.

## User Setup Required

None - nenhuma configuração externa necessária. `better-sqlite3` instalado localmente via `npm install` dentro de `app-partners-recomendados/`. O checkpoint humano da Task 0 já foi resolvido pela resposta do usuário ("Tags nativas") antes desta execução ser retomada.

## Next Phase Readiness
- `data/catalog.db` populado com o catálogo real e completo da categoria Vestidos (645 produtos), pronto para o Plano 03 (ou Fase 3) consumir como fonte de verdade, sem precisar chamar a API da Nuvemshop diretamente
- Infraestrutura de auditoria de tags de tecido (`fabric_tag_canonical_map`/`fabric_tag_audit`) pronta para ser alimentada assim que o usuário popular a planilha de tags via campo nativo `tags` (D-07) — nenhuma mudança de código será necessária nessa hora, pois a decisão do checkpoint já direcionou a implementação para o campo correto
- Regra de disponibilidade de estoque "grade >= 3 tamanhos" (D-04) validada com dados reais: 158 de 645 produtos (24.5%) da categoria Vestidos estão hoje com grade disponível
- Nenhum bloqueio identificado para o Plano 03

---
*Phase: 02-ingest-o-de-cat-logo-e-qualidade-de-dados*
*Completed: 2026-07-10*

## Self-Check: PASSED

- FOUND: app-partners-recomendados/src/db/schema.sql
- FOUND: app-partners-recomendados/src/db/catalog-store.js
- FOUND: app-partners-recomendados/src/ingestion/stock-availability.js
- FOUND: app-partners-recomendados/src/ingestion/stock-availability.test.js
- FOUND: app-partners-recomendados/src/ingestion/fabric-taxonomy.js
- FOUND: app-partners-recomendados/src/ingestion/fabric-taxonomy.test.js
- FOUND: app-partners-recomendados/src/ingestion/ingest-catalog.js
- FOUND: commit 91b8cf1 (test)
- FOUND: commit 26d8f72 (feat)
- FOUND: commit 5e2d9fe (test)
- FOUND: commit 5e2d948 (feat)
- FOUND: commit 740d4aa (feat)
- FOUND: commit 7e461e1 (fix)
