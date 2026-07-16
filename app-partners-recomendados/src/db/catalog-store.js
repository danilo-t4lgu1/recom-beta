// Wrapper better-sqlite3 do catálogo ingerido (D-10/D-11).
//
// Abre `data/catalog.db` (WAL, leitura concorrente segura durante escrita), aplica
// `schema.sql` na abertura (idempotente via CREATE TABLE IF NOT EXISTS) e exporta
// apenas funções nomeadas — NUNCA o objeto `db`/`Database` cru (mesma convenção de
// `nuvemshop-client/client.js`: um wrapper de recurso externo, funções focadas).
//
// Segurança (T-02-04, Security Domain V5/Tampering do 02-RESEARCH.md): toda escrita
// usa exclusivamente `db.prepare(...).run(params)` com parâmetros nomeados — nunca
// concatenação de string SQL com dado de produto (nome, tags, etc. vêm de uma API
// externa e não são confiáveis por default).

import Database from 'better-sqlite3';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(__dirname, 'schema.sql');
// WR-04: resolve relativo ao módulo (não a process.cwd()) — consistente com
// SCHEMA_PATH acima — e garante que o diretório exista antes de abrir o arquivo,
// já que better-sqlite3 não cria diretórios pai automaticamente.
// CATALOG_DB_DIR (opcional): override existe SOMENTE para permitir que testes de
// integração (catalog-store.test.js) apontem para um diretório temporário isolado,
// nunca tocando o data/catalog.db real de desenvolvimento. Comportamento em
// produção/uso normal (variável ausente) é idêntico ao anterior.
const DB_DIR = process.env.CATALOG_DB_DIR || join(__dirname, '..', '..', 'data');
mkdirSync(DB_DIR, { recursive: true });

const db = new Database(join(DB_DIR, 'catalog.db'));
db.pragma('journal_mode = WAL');
db.exec(readFileSync(SCHEMA_PATH, 'utf-8'));

// Migração idempotente (Pitfall 2 do 03.1-RESEARCH.md): `CREATE TABLE IF NOT EXISTS`
// acima é NO-OP contra um banco já existente no disco — não adiciona colunas novas
// retroativamente. Esta checagem roda TODA VEZ que o módulo abre o banco (mesma
// disciplina de idempotência do CREATE TABLE IF NOT EXISTS), não apenas na primeira.
const catalogSnapshotColumns = db.prepare('PRAGMA table_info(catalog_snapshots)').all();
const hasGroupColumn = catalogSnapshotColumns.some((c) => c.name === 'product_group_canonical');
if (!hasGroupColumn) {
  db.exec('ALTER TABLE catalog_snapshots ADD COLUMN category_raw TEXT');
  db.exec('ALTER TABLE catalog_snapshots ADD COLUMN product_group_canonical TEXT');
}

const insertProduct = db.prepare(
  `INSERT INTO products (id, name, handle, canonical_url, last_seen_run_id)
   VALUES (@id, @name, @handle, @canonicalUrl, @runId)
   ON CONFLICT(id) DO UPDATE SET name=excluded.name, handle=excluded.handle,
     canonical_url=excluded.canonical_url, last_seen_run_id=excluded.last_seen_run_id`
);

const insertVariant = db.prepare(
  `INSERT INTO variants (id, product_id, sku, color_value, size_value, stock_total, last_seen_run_id)
   VALUES (@id, @productId, @sku, @colorValue, @sizeValue, @stockTotal, @runId)
   ON CONFLICT(id) DO UPDATE SET product_id=excluded.product_id, sku=excluded.sku,
     color_value=excluded.color_value, size_value=excluded.size_value,
     stock_total=excluded.stock_total, last_seen_run_id=excluded.last_seen_run_id`
);

const insertSnapshot = db.prepare(
  `INSERT INTO catalog_snapshots
     (run_id, product_id, has_available_grade, sizes_in_stock_count,
      fabric_tag_raw, fabric_tag_canonical, color_value, category_raw,
      product_group_canonical, snapshot_at)
   VALUES (@runId, @productId, @hasAvailableGrade, @sizesInStockCount,
      @fabricTagRaw, @fabricTagCanonical, @colorValue, @categoryRaw,
      @productGroupCanonical, @snapshotAt)`
);

