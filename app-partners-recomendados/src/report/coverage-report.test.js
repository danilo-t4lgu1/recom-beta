// Testes de src/report/coverage-report.js (RULE-01, D-59/D-60/D-57).
//
// Cobre o relatório de cobertura DIAGNÓSTICO sobre o catálogo inteiro:
//   - contagem total de fontes com estoque, cobertas e zeradas (D-59: coberto =
//     recommendForProduct(...).length > 0, 1º OU 2º peso, sem meta % fixa);
//   - motivo item-a-item das zeradas com precedência oculta > sem cor > sem par
//     mesma-cor-em-estoque no grupo elegível (D-60/D-57);
//   - caminho de reprocesso: fontes com estoque sem tecido canônico (D-60);
//   - agregados por grupo e headlineCoveragePct informativo (D-59).
//
// Fixtures in-file (mesmas factories makeVariant/makeProduct de
// recommendation-engine.test.js / diff.test.js, copiadas por convenção de módulo
// de domínio isolado) — nunca lê data/catalog.db real. Módulo puro.

import { describe, it, expect } from 'vitest';
import { buildCoverageReport } from './coverage-report.js';
import {
  GROUP_LOOK_INTEIRO,
  GROUP_PARTES_DE_CIMA,
  GROUP_PARTES_DE_BAIXO,
} from '../recommendation/recommendation-engine.js';

let variantCounter = 0;
function makeVariant({ sizeValue = 'M', stockTotal = 5 } = {}) {
  variantCounter += 1;
  return { variantId: `variant-${variantCounter}`, sizeValue, stockTotal };
}

let productCounter = 0;
function makeProduct({
  productId,
  colorValue = 'Preto',
  fabricTagCanonical = 'Viscose',
  hasAvailableGrade = true,
  published = true,
  variants,
  productGroupCanonical = GROUP_LOOK_INTEIRO,
} = {}) {
  productCounter += 1;
  return {
    productId: productId != null ? String(productId) : `product-${productCounter}`,
    name: null,
    colorValue,
    fabricTagCanonical,
    productGroupCanonical,
    hasAvailableGrade,
    published,
    variants: variants != null ? variants : [makeVariant()],
  };
}

