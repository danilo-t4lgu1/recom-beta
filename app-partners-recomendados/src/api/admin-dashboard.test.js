// Testes de src/api/admin-dashboard.js — agregação de leitura pura para o
// Painel Administrativo do Recom. Fixtures in-file, nunca lê data/catalog.db real.

import { describe, it, expect } from 'vitest';
import { buildAdminDashboard } from './admin-dashboard.js';

function makeProduct({ productId, name = null, fabricTagCanonical = null, variants = [] } = {}) {
  return { productId: String(productId), name, fabricTagCanonical, variants };
}

describe('buildAdminDashboard', () => {
  it('conta produtos relacionados só pelos que têm write_log com lista não-vazia', () => {
    const snapshotProducts = [makeProduct({ productId: '1' }), makeProduct({ productId: '2' })];
    const lastWrittenByProduct = new Map([
      ['1', ['2']],
      ['2', []],
    ]);

    const dashboard = buildAdminDashboard({ snapshotProducts, lastWrittenByProduct, lastRunSummary: null });

    expect(dashboard.relatedProducts).toEqual({ count: 1, totalProducts: 2 });
  });

  it('soma estoque só dos produtos que são ALVO de alguma recomendação gravada', () => {
    const snapshotProducts = [
      makeProduct({ productId: '1', variants: [{ stockTotal: 10 }] }),
      makeProduct({ productId: '2', variants: [{ stockTotal: 3 }, { stockTotal: 2 }] }),
      makeProduct({ productId: '3', variants: [{ stockTotal: 999 }] }), // nunca recomendado, não deve contar
    ];
    const lastWrittenByProduct = new Map([['1', ['2']]]);

    const dashboard = buildAdminDashboard({ snapshotProducts, lastWrittenByProduct, lastRunSummary: null });

    expect(dashboard.relatedProductsStock.totalUnitsInStock).toBe(5);
    expect(dashboard.relatedProductsStock.zeroStockCount).toBe(0);
    expect(dashboard.relatedProductsStock.items).toEqual([{ productId: '2', name: null, stockTotal: 5 }]);
  });

  it('marca zeroStockCount quando um produto recomendado ficou sem estoque', () => {
    const snapshotProducts = [
      makeProduct({ productId: '1' }),
      makeProduct({ productId: '2', variants: [{ stockTotal: 0 }] }),
    ];
    const lastWrittenByProduct = new Map([['1', ['2']]]);

    const dashboard = buildAdminDashboard({ snapshotProducts, lastWrittenByProduct, lastRunSummary: null });

    expect(dashboard.relatedProductsStock.zeroStockCount).toBe(1);
  });

  it('produto alvo recomendado que não existe mais no snapshot conta estoque 0, não lança', () => {
    const snapshotProducts = [makeProduct({ productId: '1' })];
    const lastWrittenByProduct = new Map([['1', ['produto-removido']]]);

    const dashboard = buildAdminDashboard({ snapshotProducts, lastWrittenByProduct, lastRunSummary: null });

    expect(dashboard.relatedProductsStock.items).toEqual([
      { productId: 'produto-removido', name: null, stockTotal: 0 },
    ]);
  });

  it('conta fabricTagFilled só onde fabricTagCanonical != null', () => {
    const snapshotProducts = [
      makeProduct({ productId: '1', fabricTagCanonical: 'Viscose' }),
      makeProduct({ productId: '2', fabricTagCanonical: null }),
    ];

    const dashboard = buildAdminDashboard({
      snapshotProducts,
      lastWrittenByProduct: new Map(),
      lastRunSummary: null,
    });

    expect(dashboard.fabricTagFilled).toEqual({ count: 1, total: 2 });
  });

  it('lastCronRun é null quando nenhuma ingestão bem-sucedida rodou ainda (fail-closed, sem lançar)', () => {
    const dashboard = buildAdminDashboard({
      snapshotProducts: [],
      lastWrittenByProduct: new Map(),
      lastRunSummary: null,
    });

    expect(dashboard.lastCronRun).toBeNull();
    expect(dashboard.relatedProducts).toEqual({ count: 0, totalProducts: 0 });
    expect(dashboard.fabricTagFilled).toEqual({ count: 0, total: 0 });
  });

  it('repassa lastRunSummary intacto quando presente', () => {
    const lastRunSummary = {
      runId: 42,
      status: 'success',
      startedAt: '2026-08-08T03:00:00.000Z',
      finishedAt: '2026-08-08T03:05:00.000Z',
      productsRead: 592,
    };

    const dashboard = buildAdminDashboard({
      snapshotProducts: [],
      lastWrittenByProduct: new Map(),
      lastRunSummary,
    });

    expect(dashboard.lastCronRun).toEqual(lastRunSummary);
  });
});
