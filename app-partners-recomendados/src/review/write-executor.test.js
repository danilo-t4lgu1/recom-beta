// Testes de `write-executor.js` (WRTE-02/WRTE-04/WRTE-05, Pitfall 1/Pitfall 5
// do 05-RESEARCH.md).
//
// `client.js`/`catalog-store.js`/`notify-failure.js` são SEMPRE mockados
// (`vi.mock`, mesmo estilo de `ingest-catalog.test.js` linhas 22-32) — nenhum
// teste deste arquivo faz uma chamada de rede real à Nuvemshop nem abre um
// SQLite real. `vi.clearAllMocks()` em `beforeEach` isola cada teste.
//
// Test 7: decision null lança ApprovalRequiredError (gate inalterado)
// Test 8: dryRun:true retorna { dryRun: true, written: false, reason: 'dry run' }
//   sem chamar nenhum dos mocks
// Test 9: dryRun:false, findMetafield resolve null -> createMetafield chamado,
//   insertWriteLog com previousValue:null e status:success
// Test 10: dryRun:false, findMetafield resolve Metafield existente ->
//   updateMetafield chamado com o id existente, insertWriteLog com
//   previousValue igual ao value existente
// Test 11: dryRun:true nunca chama nenhum dos 4 mocks
//   (findMetafield/updateMetafield/createMetafield/insertWriteLog)
// Test 12 (Pitfall 5): falha real de escrita -> insertWriteLog status:failed,
//   notifyWriteFailure chamado, erro propagado é o ORIGINAL mesmo quando
//   notifyWriteFailure também rejeita
// Test 13: dryRun ausente (undefined) é tratado como falsy — cai no ramo REAL
//   (adaptação do antigo "Test 11" de fases anteriores, decisão documentada no
//   SUMMARY: adaptado em vez de removido, para provar o comportamento novo)

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ApprovalRequiredError } from './approval-gate.js';
import {
  executeApprovedWrite,
  executeScheduledWrite,
  filterReferentiallyValid,
} from './write-executor.js';
import { findMetafield, updateMetafield, createMetafield } from '../nuvemshop-client/client.js';
import { insertWriteLog } from '../db/catalog-store.js';
import { notifyWriteFailure } from './notify-failure.js';

vi.mock('../nuvemshop-client/client.js', () => ({
  findMetafield: vi.fn(),
  updateMetafield: vi.fn(),
  createMetafield: vi.fn(),
}));

vi.mock('../db/catalog-store.js', () => ({
  insertWriteLog: vi.fn(),
}));

