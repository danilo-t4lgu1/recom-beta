// Endpoint próprio somente-leitura (PLAT-05): expõe a recomendação gravada no
// Metafield do produto, sem NUNCA repassar token/credencial da Nuvemshop ao
// chamador. É este handler que o Script do storefront (traditional Script API,
// v.Alpha per D-11 em 01-CONTEXT.md) consulta via fetch() no navegador do
// visitante — por isso o contrato de retorno é estritamente mínimo.

import { getMetafields } from '../nuvemshop-client/client.js';

const NAMESPACE = 'recomendados';
const KEY = 'produto_sugerido';

/**
 * Lê o Metafield de recomendação de um produto e retorna um objeto JSON mínimo,
 * sem nenhum campo de autenticação (access_token, client_secret, Bearer, etc.).
 * @param {string|number} productId
 * @returns {Promise<{ productId: string|number, recommendedProductId: string|null }>}
 */
export async function getRecommendations(productId) {
  const metafields = await getMetafields({ ownerId: productId });

  const match = Array.isArray(metafields)
    ? metafields.find((m) => m.namespace === NAMESPACE && m.key === KEY)
    : null;

  return {
    productId,
    recommendedProductId: match ? match.value : null,
  };
}