const insertFabricAudit = db.prepare(
  `INSERT INTO fabric_tag_audit (run_id, raw_tag, occurrence_count, is_mapped)
   VALUES (@runId, @rawTag, @occurrenceCount, @isMapped)`
);

const insertRecommendationBaseline = db.prepare(
  `INSERT INTO recommendation_baseline (product_id, run_id, current_recommended_product_id, read_at)
   VALUES (@productId, @runId, @currentRecommendedProductId, @readAt)
   ON CONFLICT(product_id, run_id) DO UPDATE SET
     current_recommended_product_id=excluded.current_recommended_product_id,
     read_at=excluded.read_at`
);

const insertIngestionRun = db.prepare(
  `INSERT INTO ingestion_runs (started_at, category_id, category_name, status)
   VALUES (@startedAt, @categoryId, @categoryName, 'running')`
);

const updateIngestionRun = db.prepare(
  `UPDATE ingestion_runs SET finished_at = @finishedAt, status = @status, products_read = @productsRead
   WHERE id = @runId`
);

const selectCanonicalMap = db.prepare(
  `SELECT raw_tag, canonical_value FROM fabric_tag_canonical_map`
);

// 03-02: leitura do snapshot real para o motor de recomendação (D-17).
const selectLatestSuccessfulRun = db.prepare(
  `SELECT id FROM ingestion_runs WHERE status = 'success' ORDER BY id DESC LIMIT 1`
);

const selectSnapshotsForRun = db.prepare(
  `SELECT s.product_id AS product_id, s.fabric_tag_canonical AS fabric_tag_canonical,
     s.has_available_grade AS has_available_grade, s.product_group_canonical AS product_group_canonical,
     p.name AS name
   FROM catalog_snapshots s
   JOIN products p ON p.id = s.product_id
   WHERE s.run_id = @runId
   ORDER BY s.product_id`
);

const selectVariantsForRun = db.prepare(
  `SELECT id, product_id, color_value, size_value, stock_total
   FROM variants
   WHERE last_seen_run_id = @runId
   ORDER BY product_id, id`
);

// Fase 4 (D-25, APRV-02/APRV-03): leitura de baseline por run + persistência/leitura
// da decisão de aprovação em approval_queue.
const selectBaselineForRunStmt = db.prepare(
  `SELECT product_id, current_recommended_product_id
   FROM recommendation_baseline
   WHERE run_id = @runId`
);

// created_at fica DE FORA do SET do DO UPDATE propositalmente — preserva o valor
// do primeiro INSERT em decisões subsequentes para o mesmo (product_id, run_id)
// (upsert, não append).
const upsertApprovalDecisionStmt = db.prepare(
  `INSERT INTO approval_queue
     (product_id, run_id, status, approved_recommendation_ids, decided_at, created_at)
   VALUES (@productId, @runId, @status, @approvedRecommendationIds, @decidedAt, @createdAt)
   ON CONFLICT(product_id, run_id) DO UPDATE SET
     status=excluded.status,
     approved_recommendation_ids=excluded.approved_recommendation_ids,
     decided_at=excluded.decided_at`
);

const selectApprovalDecisionStmt = db.prepare(
  `SELECT status, approved_recommendation_ids
   FROM approval_queue
   WHERE product_id = @productId AND run_id = @runId`
);

const selectApprovalQueueForRunStmt = db.prepare(
  `SELECT product_id, status, approved_recommendation_ids, decided_at
   FROM approval_queue
   WHERE run_id = @runId
   ORDER BY product_id`
);

