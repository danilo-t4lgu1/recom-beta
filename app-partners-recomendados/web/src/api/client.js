// web/src/api/client.js
// Cliente HTTP unificado para o Painel Administrativo (/backend-architect).
// Oferece suporte a AbortController, tratamento padronizado de status HTTP e tipagem clara.

async function request(url, options = {}) {
  const { signal, ...rest } = options;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      ...rest.headers,
    },
    signal,
    ...rest,
  });

  if (!res.ok) {
    let errorDetail = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (data && (data.error || data.message)) {
        errorDetail = data.error || data.message;
      }
    } catch {
      // Usa fallback do status
    }
    const err = new Error(errorDetail);
    err.status = res.status;
    throw err;
  }

  return res.json();
}

/**
 * Carrega as métricas consolidadas da aba Visão Geral (Overview).
 */
export async function fetchDashboard({ signal } = {}) {
  return request('/api/dashboard', { signal });
}

/**
 * Busca produtos por termo ou ID para o Autocomplete / Inspetor.
 */
export async function searchProducts(query = '', { signal, limit = 20 } = {}) {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (limit) params.set('limit', String(limit));
  return request(`/api/products-search?${params.toString()}`, { signal });
}

/**
 * Inspeciona a vitrine ao vivo gerada pelo motor determinístico para um produto específico.
 */
export async function inspectProductRecommendations(productId, { signal } = {}) {
  const params = new URLSearchParams({ productId: String(productId) });
  return request(`/api/recommendations-inspect?${params.toString()}`, { signal });
}

/**
 * Busca a lista paginada e filtrada dos pares de co-compra reais (Hub de Looks).
 */
export async function fetchCoPurchasePairs({
  page = 1,
  limit = 25,
  category = null,
  onlyInStock = false,
  sortBy = 'count',
  signal,
} = {}) {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    sortBy,
  });
  if (category) params.set('category', category);
  if (onlyInStock) params.set('onlyInStock', 'true');

  return request(`/api/co-purchase-pairs?${params.toString()}`, { signal });
}

/**
 * Carrega o diagnóstico de saúde do catálogo (11 categorias) e métricas do disjuntor.
 */
export async function fetchCatalogHealth({ signal } = {}) {
  return request('/api/catalog-health', { signal });
}

/**
 * Carrega o detalhamento de tags de tecidos para auditoria.
 */
export async function fetchFabricTags({ signal } = {}) {
  return request('/api/fabric-tags', { signal });
}

/**
 * Carrega o log cronológico de execuções do cron diário.
 */
export async function fetchCronLog({ signal } = {}) {
  return request('/api/cron-log', { signal });
}
