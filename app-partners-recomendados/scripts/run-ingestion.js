// Script executável de entrada única do job de ingestão completo do catálogo
// (PLAT-02, DATA-01, DATA-02, DATA-03) — ponto de entrada reutilizável para a
// operação diária futura (Fase 6).
//
// Uso: node --env-file=.env scripts/run-ingestion.js [nomeCategoria]
// (default "Vestidos" se omitido, D-01)
//
// Chama runIngestion({ categoryName }), que encadeia: resolução de category_id por
// nome -> paginação de produtos -> cálculo de disponibilidade de estoque (D-04) ->
// auditoria de tags de tecido (DATA-03) -> leitura de baseline de recomendações
// (DATA-02) -> persistência transacional única (SQLite). Imprime um resumo final e
// sai com o exit code correspondente ao sucesso/falha da execução.

import { runIngestion } from '../src/ingestion/ingest-catalog.js';

async function main() {
  const categoryName = process.argv[2] || 'Vestidos';

  console.log(`\nIniciando ingestão completa da categoria "${categoryName}"...`);

  const result = await runIngestion({ categoryName });

  console.log('\n=== Resumo da execução de ingestão ===');
  console.log(`  run_id: ${result.runId}`);
  console.log(`  status: ${result.status}`);
  console.log(`  Produtos lidos: ${result.productsRead}`);
  console.log(`  Produtos disponíveis (grade >= 3 tamanhos, D-04): ${result.availableCount}`);
  console.log(`  Tags brutas distintas auditadas (DATA-03): ${result.distinctTagCount}`);
  console.log(`  Tags não mapeadas para valor canônico: ${result.unmappedTagCount}`);
  console.log(`  Produtos com baseline de recomendação prévio (DATA-02): ${result.baselineNonNullCount}`);
  console.log('=======================================\n');

  process.exit(0);
}

main().catch((err) => {
  console.error('\nERRO durante a ingestão:', err.message);
  process.exit(1);
});
