// Wrapper mínimo da API pública da Nuvemshop (Tiendanube) para a loja Talgui.
// Usa o access_token do App Partners privado (via getAccessToken()) em toda chamada.
// Sem dependências externas — usa fetch global do Node.

import { getAccessToken } from '../auth/nuvemshop-auth.js';

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
 * confirmar o round-trip (WRTE-01).
 * @param {{ ownerId: string|number }} params
 * @returns {Promise<Array<object>>} lista de Metafields encontrados
 */
export async function getMetafields({ ownerId }) {
  const { accessToken, storeId } = getAccessToken();
  const url = `${API_BASE}/${storeId}/metafields/products?owner_id=${encodeURIComponent(ownerId)}&namespace=recomendados`;

  const response = await fetch(url, {
    method: 'GET',
    headers: buildHeaders(accessToken),
  });

  await assertOk(response, `GET ${url}`);
  return response.json();
}
