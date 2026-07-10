// Cálculo de disponibilidade de estoque via inventory_levels[] (D-04/DATA-01).
//
// `variant.stock` está depreciado (mantido só por compatibilidade retroativa) — a
// leitura correta soma `variant.inventory_levels[].stock`. A regra de negócio real
// da Talgui ("grade disponível" = 3 ou mais tamanhos com estoque > 0) é isolada
// como função nomeada e configurável (Pitfall A do 02-RESEARCH.md), nunca uma
// checagem inline `stock > 0` solta no orquestrador — o valor `3` pode mudar no
// futuro sem exigir uma reescrita da lógica de estoque.

/**
 * Soma o estoque de uma variante a partir de `inventory_levels[]`, nunca de
 * `variant.stock` (depreciado). D-03 confirma localização única de estoque hoje,
 * mas a soma sobre todo o array é robusta mesmo se uma segunda localização for
 * adicionada no futuro. Trata `inventory_levels` ausente/vazio como 0, sem lançar
 * exceção (T-02-06).
 * @param {{ inventory_levels?: Array<{ location_id: string, stock: number }> }} variant
 * @returns {number} soma de stock em todas as localizações
 */
export function getVariantStock(variant) {
  const levels = (variant && variant.inventory_levels) || [];
  return levels.reduce((total, level) => total + (level.stock || 0), 0);
}

/**
 * Regra de negócio D-04: um produto tem "grade disponível" quando `minSizesInStock`
 * ou mais variantes (tamanhos) têm `getVariantStock(variant) > 0`. Nunca inline —
 * esta função nomeada é a única fonte de verdade para essa checagem em todo o
 * projeto. Produto sem `variants` (ausente/vazio) retorna `false` explicitamente,
 * nunca lança exceção (Security Domain T-02-06, produto malformado não deve
 * derrubar o job inteiro).
 * @param {{ variants?: Array<object> }} product
 * @param {{ minSizesInStock?: number }} [options]
 * @returns {boolean} true se >= minSizesInStock variantes têm estoque > 0
 */
export function hasAvailableGrade(product, { minSizesInStock = 3 } = {}) {
  const variants = (product && product.variants) || [];
  const sizesInStockCount = variants.filter((variant) => getVariantStock(variant) > 0).length;
  return sizesInStockCount >= minSizesInStock;
}
