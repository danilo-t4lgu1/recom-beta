// Script CLI de rollback em LOTE (WRTE-03, D-65/D-38) — a rede de segurança que
// torna a escrita automática em escala de catálogo (Opção B, D-61) operacionalmente
// aceitável.
//
// Uso: node scripts/rollback-batch.js [--run <id>]
//
// Itera os produtos com escrita real bem-sucedida em `write_log` (opcionalmente
// restrito a um `run_id`) e desfaz cada um chamando `performRollback` de
// `rollback.js` — NUNCA reescreve a lógica de rollback (reuso por-produto, D-38): a
// revalidação ao vivo do valor divergente e a correção CR-01 (guarda `existing == null`)
// vivem inteiramente em `performRollback`. O lote AGREGA o resultado de cada produto
// (`reverted` | `conflict` | `error` | `noop`) e NUNCA aborta no primeiro problema —
// um produto que dá `RollbackConflictError` (edição manual mais recente, D-38) ou
// lança um erro genérico não impede os demais de serem revertidos (T-07-12). Só é
// seguro após a correção CR-01 (Task 1 deste plano).
//
// Disciplina de conexão idêntica a `rollback.js`/`run-daily-job.js`: a função
// exportada `performBatchRollback` NUNCA fecha a conexão nem chama `process.exit` —
// isso vive só no bloco CLI (`checkpointAndCloseDb` + exit code refletindo erros).

import { pathToFileURL } from 'node:url';
import { listWriteLog, checkpointAndCloseDb } from '../src/db/catalog-store.js';
import { performRollback, RollbackConflictError } from './rollback.js';

/**
 * Determina o conjunto de produtos-alvo e executa `performRollback` por produto,
 * agregando resultados sem NUNCA abortar o lote.
 *
 * Alvos: `productId` distintos das linhas de `write_log` com `status === 'success'`
 * (uma escrita real bem-sucedida), preservando a ordem de encontro de `listWriteLog()`
 * (mais recente primeiro). Quando `runId` é informado, restringe aos produtos cuja
 * escrita success pertence àquele run.
 *
 * @param {{ runId?: number|string }} [params]
 * @returns {Promise<{ total: number, reverted: number, conflicts: number,
 *   errors: number, items: Array<{ productId: string,
 *   outcome: 'reverted'|'conflict'|'error'|'noop', message?: string }> }>}
 */
export async function performBatchRollback({ runId } = {}) {
  const runFilter = runId == null ? null : String(runId);

  const targets = [];
  const seen = new Set();
  for (const row of listWriteLog()) {
    if (row.status !== 'success') continue;
    if (runFilter !== null && String(row.runId) !== runFilter) continue;
    const productId = String(row.productId);
    if (seen.has(productId)) continue;
    seen.add(productId);
    targets.push(productId);
  }

  const items = [];
  let reverted = 0;
  let conflicts = 0;
  let errors = 0;

  for (const productId of targets) {
    try {
      const result = await performRollback({ productId });
      if (result && result.noop) {
        items.push({ productId, outcome: 'noop' });
      } else {
        reverted += 1;
        items.push({ productId, outcome: 'reverted' });
      }
    } catch (err) {
      if (err instanceof RollbackConflictError) {
        conflicts += 1;
        items.push({ productId, outcome: 'conflict', message: err.message });
      } else {
        errors += 1;
        items.push({ productId, outcome: 'error', message: err.message });
      }
    }
  }

  return { total: targets.length, reverted, conflicts, errors, items };
}

// Idioma ESM CLI-only (mesma forma de `rollback.js`/`run-daily-job.js`): só executa o
// corpo do CLI quando o módulo roda diretamente — importar este módulo em teste NUNCA
// aciona o lote real. `checkpointAndCloseDb`/`process.exit` vivem SÓ aqui.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const runFlagIndex = process.argv.indexOf('--run');
  const runId = runFlagIndex !== -1 ? process.argv[runFlagIndex + 1] : undefined;

  performBatchRollback({ runId })
    .then((summary) => {
      console.log(
        `Rollback em lote${runId ? ` (run ${runId})` : ''}: ` +
          `${summary.total} alvo(s) — ${summary.reverted} revertido(s), ` +
          `${summary.conflicts} conflito(s), ${summary.errors} erro(s).`
      );
      for (const item of summary.items) {
        const suffix = item.message ? ` — ${item.message}` : '';
        console.log(`  [${item.outcome}] ${item.productId}${suffix}`);
      }
      checkpointAndCloseDb();
      process.exit(summary.errors > 0 ? 1 : 0);
    })
    .catch((err) => {
      console.error(err.message);
      checkpointAndCloseDb();
      process.exit(1);
    });
}
