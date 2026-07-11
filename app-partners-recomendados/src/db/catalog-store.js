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
const DB_DIR = join(__dirname, '..', '..', 'data');
mkdirSync(DB_DIR, { recursive: true });

const db = new Database(join(DB_DIR, 'catalog.db'));
db.pragma('journal_mode = WAL');
db.exec(readFileSync(SCHEMA_PATH, 'utf-8'));

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
      fabric_tag_raw, fabric_tag_canonical, color_value, snapshot_at)
   VALUES (@runId, @productId, @hasAvailableGrade, @sizesInStockCount,
      @fabricTagRaw, @fabricTagCanonical, @colorValue, @snapshotAt)`
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