vi.mock('./notify-failure.js', () => ({
  notifyWriteFailure: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('executeApprovedWrite', () => {
  it('Test 7: lança ApprovalRequiredError (propagada de assertApproved) quando decision é null', async () => {
    await expect(
      executeApprovedWrite({ productId: '1', decision: null, dryRun: true, runId: 1 })
    ).rejects.toThrow(ApprovalRequiredError);
  });

  it("Test 8: com decisão 'approved' e dryRun:true, NÃO faz I/O e retorna o shape de dry run", async () => {
    const decision = { status: 'approved', approvedRecommendationIds: ['2'] };
    const result = await executeApprovedWrite({ productId: '1', decision, dryRun: true, runId: 1 });

    expect(result).toEqual({
      productId: '1',
      approvedIds: ['2'],
      dryRun: true,
      written: false,
      reason: 'dry run',
    });
    expect(findMetafield).not.toHaveBeenCalled();
    expect(updateMetafield).not.toHaveBeenCalled();
    expect(createMetafield).not.toHaveBeenCalled();
    expect(insertWriteLog).not.toHaveBeenCalled();
  });

  it('Test 9: dryRun:false sem Metafield existente cria um novo via createMetafield e registra o log de sucesso', async () => {
    const decision = { status: 'approved', approvedRecommendationIds: ['2'] };
    vi.mocked(findMetafield).mockResolvedValue(null);
    vi.mocked(createMetafield).mockResolvedValue({ id: 'mf-new' });

    const result = await executeApprovedWrite({ productId: '1', decision, dryRun: false, runId: 7 });

    expect(createMetafield).toHaveBeenCalledWith({ ownerId: '1', value: JSON.stringify(['2']) });
    expect(updateMetafield).not.toHaveBeenCalled();
    expect(insertWriteLog).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: '1',
        runId: 7,
        metafieldId: 'mf-new',
        previousValue: null,
        writtenValue: JSON.stringify(['2']),
        triggeredBy: 'manual',
        status: 'success',
        errorMessage: null,
      })
    );
    expect(result).toEqual({ productId: '1', approvedIds: ['2'], dryRun: false, written: true });
  });

  it('Test 10: dryRun:false com Metafield existente atualiza via updateMetafield e registra o previousValue real', async () => {
    const decision = { status: 'approved', approvedRecommendationIds: ['2'] };
    vi.mocked(findMetafield).mockResolvedValue({ id: 'mf-1', value: '["9"]' });
    vi.mocked(updateMetafield).mockResolvedValue({ id: 'mf-1' });

    const result = await executeApprovedWrite({ productId: '1', decision, dryRun: false, runId: 7 });

    expect(updateMetafield).toHaveBeenCalledWith({ id: 'mf-1', value: JSON.stringify(['2']) });
    expect(createMetafield).not.toHaveBeenCalled();
    expect(insertWriteLog).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: '1',
        runId: 7,
        metafieldId: 'mf-1',
        previousValue: '["9"]',
        writtenValue: JSON.stringify(['2']),
        status: 'success',
      })
    );
    expect(result.written).toBe(true);
  });

  it('Test 11: dryRun:true nunca chama nenhum dos 4 mocks (findMetafield/updateMetafield/createMetafield/insertWriteLog)', async () => {
    const decision = { status: 'approved', approvedRecommendationIds: ['2'] };
    await executeApprovedWrite({ productId: '1', decision, dryRun: true, runId: 7 });

    expect(findMetafield).toHaveBeenCalledTimes(0);
    expect(updateMetafield).toHaveBeenCalledTimes(0);
    expect(createMetafield).toHaveBeenCalledTimes(0);
    expect(insertWriteLog).toHaveBeenCalledTimes(0);
  });

  it('Test 12 (Pitfall 5): falha real de escrita registra log de falha, notifica e propaga o erro ORIGINAL mesmo se o webhook também rejeitar', async () => {
    const decision = { status: 'approved', approvedRecommendationIds: ['2'] };
    vi.mocked(findMetafield).mockResolvedValue(null);
    vi.mocked(createMetafield).mockRejectedValue(new Error('Nuvemshop indisponível'));
    vi.mocked(notifyWriteFailure).mockRejectedValue(new Error('webhook também falhou'));

    await expect(
      executeApprovedWrite({ productId: '1', decision, dryRun: false, runId: 7 })
    ).rejects.toThrow('Nuvemshop indisponível');

    expect(insertWriteLog).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: '1',
        runId: 7,
        metafieldId: null,
        previousValue: null,
        status: 'failed',
        errorMessage: 'Nuvemshop indisponível',
      })
    );
    expect(notifyWriteFailure).toHaveBeenCalledTimes(1);
  });

  it('Test 13: dryRun ausente (undefined) é tratado como falsy — cai no ramo REAL', async () => {
    const decision = { status: 'approved', approvedRecommendationIds: ['2'] };
    vi.mocked(findMetafield).mockResolvedValue(null);
    vi.mocked(createMetafield).mockResolvedValue({ id: 'mf-new' });

    const result = await executeApprovedWrite({ productId: '1', decision, runId: 7 });

    expect(createMetafield).toHaveBeenCalledTimes(1);
    expect(result.dryRun).toBe(false);
    expect(result.written).toBe(true);
  });
});

