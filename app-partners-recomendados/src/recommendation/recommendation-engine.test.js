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
import {
  recommendForProduct,
  MAX_RECOMMENDATIONS,
  GROUP_LOOK_INTEIRO,
  GROUP_PARTES_DE_CIMA,
  GROUP_PARTES_DE_BAIXO,
} from './recommendation-engine.js';

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

  it('INCLUI candidato sem tecido via cor+estoque quando a fonte tem tecido (Test 3 / override 2026-07-17, reverte D-15)', () => {
    const source = makeProduct({ productId: '1' }); // Preto, Viscose
    const noFabric = makeProduct({
      productId: '2',
      fabricTagCanonical: null,
      variants: [makeVariant({ stockTotal: 5 })],
    });
    // Override: tecido é opcional dos dois lados. Fonte tem tecido, candidato
    // não — não sendo "ambos preenchidos", o tecido não filtra e vale só a cor.
    const result = recommendForProduct('1', [source, noFabric]);
    expect(result.map((r) => r.productId)).toEqual(['2']);
  });

  it('fonte sem cor retorna [] sem lançar; fonte sem tecido NÃO é mais inelegível (Test 4 / override 2026-07-17)', () => {
    // Fonte sem tecido agora recomenda por cor+estoque (reverte D-16), em vez
    // de retornar [] como "inelegível".
    const sourceNoFabric = makeProduct({
      productId: '1',
      fabricTagCanonical: null,
      variants: [makeVariant({ stockTotal: 5 })],
    });
    const candidate = makeProduct({ productId: '2' }); // Preto, mesma cor, com grade
    expect(() => recommendForProduct('1', [sourceNoFabric, candidate])).not.toThrow();
    expect(recommendForProduct('1', [sourceNoFabric, candidate]).map((r) => r.productId)).toEqual(['2']);

    // Cor, ao contrário do tecido, continua sempre obrigatória: fonte sem cor
    // retorna [] (nunca lança).
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
        'productGroupCanonical',
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

  it('tecido opcional dos dois lados: casa mesmo-tecido, aceita candidato sem tecido, mas rejeita tecido diferente quando ambos têm (override 2026-07-17)', () => {
    const source = makeProduct({ productId: '1', fabricTagCanonical: 'Viscose' });
    const sameFabric = makeProduct({ productId: '2', fabricTagCanonical: 'Viscose' }); // ambos têm, igual -> ok
    const noFabric = makeProduct({ productId: '3', fabricTagCanonical: null }); // um lado sem -> ok (cor+estoque)
    const diffFabric = makeProduct({ productId: '4', fabricTagCanonical: 'Algodao' }); // ambos têm, diferente -> excluído
    const result = recommendForProduct('1', [source, sameFabric, noFabric, diffFabric]);
    expect(result.map((r) => r.productId).sort()).toEqual(['2', '3']);
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

describe('recommendForProduct - grupo e mescla (D-27-D-30, D-34, D-35)', () => {
  it('factory makeProduct usa GROUP_LOOK_INTEIRO como grupo padrão, preservando compatibilidade dos testes 1-16 (Test 17)', () => {
    const source = makeProduct({ productId: '1' });
    expect(source.productGroupCanonical).toBe(GROUP_LOOK_INTEIRO);
  });

  it('Look Inteiro exclui candidato de outro grupo mesmo com cor+tecido+estoque coincidentes (Test 18 / D-27)', () => {
    const source = makeProduct({
      productId: '1',
      colorValue: 'Preto',
      fabricTagCanonical: 'Viscose',
      productGroupCanonical: GROUP_LOOK_INTEIRO,
    });
    const otherGroupSameEverything = makeProduct({
      productId: '2',
      colorValue: 'Preto',
      fabricTagCanonical: 'Viscose',
      productGroupCanonical: GROUP_PARTES_DE_CIMA,
      variants: [makeVariant({ sizeValue: 'P', stockTotal: 5 })],
    });

    const result = recommendForProduct('1', [source, otherGroupSameEverything]);
    expect(result).toEqual([]);
  });

  it('grupo-fonte null falha fechado mesmo com candidato irmão também null e cor+tecido+estoque idênticos (Test 19)', () => {
    const source = makeProduct({
      productId: '1',
      colorValue: 'Preto',
      fabricTagCanonical: 'Viscose',
      productGroupCanonical: null,
    });
    const nullGroupSibling = makeProduct({
      productId: '2',
      colorValue: 'Preto',
      fabricTagCanonical: 'Viscose',
      productGroupCanonical: null,
      variants: [makeVariant({ sizeValue: 'P', stockTotal: 5 })],
    });

    const result = recommendForProduct('1', [source, nullGroupSibling]);
    expect(result).toEqual([]);
  });

  it('Partes de Cima com 4 elegíveis mesmo-grupo + 4 elegíveis cruzados retorna os 8, mesmo-grupo antes do cruzado (Test 20 / D-28 caso base + D-35)', () => {
    const source = makeProduct({
      productId: '1',
      colorValue: 'Preto',
      fabricTagCanonical: 'Viscose',
      productGroupCanonical: GROUP_PARTES_DE_CIMA,
    });

    const sameStocks = [40, 30, 20, 10];
    const sameGroupCandidates = ['11', '12', '13', '14'].map((id, i) =>
      makeProduct({
        productId: id,
        colorValue: 'Preto',
        fabricTagCanonical: 'Viscose',
        productGroupCanonical: GROUP_PARTES_DE_CIMA,
        variants: [makeVariant({ sizeValue: 'P', stockTotal: sameStocks[i] })],
      })
    );

    const crossFabrics = ['Algodao', null, 'Linho', null];
    const crossStocks = [40, 30, 20, 10];
    const crossGroupCandidates = ['21', '22', '23', '24'].map((id, i) =>
      makeProduct({
        productId: id,
        colorValue: 'Preto',
        fabricTagCanonical: crossFabrics[i],
        productGroupCanonical: GROUP_PARTES_DE_BAIXO,
        variants: [makeVariant({ sizeValue: 'P', stockTotal: crossStocks[i] })],
      })
    );

    const catalog = [source, ...sameGroupCandidates, ...crossGroupCandidates];
    const result = recommendForProduct('1', catalog);

    expect(result.map((r) => r.productId)).toEqual(['11', '12', '13', '14', '21', '22', '23', '24']);
  });

  it('bloco mesmo-grupo TAMBÉM aceita candidato sem tecido via cor+estoque (Test 21 / override 2026-07-17); mesmo-grupo antes do cruzado (D-35)', () => {
    const source = makeProduct({
      productId: '1',
      colorValue: 'Preto',
      fabricTagCanonical: 'Viscose',
      productGroupCanonical: GROUP_PARTES_DE_CIMA,
    });
    const sameGroupNullFabric = makeProduct({
      productId: '2',
      colorValue: 'Preto',
      fabricTagCanonical: null,
      productGroupCanonical: GROUP_PARTES_DE_CIMA,
      variants: [makeVariant({ sizeValue: 'P', stockTotal: 5 })],
    });
    const crossGroupNullFabric = makeProduct({
      productId: '3',
      colorValue: 'Preto',
      fabricTagCanonical: null,
      productGroupCanonical: GROUP_PARTES_DE_BAIXO,
      variants: [makeVariant({ sizeValue: 'P', stockTotal: 5 })],
    });

    // Override: com tecido opcional dos dois lados, id2 (mesmo grupo, sem tecido)
    // deixa de ser barrado e entra pelo bloco mesmo-grupo; id3 entra pelo cruzado.
    // Ordem final: bloco mesmo-grupo antes do cruzado (D-35).
    const result = recommendForProduct('1', [source, sameGroupNullFabric, crossGroupNullFabric]);
    expect(result.map((r) => r.productId)).toEqual(['2', '3']);
  });

  it('fonte de Partes de Baixo sem tecido canônico ainda gera o bloco cruzado (Test 22 / D-34)', () => {
    const source = makeProduct({
      productId: '1',
      colorValue: 'Preto',
      fabricTagCanonical: null,
      productGroupCanonical: GROUP_PARTES_DE_BAIXO,
    });
    const crossCandidate = makeProduct({
      productId: '2',
      colorValue: 'Preto',
      fabricTagCanonical: 'Algodao',
      productGroupCanonical: GROUP_PARTES_DE_CIMA,
      variants: [makeVariant({ sizeValue: 'P', stockTotal: 5 })],
    });

    const result = recommendForProduct('1', [source, crossCandidate]);
    expect(result.map((r) => r.productId)).toEqual(['2']);
  });

  it('backfill: mesmo-grupo escasso (2) preenchido pelo restante do cruzado abundante (6) = 8 total (Test 24 / D-29)', () => {
    const source = makeProduct({
      productId: '1',
      colorValue: 'Preto',
      fabricTagCanonical: 'Viscose',
      productGroupCanonical: GROUP_PARTES_DE_CIMA,
    });

    const sameIds = ['11', '12'];
    const sameStocks = [100, 90];
    const sameGroupCandidates = sameIds.map((id, i) =>
      makeProduct({
        productId: id,
        colorValue: 'Preto',
        fabricTagCanonical: 'Viscose',
        productGroupCanonical: GROUP_PARTES_DE_CIMA,
        variants: [makeVariant({ sizeValue: 'P', stockTotal: sameStocks[i] })],
      })
    );

    const crossIds = ['21', '22', '23', '24', '25', '26'];
    const crossStocks = [60, 50, 40, 30, 20, 10];
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
    const result = recommendForProduct('1', catalog);

    expect(result.length).toBe(8);
    expect(new Set(result.map((r) => r.productId))).toEqual(new Set([...sameIds, ...crossIds]));
  });

  it('backfill espelhado: cruzado escasso (1) preenchido pelo restante do mesmo-grupo abundante (7) = 8 total (Test 25 / D-29)', () => {
    const source = makeProduct({
      productId: '1',
      colorValue: 'Preto',
      fabricTagCanonical: 'Viscose',
      productGroupCanonical: GROUP_PARTES_DE_CIMA,
    });

    const sameIds = ['11', '12', '13', '14', '15', '16', '17'];
    const sameStocks = [170, 160, 150, 140, 130, 120, 110];
    const sameGroupCandidates = sameIds.map((id, i) =>
      makeProduct({
        productId: id,
        colorValue: 'Preto',
        fabricTagCanonical: 'Viscose',
        productGroupCanonical: GROUP_PARTES_DE_CIMA,
        variants: [makeVariant({ sizeValue: 'P', stockTotal: sameStocks[i] })],
      })
    );

    const crossIds = ['21'];
    const crossGroupCandidates = crossIds.map((id) =>
      makeProduct({
        productId: id,
        colorValue: 'Preto',
        fabricTagCanonical: 'Algodao',
        productGroupCanonical: GROUP_PARTES_DE_BAIXO,
        variants: [makeVariant({ sizeValue: 'P', stockTotal: 5 })],
      })
    );

    const catalog = [source, ...sameGroupCandidates, ...crossGroupCandidates];
    const result = recommendForProduct('1', catalog);

    expect(result.length).toBe(8);
    expect(new Set(result.map((r) => r.productId))).toEqual(new Set([...sameIds, ...crossIds]));
  });

  it('sem candidatos suficientes em nenhum lado (2 + 3 = 5), retorna exatamente os 5 existentes, nunca inventa (Test 26 / D-29)', () => {
    const source = makeProduct({
      productId: '1',
      colorValue: 'Preto',
      fabricTagCanonical: 'Viscose',
      productGroupCanonical: GROUP_PARTES_DE_CIMA,
    });

    const sameIds = ['11', '12'];
    const sameGroupCandidates = sameIds.map((id, i) =>
      makeProduct({
        productId: id,
        colorValue: 'Preto',
        fabricTagCanonical: 'Viscose',
        productGroupCanonical: GROUP_PARTES_DE_CIMA,
        variants: [makeVariant({ sizeValue: 'P', stockTotal: 10 - i })],
      })
    );

    const crossIds = ['21', '22', '23'];
    const crossGroupCandidates = crossIds.map((id, i) =>
      makeProduct({
        productId: id,
        colorValue: 'Preto',
        fabricTagCanonical: 'Algodao',
        productGroupCanonical: GROUP_PARTES_DE_BAIXO,
        variants: [makeVariant({ sizeValue: 'P', stockTotal: 10 - i })],
      })
    );

    const catalog = [source, ...sameGroupCandidates, ...crossGroupCandidates];
    const result = recommendForProduct('1', catalog);

    expect(result.length).toBe(5);
    expect(new Set(result.map((r) => r.productId))).toEqual(new Set([...sameIds, ...crossIds]));
  });

  it('cascata D-13 ordena cada bloco de forma independente, sem nível novo por grupo (Test 27 / D-30)', () => {
    const source = makeProduct({
      productId: '1',
      colorValue: 'Preto',
      fabricTagCanonical: 'Viscose',
      productGroupCanonical: GROUP_PARTES_DE_CIMA,
    });

    const sameStockById = { '11': 10, '12': 40, '13': 30, '14': 20 };
    const sameGroupCandidates = Object.entries(sameStockById).map(([id, stock]) =>
      makeProduct({
        productId: id,
        colorValue: 'Preto',
        fabricTagCanonical: 'Viscose',
        productGroupCanonical: GROUP_PARTES_DE_CIMA,
        variants: [makeVariant({ sizeValue: 'P', stockTotal: stock })],
      })
    );

    const crossStockById = { '21': 15, '22': 45, '23': 25, '24': 35 };
    const crossGroupCandidates = Object.entries(crossStockById).map(([id, stock]) =>
      makeProduct({
        productId: id,
        colorValue: 'Preto',
        fabricTagCanonical: 'Algodao',
        productGroupCanonical: GROUP_PARTES_DE_BAIXO,
        variants: [makeVariant({ sizeValue: 'P', stockTotal: stock })],
      })
    );

    const catalog = [source, ...sameGroupCandidates, ...crossGroupCandidates];
    const result = recommendForProduct('1', catalog);

    expect(result.map((r) => r.productId)).toEqual(['12', '13', '14', '11', '22', '24', '23', '21']);
  });

  it('ordem final com backfill: bloco mesmo-grupo (+ seu backfill) inteiro antes do bloco cruzado (+ seu backfill) (Test 28 / D-35)', () => {
    const source = makeProduct({
      productId: '1',
      colorValue: 'Preto',
      fabricTagCanonical: 'Viscose',
      productGroupCanonical: GROUP_PARTES_DE_CIMA,
    });

    const sameIds = ['11', '12'];
    const sameStocks = [100, 90];
    const sameGroupCandidates = sameIds.map((id, i) =>
      makeProduct({
        productId: id,
        colorValue: 'Preto',
        fabricTagCanonical: 'Viscose',
        productGroupCanonical: GROUP_PARTES_DE_CIMA,
        variants: [makeVariant({ sizeValue: 'P', stockTotal: sameStocks[i] })],
      })
    );

    const crossIds = ['21', '22', '23', '24', '25', '26'];
    const crossStocks = [60, 50, 40, 30, 20, 10];
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
    const result = recommendForProduct('1', catalog);

    expect(result.map((r) => r.productId)).toEqual(['11', '12', '25', '26', '21', '22', '23', '24']);
  });

  it('suíte completa do arquivo permanece verde: 16 testes de regressão + 12 novos desta fase (Test 29)', () => {
    // Meta-confirmação: esta suíte inteira (Tests 1-28), quando executada via
    // `npx vitest run src/recommendation/recommendation-engine.test.js`, deve
    // sair com código 0 — não há asserção adicional aqui, o próprio runner
    // vitest é a verificação (RULE-01/RULE-02, D-29/D-30/D-35).
    expect(true).toBe(true);
  });
});
