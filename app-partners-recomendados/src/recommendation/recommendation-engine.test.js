// Testes de src/recommendation/recommendation-engine.js (RULE-01/RULE-02, D-13,
// D-15, D-16, D-17, D-18).
//
// Cobre os 16 comportamentos dos planos 03-01 (Tests 1-10: elegibilidade estrita,
// objetos ricos D-18, determinismo, pureza) e 03-02... na verdade ambas as tasks
// deste MESMO plano 03-01 (Task 1: Tests 1-10; Task 2: Tests 11-16, cascata D-13).
//
// Fixtures in-file com `fabricTagCanonical` preenchido manualmente (D-16) — nunca
// lê o dump SQLite real do catálogo (que está com 0/645 tags preenchidas hoje).

import { describe, it, expect } from 'vitest';
import { recommendForProduct, MAX_RECOMMENDATIONS } from './recommendation-engine.js';

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
} = {}) {
  productCounter += 1;
  return {
    productId: productId != null ? String(productId) : `product-${productCounter}`,
    name: null,
    colorValue,
    fabricTagCanonical,
    hasAvailableGrade,
    variants,
  };
}

describe('recommendForProduct - elegibilidade estrita e objetos ricos (Task 1)', () => {
  it('retorna exatamente os candidatos elegíveis: mesma cor + mesmo tecido + grade disponível (Test 1)', () => {
    const source = makeProduct({ productId: '1', colorValue: 'Preto', fabricTagCanonical: 'Viscose' });
    const eligible1 = makeProduct({ productId: '2', colorValue: 'Preto', fabricTagCanonical: 'Viscose' });
    const eligible2 = makeProduct({ productId: '3', colorValue: 'Preto', fabricTagCanonical: 'Viscose' });
    const eligible3 = makeProduct({ productId: '4', colorValue: 'Preto', fabricTagCanonical: 'Viscose' });
    const wrongColor = makeProduct({ productId: '5', colorValue: 'Vermelho', fabricTagCanonical: 'Viscose' });
    const wrongFabric = makeProduct({ productId: '6', colorValue: 'Preto', fabricTagCanonical: 'Algodao' });
    const noStock = makeProduct({
      productId: '7',
      colorValue: 'Preto',
      fabricTagCanonical: 'Viscose',
      hasAvailableGrade: false,
    });

    const catalog = [source, eligible1, eligible2, eligible3, wrongColor, wrongFabric, noStock];
    const result = recommendForProduct('1', catalog);

    expect(result.map((r) => r.productId).sort()).toEqual(['2', '3', '4']);
    expect(result.length).toBeLessThanOrEqual(MAX_RECOMMENDATIONS);
  });

  it('exclui candidato com hasAvailableGrade falso mesmo com mesma cor e tecido (Test 2)', () => {
    const source = makeProduct({ productId: '1' });
    const noStock = makeProduct({ productId: '2', hasAvailableGrade: false });
    const result = recommendForProduct('1', [source, noStock]);
    expect(result).toEqual([]);
  });

  it('exclui candidato com fabricTagCanonical null mesmo com cor igual e estoque (Test 3 / D-15)', () => {
    const source = makeProduct({ productId: '1' });
    const noFabric = makeProduct({
      productId: '2',
      fabricTagCanonical: null,
      variants: [makeVariant({ stockTotal: 5 })],
    });
    const result = recommendForProduct('1', [source, noFabric]);
    expect(result).toEqual([]);
  });

  it('fonte inelegível retorna [] sem lançar (Test 4)', () => {
    const sourceNoFabric = makeProduct({
      productId: '1',
      fabricTagCanonical: null,
      variants: [makeVariant({ stockTotal: 5 })],
    });
    const candidate = makeProduct({ productId: '2' });
    expect(() => recommendForProduct('1', [sourceNoFabric, candidate])).not.toThrow();
    expect(recommendForProduct('1', [sourceNoFabric, candidate])).toEqual([]);

    const sourceNoColor = makeProduct({ productId: '3', colorValue: null });
    const candidate2 = makeProduct({ productId: '4', colorValue: null });
    expect(() => recommendForProduct('3', [sourceNoColor, candidate2])).not.toThrow();
    expect(recommendForProduct('3', [sourceNoColor, candidate2])).toEqual([]);
  });

  it('productId inexistente ou catalogProducts vazio/undefined retorna [] sem lançar (Test 5)', () => {
    const source = makeProduct({ productId: '1' });
    expect(recommendForProduct('999', [source])).toEqual([]);
    expect(recommendForProduct('1', [])).toEqual([]);
    expect(() => recommendForProduct('1', undefined)).not.toThrow();
    expect(recommendForProduct('1', undefined)).toEqual([]);
  });

  it('candidato com cor diferente é excluído; match de cor é normalizado trim+case-insensitive (Test 6)', () => {
    const source = makeProduct({ productId: '1', colorValue: 'Preto' });
    const sameColorNormalized = makeProduct({ productId: '2', colorValue: ' preto ' });
    const differentColor = makeProduct({ productId: '3', colorValue: 'Vermelho' });

    const result = recommendForProduct('1', [source, sameColorNormalized, differentColor]);
    expect(result.map((r) => r.productId)).toEqual(['2']);
  });

  it('o próprio produto-fonte nunca aparece na sua lista de recomendações (Test 7)', () => {
    const source = makeProduct({ productId: '1' });
    const other = makeProduct({ productId: '2' });
    const result = recommendForProduct('1', [source, other]);
    expect(result.some((r) => r.productId === '1')).toBe(false);
  });

  it('cada objeto retornado tem exatamente os campos D-18 (Test 8)', () => {
    const source = makeProduct({ productId: '1' });
    const candidate = makeProduct({
      productId: '2',
      variants: [
        makeVariant({ sizeValue: 'P', stockTotal: 3 }),
        makeVariant({ sizeValue: 'M', stockTotal: 0 }),
        makeVariant({ sizeValue: 'G', stockTotal: 2 }),
      ],
    });

    const [recommendation] = recommendForProduct('1', [source, candidate]);

    expect(Object.keys(recommendation).sort()).toEqual(
      [
        'centralSizesStock',
        'colorValue',
        'fabricTagCanonical',
        'productId',
        'sizesWithStock',
        'stockBySize',
        'stockTotal',
      ].sort()
    );
    expect(recommendation.productId).toBe('2');
    expect(recommendation.colorValue).toBe('Preto');
    expect(recommendation.fabricTagCanonical).toBe('Viscose');
    expect(recommendation.stockTotal).toBe(5);
    expect(recommendation.sizesWithStock).toBe(2);
    expect(recommendation.stockBySize).toEqual([
      { sizeValue: 'P', stock: 3 },
      { sizeValue: 'M', stock: 0 },
      { sizeValue: 'G', stock: 2 },
    ]);
  });

  it('duas chamadas consecutivas com o mesmo fixture retornam resultado deeply-equal (Test 9 / RULE-02)', () => {
    const source = makeProduct({ productId: '1' });
    const candidate1 = makeProduct({ productId: '2', variants: [makeVariant({ sizeValue: 'P', stockTotal: 3 })] });
    const candidate2 = makeProduct({ productId: '3', variants: [makeVariant({ sizeValue: 'M', stockTotal: 1 })] });
    const catalog = [source, candidate1, candidate2];

    const firstCall = recommendForProduct('1', catalog);
    const secondCall = recommendForProduct('1', catalog);

    expect(firstCall).toEqual(secondCall);
  });

  it('nunca faz nenhuma chamada de rede — stub de fetch nunca é invocado (Test 10 / Success Criteria #4)', () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () => {
      throw new Error('recommendForProduct não deve chamar fetch');
    };

    try {
      const source = makeProduct({ productId: '1' });
      const candidate = makeProduct({ productId: '2' });
      expect(() => recommendForProduct('1', [source, candidate])).not.toThrow();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('recommendForProduct - cascata de desempate D-13 e limite de 8 (Task 2)', () => {
  it('com 10 elegíveis retorna exatamente 8, ordenados por stockTotal decrescente (Test 11)', () => {
    const source = makeProduct({ productId: '1' });
    const candidates = [];
    for (let i = 1; i <= 10; i += 1) {
      candidates.push(
        makeProduct({
          productId: String(100 + i),
          variants: [makeVariant({ sizeValue: 'P', stockTotal: i * 10 })],
        })
      );
    }

    const result = recommendForProduct('1', [source, ...candidates]);

    expect(result.length).toBe(8);
    const stockTotals = result.map((r) => r.stockTotal);
    expect(stockTotals).toEqual([...stockTotals].sort((a, b) => b - a));
    expect(stockTotals).toEqual([100, 90, 80, 70, 60, 50, 40, 30]);
  });

  it('empate em stockTotal: mais tamanhos com estoque vence (Test 12 - nível 2)', () => {
    const source = makeProduct({ productId: '1' });
    const fewerSizes = makeProduct({
      productId: '2',
      variants: [makeVariant({ sizeValue: 'P', stockTotal: 10 })],
    });
    const moreSizes = makeProduct({
      productId: '3',
      variants: [makeVariant({ sizeValue: 'P', stockTotal: 5 }), makeVariant({ sizeValue: 'M', stockTotal: 5 })],
    });

    const result = recommendForProduct('1', [source, fewerSizes, moreSizes]);

    expect(result.map((r) => r.productId)).toEqual(['3', '2']);
  });

  it('empate em stockTotal e sizesWithStock: mais estoque em P/M/G vence (Test 13 - nível 3, grade letra)', () => {
    const source = makeProduct({ productId: '1' });
    const central = makeProduct({
      productId: '2',
      variants: [makeVariant({ sizeValue: 'P', stockTotal: 5 })],
    });
    const notCentral = makeProduct({
      productId: '3',
      variants: [makeVariant({ sizeValue: 'XG', stockTotal: 5 })],
    });

    const result = recommendForProduct('1', [source, notCentral, central]);

    expect(result.map((r) => r.productId)).toEqual(['2', '3']);
  });

  it('mesmo cenário com grade numérica; comparação de tamanho é trim/case-insensitive (Test 14 - nível 3, grade numérica)', () => {
    const source = makeProduct({ productId: '1' });
    const central = makeProduct({
      productId: '2',
      variants: [makeVariant({ sizeValue: '38', stockTotal: 5 })],
    });
    const notCentral = makeProduct({
      productId: '3',
      variants: [makeVariant({ sizeValue: '44', stockTotal: 5 })],
    });

    const result = recommendForProduct('1', [source, notCentral, central]);
    expect(result.map((r) => r.productId)).toEqual(['2', '3']);

    const trimmedLowercase = makeProduct({
      productId: '4',
      variants: [makeVariant({ sizeValue: ' p ', stockTotal: 5 })],
    });
    const [recommendation] = recommendForProduct('1', [source, trimmedLowercase]);
    expect(recommendation.centralSizesStock).toBe(5);
  });

  it('empate nos 3 níveis: desempate final por productId numérico ascendente, estável sob reexecução e inversão da entrada (Test 15 / RULE-02)', () => {
    const source = makeProduct({ productId: '1' });
    const variants = () => [makeVariant({ sizeValue: 'P', stockTotal: 5 })];
    const productA = makeProduct({ productId: '30', variants: variants() });
    const productB = makeProduct({ productId: '10', variants: variants() });
    const productC = makeProduct({ productId: '20', variants: variants() });

    const catalog = [source, productA, productB, productC];
    const reversedCatalog = [source, productC, productB, productA];

    const firstRun = recommendForProduct('1', catalog);
    const secondRun = recommendForProduct('1', catalog);
    const reversedRun = recommendForProduct('1', reversedCatalog);

    expect(firstRun.map((r) => r.productId)).toEqual(['10', '20', '30']);
    expect(firstRun).toEqual(secondRun);
    expect(firstRun).toEqual(reversedRun);
  });

  it('não muta catalogProducts nem os arrays variants dos fixtures (Test 16)', () => {
    const source = makeProduct({
      productId: '1',
      variants: [makeVariant({ sizeValue: 'P', stockTotal: 3 })],
    });
    const candidate = makeProduct({
      productId: '2',
      variants: [makeVariant({ sizeValue: 'M', stockTotal: 7 })],
    });
    const catalog = [source, candidate];
    const catalogBefore = JSON.parse(JSON.stringify(catalog));

    recommendForProduct('1', catalog);

    expect(catalog).toEqual(catalogBefore);
  });
});
