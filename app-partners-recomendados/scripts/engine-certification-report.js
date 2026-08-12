// CLI read-only do relatório de CERTIFICAÇÃO do motor. Mesma família de
// scripts/coverage-report.js (D-59/D-60): lê o snapshot mais recente e o write_log
// via catalog-store.js, delega a lógica pura a buildCertificationReport, nunca
// grava na loja nem no banco.
//
// Idioma ESM CLI-only (mesma forma de run-daily-job.js/coverage-report.js): o corpo
// do CLI vive atrás do guard `import.meta.url === pathToFileURL(process.argv[1]).href`
// e NUNCA dispara ao ser importado.
//
// Saída padrão: texto legível (pensado para colar num chat/relatório). Flag `--json`
// imprime o shape estruturado completo (para automação/CI).

import { pathToFileURL } from 'node:url';
import {
  getLatestSnapshotProducts,
  getLastWrittenValuesForAllProducts,
} from '../src/db/catalog-store.js';
import { buildCertificationReport, STATUS_OK } from '../src/report/engine-certification.js';

const STATUS_LABEL = {
  ok_identico: 'OK — idêntico ao recompute atual',
  drift_renovacao_ok: 'Renovação (esperado) — item saiu, novo elegível assumiu a vaga',
  drift_sem_backfill: 'ATENÇÃO — item saiu, sem substituto elegível',
  produto_nao_encontrado_no_snapshot: 'ATENÇÃO — produto-fonte não está mais no snapshot atual',
};

/**
 * Formata o relatório como texto legível (resumo + destaques que pedem atenção).
 * Linhas OK/renovação não são listadas individualmente (só contadas) — o objetivo é
 * um documento simples de visualizar, não uma tabela de milhares de linhas.
 * @param {import('../src/report/engine-certification.js').CertificationReport} report
 * @returns {string}
 */
function toReadableText(report) {
  const { summary, rows } = report;
  const lines = [];

  lines.push('=== Certificação do motor de recomendação ===');
  lines.push('');
  lines.push(`Produtos-fonte com escrita registrada: ${summary.totalProdutosComEscrita}`);
  lines.push(`  OK (idêntico ao recompute agora):        ${summary.identico}`);
  lines.push(`  Renovação OK (removido + substituído):    ${summary.renovacaoOk}`);
  lines.push(`  SEM BACKFILL (removido, sem substituto):  ${summary.semBackfill}`);
  lines.push(`  Ranking quebrado (mesmo conjunto, ordem diferente): ${summary.rankingQuebrado}`);
  lines.push(`  Não encontrado no snapshot atual:         ${summary.naoEncontrado}`);
  lines.push('');

  const attention = rows.filter((r) => r.status !== STATUS_OK || r.rankingPreserved === false);

  if (attention.length === 0) {
    lines.push('Nenhum item precisa de atenção — tudo consistente com o recompute atual.');
    return lines.join('\n');
  }

  lines.push(`--- Itens que pedem atenção (${attention.length}) ---`);
  lines.push('');
  for (const row of attention) {
    lines.push(`Produto-fonte ${row.productId} (grupo: ${row.group ?? 'desconhecido'})`);
    lines.push(`  Status: ${STATUS_LABEL[row.status] ?? row.status}`);
    lines.push(`  Escrito atualmente:  [${row.writtenIds.join(', ')}]`);
    lines.push(`  Recompute agora:     [${row.freshIds.join(', ')}]`);
    if (row.removed.length > 0) lines.push(`  Saíram: ${row.removed.join(', ')}`);
    if (row.added.length > 0) lines.push(`  Novos elegíveis: ${row.added.join(', ')}`);
    if (row.rankingPreserved === false) lines.push('  Ordem relativa dos itens em comum MUDOU.');
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Constrói o relatório contra o snapshot mais recente e o write_log atual, e o
 * imprime no formato pedido. Função exportada para permitir teste sem disparar o
 * guard ESM.
 * @param {{ json?: boolean }} [options]
 * @returns {import('../src/report/engine-certification.js').CertificationReport}
 */
export function runCertificationReport({ json = false } = {}) {
  const products = getLatestSnapshotProducts();
  const lastWritten = getLastWrittenValuesForAllProducts();
  const report = buildCertificationReport(products, lastWritten);

  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(toReadableText(report));
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const json = process.argv.slice(2).includes('--json');
  try {
    runCertificationReport({ json });
  } finally {
    const { checkpointAndCloseDb } = await import('../src/db/catalog-store.js');
    checkpointAndCloseDb();
  }
  process.exit(0);
}
