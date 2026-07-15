// Testes de src/db/catalog-store.js (RULE-01, D-26, Pitfall 2 do 03.1-RESEARCH.md).
//
// Primeiro teste automatizado deste arquivo (Wave 0 gap confirmado no
// 03.1-VALIDATION.md). Usa CATALOG_DB_DIR (seam de testabilidade da Task 1) para
// apontar cada teste a um diretório SQLite temporário e isolado — NUNCA cria/abre/
// apaga nada em data/catalog.db real.
//
// Cobre os 4 comportamentos do bloco <behavior> do plano 03.1-03:
// Test 1: banco novo (diretório vazio) abre sem lançar, getLatestSnapshotProducts()
//   retorna [] (nenhum run ainda)
// Test 2 (Pitfall 2, o mais importante deste arquivo): catalog.db PRÉ-03.1 simulado
//   (schema antigo, sem category_raw/product_group_canonical) recebe as colunas
//   novas via migração idempotente, sem lançar
// Test 3: novo run + snapshot com categoryRaw/productGroupCanonical preenchidos,
//   getLatestSnapshotProducts() retorna productGroupCanonical correto
// Test 4: linhas gravadas ANTES da migração continuam legíveis depois, com
//   product_group_canonical retornando null (coluna nova, sem backfill histórico)

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Schema ANTIGO (pré-03.1) de catalog_snapshots — cópia fiel das colunas de
// schema.sql ANTES desta fase, para simular o estado real do data/catalog.db de
// desenvolvimento (3 runs já gravados, sem category_raw/product_group_canonical).
const LEGACY_SCHEMA = `
CREATE TABLE IF NOT EXISTS ingestion_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  category_id TEXT NOT NULL,
  category_name TEXT NOT NULL,
  products_read INTEGER,
  status TEXT NOT NULL DEFAULT 'running'
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT,
  handle TEXT,
  canonical_url TEXT,
  last_seen_run_id INTEGER REFERENCES ingestion_runs(id)
);

CREATE TABLE IF NOT EXISTS variants (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  sku TEXT,
  color_value TEXT,
  size_value TEXT,
  stock_total INTEGER,
  last_seen_run_id INTEGER REFERENCES ingestion_runs(id)
);

CREATE TABLE IF NOT EXISTS catalog_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL REFERENCES ingestion_runs(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  has_available_grade INTEGER NOT NULL,
  sizes_in_stock_count INTEGER NOT NULL,
  fabric_tag_raw TEXT,
  fabric_tag_canonical TEXT,
  color_value TEXT,
  snapshot_at TEXT NOT NULL
);
`;

/**
 * Cria um catalog.db simulando o estado PRÉ-03.1 (schema antigo, sem as 2
 * colunas novas) no caminho informado, usando uma instância better-sqlite3
 * própria e independente de catalog-store.js. Fecha a conexão explicitamente
 * antes de retornar (evita lock do arquivo SQLite no Windows).
 * @param {string} dbPath
 * @param {boolean} [seedLegacyRow] Se true, grava 1 run/produto/variante/snapshot
 *   ANTES da migração (para o Test 4 verificar que dados históricos sobrevivem).
 */
function createLegacyDb(dbPath, seedLegacyRow = false) {
  const legacyDb = new Database(dbPath);
  legacyDb.exec(LEGACY_SCHEMA);

  if (seedLegacyRow) {
    legacyDb.exec(`
      INSERT INTO ingestion_runs (id, started_at, finished_at, category_id, category_name, products_read, status)
      VALUES (1, '2026-01-01T00:00:00Z', '2026-01-01T00:01:00Z', '111', 'Vestidos', 1, 'success')
    `);
    legacyDb.exec(`
      INSERT INTO products (id, name, handle, canonical_url, last_seen_run_id)
      VALUES ('legacy-1', 'Produto Legado', 'produto-legado', 'https://x/produto-legado', 1)
    `);
    legacyDb.exec(`
      INSERT INTO variants (id, product_id, sku, color_value, size_value, stock_total, last_seen_run_id)
      VALUES ('legacy-variant-1', 'legacy-1', 'SKU1', 'Preto', 'M', 5, 1)
    `);
    legacyDb.exec(`
      INSERT INTO catalog_snapshots (run_id, product_id, has_available_grade, sizes_in_stock_count, fabric_tag_raw, fabric_tag_canonical, color_value, snapshot_at)
      VALUES (1, 'legacy-1', 1, 3, 'algodao', 'Algodão', 'Preto', '2026-01-01T00:00:30Z')
    `);
  }

  legacyDb.close();
}

