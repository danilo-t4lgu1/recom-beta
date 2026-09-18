// Script executável de entrada única da ingestão de pedidos reais da Nuvemshop —
// base do sinal novo de co-compra/market basket. Fino: só chama `runOrderIngestion()`
// e imprime o resultado, mesmo padrão de `run-ingestion.js`.
//
// Uso: node --env-file=.env scripts/ingest-orders.js [--include-unpaid]
// (default onlyPaid=true — exige pedido pago + não-cancelado para qualificar; ver
// `runOrderIngestion` em src/ingestion/ingest-orders.js)

import { runOrderIngestion } from '../src/ingestion/ingest-orders.js';

async function main() {
  const onlyPaid = !process.argv.slice(2).includes('--include-unpaid');

  console.log(`\nIniciando ingestão de pedidos (onlyPaid=${onlyPaid})...`);

  const result = await runOrderIngestion({ onlyPaid });

  console.log('\n=== Resumo da execução de ingestão de pedidos ===');
  console.log(JSON.stringify(result, null, 2));
  console.log('==================================================\n');

  process.exit(0);
}

main().catch((err) => {
  console.error('\nERRO durante a ingestão de pedidos:', err.message);
  process.exit(1);
});
