// Análise de co-compra (market basket) — função pura, sem I/O de rede/banco, mesmo
// espírito de `recommendation-engine.js` (motor puro que só recebe dados já prontos e
// devolve um resultado). Agnóstica de onde `orderItems` veio (testável sem DB) —
// `report-co-purchase.js` é quem alimenta com `getAllOrderItemsForAnalysis()`.
//
// Métricas de associação (definições padrão de market basket analysis):
// - support(A,B)      = P(A e B no mesmo pedido) = count / totalOrders
// - confidence(A→B)   = P(B | A)                 = count / ordersComA
// - lift(A,B)         = P(A e B) / (P(A) * P(B))  — lift > 1 indica associação POSITIVA
//   real (comprar A aumenta a chance de comprar B além do que o acaso projetaria);
//   lift == 1 indica independência; lift < 1, associação negativa.

/**
 * Computa os pares de produtos co-comprados a partir de itens de pedido brutos,
 * filtrando por `minCoOccurrence` e ordenando por `lift` desc (tiebreak `count` desc).
 * @param {Array<{ orderId: string, productId: string, quantity: number }>} orderItems
 * @param {{ minCoOccurrence?: number }} [options]
 * @returns {Array<{ productIdA: string, productIdB: string, count: number,
 *   support: number, confidenceAtoB: number, confidenceBtoA: number, lift: number }>}
 */
export function computeCoPurchasePairs(orderItems, { minCoOccurrence = 3 } = {}) {
  // Agrupa por orderId -> Set de productId ÚNICOS por pedido (um produto duplicado no
  // mesmo pedido, ex: vindo de order_items sem dedupe upstream, nunca conta o mesmo
  // par duas vezes dentro do mesmo pedido — Set garante unicidade aqui).
  const productIdsByOrder = new Map();
  for (const { orderId, productId } of orderItems) {
    if (!productIdsByOrder.has(orderId)) productIdsByOrder.set(orderId, new Set());
    productIdsByOrder.get(orderId).add(productId);
  }

  const totalOrders = productIdsByOrder.size;

  // ordersByProduct: base do support/confidence individual de cada produto.
  const ordersByProduct = new Map();
  for (const [orderId, productIds] of productIdsByOrder) {
    for (const productId of productIds) {
      if (!ordersByProduct.has(productId)) ordersByProduct.set(productId, new Set());
      ordersByProduct.get(productId).add(orderId);
    }
  }

  // Contagem de co-ocorrência por par não-ordenado, chave "idA|idB" com idA < idB
  // (comparação lexicográfica de string) — garante 1 chave por par independente da
  // ordem em que os dois produtos aparecem no pedido.
  const pairCounts = new Map();
  for (const productIds of productIdsByOrder.values()) {
    const ids = Array.from(productIds);
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const [idA, idB] = ids[i] < ids[j] ? [ids[i], ids[j]] : [ids[j], ids[i]];
        const key = `${idA}|${idB}`;
        pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
      }
    }
  }

  const pairs = [];
  for (const [key, count] of pairCounts) {
    if (count < minCoOccurrence) continue;

    const [productIdA, productIdB] = key.split('|');
    const ordersWithA = ordersByProduct.get(productIdA).size;
    const ordersWithB = ordersByProduct.get(productIdB).size;

    const support = count / totalOrders;
    const confidenceAtoB = count / ordersWithA;
    const confidenceBtoA = count / ordersWithB;
    const lift = support / ((ordersWithA / totalOrders) * (ordersWithB / totalOrders));

    pairs.push({ productIdA, productIdB, count, support, confidenceAtoB, confidenceBtoA, lift });
  }

  pairs.sort((a, b) => b.lift - a.lift || b.count - a.count);

  return pairs;
}