describe('buildCoverageReport', () => {
  it('conta fonte com estoque e >=1 recomendação em covered e não em zeroed', () => {
    // Par mesma-cor/mesmo-grupo/em-estoque: cada um recomenda o outro.
    const a = makeProduct({ productId: '1', colorValue: 'Preto' });
    const b = makeProduct({ productId: '2', colorValue: 'Preto' });
    const report = buildCoverageReport([a, b]);

    expect(report.totalSourcesInStock).toBe(2);
    expect(report.covered).toBe(2);
    expect(report.zeroed).toEqual([]);
  });

  it('fonte oculta (published:false) com estoque aparece em zeroed com reason oculta', () => {
    const hidden = makeProduct({ productId: '10', published: false });
    const partner = makeProduct({ productId: '11', published: true });
    const report = buildCoverageReport([hidden, partner]);

    const entry = report.zeroed.find((z) => z.productId === '10');
    expect(entry).toBeDefined();
    expect(entry.reason).toBe('oculta');
  });

  it('fonte sem cor (colorValue:null) com estoque aparece em zeroed com reason sem cor', () => {
    const noColor = makeProduct({ productId: '20', colorValue: null });
    const report = buildCoverageReport([noColor]);

    const entry = report.zeroed.find((z) => z.productId === '20');
    expect(entry).toBeDefined();
    expect(entry.reason).toBe('sem cor');
  });

  it('oculta tem precedência sobre sem cor quando ambas se aplicam', () => {
    const both = makeProduct({ productId: '25', published: false, colorValue: null });
    const report = buildCoverageReport([both]);

    const entry = report.zeroed.find((z) => z.productId === '25');
    expect(entry.reason).toBe('oculta');
  });

  it('fonte com cor sem par mesma-cor-em-estoque no grupo aparece com o motivo de grupo', () => {
    // Única fonte com cor 'Azul' — nenhum par possível.
    const lonely = makeProduct({ productId: '30', colorValue: 'Azul' });
    const other = makeProduct({ productId: '31', colorValue: 'Vermelho' });
    const report = buildCoverageReport([lonely, other]);

    const entry = report.zeroed.find((z) => z.productId === '30');
    expect(entry).toBeDefined();
    expect(entry.reason).toBe('sem par mesma-cor-em-estoque no grupo elegível');
  });

  it('fonte com estoque e fabricTagCanonical:null aparece em reprocess', () => {
    const noFabric = makeProduct({ productId: '40', fabricTagCanonical: null });
    const withFabric = makeProduct({ productId: '41', fabricTagCanonical: 'Viscose' });
    const report = buildCoverageReport([noFabric, withFabric]);

    expect(report.reprocess).toContain('40');
    expect(report.reprocess).not.toContain('41');
  });

  it('só considera fontes com estoque (hasAvailableGrade) — fora de estoque não entra em nenhuma contagem', () => {
    const inStock = makeProduct({ productId: '50', colorValue: 'Roxo' });
    const outOfStock = makeProduct({ productId: '51', hasAvailableGrade: false });
    const report = buildCoverageReport([inStock, outOfStock]);

    expect(report.totalSourcesInStock).toBe(1);
    expect(report.zeroed.some((z) => z.productId === '51')).toBe(false);
    expect(report.reprocess).not.toContain('51');
  });

  it('totalSourcesInStock == covered + zeroed.length e headlineCoveragePct coerente (3 de 4 => 75)', () => {
    // 4 fontes com estoque: um par coberto (2 cobertos), + 1 coberto extra do par,
    // + 1 zerada. Montamos: par 'Preto' (2 cobertos), par 'Verde' com 1 elemento
    // adicional coberto... simplificando: par 'Preto' (2) + par 'Verde' (1 coberto
    // + 1 zerada). Para ter exatamente 3 cobertos e 1 zerada:
    const p1 = makeProduct({ productId: '60', colorValue: 'Preto' });
    const p2 = makeProduct({ productId: '61', colorValue: 'Preto' });
    const p3 = makeProduct({ productId: '62', colorValue: 'Preto' });
    // fonte solitária sem par de mesma cor -> zerada
    const lonely = makeProduct({ productId: '63', colorValue: 'Ciano' });
    const report = buildCoverageReport([p1, p2, p3, lonely]);

    expect(report.totalSourcesInStock).toBe(4);
    expect(report.covered).toBe(3);
    expect(report.zeroed.length).toBe(1);
    expect(report.totalSourcesInStock).toBe(report.covered + report.zeroed.length);
    expect(report.headlineCoveragePct).toBe(75);
  });

  it('agrega por grupo (Look Inteiro / Partes de Cima / Partes de Baixo)', () => {
    const look1 = makeProduct({ productId: '70', productGroupCanonical: GROUP_LOOK_INTEIRO, colorValue: 'Preto' });
    const look2 = makeProduct({ productId: '71', productGroupCanonical: GROUP_LOOK_INTEIRO, colorValue: 'Preto' });
    const cima = makeProduct({ productId: '72', productGroupCanonical: GROUP_PARTES_DE_CIMA, colorValue: 'Nude' });
    const baixo = makeProduct({ productId: '73', productGroupCanonical: GROUP_PARTES_DE_BAIXO, colorValue: 'Nude' });
    const report = buildCoverageReport([look1, look2, cima, baixo]);

    expect(report.byGroup[GROUP_LOOK_INTEIRO].totalSourcesInStock).toBe(2);
    expect(report.byGroup[GROUP_LOOK_INTEIRO].covered).toBe(2);
    // Cima/Baixo mesclam (D-28): par mesma-cor cruzado -> ambos cobertos.
    expect(report.byGroup[GROUP_PARTES_DE_CIMA].totalSourcesInStock).toBe(1);
    expect(report.byGroup[GROUP_PARTES_DE_BAIXO].totalSourcesInStock).toBe(1);
  });

  it('catálogo vazio retorna zeros e headlineCoveragePct 0 (nunca lança nem divide por zero)', () => {
    const report = buildCoverageReport([]);
    expect(report.totalSourcesInStock).toBe(0);
    expect(report.covered).toBe(0);
    expect(report.zeroed).toEqual([]);
    expect(report.reprocess).toEqual([]);
    expect(report.headlineCoveragePct).toBe(0);
  });

  it('entrada não-array não lança (fail-safe, retorna zeros)', () => {
    expect(() => buildCoverageReport(null)).not.toThrow();
    expect(buildCoverageReport(null).totalSourcesInStock).toBe(0);
  });
});
