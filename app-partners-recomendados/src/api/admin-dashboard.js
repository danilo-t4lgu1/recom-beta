// Agregação de leitura para o Painel Administrativo do Recom. Módulo de domínio
// PURO (mesma disciplina de coverage-report.js/engine-certification.js): recebe
// os dados já materializados (snapshot, últimos valores escritos, resumo do
// último run) e só soma/conta — nenhum I/O próprio, nenhuma escrita, nunca
// consulta a Nuvemshop. O chamador HTTP (admin-server.js) faz toda a leitura.
//
// "Produtos relacionados" usa o estado REALMENTE gravado (write_log via
// getLastWrittenValuesForAllProducts), não o que o motor computaria agora —
// reflete o que está de fato ao vivo na loja, que é o que o usuário quer
// auditar visualmente.

/**
 * @param {{
 *   snapshotProducts: Array<{ productId: string, name: string|null, fabricTagCanonical: string|null,
 *     variants: Array<{ stockTotal: number }> }>,
 *   lastWrittenByProduct: Map<string, string[]>,
 *   lastRunSummary: { runId: number, status: string, startedAt: string, finishedAt: string|null,
 *     productsRead: number|null } | null,
 * }} params
 * @returns {{
 *   relatedProducts: { count: number, totalProducts: number },
 *   relatedProductsStock: { totalUnitsInStock: number, zeroStockCount: number,
 *     items: Array<{ productId: string, name: string|null, stockTotal: number }> },
 *   fabricTagFilled: { count: number, total: number },
 *   lastCronRun: { runId: number, status: string, startedAt: string, finishedAt: string|null,
 *     productsRead: number|null } | null,
 * }}
 */
export function buildAdminDashboard({ snapshotProducts, lastWrittenByProduct, lastRunSummary }) {
  const productsById = new Map(snapshotProducts.map((p) => [String(p.productId), p]));

  let relatedCount = 0;
  const recommendedTargetIds = new Set();
  for (const [productId, recommendedIds] of lastWrittenByProduct.entries()) {
    if (recommendedIds.length === 0) continue;
    relatedCount += 1;
    for (const targetId of recommendedIds) recommendedTargetIds.add(String(targetId));
    void productId;
  }

  let totalUnitsInStock = 0;
  let zeroStockCount = 0;
  const items = [];
  for (const targetId of recommendedTargetIds) {
    const product = productsById.get(targetId);
    const stockTotal = product
      ? product.variants.reduce((sum, v) => sum + (Number(v.stockTotal) || 0), 0)
      : 0;
    totalUnitsInStock += stockTotal;
    if (stockTotal === 0) zeroStockCount += 1;
    items.push({ productId: targetId, name: product ? product.name : null, stockTotal });
  }
  items.sort((a, b) => a.stockTotal - b.stockTotal);

  const fabricTagCount = snapshotProducts.filter((p) => p.fabricTagCanonical != null).length;

  return {
    relatedProducts: { count: relatedCount, totalProducts: snapshotProducts.length },
    relatedProductsStock: { totalUnitsInStock, zeroStockCount, items },
    fabricTagFilled: { count: fabricTagCount, total: snapshotProducts.length },
    lastCronRun: lastRunSummary,
  };
}
