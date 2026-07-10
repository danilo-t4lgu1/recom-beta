// Endpoint próprio somente-leitura (PLAT-05): expõe a recomendação gravada no
// Metafield do produto, sem NUNCA repassar token/credencial da Nuvemshop ao
// chamador. É este handler que o Script do storefront (traditional Script API,
// v.Alpha per D-11 em 01-CONTEXT.md) consulta via fetch() no navegador do
// visitante — por isso o contrato de retorno é estritamente mínimo.

import { getMetafields, getProduct } from '../nuvemshop-client/client.js';

const NAMESPACE = 'recomendados';
const KEY = 'produto_sugerido';

/**
 * Lê o Metafield de recomendação de um produto e retorna um objeto JSON mínimo,
 * sem nenhum campo de autenticação (access_token, client_secret, Bearer, etc.).
 *
 * `recommendedProduct` (url/name/image/price) foi adicionado após a verificação
 * visual do Wave 4 revelar dois problemas reais: (1) o v.Alpha original
 * construía o link como `/produtos/{id}`, mas a Nuvemshop usa o "Identificador
 * URL" (handle) na rota real do produto — `/produtos/{id}` sempre resulta em
 * 404; (2) o bloco mostrava só um link de texto, sem foto/preço, o que o
 * usuário validou como abaixo do esperado mesmo para um Alpha. `canonical_url`
 * da API pública já retorna a URL real e correta pronta para uso — não precisa
 * reconstruir a partir do handle.
 * @param {string|number} productId
 * @returns {Promise<{ productId: string|number, recommendedProductId: string|null, recommendedProduct: { url: string, name: string, image: string|null, price: string|null } | null }>}
 */
export async function getRecommendations(productId) {
  const metafields = await getMetafields({ ownerId: productId });

  const match = Array.isArray(metafields)
    ? metafields.find((m) => m.namespace === NAMESPACE && m.key === KEY)
    : null;

  const recommendedProductId = match ? match.value : null;

  let recommendedProduct = null;
  if (recommendedProductId) {
    const product = await getProduct(recommendedProductId);
    recommendedProduct = {
      url: product.canonical_url,
      name: (product.name && product.name.pt) || String(recommendedProductId),
      image: (product.images && product.images[0] && product.images[0].src) || null,
      price: (product.variants && product.variants[0] && product.variants[0].price) || null,
    };
  }

  return {
    productId,
    recommendedProductId,
    recommendedProduct,
  };
}
