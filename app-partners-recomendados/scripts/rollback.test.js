// Testes de scripts/rollback.js (WRTE-03/WRTE-04, D-37/D-38/D-44, Plano 05-04).
//
// Combina os dois padrões de isolamento já estabelecidos no projeto — nenhum
// arquivo existente combinava os dois antes deste: (a) `vi.mock` de todo o
// `nuvemshop-client/client.js` (mesmo estilo de `ingest-catalog.test.js`); (b)
// `CATALOG_DB_DIR` apontando para um diretório `mkdtempSync` temporário +
// `vi.resetModules()` + import dinâmico de `catalog-store.js`/`rollback.js` em
// `beforeEach` (mesmo padrão de `catalog-store.test.js`/`review-server.test.js`).
// `insertWriteLog` é usado REAL (não mockado) para semear as linhas de `write_log`
// de cada cenário — só a rede (`findMetafield`/`updateMetafield`/`deleteMetafield`)
// é mockada.
//
// Cobre os 6 comportamentos do bloco <behavior> do plano 05-04:
// Test 1: nenhuma linha em write_log para o produto -> Error comum
// Test 2: valor atual bate + previousValue não-nulo -> updateMetafield, nunca delete,
//   nova linha em write_log com triggeredBy:'rollback'
// Test 3: valor atual bate + previousValue null -> deleteMetafield, nunca update
// Test 4: valor atual NÃO bate -> RollbackConflictError, nenhum update/delete, nenhuma
//   linha nova em write_log
// Test 5: importar o módulo em teste nunca executa o corpo do CLI (guard)
// Test 6: `node scripts/rollback.js` sem argumento -> console.error de uso + exit(1),
//   nunca chama performRollback (processo real, subprocesso isolado via CATALOG_DB_DIR)

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { findMetafield, updateMetafield, deleteMetafield } from '../src/nuvemshop-client/client.js';

vi.mock('../src/nuvemshop-client/client.js', () => ({
  findMetafield: vi.fn(),
  updateMetafield: vi.fn(),
  deleteMetafield: vi.fn(),
}));

let tempDir;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'rollback-test-'));
  process.env.CATALOG_DB_DIR = tempDir;
  vi.resetModules();
  vi.clearAllMocks();
});

afterEach(async () => {
  // Fecha o handle nativo do SQLite antes de remover o diretório temporário (mesma
  // necessidade documentada em catalog-store.test.js para o Windows).
  const store = await import('../src/db/catalog-store.js');
  store.closeDbForTests();
  delete process.env.CATALOG_DB_DIR;
  rmSync(tempDir, { recursive: true, force: true });
});

/**
 * Grava um produto real na tabela `products` — necessário porque
 * `write_log.product_id` é `NOT NULL REFERENCES products(id)` e better-sqlite3
 * habilita `PRAGMA foreign_keys = ON` por padrão (mesmo motivo documentado em
 * `catalog-store.test.js`).
 * @param {object} store módulo catalog-store.js já importado dinamicamente
 * @param {string} productId
 * @returns {number} runId gerado
 */
function seedProduct(store, productId) {
  const runId = store.startIngestionRun({ categoryId: '1', categoryName: 'Vestidos' });
  store.persistIngestionBatch({
    runId,
    records: {
      products: [
        { id: productId, name: 'Produto Teste', handle: productId, canonicalUrl: `https://x/${productId}` },
      ],
    },
  });
  return runId;
}

