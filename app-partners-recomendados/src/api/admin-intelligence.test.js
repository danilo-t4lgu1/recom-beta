// src/api/admin-intelligence.test.js
import { describe, it, expect } from 'vitest';
import {
  searchCatalogProducts,
  inspectProductRecommendations,
  getCatalogHealth,
  getCoPurchasePairsReport,
} from './admin-intelligence.js';

describe('admin-intelligence domain module', () => {
  const sampleProducts = [
    {
      productId: '101',
      name: 'Vestido Elaine Preto',
      canonicalUrl: 'https://talgui.com.br/produtos/vestido-elaine/',
      colorValue: 'Preto',
      categoryRaw: 'Vestidos',
      productGroupCanonical: 'Look Inteiro',
      fabricTagCanonical: 'crepe',
      hasAvailableGrade: true,
      published: true,
      provenLookPartnerIds: [],
      variants: [
        { variantId: 'v1', sku: 'ELA-P-PR', sizeValue: 'P', stockTotal: 5 },
        { variantId: 'v2', sku: 'ELA-M-PR', sizeValue: 'M', stockTotal: 8 },
        { variantId: 'v3', sku: 'ELA-G-PR', sizeValue: 'G', stockTotal: 4 },
      ],
    },
    {
      productId: '102',
      name: 'Vestido Mércia Preto',
      canonicalUrl: 'https://talgui.com.br/produtos/vestido-mercia/',
      colorValue: 'Preto',
      categoryRaw: 'Vestidos',
      productGroupCanonical: 'Look Inteiro',
      fabricTagCanonical: 'crepe',
      hasAvailableGrade: true,
      published: true,
      provenLookPartnerIds: [],
      variants: [
        { variantId: 'v4', sku: 'MER-P-PR', sizeValue: 'P', stockTotal: 3 },
        { variantId: 'v5', sku: 'MER-M-PR', sizeValue: 'M', stockTotal: 6 },
        { variantId: 'v6', sku: 'MER-G-PR', sizeValue: 'G', stockTotal: 2 },
      ],
    },
    {
      productId: '103',
      name: 'Blusa Eloá Branca',
      canonicalUrl: 'https://talgui.com.br/produtos/blusa-eloa/',
      colorValue: 'Preto',
      categoryRaw: 'Blusas',
      productGroupCanonical: 'Partes de Cima',
      fabricTagCanonical: 'malha',
      hasAvailableGrade: true,
      published: true,
      provenLookPartnerIds: [{ productId: '201', count: 42 }],
      variants: [
        { variantId: 'v7', sku: 'ELO-P-BR', sizeValue: 'P', stockTotal: 4 },
        { variantId: 'v8', sku: 'ELO-M-BR', sizeValue: 'M', stockTotal: 4 },
        { variantId: 'v9', sku: 'ELO-G-BR', sizeValue: 'G', stockTotal: 4 },
      ],
    },
    {
      productId: '201',
      name: 'Calça Alfaiataria Preta',
      canonicalUrl: 'https://talgui.com.br/produtos/calca-alfaiataria/',
      colorValue: 'Preto',
      categoryRaw: 'Calças',
      productGroupCanonical: 'Partes de Baixo',
      fabricTagCanonical: 'alfaiataria',
      hasAvailableGrade: true,
      published: true,
      provenLookPartnerIds: [{ productId: '103', count: 42 }],
      variants: [
        { variantId: 'v10', sku: 'CAL-38-PR', sizeValue: '38', stockTotal: 10 },
        { variantId: 'v11', sku: 'CAL-40-PR', sizeValue: '40', stockTotal: 12 },
        { variantId: 'v12', sku: 'CAL-42-PR', sizeValue: '42', stockTotal: 8 },
      ],
    },
    {
      productId: '999',
      name: 'Produto Oculto Esgotado',
      canonicalUrl: null,
      colorValue: 'Vermelho',
      categoryRaw: 'Blusas',
      productGroupCanonical: 'Partes de Cima',
      fabricTagCanonical: null,
      hasAvailableGrade: false,
      published: false,
      provenLookPartnerIds: [],
      variants: [],
    },
  ];

  describe('searchCatalogProducts', () => {
    it('retorna produtos ativos respeitando o limite', () => {
      const results = searchCatalogProducts({ snapshotProducts: sampleProducts, limit: 2 });
      expect(results).toHaveLength(2);
      expect(results.every((r) => r.published !== false)).toBe(true);
    });

    it('busca por nome parcial com case-insensitivity', () => {
      const results = searchCatalogProducts({ snapshotProducts: sampleProducts, query: 'elaine' });
      expect(results).toHaveLength(1);
      expect(results[0].productId).toBe('101');
      expect(results[0].name).toBe('Vestido Elaine Preto');
      expect(results[0].stockTotal).toBe(17);
    });

    it('prioriza match exato de ID', () => {
      const results = searchCatalogProducts({ snapshotProducts: sampleProducts, query: '103' });
      expect(results[0].productId).toBe('103');
    });

    it('ignora produtos não publicados (published: false)', () => {
      const results = searchCatalogProducts({ snapshotProducts: sampleProducts, query: 'Oculto' });
      expect(results).toHaveLength(0);
    });
  });

  describe('inspectProductRecommendations', () => {
    it('retorna notFound: true quando o produto não existe', () => {
      const res = inspectProductRecommendations({
        productId: '999999',
        snapshotProducts: sampleProducts,
      });
      expect(res.notFound).toBe(true);
      expect(res.recommendations).toHaveLength(0);
      expect(res.source).toBeNull();
    });

    it('computa vitrine de recomendações determinísticas e enriquece variantes', () => {
      const res = inspectProductRecommendations({
        productId: '101',
        snapshotProducts: sampleProducts,
      });
      expect(res.notFound).toBe(false);
      expect(res.source).toBeDefined();
      expect(res.source.productId).toBe('101');
      expect(res.source.stockTotal).toBe(17);
      expect(res.recommendations).toHaveLength(1);
      expect(res.recommendations[0].productId).toBe('102');
      expect(res.recommendations[0].matchReason).toBe('same_fabric');
      expect(res.recommendations[0].weight).toBe(1);
      expect(res.recommendations[0].variants).toHaveLength(3);
    });

    it('computa recomendação de Look Comprovado com peso 0', () => {
      const res = inspectProductRecommendations({
        productId: '103',
        snapshotProducts: sampleProducts,
      });
      expect(res.notFound).toBe(false);
      expect(res.recommendations.length).toBeGreaterThanOrEqual(1);
      const proven = res.recommendations.find((r) => r.productId === '201');
      expect(proven).toBeDefined();
      expect(proven.matchReason).toBe('proven_look');
      expect(proven.weight).toBe(0);
    });
  });

  describe('getCatalogHealth', () => {
    it('agrega cobertura das categorias e métricas do catálogo', () => {
      const writeLogRows = [
        { productId: '101', status: 'success', writtenValue: JSON.stringify(['102']) },
      ];
      const dailyRecomputeLogRows = [
        { startedAt: '2026-09-18T00:00:00Z', alterados: 0, zerados: 0, status: 'ok' },
      ];

      const health = getCatalogHealth({
        snapshotProducts: sampleProducts,
        writeLogRows,
        dailyRecomputeLogRows,
      });

      expect(health.totalCatalog).toBe(5);
      expect(health.totalActive).toBe(4);
      expect(health.totalWithRecommendations).toBe(1);
      expect(health.overallCoveragePercent).toBe(25); // 1 de 4
      expect(health.categories.length).toBeGreaterThanOrEqual(3);

      const vestidosCat = health.categories.find((c) => c.category === 'Vestidos');
      expect(vestidosCat).toBeDefined();
      expect(vestidosCat.total).toBe(2);
      expect(vestidosCat.active).toBe(2);
      expect(vestidosCat.covered).toBe(1);
      expect(vestidosCat.coveragePercent).toBe(50);
      expect(vestidosCat.status).toBe('warning');

      expect(health.circuitBreaker.status).toBe('NORMAL');
      expect(health.circuitBreaker.safeMargin).toBe(true);
      expect(health.ineligibleReasons.unpublished).toBe(1);
    });

    it('dispara alerta do disjuntor quando o churn excede o limite', () => {
      const dailyRecomputeLogRows = [
        { startedAt: '2026-09-18T00:00:00Z', alterados: 2, zerados: 1, status: 'ok' }, // 2 de 4 = 50% (> 30%)
      ];

      const health = getCatalogHealth({
        snapshotProducts: sampleProducts,
        dailyRecomputeLogRows,
      });

      expect(health.circuitBreaker.churnPercent).toBe(50);
      expect(health.circuitBreaker.status).toBe('TRIPPED');
      expect(health.circuitBreaker.safeMargin).toBe(false);
    });
  });

  describe('getCoPurchasePairsReport', () => {
    const pairs = [
      { id: 1, product_id_a: '103', product_id_b: '201', count: 42 },
      { id: 2, product_id_a: '101', product_id_b: '999', count: 15 },
    ];

    it('enriquece peças A e B e calcula elegibilidade atual', () => {
      const report = getCoPurchasePairsReport({
        coPurchasePairs: pairs,
        snapshotProducts: sampleProducts,
      });

      expect(report.total).toBe(2);
      expect(report.eligiblePairsCount).toBe(1); // par 103-201 elegível; par 101-999 tem peça 999 sem estoque/oculta
      expect(report.pairs[0].id).toBe(1);
      expect(report.pairs[0].count).toBe(42);
      expect(report.pairs[0].isEligibleNow).toBe(true);
      expect(report.pairs[0].pieceA.name).toBe('Blusa Eloá Branca');
      expect(report.pairs[0].pieceB.name).toBe('Calça Alfaiataria Preta');
      expect(report.pairs[1].isEligibleNow).toBe(false);
    });

    it('filtra apenas pares em estoque quando onlyInStock é true', () => {
      const report = getCoPurchasePairsReport({
        coPurchasePairs: pairs,
        snapshotProducts: sampleProducts,
        onlyInStock: true,
      });

      expect(report.total).toBe(1);
      expect(report.pairs[0].id).toBe(1);
    });

    it('filtra por categoria', () => {
      const report = getCoPurchasePairsReport({
        coPurchasePairs: pairs,
        snapshotProducts: sampleProducts,
        category: 'Calças',
      });

      expect(report.total).toBe(1);
      expect(report.pairs[0].pieceB.categoryRaw).toBe('Calças');
    });

    it('suporta paginação correta', () => {
      const report = getCoPurchasePairsReport({
        coPurchasePairs: pairs,
        snapshotProducts: sampleProducts,
        page: 2,
        limit: 1,
      });

      expect(report.page).toBe(2);
      expect(report.limit).toBe(1);
      expect(report.totalPages).toBe(2);
      expect(report.pairs).toHaveLength(1);
      expect(report.pairs[0].id).toBe(2);
    });
  });
});