// Fase 5 (D-41/D-42): write_log é simultaneamente snapshot (previous_value/
// written_value, WRTE-02) e log de auditoria (triggered_by/status/error_message/
// written_at, WRTE-04) — append-only, nunca upsert (mesma disciplina de
// catalog_snapshots/insertSnapshot acima).
const insertWriteLogStmt = db.prepare(
  `INSERT INTO write_log
     (product_id, run_id, metafield_id, previous_value, written_value,
      triggered_by, status, error_message, written_at)
   VALUES (@productId, @runId, @metafieldId, @previousValue, @writtenValue,
      @triggeredBy, @status, @errorMessage, @writtenAt)`
);

const selectLastSuccessfulWriteLogStmt = db.prepare(
  `SELECT * FROM write_log
   WHERE product_id = @productId AND status = 'success'
   ORDER BY written_at DESC
   LIMIT 1`
);

const selectAllWriteLogStmt = db.prepare(
  `SELECT * FROM write_log ORDER BY written_at DESC`
);

/**
 * Lê o snapshot completo do último run de ingestão com status 'success' e o
 * materializa no shape `CatalogProductEntry` consumido produto a produto por
 * `recommendForProduct` (D-17, `recommendation-engine.js`). NÃO filtra
 * elegibilidade aqui — `fabricTagCanonical` nulo, `hasAvailableGrade` falso, etc.
 * são deixados intactos no retorno; é o motor (D-15) quem decide o que é
 * elegível, nunca esta função de leitura.
 *
 * `colorValue` vem da PRIMEIRA variante do produto (ordem determinística de
 * `selectVariantsForRun`, `ORDER BY product_id, id`) na tabela `variants`, e
 * NÃO de `catalog_snapshots.color_value` (Claude's Discretion / IN-03 do
 * 03-CONTEXT.md): `catalog_snapshots.color_value` é derivada apenas da
 * primeira variante retornada pela API Nuvemshop no momento da ingestão e é
 * sabidamente não confiável para produtos multi-cor; `variants.color_value`
 * tem a granularidade correta por variante. Hoje (0 produtos multi-cor no
 * catálogo real) os dois valores coincidem na prática, mas a fonte escolhida
 * é a robusta.
 *
 * Nunca mistura runs: resolve o `run_id` mais recente com `status = 'success'`
 * via `selectLatestSuccessfulRun`, e tanto os snapshots quanto as variantes são
 * filtrados por esse mesmo `run_id`/`last_seen_run_id` — `products`/`variants`
 * são upsert de estado mais recente, `catalog_snapshots` é append-only por run
 * (ver header do arquivo), então o filtro por run garante que variantes de
 * produtos que saíram do catálogo em runs anteriores não vazem para o
 * snapshot atual.
 *
 * Se não houver nenhum run com status 'success' ainda, retorna `[]` (mesmo
 * padrão de `getCanonicalMap` com tabela vazia — comportamento esperado antes
 * da primeira ingestão bem-sucedida, nunca lança).
 *
 * `productGroupCanonical` (D-26) segue a mesma simetria de `fabricTagCanonical`: o
 * valor já canônico (lido de `catalog_snapshots.product_group_canonical`) passa
 * direto, `null` permanece `null`, sem filtro de elegibilidade aqui — é o motor
 * (D-15/D-27/D-28) quem decide o que é elegível. `category_raw` é persistida na
 * tabela para auditoria/histórico mas não é exposta neste shape (mesmo padrão de
 * `fabric_tag_raw`, que também não aparece em `CatalogProductEntry`).
 *
 * @returns {Array<{
 *   productId: string,
 *   name: string|null,
 *   colorValue: string|null,
 *   fabricTagCanonical: string|null,
 *   productGroupCanonical: string|null,
 *   hasAvailableGrade: boolean,
 *   variants: Array<{ variantId: string, sizeValue: string|null, stockTotal: number }>
 * }>}
 */
