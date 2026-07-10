// Testes de src/ingestion/stock-availability.js (D-04/DATA-01).
//
// Cobre os 6 comportamentos do plano 02-02: soma de inventory_levels[] (nunca
// variant.stock), regra de negócio "grade >= 3 tamanhos em estoque" como função
// nomeada/configurável, e resiliência a produtos malformados (T-02-06).

import { describe, it, expect } from 'vitest';
import { getVariantStock, hasAvailableGrade } from './stock-availability.js';

describe('getVariantStock', () => {
  it('soma todos os inventory_levels de uma variante (Test 1)', () => {
    const variant = {
      inventory_levels: [
        { location_id: 'A', stock: 3 },
        { location_id: 'B', stock: 2 },
      ],
    };
    expect(getVariantStock(variant)).toBe(5);
  });

  it('retorna 0 sem lançar exceção quando inventory_levels é vazio ou ausente (Test 2)', () => {
    expect(getVariantStock({ inventory_levels: [] })).toBe(0);
    expect(getVariantStock({})).toBe(0);
    expect(getVariantStock({ inventory_levels: undefined })).toBe(0);
  });
});

describe('hasAvailableGrade', () => {
  function makeVariant(stock) {
    return { inventory_levels: [{ location_id: 'A', stock }] };
  }

  it('retorna true quando >= minSizesInStock variantes têm estoque > 0 (Test 3)', () => {
    const product = {
      variants: [makeVariant(3), makeVariant(2), makeVariant(1), makeVariant(0)],
    };
    expect(hasAvailableGrade(product, { minSizesInStock: 3 })).toBe(true);
  });

  it('retorna false quando menos de minSizesInStock variantes têm estoque > 0 (Test 4)', () => {
    const product = {
      variants: [makeVariant(3), makeVariant(2), makeVariant(0), makeVariant(0)],
    };
    expect(hasAvailableGrade(product, { minSizesInStock: 3 })).toBe(false);
  });

  it('usa o default minSizesInStock = 3 quando a opção não é passada (Test 5)', () => {
    const productAvailable = {
      variants: [makeVariant(3), makeVariant(2), makeVariant(1), makeVariant(0)],
    };
    const productUnavailable = {
      variants: [makeVariant(3), makeVariant(2), makeVariant(0), makeVariant(0)],
    };
    expect(hasAvailableGrade(productAvailable)).toBe(true);
    expect(hasAvailableGrade(productUnavailable)).toBe(false);
  });

  it('retorna false sem lançar exceção quando product.variants está ausente/vazio (Test 6)', () => {
    expect(hasAvailableGrade({}, { minSizesInStock: 3 })).toBe(false);
    expect(hasAvailableGrade({ variants: [] }, { minSizesInStock: 3 })).toBe(false);
    expect(hasAvailableGrade({ variants: undefined })).toBe(false);
  });
});