describe('performRollback', () => {
  it('Test 1: sem nenhuma linha em write_log lança Error citando "Nenhuma escrita real registrada"', async () => {
    const { performRollback } = await import('./rollback.js');

    await expect(performRollback({ productId: 'prod-none' })).rejects.toThrow(
      /Nenhuma escrita real registrada/
    );
    expect(findMetafield).not.toHaveBeenCalled();
    expect(updateMetafield).not.toHaveBeenCalled();
    expect(deleteMetafield).not.toHaveBeenCalled();
  });

  it('Test 2: valor atual bate e previousValue não-nulo -> updateMetafield com previousValue, nunca deleteMetafield, nova linha rollback em write_log', async () => {
    const store = await import('../src/db/catalog-store.js');
    const { performRollback } = await import('./rollback.js');
    const runId = seedProduct(store, 'prod-a');

    store.insertWriteLog({
      productId: 'prod-a',
      runId,
      metafieldId: 'mf-1',
      previousValue: 'valor-antigo',
      writtenValue: 'valor-novo',
      triggeredBy: 'manual',
      status: 'success',
      errorMessage: null,
      writtenAt: '2026-07-16T10:00:00Z',
    });

    findMetafield.mockResolvedValue({ id: 'mf-1', value: 'valor-novo' });
    updateMetafield.mockResolvedValue({ id: 'mf-1', value: 'valor-antigo' });

    const result = await performRollback({ productId: 'prod-a' });

    expect(updateMetafield).toHaveBeenCalledWith({ id: 'mf-1', value: 'valor-antigo' });
    expect(deleteMetafield).not.toHaveBeenCalled();
    expect(result).toEqual({ id: 'mf-1', value: 'valor-antigo' });

    const rows = store.listWriteLog();
    expect(rows).toHaveLength(2);
    const rollbackRow = rows.find((r) => r.triggeredBy === 'rollback');
    expect(rollbackRow).toMatchObject({
      productId: 'prod-a',
      metafieldId: 'mf-1',
      previousValue: 'valor-novo',
      writtenValue: 'valor-antigo',
      status: 'success',
    });
  });

  it('Test 3: valor atual bate e previousValue é null -> deleteMetafield, nunca updateMetafield', async () => {
    const store = await import('../src/db/catalog-store.js');
    const { performRollback } = await import('./rollback.js');
    const runId = seedProduct(store, 'prod-b');

    store.insertWriteLog({
      productId: 'prod-b',
      runId,
      metafieldId: 'mf-2',
      previousValue: null,
      writtenValue: 'valor-criado',
      triggeredBy: 'manual',
      status: 'success',
      errorMessage: null,
      writtenAt: '2026-07-16T10:00:00Z',
    });

    findMetafield.mockResolvedValue({ id: 'mf-2', value: 'valor-criado' });
    deleteMetafield.mockResolvedValue({ deleted: true });

    await performRollback({ productId: 'prod-b' });

    expect(deleteMetafield).toHaveBeenCalledWith({ id: 'mf-2' });
    expect(updateMetafield).not.toHaveBeenCalled();

    const rows = store.listWriteLog();
    const rollbackRow = rows.find((r) => r.triggeredBy === 'rollback');
    expect(rollbackRow).toMatchObject({
      productId: 'prod-b',
      metafieldId: 'mf-2',
      previousValue: 'valor-criado',
      writtenValue: null,
      status: 'success',
    });
  });

  it('Test 4: valor atual NÃO bate -> RollbackConflictError, nenhum update/delete, nenhuma linha nova em write_log', async () => {
    const store = await import('../src/db/catalog-store.js');
    const { performRollback, RollbackConflictError } = await import('./rollback.js');
    const runId = seedProduct(store, 'prod-c');

    store.insertWriteLog({
      productId: 'prod-c',
      runId,
      metafieldId: 'mf-3',
      previousValue: 'valor-antigo',
      writtenValue: 'valor-esperado',
      triggeredBy: 'manual',
      status: 'success',
      errorMessage: null,
      writtenAt: '2026-07-16T10:00:00Z',
    });

    findMetafield.mockResolvedValue({ id: 'mf-3', value: 'valor-editado-manualmente' });

    let thrown;
    try {
      await performRollback({ productId: 'prod-c' });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(RollbackConflictError);
    expect(thrown.name).toBe('RollbackConflictError');
    expect(thrown.productId).toBe('prod-c');
    expect(updateMetafield).not.toHaveBeenCalled();
    expect(deleteMetafield).not.toHaveBeenCalled();

    const rows = store.listWriteLog();
    expect(rows).toHaveLength(1);
    expect(rows[0].triggeredBy).toBe('manual');
  });
});

describe('CLI entrypoint guard', () => {
  it('Test 5: importar o módulo em teste nunca executa o corpo do CLI', async () => {
    await import('./rollback.js');

    expect(findMetafield).not.toHaveBeenCalled();
    expect(updateMetafield).not.toHaveBeenCalled();
    expect(deleteMetafield).not.toHaveBeenCalled();
  });

  it('Test 6: node scripts/rollback.js sem argumento -> console.error de uso + exit(1), nunca chama performRollback', () => {
    const scriptPath = fileURLToPath(new URL('./rollback.js', import.meta.url));
    let stderr = '';
    let status = 0;

    try {
      execFileSync('node', [scriptPath], {
        env: { ...process.env, CATALOG_DB_DIR: tempDir },
        encoding: 'utf-8',
      });
    } catch (err) {
      stderr = err.stderr ?? '';
      status = err.status ?? 1;
    }

    expect(status).toBe(1);
    expect(stderr).toMatch(/Uso: node scripts\/rollback\.js <productId>/);
  });
});
