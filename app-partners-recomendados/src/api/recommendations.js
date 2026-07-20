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

/**
 * Materializa os dados de exibição de um produto recomendado (url/name/image/price)
 * a partir da API pública. Nunca lança: se o produto foi excluído/indisponível,
 * o chamador filtra o `null` fora (um id morto não derruba o bloco inteiro).
 * @param {string} id
 * @returns {Promise<{ id: string, url: string, name: string, image: string|null, price: string|null } | null>}
 */
async function materializeProduct(id) {
  try {
    const product = await getProduct(id);
    return {
      id: String(id),
      url: product.canonical_url,
      name: (product.name && product.name.pt) || String(id),
      image: (product.images && product.images[0] && product.images[0].src) || null,
      price: (product.variants && product.variants[0] && product.variants[0].price) || null,
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
