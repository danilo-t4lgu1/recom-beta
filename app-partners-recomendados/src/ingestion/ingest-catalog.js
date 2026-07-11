// Orquestrador de ingestão transacional do catálogo (PLAT-02, DATA-01, DATA-02, DATA-03).
//
// Encadeia: resolução de category_id por nome (nunca hardcoded, Pitfall C do
// 02-RESEARCH.md) -> paginação de produtos -> cálculo de disponibilidade de estoque
// (D-04, stock-availability.js) -> auditoria de tags de tecido (DATA-03,
// fabric-taxonomy.js, uma vez por lote inteiro, não por produto) -> persistência
// transacional única (catalog-store.js). Em caso de exceção em qualquer etapa após
// abrir o run, finaliza a execução com status 'failed' antes de relançar — nunca
// deixa uma ingestion_run presa em 'running' silenciosamente.

import { listCategories, listProducts, getMetafields } from '../nuvemshop-client/client.js';
import { AdaptiveRateLimiter } from '../rate-limit/adaptive-limiter.js';
import { hasAvailableGrade, getVariantStock } from './stock-availability.js';
import { auditFabricTags } from './fabric-taxonomy.js';
import { startIngestionRun, persistIngestionBatch, finishIngestionRun, getCanonicalMap } from '../db/catalog-store.js';

const MIN_SIZES_IN_STOCK = 3; // D-04: regra de negócio nomeada, nunca inline
const RECOMMENDATION_NAMESPACE = 'recomendados';
const RECOMMENDATION_KEY = 'produto_sugerido';

// WR-06: nomes de atributo aceitos para localizar a posição de cor/tamanho em
// `product.attributes`/`variant.values` (a API Nuvemshop retorna `attributes` como
// array paralelo posicionalmente a `variant.values`, nomeando cada posição — ex.
// `["Cor", "Tamanho"]` — mas o nome exato configurado pela loja pode variar).
const COLOR_ATTRIBUTE_NAMES = ['cor', 'color'];
const SIZE_ATTRIBUTE_NAMES = ['tamanho', 'size'];

/**
 * Localiza o índice de um atributo em `product.attributes` (array de objetos com
 * campo `.pt`) comparando (case-insensitive) contra uma lista de nomes aceitos.
 * Retorna -1 se `product.attributes` estiver ausente ou o nome não for encontrado —
 * nesse caso o chamador cai no fallback posicional (WR-06), nunca lança erro.
 * @param {Array<object>|undefined} attributes
 * @param {string[]} acceptedNames
 * @returns {number}
 */
function findAttributeIndex(attributes, acceptedNames) {
  if (!Array.isArray(attributes)) return -1;
  return attributes.findIndex((attr) => {
    const name = (attr && attr.pt ? attr.pt : '').trim().toLowerCase();
    return acceptedNames.includes(name);
  });
}

/**
 * Extrai o valor de cor/tamanho de uma variante usando o índice de
 * `product.attributes` que corresponde ao nome do atributo (WR-06), evitando a
 * suposição fixa de "posição 0 = cor, posição 1 = tamanho". Se `product.attributes`
 * não tiver o nome esperado (ausente, unicamente atributo diferente, ordem
 * invertida), cai de volta na posição fornecida como `fallbackIndex` — o mesmo
 * comportamento anterior a esta correção — para não quebrar produtos sem
 * `attributes` nomeados.
 * @param {object} product
 * @param {object} variant
 * @param {string[]} acceptedNames
 * @param {number} fallbackIndex
 * @returns {string|null}
 */
function extractVariantValueByAttributeName(product, variant, acceptedNames, fallbackIndex) {
  if (!variant.values) return null;
  const attrIndex = findAttributeIndex(product.attributes, acceptedNames);
  const index = attrIndex >= 0 ? attrIndex : fallbackIndex;
  return variant.values[index] ? variant.values[index].pt : null;
}