let tempDir;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'catalog-store-test-'));
  process.env.CATALOG_DB_DIR = tempDir;
  vi.resetModules();
});

afterEach(async () => {
  // Fecha a conexão SQLite da instância do módulo importada neste teste antes de
  // remover o diretório temporário — no Windows, o handle nativo do arquivo
  // permanece aberto até close() explícito, mesmo após vi.resetModules(), e
  // rmSync falharia com EPERM sem isso.
  const store = await import('./catalog-store.js');
  store.closeDbForTests();
  delete process.env.CATALOG_DB_DIR;
  rmSync(tempDir, { recursive: true, force: true });
});

describe('catalog-store.js', () => {
  it('banco novo (diretório vazio) abre sem lançar e getLatestSnapshotProducts() retorna [] (Test 1)', async () => {
    const store = await import('./catalog-store.js');

    expect(() => store.getLatestSnapshotProducts()).not.toThrow();
    expect(store.getLatestSnapshotProducts()).toEqual([]);
  });

  it('migração idempotente adiciona category_raw/product_group_canonical a um catalog.db pré-03.1 sem lançar (Pitfall 2, Test 2)', async () => {
    const dbPath = join(tempDir, 'catalog.db');
    createLegacyDb(dbPath);

    const store = await import('./catalog-store.js');

    expect(() => store.getLatestSnapshotProducts()).not.toThrow();

    const check = new Database(dbPath);
    const columns = check.prepare('PRAGMA table_info(catalog_snapshots)').all();
    check.close();
    const columnNames = columns.map((c) => c.name);
    expect(columnNames).toContain('category_raw');
    expect(columnNames).toContain('product_group_canonical');
  });

  it('novo run+snapshot com categoryRaw/productGroupCanonical preenchidos é lido corretamente por getLatestSnapshotProducts() (Test 3)', async () => {
    const dbPath = join(tempDir, 'catalog.db');
    createLegacyDb(dbPath);

    const store = await import('./catalog-store.js');

    const runId = store.startIngestionRun({ categoryId: '222', categoryName: 'Blusas' });
    store.persistIngestionBatch({
      runId,
      records: {
        products: [
          { id: 'prod-novo', name: 'Blusa Nova', handle: 'blusa-nova', canonicalUrl: 'https://x/blusa-nova' },
        ],
        variants: [
          { id: 'var-novo', productId: 'prod-novo', sku: 'SKU2', colorValue: 'Azul', sizeValue: 'P', stockTotal: 10 },
        ],
        snapshots: [
          {
            productId: 'prod-novo',
            hasAvailableGrade: 1,
            sizesInStockCount: 3,
            fabricTagRaw: 'algodao',
            fabricTagCanonical: 'Algodão',
            colorValue: 'Azul',
            categoryRaw: 'Blusas',
            productGroupCanonical: 'Partes de Cima',
            snapshotAt: new Date().toISOString(),
          },
        ],
      },
    });
    store.finishIngestionRun({ runId, status: 'success', productsRead: 1 });

    const rows = store.getLatestSnapshotProducts();
    const found = rows.find((row) => row.productId === 'prod-novo');
    expect(found).toBeDefined();
    expect(found.productGroupCanonical).toBe('Partes de Cima');
  });

  it('linhas gravadas ANTES da migração continuam legíveis, com product_group_canonical null (Test 4)', async () => {
    const dbPath = join(tempDir, 'catalog.db');
    createLegacyDb(dbPath, true);

    const store = await import('./catalog-store.js');

    const rows = store.getLatestSnapshotProducts();
    const legacyRow = rows.find((row) => row.productId === 'legacy-1');
    expect(legacyRow).toBeDefined();
    expect(legacyRow.productGroupCanonical).toBeNull();
    expect(legacyRow.fabricTagCanonical).toBe('Algodão');
  });
});
