// Testes de src/report/engine-certification.js.
//
// Cobre o relatório de CERTIFICAÇÃO: compara write_log (última escrita bem-sucedida
// por produto) contra um recompute fresco do motor sobre o snapshot atual, para as
// três perguntas concretas: leitura de estoque (item que sai de estoque desaparece
// do fresco), ranking respeitado (ordem relativa preservada) e backfill após
// remoção por elegibilidade (novo elegível assume a vaga).
//
// Fixtures in-file (mesma factory de coverage-report.test.js/diff.test.js) — nunca
// lê data/catalog.db real. Módulo puro.

import { describe, it, expect } from 'vitest';
import {
  buildCertificationReport,
  STATUS_OK,
  STATUS_RENOVACAO,
  STATUS_SEM_BACKFILL,
  STATUS_NAO_ENCONTRADO,
} from './engine-certification.js';
import { GROUP_LOOK_INTEIRO } from '../recommendation/recommendation-engine.js';

let variantCounter = 0;
function makeVariant({ sizeValue = 'M', stockTotal = 5 } = {}) {
  variantCounter += 1;
  return { variantId: `variant-${variantCounter}`, sizeValue, stockTotal };
}

function makeProduct({
  productId,
  colorValue = 'Preto',
  fabricTagCanonical = 'Viscose',
  hasAvailableGrade = true,
  published = true,
  variants,
  productGroupCanonical = GROUP_LOOK_INTEIRO,
} = {}) {
  return {
    productId: String(productId),
    name: null,
    colorValue,
    fabricTagCanonical,
    productGroupCanonical,
    hasAvailableGrade,
    published,
    variants: variants != null ? variants : [makeVariant()],
  };
}

describe('buildCertificationReport', () => {
  it('escrito == recompute fresco (mesmo conjunto, mesma ordem) => STATUS_OK, rankingPreserved true', () => {
    const source = makeProduct({ productId: '1' });
    const rec = makeProduct({ productId: '2' });
    const catalog = [source, rec];
    const written = new Map([['1', ['2']]]);

    const report = buildCertificationReport(catalog, written);

    expect(report.rows).toHaveLength(1);
    expect(report.rows[0].status).toBe(STATUS_OK);
    expect(report.rows[0].rankingPreserved).toBe(true);
    expect(report.rows[0].removed).toEqual([]);
    expect(report.rows[0].added).toEqual([]);
    expect(report.summary.identico).toBe(1);
  });

  it('item escrito sai de estoque e um novo elegível assume a vaga => STATUS_RENOVACAO', () => {
    const source = makeProduct({ productId: '1' });
    const outOfStockNow = makeProduct({ productId: '2', hasAvailableGrade: false });
    const stillEligible = makeProduct({ productId: '3' });
    const newlyEligible = makeProduct({ productId: '4' });
    const catalog = [source, outOfStockNow, stillEligible, newlyEligible];
    // Escrito na última vez que rodou: 2 e 3 (2 ainda estava em estoque então).
    const written = new Map([['1', ['2', '3']]]);

    const report = buildCertificationReport(catalog, written);
    const row = report.rows[0];

    expect(row.status).toBe(STATUS_RENOVACAO);
    expect(row.removed).toEqual(['2']);
    expect(row.added).toEqual(['4']);
    expect(row.freshIds).toEqual(expect.arrayContaining(['3', '4']));
    expect(row.freshIds).not.toContain('2');
    expect(report.summary.renovacaoOk).toBe(1);
  });

  it('item escrito sai de estoque SEM nenhum substituto elegível => STATUS_SEM_BACKFILL', () => {
    const source = makeProduct({ productId: '1' });
    const outOfStockNow = makeProduct({ productId: '2', hasAvailableGrade: false });
    const stillEligible = makeProduct({ productId: '3' });
    const catalog = [source, outOfStockNow, stillEligible];
    const written = new Map([['1', ['2', '3']]]);

    const report = buildCertificationReport(catalog, written);
    const row = report.rows[0];

    expect(row.status).toBe(STATUS_SEM_BACKFILL);
    expect(row.removed).toEqual(['2']);
    expect(row.added).toEqual([]);
    expect(report.summary.semBackfill).toBe(1);
  });

  it('produto-fonte com escrita em write_log ausente do snapshot atual => STATUS_NAO_ENCONTRADO', () => {
    const catalog = [makeProduct({ productId: '5' })];
    const written = new Map([['99', ['5']]]);

    const report = buildCertificationReport(catalog, written);
    const row = report.rows[0];

    expect(row.status).toBe(STATUS_NAO_ENCONTRADO);
    expect(row.hasStock).toBeNull();
    expect(row.rankingPreserved).toBeNull();
    expect(report.summary.naoEncontrado).toBe(1);
  });

  it('mesmo conjunto, ordem diferente => status OK por conjunto mas rankingPreserved false', () => {
    const source = makeProduct({ productId: '1' });
    // '2' tem estoque maior que '3' -> cascata D-13 nível 1 ordena '2' antes de '3'.
    const higherStock = makeProduct({ productId: '2', variants: [makeVariant({ stockTotal: 20 })] });
    const lowerStock = makeProduct({ productId: '3', variants: [makeVariant({ stockTotal: 2 })] });
    const catalog = [source, higherStock, lowerStock];
    // Escrito na ordem invertida em relação ao que o motor computaria agora.
    const written = new Map([['1', ['3', '2']]]);

    const report = buildCertificationReport(catalog, written);
    const row = report.rows[0];

    expect(row.freshIds).toEqual(['2', '3']);
    expect(row.rankingPreserved).toBe(false);
    expect(row.removed).toEqual([]);
    expect(row.added).toEqual([]);
    expect(report.summary.rankingQuebrado).toBe(1);
  });

  it('write_log vazio retorna rows vazio e summary zerado (nunca lança)', () => {
    const report = buildCertificationReport([makeProduct({ productId: '1' })], new Map());
    expect(report.rows).toEqual([]);
    expect(report.summary.totalProdutosComEscrita).toBe(0);
  });

  it('entradas malformadas não lançam (catalog não-array, written não-Map)', () => {
    expect(() => buildCertificationReport(null, null)).not.toThrow();
    expect(buildCertificationReport(null, null).rows).toEqual([]);
  });
});
