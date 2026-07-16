// Testes de src/review/diff.js (APRV-01, D-19, D-20, D-21, Pitfall 1 do
// 04-RESEARCH.md).
//
// Cobre os 7 comportamentos do Plano 04-02 Task 2: recomputeAfterRemoval
// (backfill via recomputação com catálogo filtrado) e computeDiff (diff
// antes/depois com status added/removed/kept).
//
// Fixtures in-file (mesmas factories makeVariant/makeProduct de
// recommendation-engine.test.js, copiadas aqui por convenção de módulo de
// domínio isolado) — nunca lê data/catalog.db real.

import { describe, it, expect } from 'vitest';
import { computeDiff, recomputeAfterRemoval } from './diff.js';
import {
  recommendForProduct,
  GROUP_LOOK_INTEIRO,
  GROUP_PARTES_DE_CIMA,
  GROUP_PARTES_DE_BAIXO,
} from '../recommendation/recommendation-engine.js';

let variantCounter = 0;
function makeVariant({ sizeValue = null, stockTotal = 0 } = {}) {
  variantCounter += 1;
  return { variantId: `variant-${variantCounter}`, sizeValue, stockTotal };
}

let productCounter = 0;
function makeProduct({
  productId,
  colorValue = 'Preto',
  fabricTagCanonical = 'Viscose',
  hasAvailableGrade = true,
  variants = [],
  productGroupCanonical = GROUP_LOOK_INTEIRO,
} = {}) {
  productCounter += 1;
  return {
    productId: productId != null ? String(productId) : `product-${productCounter}`,
    name: null,
    colorValue,
    fabricTagCanonical,
    hasAvailableGrade,
    variants,
    productGroupCanonical,
  };
}

describe('recomputeAfterRemoval - D-20 backfill via catálogo filtrado', () => {
  it('removedIds vazio é no-op: resultado idêntico a recommendForProduct direto (Test 8)', () => {
    const source = makeProduct({ productId: '1' });
    const candidates = ['11', '12', '13'].map((id, i) =>
      makeProduct({ productId: id, variants: [makeVariant({ sizeValue: 'P', stockTotal: 30 - i * 10 })] })
    );
    const catalog = [source, ...candidates];

    const direct = recommendForProduct('1', catalog);
    const viaRemoval = recomputeAfterRemoval('1', catalog, []);

    expect(viaRemoval).toEqual(direct);
  });

  it('remover 1 candidato elegível faz ele desaparecer do resultado; resultado só encolhe (Test 9)', () => {
    const source = makeProduct({ productId: '1' });
    const candidates = ['11', '12', '13'].map((id, i) =>
      makeProduct({ productId: id, variants: [makeVariant({ sizeValue: 'P', stockTotal: 30 - i * 10 })] })
    );
    const catalog = [source, ...candidates];

    const result = recomputeAfterRemoval('1', catalog, ['12']);

    expect(result.map((r) => r.productId)).toEqual(['11', '13']);
  });

  it('Pitfall 1: remover 1 dos 4 da cota mesmo-grupo faz o 5º elegível (antes fora da cota) aparecer via backfill (Test 10)', () => {
    const source = makeProduct({
      productId: '1',
      colorValue: 'Preto',
      fabricTagCanonical: 'Viscose',
      productGroupCanonical: GROUP_PARTES_DE_CIMA,
    });

    // 5 candidatos elegíveis do MESMO grupo — mais que GROUP_QUOTA_PER_SIDE (4).
    const sameIds = ['11', '12', '13', '14', '15'];
    const sameStocks = [50, 40, 30, 20, 10];
    const sameGroupCandidates = sameIds.map((id, i) =>
      makeProduct({
        productId: id,
        colorValue: 'Preto',
        fabricTagCanonical: 'Viscose',
        productGroupCanonical: GROUP_PARTES_DE_CIMA,
        variants: [makeVariant({ sizeValue: 'P', stockTotal: sameStocks[i] })],
      })
    );

    // 4 candidatos elegíveis do grupo cruzado — preenche a cota cruzada exatamente,
    // sem deixar shortfall que faria o backfill "vazar" para o 5º mesmo-grupo sozinho.
    const crossIds = ['21', '22', '23', '24'];
    const crossStocks = [45, 35, 25, 15];
    const crossGroupCandidates = crossIds.map((id, i) =>
      makeProduct({
        productId: id,
        colorValue: 'Preto',
        fabricTagCanonical: 'Algodao',
        productGroupCanonical: GROUP_PARTES_DE_BAIXO,
        variants: [makeVariant({ sizeValue: 'P', stockTotal: crossStocks[i] })],
      })
    );

    const catalog = [source, ...sameGroupCandidates, ...crossGroupCandidates];

    // Antes da remoção: '15' (5º mesmo-grupo, pior estoque) fica fora da cota.
    const before = recommendForProduct('1', catalog);
    expect(before.map((r) => r.productId)).not.toContain('15');

    // Remove '12' (um dos 4 que apareceriam na cota mesmo-grupo).
    const after = recomputeAfterRemoval('1', catalog, ['12']);

    expect(after.map((r) => r.productId)).not.toContain('12');
    expect(after.map((r) => r.productId)).toContain('15');
    expect(after.map((r) => r.productId)).toEqual(['11', '13', '14', '15', '21', '22', '23', '24']);
  });
});

