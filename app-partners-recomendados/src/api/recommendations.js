// Endpoint próprio somente-leitura (PLAT-05): expõe a(s) recomendação(ões) gravada(s)
// no Metafield do produto, sem NUNCA repassar token/credencial da Nuvemshop ao
// chamador. É este handler que o Script do storefront (traditional Script API,
// v.Alpha per D-11 em 01-CONTEXT.md) consulta via fetch() no navegador do
// visitante — por isso o contrato de retorno é estritamente mínimo.

import { getMetafields, getProduct } from '../nuvemshop-client/client.js';

const NAMESPACE = 'recomendados';
const KEY = 'produto_sugerido';
const MAX_RECOMMENDATIONS = 8; // espelha MAX_RECOMMENDATIONS do motor (RULE-01/D-18)

/**
 * Normaliza o valor bruto do Metafield para uma lista de productIds (strings).
 * Trata os dois formatos que já existiram na loja, sem quebrar nenhum:
 *  - Formato atual (write-executor.js, Fase 5): array JSON de até 8 ids
 *    (`'["321418552","349886153"]'`).
 *  - Formato legado (spike Fase 1): um único id "cru" (`'321418552'`), que é
 *    JSON válido (número) e resolve para `[id]`.
 * Qualquer string não-JSON também vira `[rawValue]` (defensivo, nunca lança).
 * @param {string|null|undefined} rawValue
 * @returns {string[]}
 */
export function parseRecommendedIds(rawValue) {
  if (rawValue == null || rawValue === '') return [];
  let parsed;
  try {
    parsed = JSON.parse(rawValue);
  } catch {
    return [String(rawValue)];
  }
  if (Array.isArray(parsed)) return parsed.map((id) => String(id)).filter(Boolean);
  return [String(parsed)];
}

// Localiza a posição do atributo "Tamanho" em product.attributes (mesma
// convenção WR-06 da ingestão). Fallback para índice 1 se não achar.
function findSizeIndex(attributes) {
  if (!Array.isArray(attributes)) return 1;
  const i = attributes.findIndex((a) => {
    const n = (a && a.pt ? a.pt : '').trim().toLowerCase();
    return n === 'tamanho' || n === 'size';
  });
  return i >= 0 ? i : 1;
}

// Estoque de uma variante: soma inventory_levels[].stock quando presente
// (fonte correta, DATA-01), senão cai no campo v.stock.
function variantStock(v) {
  const inv = v && v.inventory_levels;
  if (Array.isArray(inv) && inv.length) {
    return inv.reduce((s, l) => s + (Number(l && l.stock) || 0), 0);
  }
  return Number(v && v.stock) || 0;
}

/**
 * Materializa os dados de exibição de um produto recomendado a partir da API
 * pública — agora com PREÇO ATUAL (promocional quando houver, para bater com a
 * página real do produto), preço cheio para riscar, flag de promoção, e a GRADE
 * DE TAMANHOS com disponibilidade por tamanho. Nunca lança: produto excluído/
 * indisponível vira `null` e é filtrado pelo chamador.
 * @param {string} id
 * @returns {Promise<object|null>}
 */
async function materializeProduct(id) {
  try {
    const product = await getProduct(id);
    const variants = Array.isArray(product.variants) ? product.variants : [];
    const first = variants[0] || {};

    // Preço: promotional_price é o preço ATUAL da vitrine quando presente; price
    // é o cheio (para riscar). Bate com o que a página do produto exibe.
    const regular = first.price != null ? Number(first.price) : null;
    const promo = first.promotional_price != null ? Number(first.promotional_price) : null;
    const current = promo != null ? promo : regular;
    const onSale = promo != null && regular != null && promo < regular;

    // Grade de tamanhos: agrega por valor de tamanho (attributes → 'Tamanho'),
    // marcando disponível se QUALQUER variante daquele tamanho tem estoque > 0.
    const sizeIdx = findSizeIndex(product.attributes);
    const sizeMap = new Map();
    for (const v of variants) {
      const size = v && v.values && v.values[sizeIdx] ? v.values[sizeIdx].pt : null;
      if (size == null) continue;
      const available = variantStock(v) > 0;
      sizeMap.set(size, (sizeMap.get(size) || false) || available);
    }
    const sizes = Array.from(sizeMap.entries()).map(([size, available]) => ({ size, available }));

    return {
      id: String(id),
      url: product.canonical_url,
      name: (product.name && product.name.pt) || String(id),
      image: (product.images && product.images[0] && product.images[0].src) || null,
      price: current != null ? String(current) : null,
      regularPrice: onSale ? String(regular) : null,
      onSale,
      discountPercent: onSale ? Math.round((1 - promo / regular) * 100) : null,
      sizes,
    };
  } catch {
    return null;
  }
}

/**
 * Lê o Metafield de recomendação de um produto e retorna um objeto JSON mínimo
 * (sem nenhum campo de autenticação), agora com a LISTA de até 8 produtos
 * recomendados (RULE-01/D-18) — não apenas 1. O storefront renderiza essa lista
 * como um carrossel no formato do bloco nativo.
 *
 * Retrocompatibilidade: `recommendedProductId`/`recommendedProduct` (singular)
 * continuam presentes, apontando para o PRIMEIRO item da lista, para não quebrar
 * nenhum consumidor legado enquanto o storefront é atualizado.
 * @param {string|number} productId
 * @returns {Promise<{
 *   productId: string|number,
 *   recommendedProductIds: string[],
 *   recommendedProducts: Array<{ id: string, url: string, name: string, image: string|null, price: string|null }>,
 *   recommendedProductId: string|null,
 *   recommendedProduct: { url: string, name: string, image: string|null, price: string|null } | null
 * }>}
 */
export async function getRecommendations(productId) {
  const metafields = await getMetafields({ ownerId: productId });

  const match = Array.isArray(metafields)
    ? metafields.find((m) => m.namespace === NAMESPACE && m.key === KEY)
    : null;

  const ids = parseRecommendedIds(match ? match.value : null).slice(0, MAX_RECOMMENDATIONS);

  // Materializa em paralelo; ids mortos (produto excluído) viram null e são filtrados.
  const settled = await Promise.all(ids.map((id) => materializeProduct(id)));
  const recommendedProducts = settled.filter(Boolean);

  const first = recommendedProducts[0] || null;

  return {
    productId,
    recommendedProductIds: recommendedProducts.map((p) => p.id),
    recommendedProducts,
    // Retrocompatibilidade (singular) — primeiro item da lista.
    recommendedProductId: first ? first.id : null,
    recommendedProduct: first
      ? { url: first.url, name: first.name, image: first.image, price: first.price }
      : null,
  };
}
