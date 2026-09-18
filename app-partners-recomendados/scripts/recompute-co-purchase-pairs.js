// Script executável de recompute COMPLETO dos pares de co-compra persistidos
// (`co_purchase_pairs`) — mesmo padrão fino de `scripts/run-ingestion.js`: só lê,
// calcula e persiste, nenhuma chamada de rede nova.
//
// Uso: node --env-file=.env scripts/recompute-co-purchase-pairs.js
// (piso de persistência configurável via MIN_CO_PURCHASE_COUNT, default 3)
//
// Fluxo: lê TODOS os `order_items` qualificados já ingeridos
// (`getAllOrderItemsForAnalysis`), roda `computeCoPurchasePairs` com
// `minCoOccurrence: 1` (todos os pares, sem filtro de negócio ainda — o piso
// `minCount` só entra na hora de PERSISTIR, para o histórico de `computed_at`
// sempre refletir a mesma janela de dados, independente de qual piso está
// configurado hoje), filtra para CROSS-GROUP apenas (um lado 'Partes de Cima',
// outro 'Partes de Baixo' — escopo deliberadamente limitado a "looks" cross-group;
// Look Inteiro e pares do mesmo grupo NUNCA são persistidos nesta feature) e
// substitui o conteúdo inteiro de `co_purchase_pairs` (recompute completo, nunca
// incremental).

import { getAllOrderItemsForAnalysis, replaceCoPurchasePairs, resolveMinCoPurchaseCount } from '../src/db/orders-store.js';
import { getLatestSnapshotProducts } from '../src/db/catalog-store.js';
import { computeCoPurchasePairs } from '../src/recommendation/co-purchase-analysis.js';

const GROUP_PARTES_DE_CIMA = 'Partes de Cima';
const GROUP_PARTES_DE_BAIXO = 'Partes de Baixo';

/**
 * Verifica se um par de grupos é a mescla cross-group alvo desta feature (D-28):
 * um lado 'Partes de Cima', o outro 'Partes de Baixo', em qualquer ordem. Qualquer
 * outro par (Look Inteiro, mesmo-grupo, grupo desconhecido/null) é descartado.
 * @param {string|null} groupA
 * @param {string|null} groupB
 * @returns {boolean}
 */
function isCrossGroupPair(groupA, groupB) {
  return (
    (groupA === GROUP_PARTES_DE_CIMA && groupB === GROUP_PARTES_DE_BAIXO) ||
    (groupA === GROUP_PARTES_DE_BAIXO && groupB === GROUP_PARTES_DE_CIMA)
  );
}

async function main() {
  const orderItems = getAllOrderItemsForAnalysis();
  const catalogProducts = getLatestSnapshotProducts();
  const groupByProductId = new Map(catalogProducts.map((p) => [p.productId, p.productGroupCanonical]));

  const allPairs = computeCoPurchasePairs(orderItems, { minCoOccurrence: 1 });
  const crossGroupPairs = allPairs.filter((pair) => {
    const groupA = groupByProductId.get(pair.productIdA) ?? null;
    const groupB = groupByProductId.get(pair.productIdB) ?? null;
    return isCrossGroupPair(groupA, groupB);
  });

  const minCount = resolveMinCoPurchaseCount(process.env.MIN_CO_PURCHASE_COUNT);
  const persistedCount = replaceCoPurchasePairs({ pairs: crossGroupPairs, minCount });

  console.log('\n=== Recompute de pares de co-compra (co_purchase_pairs) ===');
  console.log(`  Itens de pedido qualificados disponíveis: ${orderItems.length}`);
  console.log(`  Pares totais computados (minCoOccurrence=1): ${allPairs.length}`);
  console.log(`  Pares cross-group (Partes de Cima <-> Partes de Baixo): ${crossGroupPairs.length}`);
  console.log(`  Piso de persistência (MIN_CO_PURCHASE_COUNT=${minCount}): count >= ${minCount}`);
  console.log(`  Pares persistidos em co_purchase_pairs: ${persistedCount}`);
  console.log('=============================================================\n');

  process.exit(0);
}

main().catch((err) => {
  console.error('\nERRO ao recomputar pares de co-compra:', err.message);
  process.exit(1);
});
