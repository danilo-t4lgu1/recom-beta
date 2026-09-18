-- Schema SQLite do catálogo ingerido (D-10/D-11).
-- Fonte: 02-RESEARCH.md ## Code Examples > Schema SQLite (D-10/D-11).
--
-- ingestion_runs: 1 linha por execução do job de ingestão (histórico versionado, D-11).
-- products/variants: estado normalizado mais recente (última execução que viu cada linha).
-- catalog_snapshots: fato append-only (1 linha por produto por execução) — base do
--   histórico versionado (D-11), extensível no futuro para dados de conversão sem
--   redesenho (nova tabela irmã referenciando o mesmo run_id).
-- fabric_tag_canonical_map / fabric_tag_audit: infraestrutura de auditoria contínua de
--   tags de tecido (DATA-03) — regenerada a cada execução, nunca só na primeira vez.
-- recommendation_baseline: registro informativo dos Metafields de recomendação atuais
--   (DATA-02), sem lógica de drift (D-12).
-- catalog_snapshots.category_raw / product_group_canonical: campos por-produto do
--   Grupo de Produtos (D-26/D-33, Fase 03.1) — bancos já existentes (sem essas
--   colunas) recebem migração idempotente em catalog-store.js (Pitfall 2 do
--   03.1-RESEARCH.md), não apenas este CREATE TABLE.
-- approval_queue: registro de decisão de aprovação/rejeição por produto+run (D-25,
--   Fase 4), conjunto exato de ids aprovados via JSON em texto, nunca um booleano;
--   base do gate de escrita (APRV-03) que a Fase 5 consome.
-- write_log: snapshot (previous_value/written_value, WRTE-02) e log de auditoria
--   (triggered_by/status/error_message/written_at, WRTE-04) numa ÚNICA tabela/linha
--   por tentativa de escrita real de Metafield na loja (D-41) — nunca duas tabelas
--   separadas. Append-only: cada tentativa (sucesso ou falha) grava uma linha nova,
--   nunca update/upsert (mesma disciplina de catalog_snapshots). Base do rollback
--   (D-38, Plano 05-04) e da tela de auditoria (D-42, Plano 05-05).

CREATE TABLE IF NOT EXISTS ingestion_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  category_id TEXT NOT NULL,
  category_name TEXT NOT NULL,
  products_read INTEGER,
  category_counts TEXT,         -- JSON { [categoria]: contagem bruta } por-categoria ANTES do dedup (Defesa 1, D-66); bancos antigos recebem migração idempotente em catalog-store.js
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
  stock_total INTEGER,          -- soma de inventory_levels[].stock (nunca variant.stock)
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
  category_raw TEXT,             -- nome bruto da categoria, ex: "Blusas" (D-26)
  product_group_canonical TEXT,  -- 'Look Inteiro' | 'Partes de Cima' | 'Partes de Baixo' | NULL (D-26)
  published INTEGER,             -- 0/1 visibilidade do produto na loja (D-58); NULL = pré-migração/desconhecido (nunca coagir p/ oculto, A6); bancos antigos recebem migração idempotente em catalog-store.js
  snapshot_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_snapshots_product ON catalog_snapshots(product_id, snapshot_at);

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

CREATE TABLE IF NOT EXISTS approval_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id TEXT NOT NULL REFERENCES products(id),
  run_id INTEGER NOT NULL REFERENCES ingestion_runs(id),
  status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  approved_recommendation_ids TEXT,       -- JSON array de productId, NULL se rejected/pending
  decided_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(product_id, run_id)
);

CREATE TABLE IF NOT EXISTS write_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id TEXT NOT NULL REFERENCES products(id),
  run_id INTEGER REFERENCES ingestion_runs(id),
  metafield_id TEXT,
  previous_value TEXT,
  written_value TEXT,
  triggered_by TEXT NOT NULL,   -- 'manual' | 'scheduled' | 'rollback'
  status TEXT NOT NULL,         -- 'success' | 'failed'
  error_message TEXT,
  written_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_write_log_product ON write_log(product_id, written_at);

