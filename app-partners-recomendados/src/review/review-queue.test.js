// Testes de src/review/review-queue.js (APRV-01, D-22, D-23).
//
// Cobre os 7 comportamentos do Plano 04-02 Task 1: hasChanged (comparação por
// conjunto, ignora ordem) e buildReviewQueue (filtra o catálogo completo para
// só os produtos com diff real).
//
// Fixtures in-file (mesmas factories makeVariant/makeProduct de
// recommendation-engine.test.js, copiadas aqui por convenção de módulo de
// domínio isolado) — nunca lê data/catalog.db real.

import { describe, it, expect } from 'vitest';
import { hasChanged, buildReviewQueue } from './review-queue.js';
import { GROUP_LOOK_INTEIRO } from '../recommendation/recommendation-engine.js';

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
  name = null,
} = {}) {
  productCounter += 1;
  return {
    productId: productId != null ? String(productId) : `product-${productCounter}`,
    name,
    colorValue,
    fabricTagCanonical,
    hasAvailableGrade,
    variants,
    productGroupCanonical,
  };
}

describe('hasChanged - D-23 comparação por conjunto, ignora ordem', () => {
  it('ambos vazios retorna false (Test 1)', () => {
    expect(hasChanged([], [])).toBe(false);
  });

  it('mesmo id, tipos mistos number/string não geram falso-positivo (Test 2)', () => {
    expect(hasChanged(['1'], ['1'])).toBe(false);
    expect(hasChanged([1], ['1'])).toBe(false);
  });

  it('mesmo conjunto em ordem diferente NÃO é mudança (Test 3 / D-23)', () => {
    expect(hasChanged(['1', '2', '3'], ['3', '2', '1'])).toBe(false);
  });

  it('baseline não-vazio virando vazio, e vice-versa, SÃO mudança (Test 4 / D-23 simetria)', () => {
    expect(hasChanged(['1'], [])).toBe(true);
    expect(hasChanged([], ['1'])).toBe(true);
  });

  it('troca de 1 elemento com tamanho igual é mudança — não basta comparar .length (Test 5)', () => {
    expect(hasChanged(['1', '2'], ['1', '3'])).toBe(true);
  });
});

describe('buildReviewQueue - D-22 só produtos com diff real entram na fila', () => {
  it('retorna apenas os produtos com diff (B e C), com shape correto (Test 6)', () => {
    // Produto A: baseline igual ao cálculo do motor (Look Inteiro auto-contido) - sem mudança.
    const productA = makeProduct({ productId: 'A', name: 'Produto A' });
    const aCandidate = makeProduct({ productId: 'A-cand' });

    // Produto B: baseline diferente do cálculo do motor.
    const productB = makeProduct({ productId: 'B', name: 'Produto B' });
    const bCandidate = makeProduct({ productId: 'B-cand' });

    // Produto C: baseline vazio, motor retorna itens.
    const productC = makeProduct({ productId: 'C', name: 'Produto C' });
    const cCandidate = makeProduct({ productId: 'C-cand' });

    const catalogProducts = [productA, aCandidate, productB, bCandidate, productC, cCandidate];

    const baselineMap = new Map([
      ['A', 'A-cand'],
      ['B', 'some-other-id-not-in-result'],
      // C ausente do baselineMap => beforeIds: []
    ]);

    const result = buildReviewQueue(catalogProducts, baselineMap);

    expect(result.map((r) => r.productId).sort()).toEqual(['B', 'C']);

    const entryB = result.find((r) => r.productId === 'B');
    expect(entryB).toEqual({
      productId: 'B',
      name: 'Produto B',
      beforeIds: ['some-other-id-not-in-result'],
      afterIds: ['B-cand'],
    });

    const entryC = result.find((r) => r.productId === 'C');
    expect(entryC).toEqual({
      productId: 'C',
      name: 'Produto C',
      beforeIds: [],
      afterIds: ['C-cand'],
    });
  });

  it('não lança para catálogo vazio ou baselineMap vazio; ausência no Map é beforeIds: [] (Test 7)', () => {
    expect(() => buildReviewQueue([], new Map())).not.toThrow();
    expect(buildReviewQueue([], new Map())).toEqual([]);

    const productX = makeProduct({ productId: 'X', name: 'Produto X' });
    const candidateX = makeProduct({ productId: 'X-cand' });
    const catalogProducts = [productX, candidateX];

    expect(() => buildReviewQueue(catalogProducts, new Map())).not.toThrow();
    const result = buildReviewQueue(catalogProducts, new Map());
    expect(result.map((r) => r.productId)).toContain('X');
  });
});
