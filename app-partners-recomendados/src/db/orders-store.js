// Wrapper better-sqlite3 dos pedidos ingeridos (sinal novo de co-compra/market basket).
//
// Abre o MESMO arquivo `data/catalog.db` (WAL) que `catalog-store.js` — conexão
// própria e independente, mesmo padrão já usado neste projeto para múltiplos
// wrappers apontarem ao mesmo arquivo SQLite (better-sqlite3 suporta múltiplas
// conexões ao mesmo arquivo em WAL sem conflito). Aplica `schema.sql` na abertura
// (idempotente via `CREATE TABLE IF NOT EXISTS` — nenhum conflito com as tabelas de
// catálogo já existentes no mesmo arquivo) e exporta apenas funções nomeadas —
// NUNCA o objeto `db`/`Database` cru (mesma convenção de `catalog-store.js`).
//
// `orders` é upsert de estado mais recente (igual a `products` em catalog-store.js);
// `order_items` é append-only por execução (igual a `catalog_snapshots`) — ver
// comentário de cabeçalho em schema.sql para o raciocínio completo.
//
// Toda escrita usa exclusivamente `db.prepare(...).run(params)` com parâmetros
// nomeados — nunca concatenação de string SQL (mesma disciplina de catalog-store.js,
// já que `orders`/`order_items` também carregam dados de uma API externa).

import Database from 'better-sqlite3';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(__dirname, 'schema.sql');
// Mesmo DB_DIR/seam de testabilidade de catalog-store.js (CATALOG_DB_DIR) — os dois
// módulos precisam apontar ao MESMO diretório/arquivo para que testes de integração
// que usam ambos (ex: report-co-purchase.js cruzando order_items com o catálogo)
// funcionem contra o mesmo banco temporário isolado.
const DB_DIR = process.env.CATALOG_DB_DIR || join(__dirname, '..', '..', 'data');
mkdirSync(DB_DIR, { recursive: true });

const db = new Database(join(DB_DIR, 'catalog.db'));
db.pragma('journal_mode = WAL');
db.exec(readFileSync(SCHEMA_PATH, 'utf-8'));

const insertOrderIngestionRun = db.prepare(
  `INSERT INTO order_ingestion_runs (started_at, status) VALUES (@startedAt, 'running')`
);

const updateOrderIngestionRun = db.prepare(
  `UPDATE order_ingestion_runs SET finished_at = @finishedAt, status = @status,
     orders_read = @ordersRead, orders_qualified = @ordersQualified
   WHERE id = @runId`
);

const insertOrder = db.prepare(
  `INSERT INTO orders (id, status, payment_status, created_at, total, last_seen_run_id)
   VALUES (@id, @status, @paymentStatus, @createdAt, @total, @runId)
   ON CONFLICT(id) DO UPDATE SET status=excluded.status, payment_status=excluded.payment_status,
     created_at=excluded.created_at, total=excluded.total, last_seen_run_id=excluded.last_seen_run_id`
);

const insertOrderItem = db.prepare(
  `INSERT INTO order_items (order_id, product_id, quantity, run_id)
   VALUES (@orderId, @productId, @quantity, @runId)`
);

// Base de `getAllOrderItemsForAnalysis`: só os `order_items` cujo `run_id` é o
// `last_seen_run_id` ATUAL do pedido — nunca itens de um run antigo de um pedido que
// foi re-ingerido depois (mesmo raciocínio de `selectVariantsForRun` filtrado por
// `last_seen_run_id` em catalog-store.js).
const selectAllOrderItemsForAnalysisStmt = db.prepare(
  `SELECT oi.order_id AS order_id, oi.product_id AS product_id, oi.quantity AS quantity
   FROM order_items oi
   JOIN orders o ON o.id = oi.order_id
   WHERE oi.run_id = o.last_seen_run_id`
);

// Sinal de "Sugestão de Look Automática" (D-XX de negócio, decisão já validada com
// o responsável do produto): pares CROSS-GROUP (Partes de Cima <-> Partes de Baixo)
// com `count >= minCount` comprado junto em pedidos reais. `count` sozinho (não
// lift/confiança) é o critério de corte escolhido deliberadamente por ser a
// métrica mais robusta contra ruído estatístico de baixíssimo volume.
const deleteAllCoPurchasePairsStmt = db.prepare(`DELETE FROM co_purchase_pairs`);

const insertCoPurchasePairStmt = db.prepare(
  `INSERT INTO co_purchase_pairs (product_id_a, product_id_b, count, computed_at)
   VALUES (@productIdA, @productIdB, @count, @computedAt)`
);

const selectAllCoPurchasePairsStmt = db.prepare(
  `SELECT product_id_a AS product_id_a, product_id_b AS product_id_b, count AS count
   FROM co_purchase_pairs`
);

/**
 * Abre uma nova execução de ingestão de pedidos, registrando-a como 'running'. Deve
 * sempre ser fechada posteriormente via `finishOrderIngestionRun` (sucesso ou falha),
 * nunca deixada presa em 'running' silenciosamente (mesma disciplina de
 * `startIngestionRun` em catalog-store.js).
 * @returns {number} run_id gerado
 */
export function startOrderIngestionRun() {
  const info = insertOrderIngestionRun.run({ startedAt: new Date().toISOString() });
  return Number(info.lastInsertRowid);
}

/**
 * Fecha uma execução de ingestão de pedidos com o status final (success | failed) e
 * as contagens de pedidos lidos/qualificados.
 * @param {{ runId: number, status: 'success'|'failed', ordersRead: number, ordersQualified: number }} params
 * @returns {void}
 */