/**
 * Resolve o category_id real de uma categoria pelo nome via GET /categories — nunca
 * hardcoded (D-01/D-02/Pitfall C do 02-RESEARCH.md).
 * @param {string} targetName
 * @param {AdaptiveRateLimiter} limiter
 * @returns {Promise<{ id: string|number, name: string }>}
 */
export async function resolveCategoryIdByName(targetName, limiter) {
  const categories = await listCategories({ limiter });
  const normalizedTarget = targetName.trim().toLowerCase();
  const match = categories.find(
    (c) => (c.name?.pt || '').trim().toLowerCase() === normalizedTarget
  );

  if (!match) {
    throw new Error(
      `Categoria "${targetName}" não encontrada via GET /categories — confirme o nome exato no admin antes de prosseguir.`
    );
  }

  return { id: match.id, name: match.name?.pt || targetName };
}

/**
 * Pagina todos os produtos de uma categoria até `hasNextPage === false`, acumulando
 * o lote completo antes de prosseguir (per_page=200, PLAT-02).
 * @param {string|number} categoryId
 * @param {AdaptiveRateLimiter} limiter
 * @returns {Promise<Array<object>>}
 */
async function listAllProductsInCategory(categoryId, limiter) {
  const allProducts = [];
  let page = 1;
  let hasNextPage = true;

  while (hasNextPage) {
    const result = await listProducts({ categoryId, page, perPage: 200, limiter });
    allProducts.push(...result.products);
    hasNextPage = result.hasNextPage;
    page += 1;
  }

  return allProducts;
}

/**
 * Lê o baseline informativo do Metafield de recomendação atual de um produto
 * (DATA-02), reaproveitando `getMetafields()` já existente — sem lógica de drift
 * (D-12). Recebe o mesmo `limiter` usado na paginação de produtos/categorias para que
 * as ~628 chamadas de Metafields também respeitem o rate limit adaptativo (T-02-08,
 * Pitfall B do RESEARCH.md) — não apenas a paginação.
 * @param {string|number} productId
 * @param {import('../rate-limit/adaptive-limiter.js').AdaptiveRateLimiter} limiter
 * @returns {Promise<string|null>}
 */
async function readRecommendationBaseline(productId, limiter) {
  const metafields = await getMetafields({ ownerId: productId, limiter });
  const match = Array.isArray(metafields)
    ? metafields.find((m) => m.namespace === RECOMMENDATION_NAMESPACE && m.key === RECOMMENDATION_KEY)
    : null;
  return match ? match.value : null;
}

/**
 * Orquestra uma execução completa de ingestão do catálogo: resolve categoria ->
 * pagina produtos -> calcula estoque -> audita tags -> persiste tudo em uma única
 * transação. Garante que `ingestion_runs.status` é sempre finalizado (success ou
 * failed), nunca preso em 'running'.
 * @param {{ categoryName?: string }} [params]
 * @returns {Promise<{ runId: number, productsRead: number, status: 'success',
 *   availableCount: number, distinctTagCount: number, unmappedTagCount: number,
 *   baselineNonNullCount: number }>}
 */