-- daily_recompute_log: 1 linha por execução do job diário (run-daily-job.js),
-- registrando o resultado da etapa de RECOMPUTE/ESCRITA (distinta do resultado da
-- INGESTÃO, já coberto por ingestion_runs.status) -- painel administrativo, achado
-- 2026-08-10. `run_id` é NULLABLE porque a etapa de ingestão pode falhar ANTES de
-- criar uma linha em ingestion_runs (ex: erro de rede durante a leitura, como o
-- incidente de 2026-07-23) -- este log precisa registrar o dia mesmo nesse caso,
-- por isso NUNCA é chaveado só por run_id. Append-only, mesma disciplina de
-- write_log/catalog_snapshots -- nunca update/upsert.
CREATE TABLE IF NOT EXISTS daily_recompute_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER REFERENCES ingestion_runs(id),
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  status TEXT NOT NULL,         -- 'ok' | 'error'
  reason TEXT,                  -- NULL quando status='ok'; motivo/mensagem quando 'error'
  alterados INTEGER,
  zerados INTEGER,
  novos INTEGER,
  dry_run INTEGER               -- 0/1/NULL (NULL quando nem chegou a essa decisão)
);
CREATE INDEX IF NOT EXISTS idx_daily_recompute_log_started_at ON daily_recompute_log(started_at);

-- Sinal novo: pares de produtos REALMENTE comprados juntos (co-compra/market basket),
-- a partir de pedidos reais da API Nuvemshop (`GET /orders`) — distinto do sinal de
-- similaridade (cor/tecido/estoque) já existente em catalog_snapshots/variants.
-- order_ingestion_runs: 1 linha por execução da ingestão de pedidos, mesmo padrão de
--   ingestion_runs (histórico versionado, nunca fica presa em 'running').
-- orders: estado normalizado mais recente de CADA pedido lido (upsert por id, igual a
--   `products` acima) — inclui pedidos cancelados/não pagos, para histórico completo.
-- order_items: fato append-only (1 linha por produto ÚNICO por pedido por execução que
--   o gravou) — só recebe linhas de pedidos QUALIFICADOS (não cancelado + pago, ver
--   ingest-orders.js), para a análise de co-compra nunca contar carrinho abandonado/
--   cancelado como sinal de "compraram junto". `last_seen_run_id` em `orders` +
--   `run_id` em `order_items` juntos garantem que uma leitura de análise nunca mistura
--   itens de um run antigo de um pedido que foi re-ingerido depois (mesma disciplina de
--   `catalog_snapshots` filtrado por `run_id` vs `variants.last_seen_run_id`).
CREATE TABLE IF NOT EXISTS order_ingestion_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  orders_read INTEGER,
  orders_qualified INTEGER,
  status TEXT NOT NULL DEFAULT 'running' -- running | success | failed
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,           -- order_id da Nuvemshop
  status TEXT,                   -- open | closed | cancelled (bruto da API)
  payment_status TEXT,           -- pending | paid | ... (bruto da API)
  created_at TEXT,
  total TEXT,
  last_seen_run_id INTEGER REFERENCES order_ingestion_runs(id)
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL REFERENCES orders(id),
  product_id TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  run_id INTEGER NOT NULL REFERENCES order_ingestion_runs(id)
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id);

-- co_purchase_pairs: recompute COMPLETO a cada execução do script dedicado
-- (scripts/recompute-co-purchase-pairs.js) — nunca incremental (DELETE FROM +
-- INSERT numa única transação, ver replaceCoPurchasePairs em orders-store.js).
-- Escopo deliberadamente limitado a pares CROSS-GROUP (Partes de Cima <->
-- Partes de Baixo) com count >= piso configurável (MIN_CO_PURCHASE_COUNT,
-- default 3) — sinal de "Sugestão de Look Automática" de prioridade máxima no
-- motor de recomendação (peso 0, acima de cor/tecido). Convenção obrigatória:
-- product_id_a < product_id_b (comparação de string), nunca duas linhas para o
-- mesmo par em ordem invertida — mesma convenção de chave canônica já usada
-- internamente por computeCoPurchasePairs (co-purchase-analysis.js).
CREATE TABLE IF NOT EXISTS co_purchase_pairs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id_a TEXT NOT NULL,
  product_id_b TEXT NOT NULL,
  count INTEGER NOT NULL,
  computed_at TEXT NOT NULL,
  UNIQUE(product_id_a, product_id_b)
);
CREATE INDEX IF NOT EXISTS idx_co_purchase_a ON co_purchase_pairs(product_id_a);
CREATE INDEX IF NOT EXISTS idx_co_purchase_b ON co_purchase_pairs(product_id_b);