export function finishOrderIngestionRun({ runId, status, ordersRead, ordersQualified }) {
  updateOrderIngestionRun.run({
    runId,
    finishedAt: new Date().toISOString(),
    status,
    ordersRead,
    ordersQualified,
  });
}

/**
 * Persiste um lote de pedidos (upsert em `orders`, TODOS os pedidos lidos) e itens
 * (append-only em `order_items`, só os pedidos QUALIFICADOS — filtro já aplicado pelo
 * chamador em `ingest-orders.js`) em uma ÚNICA transação — nunca uma escrita por
 * pedido. Usa exclusivamente prepared statements com parâmetros nomeados.
 * @param {{ runId: number, orders: Array<{ id: string, status: string|null,
 *   paymentStatus: string|null, createdAt: string|null, total: string|null }>,
 *   items: Array<{ orderId: string, productId: string, quantity: number }> }} params
 * @returns {void}
 */
export function persistOrderBatch({ runId, orders, items }) {
  const persist = db.transaction(() => {
    for (const order of orders) {
      insertOrder.run({ ...order, runId });
    }
    for (const item of items) {
      insertOrderItem.run({ ...item, runId });
    }
  });

  persist();
}

/**
 * Lê todos os `order_items` para a análise de co-compra (`co-purchase-analysis.js`),
 * restritos ao `run_id` mais recente (`last_seen_run_id`) de cada pedido — nunca
 * mistura itens de um run antigo de um pedido re-ingerido (ver comentário do statement
 * acima). Shape agnóstico de SQL, plain rows, consumido diretamente por
 * `computeCoPurchasePairs`.
 * @returns {Array<{ orderId: string, productId: string, quantity: number }>}
 */
export function getAllOrderItemsForAnalysis() {
  return selectAllOrderItemsForAnalysisStmt.all().map((row) => ({
    orderId: String(row.order_id),
    productId: String(row.product_id),
    quantity: row.quantity,
  }));
}

/**
 * Resolve o piso configurável de `count` (D-XX de negócio) a partir do valor bruto de
 * ambiente `MIN_CO_PURCHASE_COUNT`. Mesmo padrão de `resolveMinSizesInStock`
 * (`ingest-catalog.js`): default 3, valor ausente/não-numérico/< 1 cai no default —
 * toggle operacional seguro por ambiente, sem editar código.
 * @param {string|undefined} rawValue
 * @returns {number}
 */
export function resolveMinCoPurchaseCount(rawValue) {
  const parsed = Number.parseInt(rawValue ?? '', 10);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : 3;
}

/**
 * Substitui o conteúdo INTEIRO de `co_purchase_pairs` (DELETE FROM + INSERT numa
 * única transação) — sempre um recompute completo, nunca incremental, já que
 * `computeCoPurchasePairs` é recalculado do zero a cada execução do script dedicado
 * (`scripts/recompute-co-purchase-pairs.js`). Persiste só os pares com
 * `count >= minCount`; o resto é descartado silenciosamente (comportamento esperado,
 * não erro). Normaliza a convenção `product_id_a < product_id_b` (comparação de
 * string) mesmo que o chamador já entregue nessa ordem (`computeCoPurchasePairs` já
 * garante isso internamente) — defesa extra contra nunca gravar duas linhas para o
 * mesmo par em ordem invertida.
 * @param {{ pairs: Array<{ productIdA: string, productIdB: string, count: number }>,
 *   minCount: number }} params
 * @returns {number} quantidade de pares efetivamente persistidos
 */
export function replaceCoPurchasePairs({ pairs, minCount }) {
  const computedAt = new Date().toISOString();
  const qualifyingPairs = (Array.isArray(pairs) ? pairs : []).filter((pair) => pair.count >= minCount);

  const replace = db.transaction(() => {
    deleteAllCoPurchasePairsStmt.run();
    for (const pair of qualifyingPairs) {
      const idA = String(pair.productIdA);
      const idB = String(pair.productIdB);
      const [productIdA, productIdB] = idA < idB ? [idA, idB] : [idB, idA];
      insertCoPurchasePairStmt.run({ productIdA, productIdB, count: pair.count, computedAt });
    }
  });

  replace();
  return qualifyingPairs.length;
}

/**
 * Lê `co_purchase_pairs` inteira e devolve um mapa BIDIRECIONAL: se o par A-B existe,
 * tanto `map.get(A)` quanto `map.get(B)` têm uma entrada apontando um pro outro — base
 * do enriquecimento `provenLookPartnerIds` em `catalog-store.js` (o motor de
 * recomendação puro, RULE-02, nunca consulta esta tabela diretamente).
 * @returns {Map<string, Array<{ partnerId: string, count: number }>>}
 */
export function getCoPurchasePartnersMap() {
  const map = new Map();
  for (const row of selectAllCoPurchasePairsStmt.all()) {
    const productIdA = String(row.product_id_a);
    const productIdB = String(row.product_id_b);
    const count = row.count;

    if (!map.has(productIdA)) map.set(productIdA, []);
    map.get(productIdA).push({ partnerId: productIdB, count });

    if (!map.has(productIdB)) map.set(productIdB, []);
    map.get(productIdB).push({ partnerId: productIdA, count });
  }
  return map;
}

/**
 * Fecha a conexão SQLite subjacente. Uso exclusivo de testes de integração — mesmo
 * padrão de `closeDbForTests` em catalog-store.js (necessário no Windows para liberar
 * o lock do arquivo antes de remover o diretório temporário).
 * @returns {void}
 */
export function closeOrdersDbForTests() {
  db.close();
}
