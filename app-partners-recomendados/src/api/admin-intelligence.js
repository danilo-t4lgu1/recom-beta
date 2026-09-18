// src/api/admin-intelligence.js
// Módulo de domínio PURO (/backend-architect) para o Painel Administrativo do Recom.
// Zero chamadas de I/O direto, zero queries SQL ou requisições de rede.
// Recebe dados já materializados e computa buscas, simulações, métricas e agregações.

import { recommendForProduct } from '../recommendation/recommendation-engine.js';

/**
 * Busca produtos no catálogo de snapshot ativo por nome, ID, cor ou categoria.
 * @param {{
 *   snapshotProducts: Array<object>,
 *   query?: string,
 *   limit?: number
 * }} params
 * @returns {Array<{
 *   productId: string,
 *   name: string|null,
 *   canonicalUrl: string|null,
 *   colorValue: string|null,
 *   categoryRaw: string|null,
 *   productGroupCanonical: string|null,
 *   fabricTagCanonical: string|null,
 *   stockTotal: number,
 *   hasAvailableGrade: boolean,
 *   published: boolean|null
 * }>}
 */
export function searchCatalogProducts({ snapshotProducts, query = '', limit = 20 }) {
  const products = Array.isArray(snapshotProducts) ? snapshotProducts : [];
  const cleanQuery = typeof query === 'string' ? query.trim().toLowerCase() : '';

  const mapped = products
    .filter((p) => p && p.published !== false)
    .map((p) => {
      const stockTotal = Array.isArray(p.variants)
        ? p.variants.reduce((sum, v) => sum + (Number(v.stockTotal) || 0), 0)
        : 0;

      return {
        productId: String(p.productId),
        name: p.name || null,
        canonicalUrl: p.canonicalUrl || null,
        colorValue: p.colorValue || null,
        categoryRaw: p.categoryRaw || null,
        productGroupCanonical: p.productGroupCanonical || null,
        fabricTagCanonical: p.fabricTagCanonical || null,
        stockTotal,
        hasAvailableGrade: Boolean(p.hasAvailableGrade),
        published: p.published,
      };
    });

  if (!cleanQuery) {
    return mapped.slice(0, limit);
  }

  // Ordenação com relevância:
  // 1. Match exato de ID
  // 2. ID começa com a query
  // 3. Nome começa com a query
  // 4. Nome inclui a query
  // 5. Cor ou categoria inclui a query
  const scored = [];

  for (const item of mapped) {
    const id = item.productId.toLowerCase();
    const name = (item.name || '').toLowerCase();
    const color = (item.colorValue || '').toLowerCase();
    const cat = (item.categoryRaw || '').toLowerCase();

    let score = 0;
    if (id === cleanQuery) score = 100;
    else if (id.startsWith(cleanQuery)) score = 80;
    else if (name.startsWith(cleanQuery)) score = 70;
    else if (name.includes(cleanQuery)) score = 50;
    else if (color.includes(cleanQuery) || cat.includes(cleanQuery)) score = 30;

    if (score > 0) {
      scored.push({ item, score });
    }
  }

  scored.sort((a, b) => b.score - a.score || a.item.productId.localeCompare(b.item.productId));
  return scored.slice(0, limit).map((s) => s.item);
}

/**
 * Executa a inspeção completa de recomendações para um produto-fonte,
 * retornando a vitrine determinística com seus motivos (matchReason) e pesos.
 * @param {{
 *   productId: string,
 *   snapshotProducts: Array<object>,
 *   maxRecommendations?: number
 * }} params
 * @returns {{
 *   source: object|null,
 *   recommendations: Array<object>,
 *   count: number,
 *   notFound: boolean
 * }}
 */
