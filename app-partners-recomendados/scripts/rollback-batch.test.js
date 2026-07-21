// Testes de scripts/rollback-batch.js (WRTE-03, D-65/D-38, Plano 07-04).
//
// O rollback em lote é a rede de segurança que torna a escrita automática em escala
// de catálogo (Opção B, D-61) operacionalmente aceitável: itera os produtos com
// escrita real bem-sucedida e chama `performRollback` por produto, AGREGANDO
// falhas/conflitos sem NUNCA abortar o lote inteiro. Nunca reescreve a lógica de
// rollback (reusa `performRollback`, D-38).
//
// Isolamento: `./rollback.js` é MOCKADO inteiro — `performRollback` é um `vi.fn()`
// controlado por teste e `RollbackConflictError` é uma classe real (para o
// acumulador distinguir 'conflict' de 'error' via instanceof). A determinação do
// conjunto-alvo lê `write_log` REAL via `listWriteLog()`, semeado com `insertWriteLog`
// num diretório `CATALOG_DB_DIR` temporário (mesmo padrão de rollback.test.js).
//
// Test 1: 3 produtos success — 1 reverte, 1 dá RollbackConflictError, 1 lança erro
//   genérico -> o lote processa os 3 e retorna total:3, reverted:1, conflicts:1,
//   errors:1 (nunca aborta no primeiro problema). Linhas `failed` e duplicatas do
//   mesmo produto não geram alvos extras.
// Test 2: `runId` restringe o lote aos produtos com escrita success daquele run_id.
// Test 3: resultado 'noop' de performRollback é agregado sem contar como erro.
// Test 4: importar o módulo NÃO executa o corpo do CLI (guard ESM) nem toca a rede
//   (performRollback nunca chamado só por importar).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performRollback, RollbackConflictError } from './rollback.js';

vi.mock('./rollback.js', () => {
  class RollbackConflictError extends Error {
    constructor(productId, expected, actual) {
      super(`conflito ${productId}`);
      this.name = 'RollbackConflictError';
      this.productId = productId;
    }
  }
  return { performRollback: vi.fn(), RollbackConflictError };
});

let tempDir;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'rollback-batch-test-'));
  process.env.CATALOG_DB_DIR = tempDir;
  vi.resetModules();
  vi.clearAllMocks();
});

afterEach(async () => {
  const store = await import('../src/db/catalog-store.js');
  store.closeDbForTests();
  delete process.env.CATALOG_DB_DIR;
  rmSync(tempDir, { recursive: true, force: true });
});

/**
 * Cria um produto real em `products` (write_log.product_id é NOT NULL REFERENCES
 * products(id)) sob um run de ingestão. Retorna o runId gerado.
 */
function seedProduct(store, productId, runId) {
  store.persistIngestionBatch({
    runId,
    records: {
      products: [
        { id: productId, name: `Produto ${productId}`, handle: productId, canonicalUrl: `https://x/${productId}` },
      ],
    },
  });
}

/** Semeia uma linha de write_log de escrita real para um produto. */
function seedWrite(store, { productId, runId, status = 'success', writtenAt }) {
  store.insertWriteLog({
    productId,
    runId,
    metafieldId: `mf-${productId}`,
    previousValue: null,
    writtenValue: '["rec-1"]',
    triggeredBy: 'scheduled',
    status,
    errorMessage: status === 'failed' ? 'boom' : null,
    writtenAt,
  });
}