export function getLatestSnapshotProducts() {
  const latestRun = selectLatestSuccessfulRun.get();
  if (!latestRun) return [];

  const runId = latestRun.id;
  const snapshotRows = selectSnapshotsForRun.all({ runId });
  const variantRows = selectVariantsForRun.all({ runId });

  // Ordem determinística de selectVariantsForRun (ORDER BY product_id, id) garante
  // que a primeira ocorrência de cada product_id neste loop seja a "primeira
  // variante" per IN-03 — sem necessidade de um segundo lookup/find.
  const variantsByProduct = new Map();
  const firstColorByProduct = new Map();
  for (const row of variantRows) {
    const productId = String(row.product_id);
    if (!variantsByProduct.has(productId)) {
      variantsByProduct.set(productId, []);
      firstColorByProduct.set(productId, row.color_value);
    }
    variantsByProduct.get(productId).push({
      variantId: String(row.id),
      sizeValue: row.size_value,
      stockTotal: row.stock_total,
    });
  }

  return snapshotRows.map((row) => {
    const productId = String(row.product_id);

    return {
      productId,
      name: row.name,
      colorValue: firstColorByProduct.has(productId) ? firstColorByProduct.get(productId) : null,
      fabricTagCanonical: row.fabric_tag_canonical,
      productGroupCanonical: row.product_group_canonical,
      hasAvailableGrade: row.has_available_grade === 1,
      variants: variantsByProduct.get(productId) || [],
    };
  });
}

/**
 * Resolve o run_id do último snapshot bem-sucedido, sem duplicar a lógica interna já
 * usada por `getLatestSnapshotProducts` (D-25/APRV-02, Fase 4). Base para localizar
 * o run "atual" contra o qual toda decisão de aprovação (`upsertApprovalDecision`) e
 * leitura de baseline (`getBaselineForRun`) deve operar.
 * @returns {number|null} `null` se nenhum run com status 'success' existir ainda.
 */
export function getLatestSuccessfulRunId() {
  const latestRun = selectLatestSuccessfulRun.get();
  return latestRun ? latestRun.id : null;
}

/**
 * Lê o "antes" do diff de aprovação (D-25): o `current_recommended_product_id`
 * gravado em `recommendation_baseline` para um run específico. Primeira função de
 * leitura desta tabela (só existia escrita até a Fase 4) — `recommendation_baseline`
 * é escrita desde a Fase 2 (DATA-02), sem lógica de drift (D-12).
 * @param {{ runId: number|null }} params
 * @returns {Map<string, string|null>} chave = productId (string, mesma convenção de
 *   `getLatestSnapshotProducts`), valor = current_recommended_product_id (string ou
 *   null). `runId` nulo ou sem nenhuma linha retorna `Map` vazio, nunca lança.
 */
export function getBaselineForRun({ runId }) {
  if (runId == null) return new Map();
  const rows = selectBaselineForRunStmt.all({ runId });
  return new Map(rows.map((row) => [String(row.product_id), row.current_recommended_product_id]));
}

/**
 * Persiste a decisão de aprovação/rejeição de um produto para um run (D-25,
 * APRV-02/APRV-03): SEMPRE o conjunto EXATO de ids aprovados, nunca um booleano.
 * Upsert por (productId, runId) — chamada repetida SOBRESCREVE status/
 * approvedRecommendationIds/decidedAt da decisão anterior, mas preserva o
 * `created_at` do primeiro registro (upsert, não append; ver `upsertApprovalDecisionStmt`).
 * @param {{ productId: string, runId: number, status: 'approved'|'rejected',
 *   approvedRecommendationIds: string[]|null, decidedAt: string }} params
 * @returns {void}
 */
export function upsertApprovalDecision({ productId, runId, status, approvedRecommendationIds, decidedAt }) {
  upsertApprovalDecisionStmt.run({
    productId: String(productId),
    runId,
    status,
    approvedRecommendationIds: approvedRecommendationIds != null ? JSON.stringify(approvedRecommendationIds) : null,
    decidedAt,
    createdAt: new Date().toISOString(),
  });
}

/**
 * Lê a decisão de aprovação já registrada para um produto+run (base do gate
 * `assertApproved`, Plano 04-03). "Sem decisão" é um estado válido, não um erro.
 * @param {{ productId: string, runId: number }} params
 * @returns {{ status: 'approved'|'rejected', approvedRecommendationIds: string[]|null }|null}
 *   `null` se não houver nenhuma linha para (productId, runId), nunca lança.
 */