export function inspectProductRecommendations({
  productId,
  snapshotProducts,
  maxRecommendations = 8,
}) {
  const products = Array.isArray(snapshotProducts) ? snapshotProducts : [];
  const targetId = String(productId);
  const source = products.find((p) => p && String(p.productId) === targetId);

  if (!source) {
    return {
      source: null,
      recommendations: [],
      count: 0,
      notFound: true,
    };
  }

  const productsById = new Map(products.map((p) => [String(p.productId), p]));
  const sourceStockTotal = Array.isArray(source.variants)
    ? source.variants.reduce((sum, v) => sum + (Number(v.stockTotal) || 0), 0)
    : 0;

  const rawRecommendations = recommendForProduct(targetId, products, {
    maxRecommendations,
  });

  const enrichedRecommendations = rawRecommendations.map((rec) => {
    const fullProduct = productsById.get(String(rec.productId));
    const variants = fullProduct && Array.isArray(fullProduct.variants) ? fullProduct.variants : [];
    const weight =
      typeof rec.weight === 'number'
        ? rec.weight
        : rec.matchReason === 'proven_look'
          ? 0
          : rec.matchReason === 'same_fabric'
            ? 1
            : 2;

    return {
      productId: String(rec.productId),
      name: rec.name || (fullProduct ? fullProduct.name : null),
      canonicalUrl: fullProduct ? fullProduct.canonicalUrl : null,
      colorValue: fullProduct ? fullProduct.colorValue : null,
      categoryRaw: fullProduct ? fullProduct.categoryRaw : null,
      productGroupCanonical: fullProduct ? fullProduct.productGroupCanonical : null,
      fabricTagCanonical: fullProduct ? fullProduct.fabricTagCanonical : null,
      weight,
      matchReason: rec.matchReason || 'color_stock', // 'proven_look' | 'same_fabric' | 'color_stock'
      stockTotal: rec.stockTotal,
      sizesWithStock: rec.sizesWithStock,
      centralSizesStock: rec.centralSizesStock,
      variants: variants.map((v) => ({
        variantId: String(v.variantId || v.id || ''),
        sku: v.sku || null,
        sizeValue: v.sizeValue || null,
        stockTotal: Number(v.stockTotal) || 0,
      })),
    };
  });

  return {
    source: {
      productId: String(source.productId),
      name: source.name,
      canonicalUrl: source.canonicalUrl || null,
      colorValue: source.colorValue || null,
      categoryRaw: source.categoryRaw || null,
      productGroupCanonical: source.productGroupCanonical || null,
      fabricTagCanonical: source.fabricTagCanonical || null,
      hasAvailableGrade: Boolean(source.hasAvailableGrade),
      published: source.published,
      stockTotal: sourceStockTotal,
      variants: (source.variants || []).map((v) => ({
        variantId: String(v.variantId || v.id || ''),
        sku: v.sku || null,
        sizeValue: v.sizeValue || null,
        stockTotal: Number(v.stockTotal) || 0,
      })),
    },
    recommendations: enrichedRecommendations,
    count: enrichedRecommendations.length,
    notFound: false,
  };
}

/**
 * Agrega métricas de cobertura das 11 categorias e calcula telemetria do disjuntor de segurança.
 * @param {{
 *   snapshotProducts: Array<object>,
 *   writeLogRows?: Array<object>,
 *   dailyRecomputeLogRows?: Array<object>
 * }} params
 * @returns {{
 *   totalCatalog: number,
 *   totalActive: number,
 *   totalWithRecommendations: number,
 *   overallCoveragePercent: number,
 *   categories: Array<{
 *     category: string,
 *     total: number,
 *     active: number,
 *     covered: number,
 *     coveragePercent: number,
 *     status: 'good'|'warning'|'critical'
 *   }>,
 *   ineligibleReasons: {
 *     noColor: number,
 *     noStockGrade: number,
 *     unmappedGroup: number,
 *     unpublished: number
 *   },
 *   circuitBreaker: {
 *     status: 'NORMAL'|'WARNING'|'TRIPPED',
 *     churnPercent: number,
 *     churnLimitPercent: number,
 *     blackoutPercent: number,
 *     blackoutLimitPercent: number,
 *     lastRecomputeAt: string|null,
 *     safeMargin: boolean
 *   }
 * }}
 */
