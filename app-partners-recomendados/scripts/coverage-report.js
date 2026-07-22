// CLI read-only do relatório de cobertura (D-59/D-60). Substitui o protótipo
// TEMP `scripts/_scope.js` (removido no Plano 07-07) por código permanente com
// motivo item-a-item das zeradas e caminho de reprocesso.
//
// Idioma ESM CLI-only (mesma forma de `run-daily-job.js`/`rollback.js`): o corpo
// do CLI vive atrás do guard `import.meta.url === pathToFileURL(process.argv[1]).href`
// e NUNCA dispara ao ser importado (teste importa o módulo sem efeito colateral).
// Read-only: lê o snapshot com `getLatestSnapshotProducts` e delega a lógica pura a
// `buildCoverageReport` — nunca grava na loja nem no banco. Ainda assim fecha a
// conexão SQLite ao final (`checkpointAndCloseDb`), mesma disciplina de conexão do
// job diário, para liberar o handle nativo antes de sair.
//
// Saída: JSON legível por padrão; flag opcional `--csv` serializa as tabelas de
// zeradas e reprocesso em CSV (formato à discrição, D-60).

import { pathToFileURL } from 'node:url';
import { getLatestSnapshotProducts } from '../src/db/catalog-store.js';
import { buildCoverageReport } from '../src/report/coverage-report.js';

/**
 * Escapa um campo para CSV (RFC 4180 simplificado): envolve em aspas e duplica
 * aspas internas quando o valor contém vírgula, aspas ou quebra de linha.
 * @param {*} value
 * @returns {string}
 */
function csvField(value) {
  const str = value == null ? '' : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Serializa o relatório em CSV (D-60): um bloco para as zeradas
 * (`productId,reason,group`) e um bloco para o reprocesso (`productId`), com uma
 * linha de cabeçalho de resumo. Formato pensado para colar em planilha.
 * @param {import('../src/report/coverage-report.js').CoverageReport} report
 * @returns {string}
 */
function toCsv(report) {
  const lines = [];
  lines.push('secao,total_fontes_em_estoque,cobertas,zeradas,cobertura_pct');
  lines.push(
    [
      'resumo',
      report.totalSourcesInStock,
      report.covered,
      report.zeroed.length,
      report.headlineCoveragePct,
    ]
      .map(csvField)
      .join(',')
  );
  lines.push('');
  lines.push('zeradas_product_id,motivo,grupo');
  for (const z of report.zeroed) {
    lines.push([z.productId, z.reason, z.group].map(csvField).join(','));
  }
  lines.push('');
  lines.push('reprocesso_product_id');
  for (const id of report.reprocess) {
    lines.push(csvField(id));
  }
  return lines.join('\n');
}

/**
 * Constrói o relatório contra o snapshot mais recente com sucesso e o imprime no
 * formato pedido. Função exportada para permitir teste sem disparar o guard ESM.
 * @param {{ csv?: boolean }} [options]
 * @returns {import('../src/report/coverage-report.js').CoverageReport}
 */
export function runCoverageReport({ csv = false } = {}) {
  const products = getLatestSnapshotProducts();
  const report = buildCoverageReport(products);

  if (csv) {
    console.log(toCsv(report));
  } else {
    console.log(JSON.stringify(report, null, 2));
  }
  return report;
}

// Guard ESM: só executa o corpo do CLI quando o módulo é rodado diretamente
// (`node scripts/coverage-report.js`), nunca ao ser importado.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const csv = process.argv.slice(2).includes('--csv');
  try {
    runCoverageReport({ csv });
  } finally {
    // Read-only, mas fecha a conexão para liberar o handle nativo (disciplina de
    // conexão do job diário). checkpointAndCloseDb é importado sob demanda para
    // não acoplar a assinatura pura de runCoverageReport ao ciclo de vida do CLI.
    const { checkpointAndCloseDb } = await import('../src/db/catalog-store.js');
    checkpointAndCloseDb();
  }
  process.exit(0);
}
