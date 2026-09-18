// Script executável de relatório de co-compra (market basket) — cruza os pares
// calculados por `computeCoPurchasePairs` (a partir de pedidos reais já ingeridos) com
// o snapshot mais recente do catálogo (`getLatestSnapshotProducts`) para exibir
// nome/grupo de cada lado do par, sem nenhuma chamada de rede nova. Fino: só lê,
// calcula e imprime — mesmo padrão de `coverage-report.js`/`engine-certification-report.js`.
//
// Uso: node --env-file=.env scripts/report-co-purchase.js [minCoOccurrence]
// (default minCoOccurrence=3, D-XX de negócio prioritário: cross-group Partes de
// Cima <-> Partes de Baixo, ex: blusa+calça)
//
// Sem dependências novas: tabela texto simples via console.table.

import { getAllOrderItemsForAnalysis } from '../src/db/orders-store.js';
import { getLatestSnapshotProducts } from '../src/db/catalog-store.js';
import { computeCoPurchasePairs } from '../src/recommendation/co-purchase-analysis.js';

const TOP_N = 30;

function formatPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

async function main() {
  const minCoOccurrenceArg = Number.parseInt(process.argv[2] ?? '', 10);
  const minCoOccurrence = Number.isInteger(minCoOccurrenceArg) && minCoOccurrenceArg >= 1 ? minCoOccurrenceArg : 3;

  const orderItems = getAllOrderItemsForAnalysis();
  const catalogProducts = getLatestSnapshotProducts();
  const productById = new Map(catalogProducts.map((p) => [p.productId, p]));

  console.log(`\nItens de pedido qualificados disponíveis para análise: ${orderItems.length}`);
  console.log(`minCoOccurrence: ${minCoOccurrence}\n`);

  const pairs = computeCoPurchasePairs(orderItems, { minCoOccurrence });

  if (pairs.length === 0) {
    console.log(
      `Nenhum par de produtos atingiu minCoOccurrence=${minCoOccurrence} — volume de pedidos ` +
        'insuficiente para um sinal de co-compra confiável neste limiar.\n'
    );
    process.exit(0);
  }

  const rows = pairs.slice(0, TOP_N).map((pair) => {
    const productA = productById.get(pair.productIdA);
    const productB = productById.get(pair.productIdB);
    const groupA = productA?.productGroupCanonical ?? null;
    const groupB = productB?.productGroupCanonical ?? null;
    const isCrossGroup =
      (groupA === 'Partes de Cima' && groupB === 'Partes de Baixo') ||
      (groupA === 'Partes de Baixo' && groupB === 'Partes de Cima');

    return {
      'Produto A': productA?.name ?? `#${pair.productIdA} (fora do catálogo atual)`,
      'Grupo A': groupA ?? '(desconhecido)',
      'Produto B': productB?.name ?? `#${pair.productIdB} (fora do catálogo atual)`,
      'Grupo B': groupB ?? '(desconhecido)',
      count: pair.count,
      support: formatPercent(pair.support),
      'conf A→B': formatPercent(pair.confidenceAtoB),
      'conf B→A': formatPercent(pair.confidenceBtoA),
      lift: pair.lift.toFixed(2),
      'cross-group (blusa+calça)': isCrossGroup ? 'SIM' : '',
    };
  });

  console.log(`Top ${rows.length} pares por lift (count >= ${minCoOccurrence}):\n`);
  console.table(rows);

  const crossGroupCount = rows.filter((r) => r['cross-group (blusa+calça)'] === 'SIM').length;
  console.log(`\nPares cross-group (Partes de Cima + Partes de Baixo) no top ${rows.length}: ${crossGroupCount}\n`);

  process.exit(0);
}

main().catch((err) => {
  console.error('\nERRO ao gerar relatório de co-compra:', err.message);
  process.exit(1);
});