export function getCatalogHealth({
  snapshotProducts,
  writeLogRows = [],
  dailyRecomputeLogRows = [],
}) {
  const products = Array.isArray(snapshotProducts) ? snapshotProducts : [];

  // Mapear os produtos que têm recomendação gravada com sucesso
  const recommendedProductIds = new Set();
  for (const row of writeLogRows) {
    if (row.status === 'success' && row.writtenValue) {
      try {
        const parsed = JSON.parse(row.writtenValue);
        if (Array.isArray(parsed) && parsed.length > 0) {
          recommendedProductIds.add(String(row.productId));
        } else if (parsed && parsed.recommended_product_id) {
          recommendedProductIds.add(String(row.productId));
        }
      } catch {
        // Ignora JSON inválido
      }
    }
  }

  // Agrupar por Categoria
  const categoryStats = new Map();
  let ineligibleNoColor = 0;
  let ineligibleNoStockGrade = 0;
  let ineligibleUnmappedGroup = 0;
  let ineligibleUnpublished = 0;
  let totalActive = 0;
  let coveredCount = 0;

  for (const p of products) {
    const isPublished = p.published !== false;
    if (isPublished) totalActive += 1;

    const catName = p.categoryRaw || 'Outros';
    if (!categoryStats.has(catName)) {
      categoryStats.set(catName, { total: 0, active: 0, covered: 0 });
    }

    const stat = categoryStats.get(catName);
    stat.total += 1;

    const isCovered = recommendedProductIds.has(String(p.productId));
    if (isPublished) {
      stat.active += 1;
      if (isCovered) {
        stat.covered += 1;
        coveredCount += 1;
      }
    }

    // Diagnóstico de inelegibilidade
    if (!isPublished) {
      ineligibleUnpublished += 1;
    } else if (!p.colorValue) {
      ineligibleNoColor += 1;
    } else if (!p.hasAvailableGrade) {
      ineligibleNoStockGrade += 1;
    } else if (!p.productGroupCanonical) {
      ineligibleUnmappedGroup += 1;
    }
  }

  const categories = Array.from(categoryStats.entries())
    .map(([category, s]) => {
      const coveragePercent = s.active > 0 ? Math.round((s.covered / s.active) * 100) : 0;
      let status = 'critical';
      if (coveragePercent >= 80) status = 'good';
      else if (coveragePercent >= 50) status = 'warning';

      return {
        category,
        total: s.total,
        active: s.active,
        covered: s.covered,
        coveragePercent,
        status,
      };
    })
    .sort((a, b) => b.active - a.active);

  const overallCoveragePercent =
    totalActive > 0 ? Math.round((coveredCount / totalActive) * 100) : 0;

  // Telemetria do Disjuntor de Segurança (Circuit Breaker)
  // Limiares: Churn teto 30%, Apagão teto 10%
  const CHURN_LIMIT = 30;
  const BLACKOUT_LIMIT = 10;

  const latestRecompute =
    dailyRecomputeLogRows && dailyRecomputeLogRows.length > 0
      ? dailyRecomputeLogRows[dailyRecomputeLogRows.length - 1]
      : null;

  let churnPercent = 0;
  let blackoutPercent = 0;
  let circuitStatus = 'NORMAL';

  if (latestRecompute && totalActive > 0) {
    const alterados = Number(latestRecompute.alterados) || 0;
    const zerados = Number(latestRecompute.zerados) || 0;
    churnPercent = Math.round((alterados / totalActive) * 1000) / 10;
    blackoutPercent = Math.round((zerados / totalActive) * 1000) / 10;

    if (churnPercent > CHURN_LIMIT || blackoutPercent > BLACKOUT_LIMIT) {
      circuitStatus = 'TRIPPED';
    } else if (churnPercent >= CHURN_LIMIT * 0.8 || blackoutPercent >= BLACKOUT_LIMIT * 0.8) {
      circuitStatus = 'WARNING';
    }
  }

  return {
    totalCatalog: products.length,
    totalActive,
    totalWithRecommendations: coveredCount,
    overallCoveragePercent,
    categories,
    ineligibleReasons: {
      noColor: ineligibleNoColor,
      noStockGrade: ineligibleNoStockGrade,
      unmappedGroup: ineligibleUnmappedGroup,
      unpublished: ineligibleUnpublished,
    },
    circuitBreaker: {
      status: circuitStatus,
      churnPercent,
      churnLimitPercent: CHURN_LIMIT,
      blackoutPercent,
      blackoutLimitPercent: BLACKOUT_LIMIT,
      lastRecomputeAt: latestRecompute ? latestRecompute.startedAt || null : null,
      safeMargin: circuitStatus === 'NORMAL',
    },
  };
}