// Defesa 2 referencial (D-67): função pura que reconfere cada id recomendado
// contra o snapshot atual (`snapshotById`) — existe, visível (`published !==
// false`), com estoque (`hasAvailableGrade`) e mesma cor normalizada da fonte.
// Ids que falham qualquer critério são descartados. Sem I/O, não lança.
describe('filterReferentiallyValid (Defesa 2, D-67)', () => {
  function entry(overrides = {}) {
    return {
      productId: '2',
      colorValue: 'Azul',
      hasAvailableGrade: true,
      published: true,
      ...overrides,
    };
  }

  it('descarta um id ausente do snapshotById', () => {
    const source = entry({ productId: '1' });
    const snapshotById = new Map(); // vazio — id '2' não existe
    expect(filterReferentiallyValid(source, ['2'], snapshotById)).toEqual([]);
  });

  it('descarta um id com published:false; NÃO descarta com published:null por visibilidade', () => {
    const source = entry({ productId: '1' });
    const snapshotById = new Map([
      ['2', entry({ productId: '2', published: false })],
      ['3', entry({ productId: '3', published: null })],
    ]);
    expect(filterReferentiallyValid(source, ['2', '3'], snapshotById)).toEqual(['3']);
  });

  it('descarta um id sem hasAvailableGrade e um id com cor diferente da fonte', () => {
    const source = entry({ productId: '1', colorValue: 'Azul' });
    const snapshotById = new Map([
      ['2', entry({ productId: '2', hasAvailableGrade: false })],
      ['3', entry({ productId: '3', colorValue: 'Vermelho' })],
    ]);
    expect(filterReferentiallyValid(source, ['2', '3'], snapshotById)).toEqual([]);
  });

  it('compara cor após normalização (trim + minúsculas)', () => {
    const source = entry({ productId: '1', colorValue: '  AZUL ' });
    const snapshotById = new Map([['2', entry({ productId: '2', colorValue: 'azul' })]]);
    expect(filterReferentiallyValid(source, ['2'], snapshotById)).toEqual(['2']);
  });

  it('preserva a ordem/conteúdo dos ids válidos quando todos passam', () => {
    const source = entry({ productId: '1', colorValue: 'Azul' });
    const snapshotById = new Map([
      ['2', entry({ productId: '2' })],
      ['3', entry({ productId: '3' })],
      ['4', entry({ productId: '4' })],
    ]);
    expect(filterReferentiallyValid(source, ['4', '2', '3'], snapshotById)).toEqual(['4', '2', '3']);
  });

  it('não lança para entradas ausentes (função pura)', () => {
    const source = entry({ productId: '1' });
    expect(() => filterReferentiallyValid(source, ['999'], new Map())).not.toThrow();
  });
});