export function getApprovalDecision({ productId, runId }) {
  const row = selectApprovalDecisionStmt.get({ productId: String(productId), runId });
  if (!row) return null;
  return {
    status: row.status,
    approvedRecommendationIds: row.approved_recommendation_ids ? JSON.parse(row.approved_recommendation_ids) : null,
  };
}

/**
 * Lista todas as decisões de aprovação já tomadas para um run, ordenadas por
 * product_id — interface que a Fase 5 consome para saber o que escrever na loja.
 * @param {{ runId: number }} params
 * @returns {Array<{ productId: string, status: string, approvedRecommendationIds: string[]|null, decidedAt: string|null }>}
 */
export function listApprovalQueueChanges({ runId }) {
  return selectApprovalQueueForRunStmt.all({ runId }).map((row) => ({
    productId: row.product_id,
    status: row.status,
    approvedRecommendationIds: row.approved_recommendation_ids ? JSON.parse(row.approved_recommendation_ids) : null,
    decidedAt: row.decided_at,
  }));
}

/**
 * Traduz uma linha crua (snake_case) de `write_log` para o shape camelCase
 * consumido por `getLastSuccessfulWriteLog`/`listWriteLog` — mesmo padrão de
 * tradução já usado por `getApprovalDecision`/`listApprovalQueueChanges`.
 * @param {object} row linha crua retornada por `db.prepare(...).get()/.all()`
 * @returns {{ productId: string, runId: number|null, metafieldId: string|null,
 *   previousValue: string|null, writtenValue: string|null, triggeredBy: string,
 *   status: string, errorMessage: string|null, writtenAt: string }}
 */
function mapWriteLogRow(row) {
  return {
    productId: row.product_id,
    runId: row.run_id,
    metafieldId: row.metafield_id,
    previousValue: row.previous_value,
    writtenValue: row.written_value,
    triggeredBy: row.triggered_by,
    status: row.status,
    errorMessage: row.error_message,
    writtenAt: row.written_at,
  };
}

/**
 * Insere exatamente 1 linha nova em `write_log` a cada chamada — nunca upsert/update
 * (append-only, D-41). `write_log` serve simultaneamente de snapshot
 * (`previousValue`/`writtenValue`, WRTE-02) e de log de auditoria (`triggeredBy`/
 * `status`/`errorMessage`/`writtenAt`, WRTE-04) numa única linha por tentativa de
 * escrita real de Metafield (sucesso ou falha) — consumida pelo Plano 05-03.
 * @param {{ productId: string, runId: number|null, metafieldId: string|null,
 *   previousValue: string|null, writtenValue: string|null,
 *   triggeredBy: 'manual'|'scheduled'|'rollback', status: 'success'|'failed',
 *   errorMessage: string|null, writtenAt: string }} params
 * @returns {void}
 */
export function insertWriteLog({
  productId,
  runId,
  metafieldId,
  previousValue,
  writtenValue,
  triggeredBy,
  status,
  errorMessage,
  writtenAt,
}) {
  insertWriteLogStmt.run({
    productId: String(productId),
    runId: runId ?? null,
    metafieldId: metafieldId ?? null,
    previousValue: previousValue ?? null,
    writtenValue: writtenValue ?? null,
    triggeredBy,
    status,
    errorMessage: errorMessage ?? null,
    writtenAt,
  });
}

/**
 * Retorna a linha mais recente de `write_log` com `status = 'success'` para um
 * produto — base do rollback (D-38, Plano 05-04). Uma linha `status = 'failed'`
 * mais recente para o MESMO produto nunca é retornada no lugar de uma `success`
 * mais antiga (filtro `status = 'success'` aplicado ANTES do `ORDER BY`/`LIMIT`).
 * @param {{ productId: string }} params
 * @returns {object|undefined} linha traduzida (camelCase) ou `undefined` se não
 *   houver nenhuma linha `success` para o produto — nunca lança.
 */