export async function runIngestion({ categoryName = 'Vestidos' } = {}) {
  const limiter = new AdaptiveRateLimiter();
  const category = await resolveCategoryIdByName(categoryName, limiter);

  const allProducts = await listAllProductsInCategory(category.id, limiter);

  const runId = startIngestionRun({ categoryId: category.id, categoryName: category.name });

  try {
    // DATA-03: auditoria de tags de tecido roda UMA VEZ para todo o lote, não por
    // produto. canonicalMap vazio na primeira execução é esperado (D-06) — mas agora
    // é lido de fabric_tag_canonical_map, não mais hardcoded, para que o mapeamento
    // funcione assim que a planilha D-07 for importada (WR-01).
    const canonicalMap = getCanonicalMap();
    const { frequency, unmapped } = auditFabricTags(allProducts, canonicalMap);

    const snapshotAt = new Date().toISOString();
    const products = [];
    const variants = [];
    const snapshots = [];
    const recommendationBaselines = [];
    let availableCount = 0;
    let baselineNonNullCount = 0;

    for (const product of allProducts) {
      const productId = String(product.id);
      const sizesInStockCount = (product.variants || []).filter(
        (variant) => getVariantStock(variant) > 0
      ).length;
      const availableGrade = hasAvailableGrade(product, { minSizesInStock: MIN_SIZES_IN_STOCK });
      if (availableGrade) availableCount += 1;

      products.push({
        id: productId,
        name: (product.name && product.name.pt) || null,
        handle: (product.handle && product.handle.pt) || null,
        canonicalUrl: product.canonical_url || null,
      });

      for (const variant of product.variants || []) {
        variants.push({
          id: String(variant.id),
          productId,
          sku: variant.sku || null,
          // WR-06: mapeia por nome de atributo (product.attributes) quando disponível,
          // em vez de assumir posição fixa 0=cor/1=tamanho; cai no índice posicional
          // apenas se o nome do atributo não puder ser identificado.
          colorValue: extractVariantValueByAttributeName(product, variant, COLOR_ATTRIBUTE_NAMES, 0),
          sizeValue: extractVariantValueByAttributeName(product, variant, SIZE_ATTRIBUTE_NAMES, 1),
          stockTotal: getVariantStock(variant),
        });
      }

      const rawTags = ((product.tags || '').split(',').map((t) => t.trim()).filter(Boolean));
      // CR-01: product.tags mistura tags de marketing/SEO com tags de tecido (uma vez
      // que a planilha D-07 for importada) sem nenhuma ordem/posição garantida. Só
      // tratamos uma tag como "a tag de tecido" quando ela já é uma chave conhecida no
      // canonicalMap — nunca assumimos rawTags[0] arbitrariamente.
      const fabricTagRaw = rawTags.find((tag) => canonicalMap.has(tag)) || null;
      const fabricTagCanonical = fabricTagRaw ? canonicalMap.get(fabricTagRaw) : null;

      // WR-06/IN-03: mesmo mapeamento por nome de atributo usado no loop de variantes
      // acima, aplicado à primeira variante retornada pela API — este valor continua
      // sendo "a cor da primeira variante retornada", não necessariamente
      // representativa para produtos multi-cor (ver IN-03), mas ao menos deixa de
      // assumir a posição fixa 0 para o valor de cor.
      const firstVariant = (product.variants && product.variants[0]) || null;
      const snapshotColorValue = firstVariant
        ? extractVariantValueByAttributeName(product, firstVariant, COLOR_ATTRIBUTE_NAMES, 0)
        : null;

      snapshots.push({
        productId,
        hasAvailableGrade: availableGrade ? 1 : 0,
        sizesInStockCount,
        fabricTagRaw,
        fabricTagCanonical,
        colorValue: snapshotColorValue,
        snapshotAt,
      });

      const currentRecommendedProductId = await readRecommendationBaseline(productId, limiter);
      if (currentRecommendedProductId !== null) baselineNonNullCount += 1;
      recommendationBaselines.push({
        productId,
        currentRecommendedProductId,
        readAt: new Date().toISOString(),
      });
    }

    const fabricAudits = [];
    for (const [rawTag, occurrenceCount] of frequency.entries()) {
      fabricAudits.push({
        rawTag,
        occurrenceCount,
        isMapped: unmapped.has(rawTag) ? 0 : 1,
      });
    }

    persistIngestionBatch({
      runId,
      records: { products, variants, snapshots, fabricAudits, recommendationBaselines },
    });

    finishIngestionRun({ runId, status: 'success', productsRead: allProducts.length });

    return {
      runId,
      productsRead: allProducts.length,
      status: 'success',
      availableCount,
      distinctTagCount: frequency.size,
      unmappedTagCount: unmapped.size,
      baselineNonNullCount,
    };
  } catch (error) {
    // WR-03: allProducts já está disponível antes do try — registra a contagem real
    // em vez de sempre 0, para que ingestion_runs distinga falha antes de qualquer
    // leitura de falha após já ter processado a maioria dos produtos.
    finishIngestionRun({ runId, status: 'failed', productsRead: allProducts.length });
    throw error;
  }
}