describe('performBatchRollback', () => {
  it('Test 1: agrega reverted/conflict/error sem abortar; ignora linhas failed e duplicatas', async () => {
    const store = await import('../src/db/catalog-store.js');
    const { performBatchRollback } = await import('./rollback-batch.js');

    const runId = store.startIngestionRun({ categoryId: '1', categoryName: 'Vestidos' });
    for (const id of ['prod-1', 'prod-2', 'prod-3', 'prod-4']) seedProduct(store, id, runId);

    seedWrite(store, { productId: 'prod-1', runId, writtenAt: '2026-07-16T10:00:00Z' });
    // Duplicata do mesmo produto — não deve virar um alvo extra.
    seedWrite(store, { productId: 'prod-1', runId, writtenAt: '2026-07-16T10:05:00Z' });
    seedWrite(store, { productId: 'prod-2', runId, writtenAt: '2026-07-16T10:01:00Z' });
    seedWrite(store, { productId: 'prod-3', runId, writtenAt: '2026-07-16T10:02:00Z' });
    // Só tem escrita FAILED -> não é alvo de rollback.
    seedWrite(store, { productId: 'prod-4', runId, status: 'failed', writtenAt: '2026-07-16T10:03:00Z' });

    performRollback.mockImplementation(async ({ productId }) => {
      if (productId === 'prod-2') throw new RollbackConflictError('prod-2', 'a', 'b');
      if (productId === 'prod-3') throw new Error('falha de rede generica');
      return { id: 'mf-prod-1', value: null };
    });

    const summary = await performBatchRollback();

    expect(performRollback).toHaveBeenCalledTimes(3);
    expect(summary.total).toBe(3);
    expect(summary.reverted).toBe(1);
    expect(summary.conflicts).toBe(1);
    expect(summary.errors).toBe(1);
    expect(summary.items).toHaveLength(3);

    const byId = Object.fromEntries(summary.items.map((i) => [i.productId, i]));
    expect(byId['prod-1'].outcome).toBe('reverted');
    expect(byId['prod-2'].outcome).toBe('conflict');
    expect(byId['prod-3'].outcome).toBe('error');
    expect(byId['prod-3'].message).toMatch(/falha de rede generica/);
    expect(byId['prod-4']).toBeUndefined();
  });

  it('Test 2: runId restringe o lote aos produtos com escrita success daquele run', async () => {
    const store = await import('../src/db/catalog-store.js');
    const { performBatchRollback } = await import('./rollback-batch.js');

    const runA = store.startIngestionRun({ categoryId: '1', categoryName: 'Vestidos' });
    const runB = store.startIngestionRun({ categoryId: '2', categoryName: 'Blusas' });
    seedProduct(store, 'prod-a1', runA);
    seedProduct(store, 'prod-a2', runA);
    seedProduct(store, 'prod-b1', runB);

    seedWrite(store, { productId: 'prod-a1', runId: runA, writtenAt: '2026-07-16T10:00:00Z' });
    seedWrite(store, { productId: 'prod-a2', runId: runA, writtenAt: '2026-07-16T10:01:00Z' });
    seedWrite(store, { productId: 'prod-b1', runId: runB, writtenAt: '2026-07-16T10:02:00Z' });

    performRollback.mockResolvedValue({ id: 'mf', value: null });

    const summary = await performBatchRollback({ runId: runA });

    expect(summary.total).toBe(2);
    const ids = summary.items.map((i) => i.productId).sort();
    expect(ids).toEqual(['prod-a1', 'prod-a2']);
    const called = performRollback.mock.calls.map((c) => c[0].productId).sort();
    expect(called).toEqual(['prod-a1', 'prod-a2']);
    expect(performRollback).not.toHaveBeenCalledWith({ productId: 'prod-b1' });
  });

  it('Test 3: resultado noop de performRollback é agregado como outcome noop, sem contar erro', async () => {
    const store = await import('../src/db/catalog-store.js');
    const { performBatchRollback } = await import('./rollback-batch.js');

    const runId = store.startIngestionRun({ categoryId: '1', categoryName: 'Vestidos' });
    seedProduct(store, 'prod-noop', runId);
    seedWrite(store, { productId: 'prod-noop', runId, writtenAt: '2026-07-16T10:00:00Z' });

    performRollback.mockResolvedValue({ noop: true });

    const summary = await performBatchRollback();

    expect(summary.total).toBe(1);
    expect(summary.errors).toBe(0);
    expect(summary.reverted).toBe(0);
    expect(summary.items[0].outcome).toBe('noop');
  });

  it('Test 4: importar o módulo nunca executa o corpo do CLI nem chama performRollback', async () => {
    await import('./rollback-batch.js');
    expect(performRollback).not.toHaveBeenCalled();
  });
});
