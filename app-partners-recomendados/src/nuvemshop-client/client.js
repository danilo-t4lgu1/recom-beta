// Wrapper mínimo da API pública da Nuvemshop (Tiendanube) para a loja Talgui.
// Usa o access_token do App Partners privado (via getAccessToken()) em toda chamada.
// Sem dependências externas — usa fetch global do Node.

import { getAccessToken } from '../auth/nuvemshop-auth.js';
import { fetchWithRateLimit } from '../rate-limit/adaptive-limiter.js';

const API_BASE = 'https://api.tiendanube.com/v1';
const USER_AGENT = 'TalguiRecomendados (danilopradosilva20@gmail.com)';

function buildHeaders(accessToken) {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'User-Agent': USER_AGENT,
  };
}

async function assertOk(response, context) {
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `${context} falhou (status ${response.status}): ${body || '(corpo vazio)'}`
    );
  }
}

/**
 * Busca um produto da loja Talgui pelo ID, confirmando que existe e é acessível.
 * @param {string|number} productId
 * @returns {Promise<object>} objeto do produto retornado pela API pública
 */
export async function getProduct(productId) {
  const { accessToken, storeId } = getAccessToken();
  const url = `${API_BASE}/${storeId}/products/${encodeURIComponent(productId)}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: buildHeaders(accessToken),
  });

  await assertOk(response, `GET ${url}`);
  return response.json();
}

/**
 * Cria um Metafield no produto de teste, gravando o ID do produto recomendado.
 * namespace/key/owner_resource fixos conforme convenção deste spike (WRTE-01).
 * @param {{ ownerId: string|number, value: string }} params
 * @returns {Promise<object>} Metafield criado, conforme retornado pela API
 */
export async function createMetafield({ ownerId, value }) {
  const { accessToken, storeId } = getAccessToken();
  const url = `${API_BASE}/${storeId}/metafields`;

  const response = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(accessToken),
    body: JSON.stringify({
      namespace: 'recomendados',
      key: 'produto_sugerido',
      value,
      owner_resource: 'Product',
      owner_id: ownerId,
      description: 'ID do produto recomendado - spike de viabilidade Fase 1',
    }),
  });

  await assertOk(response, `POST ${url}`);
  return response.json();
}

/**
 * Lê de volta os Metafields do namespace "recomendados" de um produto, para
 * confirmar o round-trip (WRTE-01) e, na Fase 2, para ler o baseline informativo de
 * recomendação de cada produto (DATA-02). Aceita `limiter` opcional para respeitar o
 * rate limit adaptativo em volume (~628 chamadas na ingestão completa, T-02-08) — se
 * omitido, `fetchWithRateLimit` cria uma instância descartável (comportamento anterior
 * preservado para chamadas avulsas como `scripts/roundtrip-metafield.js`).
 * @param {{ ownerId: string|number, limiter?: import('../rate-limit/adaptive-limiter.js').AdaptiveRateLimiter }} params
 * @returns {Promise<Array<object>>} lista de Metafields encontrados
 */
export async function getMetafields({ ownerId, limiter }) {
  const { accessToken, storeId } = getAccessToken();
  const url = `${API_BASE}/${storeId}/metafields/products?owner_id=${encodeURIComponent(ownerId)}&namespace=recomendados`;

  const response = await fetchWithRateLimit(
    url,
    { method: 'GET', headers: buildHeaders(accessToken) },
    limiter
  );

  await assertOk(response, `GET ${url}`);
  return response.json();
}

/**
 * Lista as categorias da loja Talgui via GET /categories, usada para resolver o
 * category_id real de uma categoria por nome (PLAT-02, Pitfall C) — nunca hardcoded.
 * Não pagina múltiplas páginas (o catálogo de categorias é pequeno), mas loga um aviso
 * se o header `link` indicar `rel="next"`, para não mascarar silenciosamente uma lista
 * incompleta caso existam mais de 200 categorias (caso não esperado).
 * @param {{ limiter?: import('../rate-limit/adaptive-limiter.js').AdaptiveRateLimiter }} [params]
 * @returns {Promise<Array<object>>} lista de categorias retornada pela API
 */
export async function listCategories({ limiter } = {}) {
  const { accessToken, storeId } = getAccessToken();
  const url = `${API_BASE}/${storeId}/categories?per_page=200`;

  const response = await fetchWithRateLimit(
    url,
    { method: 'GET', headers: buildHeaders(accessToken) },
    limiter
  );

  await assertOk(response, `GET ${url}`);

  const linkHeader = response.headers.get('link') || '';
  if (linkHeader.includes('rel="next"')) {
    console.warn(
      `listCategories: header 'link' indica rel="next" — existem mais de 200 categorias, ` +
        'a lista retornada pode estar incompleta.'
    );
  }

  return response.json();
}

/**
 * Lista produtos de uma categoria da loja Talgui via GET /products?category_id=,
 * paginado (PLAT-02, DATA-01). `hasNextPage` deriva do header `link` (`rel="next"`)
 * OU do fallback por tamanho de página (products.length === perPage) — nunca assume
 * "última página" apenas pela ausência do header `link` (Pitfall/T-02-02).
 * @param {{ categoryId: string|number, page?: number, perPage?: number, limiter?: import('../rate-limit/adaptive-limiter.js').AdaptiveRateLimiter }} params
 * @returns {Promise<{ products: Array<object>, hasNextPage: boolean }>}
 */
export async function listProducts({ categoryId, page = 1, perPage = 200, limiter } = {}) {
  const { accessToken, storeId } = getAccessToken();
  const url =
    `${API_BASE}/${storeId}/products?category_id=${encodeURIComponent(categoryId)}` +
    `&page=${encodeURIComponent(page)}&per_page=${encodeURIComponent(perPage)}`;

  const response = await fetchWithRateLimit(
    url,
    { method: 'GET', headers: buildHeaders(accessToken) },
    limiter
  );

  await assertOk(response, `GET ${url}`);

  const products = await response.json();
  const linkHeader = response.headers.get('link') || '';
  const hasNextPage = linkHeader.includes('rel="next"') || products.length === perPage;

  return { products, hasNextPage };
}
