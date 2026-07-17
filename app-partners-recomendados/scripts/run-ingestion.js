// Script executável de entrada única do job de ingestão completo do catálogo
// (PLAT-02, DATA-01, DATA-02, DATA-03) — ponto de entrada reutilizável para a
// operação diária futura (Fase 6).
//
// Uso: node --env-file=.env scripts/run-ingestion.js [categoria1] [categoria2] ...
// (default ["Vestidos"] se nenhuma categoria for passada, D-01)
//
// Atalho: `--all` ingere as 11 categorias de taxonomia do catálogo completo
// (ALL_TAXONOMY_CATEGORY_NAMES, D-26) sob um único run_id — evita digitar 11
// nomes acentuados na linha de comando (onde acento/cedilha podem ser
// corrompidos pelo shell).
//
// D-33 (Fase 03.1): cada argumento adicional de linha de comando é um nome de
// categoria distinto — todas ficam sob o MESMO run_id (runIngestion({ categoryNames })),
// corrigindo a limitação em que ingerir categorias em chamadas separadas fazia a
// categoria anterior "desaparecer" do snapshot de trabalho lido por
// getLatestSnapshotProducts() (Pitfall 1 do 03.1-RESEARCH.md).
//
// Chama runIngestion({ categoryNames }), que encadeia: resolução de category_id por
// nome (uma vez por categoria) -> paginação de produtos -> cálculo de disponibilidade
// de estoque (D-04) -> auditoria de tags de tecido (DATA-03) -> extração/resolução de
// Grupo de Produtos (D-26) -> leitura de baseline de recomendações (DATA-02) ->
// persistência transacional única (SQLite). Imprime um resumo final e sai com o exit
// code correspondente ao sucesso/falha da execução.

import { runIngestion } from '../src/ingestion/ingest-catalog.js';
import { ALL_TAXONOMY_CATEGORY_NAMES } from '../src/ingestion/product-group.js';

async function main() {
  const args = process.argv.slice(2);
  const categoryNames = args.includes('--all')
    ? ALL_TAXONOMY_CATEGORY_NAMES
    : args.length > 0
      ? args
      : ['Vestidos'];

  console.log(`\nIniciando ingestão completa da(s) categoria(s) "${categoryNames.join(', ')}"...`);

  const result = await runIngestion({ categoryNames });

  console.log('\n=== Resumo da execução de ingestão ===');
  console.log(`  run_id: ${result.runId}`);
  console.log(`  status: ${result.status}`);
  console.log(`  Produtos lidos: ${result.productsRead}`);
  console.log(`  Produtos disponíveis (grade >= 3 tamanhos, D-04): ${result.availableCount}`);
  console.log(`  Tags brutas distintas auditadas (DATA-03): ${result.distinctTagCount}`);
  console.log(`  Tags não mapeadas para valor canônico: ${result.unmappedTagCount}`);
  console.log(`  Categorias de produto não mapeadas para grupo canônico (D-26): ${result.unmappedCategoryCount}`);
  console.log(`  Produtos com baseline de recomendação prévio (DATA-02): ${result.baselineNonNullCount}`);
  console.log('=======================================\n');

  process.exit(0);
}

main().catch((err) => {
  console.error('\nERRO durante a ingestão:', err.message);
  process.exit(1);
});