/**
 * Pagina, filtra e enriquece os pares de co-compra reais (1.373 pares derivados).
 * @param {{
 *   coPurchasePairs: Array<object>,
 *   snapshotProducts: Array<object>,
 *   page?: number,
 *   limit?: number,
 *   category?: string|null,
 *   onlyInStock?: boolean,
 *   sortBy?: 'count'|'count_asc'
 * }} params
 * @returns {{
 *   total: number,
 *   page: number,
 *   limit: number,
 *   totalPages: number,
 *   pairs: Array<object>,
 *   eligiblePairsCount: number
 * }}
 */
export function getCoPurchasePairsReport({
  coPurchasePairs,
  snapshotProducts,
  page = 1,
  limit = 25,
  category = null,
  onlyInStock = false,
  sortBy = 'count',
}) {
  const pairs = Array.isArray(coPurchasePairs) ? coPurchasePairs : [];
  const products = Array.isArray(snapshotProducts) ? snapshotProducts : [];
  const productsById = new Map(products.map((p) => [String(p.productId), p]));

  function getProductSummary(id) {
    const p = productsById.get(String(id));
    if (!p) {
      return {
        productId: String(id),
        name: `Produto ${id}`,
        canonicalUrl: null,
        categoryRaw: null,
        productGroupCanonical: null,
        colorValue: null,
        stockTotal: 0,
        published: null,
        hasAvailableGrade: false,
      };
    }

    const stockTotal = Array.isArray(p.variants)
      ? p.variants.reduce((sum, v) => sum + (Number(v.stockTotal) || 0), 0)
      : 0;

    return {
      productId: String(p.productId),
      name: p.name || `Produto ${p.productId}`,
      canonicalUrl: p.canonicalUrl || null,
      categoryRaw: p.categoryRaw || null,
      productGroupCanonical: p.productGroupCanonical || null,
      colorValue: p.colorValue || null,
      stockTotal,
      published: p.published,
      hasAvailableGrade: Boolean(p.hasAvailableGrade),
    };
  }

  let eligibleCount = 0;
  const enriched = [];

  for (const row of pairs) {
    const idA = String(row.product_id_a);
    const idB = String(row.product_id_b);
    const count = Number(row.count) || 0;

    const pieceA = getProductSummary(idA);
    const pieceB = getProductSummary(idB);

    const isEligibleNow =
      pieceA.published !== false &&
      pieceB.published !== false &&
      pieceA.hasAvailableGrade &&
      pieceB.hasAvailableGrade &&
      pieceA.stockTotal > 0 &&
      pieceB.stockTotal > 0;

    if (isEligibleNow) {
      eligibleCount += 1;
    }

    if (onlyInStock && !isEligibleNow) {
      continue;
    }

    if (category) {
      const matchCatA = pieceA.categoryRaw && pieceA.categoryRaw.toLowerCase() === category.toLowerCase();
      const matchCatB = pieceB.categoryRaw && pieceB.categoryRaw.toLowerCase() === category.toLowerCase();
      if (!matchCatA && !matchCatB) continue;
    }

    enriched.push({
      id: row.id || `${idA}-${idB}`,
      count,
      isEligibleNow,
      pieceA,
      pieceB,
    });
  }

  if (sortBy === 'count_asc') {
    enriched.sort((a, b) => a.count - b.count);
  } else {
    enriched.sort((a, b) => b.count - a.count);
  }

  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 25));
  const total = enriched.length;
  const totalPages = Math.ceil(total / safeLimit) || 1;
  const offset = (safePage - 1) * safeLimit;
  const paginatedPairs = enriched.slice(offset, offset + safeLimit);

  return {
    total,
    page: safePage,
    limit: safeLimit,
    totalPages,
    pairs: paginatedPairs,
    eligiblePairsCount: eligibleCount,
  };
}
