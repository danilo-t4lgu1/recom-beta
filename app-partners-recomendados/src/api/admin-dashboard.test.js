// Testes de src/api/admin-dashboard.js — agregação de leitura pura para o
// Painel Administrativo do Recom. Fixtures in-file, nunca lê data/catalog.db real.

import { describe, it, expect } from 'vitest';
import { buildAdminDashboard, buildFabricTagDetail, buildCronLog } from './admin-dashboard.js';

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

describe('buildFabricTagDetail (Card Tecido preenchido em tags — achado 2026-08-10)', () => {
  it('agrega por fabricTagCanonical (Grupo de Tecidos) e conta os sem tag separadamente', () => {
    const snapshotProducts = [
      makeProduct({ productId: '1', fabricTagCanonical: 'Malha' }),
      makeProduct({ productId: '2', fabricTagCanonical: 'Malha' }),
      makeProduct({ productId: '3', fabricTagCanonical: 'Alfaiataria' }),
      makeProduct({ productId: '4', fabricTagCanonical: null }),
    ];

    const detail = buildFabricTagDetail({ snapshotProducts });

    expect(detail.total).toBe(4);
    expect(detail.filledCount).toBe(3);
    expect(detail.missingCount).toBe(1);
    expect(detail.byGroup).toEqual([
      { group: 'Malha', count: 2 },
      { group: 'Alfaiataria', count: 1 },
    ]);
  });

  it('monta rows produto-a-produto com sku (primeira variante não-nula), estoque somado e hasTag', () => {
    const snapshotProducts = [
      makeProduct({
        productId: '1',
        name: 'Vestido Marta Em Malha Marrom',
        fabricTagCanonical: 'Malha',
        variants: [
          { sku: null, stockTotal: 5 },
          { sku: '6051704201', stockTotal: 14 },
        ],
      }),
      makeProduct({ productId: '2', name: 'Blusa Pâmela Off White', fabricTagCanonical: null, variants: [{ sku: '9032900201', stockTotal: 62 }] }),
    ];

    const detail = buildFabricTagDetail({ snapshotProducts });

    expect(detail.rows).toEqual([
      { productId: '1', name: 'Vestido Marta Em Malha Marrom', sku: '6051704201', stockTotal: 19, hasTag: true, fabricTagCanonical: 'Malha' },
      { productId: '2', name: 'Blusa Pâmela Off White', sku: '9032900201', stockTotal: 62, hasTag: false, fabricTagCanonical: null },
    ]);
  });

  it('catálogo vazio retorna zeros e arrays vazios, nunca lança', () => {
    const detail = buildFabricTagDetail({ snapshotProducts: [] });
    expect(detail).toEqual({ total: 0, filledCount: 0, missingCount: 0, byGroup: [], rows: [] });
  });

  it('produto sem nenhuma variante com sku vira sku:null nas rows, sem lançar', () => {
    const snapshotProducts = [
      makeProduct({ productId: '1', fabricTagCanonical: 'Crepe', variants: [{ sku: null, stockTotal: 3 }] }),
    ];
    const detail = buildFabricTagDetail({ snapshotProducts });
    expect(detail.rows[0].sku).toBeNull();
  });
});