describe('computeDiff - D-19/D-21 status added/removed/kept', () => {
  it('beforeIds igual ao resultado do motor: todo item kept, nenhum added/removed (Test 11)', () => {
    const source = makeProduct({ productId: '1' });
    const candidates = ['11', '12'].map((id, i) =>
      makeProduct({ productId: id, variants: [makeVariant({ sizeValue: 'P', stockTotal: 20 - i * 10 })] })
    );
    const catalog = [source, ...candidates];

    const engineResult = recommendForProduct('1', catalog);
    const beforeIds = engineResult.map((r) => r.productId);

    const diff = computeDiff('1', catalog, beforeIds);

    expect(diff.items.every((item) => item.status === 'kept')).toBe(true);
    expect(diff.items.some((item) => item.status === 'added')).toBe(false);
    expect(diff.items.some((item) => item.status === 'removed')).toBe(false);
  });

  it('beforeIds com id ausente do resultado do motor gera status removed; ids novos geram added (Test 12)', () => {
    const source = makeProduct({ productId: '1' });
    const candidate = makeProduct({ productId: '11', variants: [makeVariant({ sizeValue: 'P', stockTotal: 10 })] });
    const catalog = [source, candidate];

    const beforeIds = ['99']; // não está no resultado do motor

    const diff = computeDiff('1', catalog, beforeIds);

    const removedItem = diff.items.find((item) => item.productId === '99');
    expect(removedItem).toEqual({ productId: '99', status: 'removed', recommendation: null });

    const addedItem = diff.items.find((item) => item.productId === '11');
    expect(addedItem.status).toBe('added');
    expect(addedItem.recommendation).not.toBeNull();
  });

  it('removedIds no computeDiff exclui o id de afterIds mas engineComputedIds (pré-curadoria) ainda o contém (Test 13)', () => {
    const source = makeProduct({ productId: '1' });
    const candidates = ['11', '12'].map((id, i) =>
      makeProduct({ productId: id, variants: [makeVariant({ sizeValue: 'P', stockTotal: 20 - i * 10 })] })
    );
    const catalog = [source, ...candidates];

    const diff = computeDiff('1', catalog, [], { removedIds: ['11'] });

    expect(diff.afterIds).not.toContain('11');
    expect(diff.engineComputedIds).toContain('11');
  });

  it('nunca lança para catalogProducts vazio/undefined, beforeIds undefined, ou productId inexistente (Test 14)', () => {
    expect(() => computeDiff('1', [], undefined)).not.toThrow();
    const emptyDiff = computeDiff('1', [], undefined);
    expect(emptyDiff.afterIds).toEqual([]);
    expect(emptyDiff.items).toEqual([]);

    expect(() => computeDiff('1', undefined, undefined)).not.toThrow();
    expect(() => computeDiff('999', [makeProduct({ productId: '1' })], ['5'])).not.toThrow();

    const nonExistentSourceDiff = computeDiff('999', [makeProduct({ productId: '1' })], ['5']);
    expect(nonExistentSourceDiff.afterIds).toEqual([]);
    expect(nonExistentSourceDiff.items.map((i) => i.productId)).toEqual(['5']);
    expect(nonExistentSourceDiff.items[0].status).toBe('removed');
  });
});
