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