describe('buildCronLog (Card Cron Diário — achado 2026-08-10)', () => {
  function makeRun({ runId, startedAt, finishedAt = startedAt, status = 'success', productsRead }) {
    return { runId, startedAt, finishedAt, status, productsRead };
  }
  function makeWrite({ productId, writtenValue, writtenAt, status = 'success' }) {
    return { productId, writtenValue: JSON.stringify(writtenValue), status, writtenAt };
  }

  it('ingestionRuns vazio retorna [] sem lançar', () => {
    expect(buildCronLog({ ingestionRuns: [], writeLogRows: [], dailyRecomputeLogRows: [] })).toEqual([]);
  });

  it('preenche dias SEM nenhum run bem-sucedido como NÃO ATUALIZADO, sem buraco silencioso', () => {
    const ingestionRuns = [
      makeRun({ runId: 1, startedAt: '2026-07-17T10:00:00.000Z', productsRead: 672 }),
      // 07-18 sem run nenhum (gap real, ex: 2026-07-23/2026-08-03)
      makeRun({ runId: 2, startedAt: '2026-07-19T10:00:00.000Z', productsRead: 1724 }),
    ];

    const rows = buildCronLog({ ingestionRuns, writeLogRows: [], dailyRecomputeLogRows: [] });

    expect(rows.map((r) => r.date)).toEqual(['2026-07-17', '2026-07-18', '2026-07-19']);
    expect(rows[1]).toMatchObject({ status: 'NÃO ATUALIZADO', catalog: null, related: null, time: null });
    expect(rows[0].status).toBe('ATUALIZADO');
    expect(rows[0].catalog).toBe(672);
  });

  it('usa a execução success MAIS RECENTE do dia quando há mais de uma (ex: cron + workflow_dispatch no mesmo dia)', () => {
    const ingestionRuns = [
      makeRun({ runId: 1, startedAt: '2026-07-22T12:06:00.000Z', productsRead: 1724 }),
      makeRun({ runId: 2, startedAt: '2026-07-22T13:42:00.000Z', productsRead: 1724 }),
    ];

    const rows = buildCronLog({ ingestionRuns, writeLogRows: [], dailyRecomputeLogRows: [] });

    expect(rows).toHaveLength(1);
    expect(rows[0].time).toBe('13:42');
  });

  it('reconstrói related HISTÓRICO via sweep cronológico de write_log, não o valor atual', () => {
    const ingestionRuns = [
      makeRun({ runId: 1, startedAt: '2026-08-10T06:00:00.000Z', finishedAt: '2026-08-10T06:05:00.000Z', productsRead: 3022 }),
      makeRun({ runId: 2, startedAt: '2026-08-11T06:00:00.000Z', finishedAt: '2026-08-11T06:05:00.000Z', productsRead: 3042 }),
    ];
    const writeLogRows = [
      makeWrite({ productId: '1', writtenValue: ['a'], writtenAt: '2026-08-10T06:03:00.000Z' }),
      makeWrite({ productId: '2', writtenValue: ['b'], writtenAt: '2026-08-10T06:04:00.000Z' }),
      // Escrita nova só depois do 1º dia -- não deve contar no related de 08-10.
      makeWrite({ productId: '3', writtenValue: ['c'], writtenAt: '2026-08-11T06:03:00.000Z' }),
    ];

    const rows = buildCronLog({ ingestionRuns, writeLogRows, dailyRecomputeLogRows: [] });

    expect(rows[0].related).toBe(2); // só produtos 1 e 2 até 08-10
    expect(rows[1].related).toBe(3); // produto 3 já entra em 08-11
  });

  it('conjunto vazio (zerado) escrito depois reduz o related histórico corretamente', () => {
    const ingestionRuns = [
      makeRun({ runId: 1, startedAt: '2026-08-10T06:00:00.000Z', finishedAt: '2026-08-10T06:05:00.000Z', productsRead: 100 }),
      makeRun({ runId: 2, startedAt: '2026-08-11T06:00:00.000Z', finishedAt: '2026-08-11T06:05:00.000Z', productsRead: 100 }),
    ];
    const writeLogRows = [
      makeWrite({ productId: '1', writtenValue: ['a'], writtenAt: '2026-08-10T06:03:00.000Z' }),
      makeWrite({ productId: '1', writtenValue: [], writtenAt: '2026-08-11T06:03:00.000Z' }), // apagão
    ];

    const rows = buildCronLog({ ingestionRuns, writeLogRows, dailyRecomputeLogRows: [] });

    expect(rows[0].related).toBe(1);
    expect(rows[1].related).toBe(0);
  });

  it('dailyRecompute fica null em dias anteriores à persistência (gap de dado documentado, não bug)', () => {
    const ingestionRuns = [
      makeRun({ runId: 1, startedAt: '2026-07-17T06:00:00.000Z', productsRead: 672 }),
    ];

    const rows = buildCronLog({ ingestionRuns, writeLogRows: [], dailyRecomputeLogRows: [] });

    expect(rows[0].dailyRecompute).toBeNull();
  });

  it('junta dailyRecomputeLogRows por dia, status vira maiúsculo (OK/ERROR)', () => {
    const ingestionRuns = [
      makeRun({ runId: 1, startedAt: '2026-08-10T06:00:00.000Z', productsRead: 3022 }),
    ];
    const dailyRecomputeLogRows = [
      { startedAt: '2026-08-10T06:04:00.000Z', status: 'ok' },
    ];

    const rows = buildCronLog({ ingestionRuns, writeLogRows: [], dailyRecomputeLogRows });

    expect(rows[0].dailyRecompute).toBe('OK');
  });

  it('quando um dia NÃO ATUALIZADO tem uma linha de daily_recompute_log error (falha catastrófica com runId:null), reflete ERROR mesmo sem ingestion_runs correspondente', () => {
    const ingestionRuns = [
      makeRun({ runId: 1, startedAt: '2026-08-09T06:00:00.000Z', productsRead: 3222 }),
      makeRun({ runId: 2, startedAt: '2026-08-11T06:00:00.000Z', productsRead: 3222 }),
    ];
    const dailyRecomputeLogRows = [
      { startedAt: '2026-08-10T06:00:00.000Z', status: 'error', reason: '502 Bad Gateway' },
    ];

    const rows = buildCronLog({ ingestionRuns, writeLogRows: [], dailyRecomputeLogRows });

    const day10 = rows.find((r) => r.date === '2026-08-10');
    expect(day10.status).toBe('NÃO ATUALIZADO');
    expect(day10.dailyRecompute).toBe('ERROR');
  });
});