// Caminho `scheduled` (D-61): grava automaticamente SEM o gate de aprovação
// prévia, aplicando a Defesa 2 antes de qualquer escrita, gravando
// `triggered_by:'scheduled'` no write_log e respeitando `dryRun` com zero I/O.
// NUNCA fabrica um objeto de decisão `{ status:'approved' }` (Anti-Pattern
// _batch-write.js) nem chama `assertApproved`.
describe('executeScheduledWrite (caminho scheduled, D-61/D-67)', () => {
  function source(overrides = {}) {
    return {
      productId: '1',
      colorValue: 'Azul',
      hasAvailableGrade: true,
      published: true,
      ...overrides,
    };
  }
  function snapshotWith(ids, overrides = {}) {
    return new Map(
      ids.map((id) => [
        String(id),
        {
          productId: String(id),
          colorValue: 'Azul',
          hasAvailableGrade: true,
          published: true,
          ...overrides,
        },
      ])
    );
  }

  it('SC1: dryRun:false com ids válidos grava e registra write_log com triggeredBy:scheduled', async () => {
    vi.mocked(findMetafield).mockResolvedValue(null);
    vi.mocked(createMetafield).mockResolvedValue({ id: 'mf-new' });

    const result = await executeScheduledWrite({
      productId: '1',
      recommendedIds: ['2'],
      dryRun: false,
      runId: 42,
      sourceEntry: source(),
      snapshotById: snapshotWith(['2']),
    });

    expect(createMetafield).toHaveBeenCalledWith({ ownerId: '1', value: JSON.stringify(['2']) });
    expect(insertWriteLog).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: '1',
        runId: 42,
        metafieldId: 'mf-new',
        previousValue: null,
        writtenValue: JSON.stringify(['2']),
        triggeredBy: 'scheduled',
        status: 'success',
      })
    );
    expect(result).toEqual({ productId: '1', approvedIds: ['2'], dryRun: false, written: true });
  });

  it('SC2: nunca registra triggeredBy:manual no caminho scheduled', async () => {
    vi.mocked(findMetafield).mockResolvedValue(null);
    vi.mocked(createMetafield).mockResolvedValue({ id: 'mf-new' });

    await executeScheduledWrite({
      productId: '1',
      recommendedIds: ['2'],
      dryRun: false,
      runId: 42,
      sourceEntry: source(),
      snapshotById: snapshotWith(['2']),
    });

    expect(insertWriteLog).not.toHaveBeenCalledWith(
      expect.objectContaining({ triggeredBy: 'manual' })
    );
  });

  it('SC3: todos os ids inválidos pela Defesa 2 → written:false, reason:coverage-gap, sem escrita', async () => {
    const result = await executeScheduledWrite({
      productId: '1',
      recommendedIds: ['2'],
      dryRun: false,
      runId: 42,
      sourceEntry: source(),
      snapshotById: snapshotWith(['2'], { published: false }), // oculto → descartado
    });

    expect(result).toEqual({ productId: '1', approvedIds: [], written: false, reason: 'coverage-gap' });
    expect(findMetafield).not.toHaveBeenCalled();
    expect(updateMetafield).not.toHaveBeenCalled();
    expect(createMetafield).not.toHaveBeenCalled();
    expect(insertWriteLog).not.toHaveBeenCalled();
  });

  it('SC4: dryRun:true não faz nenhuma chamada de rede/DB (zero I/O)', async () => {
    const result = await executeScheduledWrite({
      productId: '1',
      recommendedIds: ['2'],
      dryRun: true,
      runId: 42,
      sourceEntry: source(),
      snapshotById: snapshotWith(['2']),
    });

    expect(findMetafield).not.toHaveBeenCalled();
    expect(updateMetafield).not.toHaveBeenCalled();
    expect(createMetafield).not.toHaveBeenCalled();
    expect(insertWriteLog).not.toHaveBeenCalled();
    expect(result).toEqual({
      productId: '1',
      approvedIds: ['2'],
      dryRun: true,
      written: false,
      reason: 'dry run',
    });
  });

  it('SC5: falha real de escrita registra write_log failed com triggeredBy:scheduled, notifica e propaga o erro original', async () => {
    vi.mocked(findMetafield).mockResolvedValue(null);
    vi.mocked(createMetafield).mockRejectedValue(new Error('Nuvemshop indisponível'));
    vi.mocked(notifyWriteFailure).mockRejectedValue(new Error('webhook também falhou'));

    await expect(
      executeScheduledWrite({
        productId: '1',
        recommendedIds: ['2'],
        dryRun: false,
        runId: 42,
        sourceEntry: source(),
        snapshotById: snapshotWith(['2']),
      })
    ).rejects.toThrow('Nuvemshop indisponível');

    expect(insertWriteLog).toHaveBeenCalledWith(
      expect.objectContaining({ triggeredBy: 'scheduled', status: 'failed', errorMessage: 'Nuvemshop indisponível' })
    );
    expect(notifyWriteFailure).toHaveBeenCalledWith(
      expect.objectContaining({ triggeredBy: 'scheduled' })
    );
  });
});

// Regressão do gate manual (APRV-03): a Defesa 1 do caminho manual NÃO pode
// ser reaberta — `executeApprovedWrite` continua exigindo `assertApproved` como
// primeira operação.
describe('regressão — gate manual (APRV-03) intacto', () => {
  it('executeApprovedWrite ainda lança ApprovalRequiredError quando decision não é approved', async () => {
    await expect(
      executeApprovedWrite({ productId: '1', decision: { status: 'rejected' }, dryRun: false, runId: 1 })
    ).rejects.toThrow(ApprovalRequiredError);
    expect(findMetafield).not.toHaveBeenCalled();
    expect(insertWriteLog).not.toHaveBeenCalled();
  });
});