export function getLastSuccessfulWriteLog({ productId }) {
  const row = selectLastSuccessfulWriteLogStmt.get({ productId: String(productId) });
  if (!row) return undefined;
  return mapWriteLogRow(row);
}

/**
 * Lista TODAS as linhas de `write_log` (de todos os produtos), ordenadas por
 * `written_at DESC`, sem nenhum parâmetro de filtro (D-42) — base de `GET /audit`
 * que o Plano 05-05 consome sem precisar de nenhuma lógica adicional de filtro.
 * @returns {Array<object>} linhas traduzidas (camelCase)
 */
export function listWriteLog() {
  return selectAllWriteLogStmt.all().map(mapWriteLogRow);
}

/**
 * Abre uma nova execução de ingestão, registrando-a como 'running'. Deve sempre ser
 * fechada posteriormente via `finishIngestionRun` (sucesso ou falha), nunca deixada
 * presa em 'running' silenciosamente.
 * @param {{ categoryId: string|number, categoryName: string }} params
 * @returns {number} run_id gerado
 */
export function startIngestionRun({ categoryId, categoryName }) {
  const info = insertIngestionRun.run({
    startedAt: new Date().toISOString(),
    categoryId: String(categoryId),
    categoryName,
  });
  return Number(info.lastInsertRowid);
}

/**
 * Lê o mapa de canonicalização de tags de tecido persistido em
 * `fabric_tag_canonical_map` (DATA-03), populado conforme a planilha D-07 é
 * importada. Retorna um `Map` vazio se a tabela ainda não tiver linhas
 * (comportamento esperado antes da primeira importação, D-06).
 * @returns {Map<string, string>}
 */
export function getCanonicalMap() {
  return new Map(selectCanonicalMap.all().map((row) => [row.raw_tag, row.canonical_value]));
}

/**
 * Persiste um lote de registros (produtos/variantes/snapshots/auditoria de tags/
 * baseline de recomendação) em uma ÚNICA transação — nunca uma escrita por produto.
 * Usa exclusivamente prepared statements com parâmetros nomeados (T-02-04).
 * @param {{ runId: number, records: { products: Array<object>, variants: Array<object>,
 *   snapshots: Array<object>, fabricAudits: Array<object>, recommendationBaselines: Array<object> } }} params
 * @returns {void}
 */
export function persistIngestionBatch({ runId, records }) {
  const {
    products = [],
    variants = [],
    snapshots = [],
    fabricAudits = [],
    recommendationBaselines = [],
  } = records;

  const persist = db.transaction(() => {
    for (const product of products) {
      insertProduct.run({ ...product, runId });
    }
    for (const variant of variants) {
      insertVariant.run({ ...variant, runId });
    }
    for (const snapshot of snapshots) {
      insertSnapshot.run({ ...snapshot, runId });
    }
    for (const fabricAudit of fabricAudits) {
      insertFabricAudit.run({ ...fabricAudit, runId });
    }
    for (const baseline of recommendationBaselines) {
      insertRecommendationBaseline.run({ ...baseline, runId });
    }
  });

  persist();
}

/**
 * Fecha uma execução de ingestão com o status final (success | failed) e a
 * contagem real de produtos lidos.
 * @param {{ runId: number, status: 'success'|'failed', productsRead: number }} params
 * @returns {void}
 */
export function finishIngestionRun({ runId, status, productsRead }) {
  updateIngestionRun.run({
    runId,
    finishedAt: new Date().toISOString(),
    status,
    productsRead,
  });
}

/**
 * Fecha a conexão SQLite subjacente. Uso exclusivo de testes de integração
 * (`catalog-store.test.js`), que precisam liberar o handle nativo do arquivo
 * antes de remover o diretório temporário — no Windows, `better-sqlite3` retém
 * o lock do arquivo até `close()` explícito, mesmo após `vi.resetModules()`.
 * Nunca chamado em uso normal do módulo (o processo mantém a conexão aberta
 * durante todo o ciclo de vida do job de ingestão).
 * @returns {void}
 */
export function closeDbForTests() {
  db.close();
}
