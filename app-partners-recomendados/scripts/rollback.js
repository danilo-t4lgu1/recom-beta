// Script CLI manual de rollback de uma escrita real (WRTE-03, D-37).
//
// Uso: node scripts/rollback.js <productId>
//
// Desfaz a última escrita real bem-sucedida (write_log.status = 'success') feita
// para um produto — mas SOMENTE quando o valor atual do Metafield na loja (lido AO
// VIVO via findMetafield, nunca a partir do snapshot local sozinho) bate exatamente
// com o valor que aquela escrita gravou (D-38). Uma divergência (ex: edição manual
// no admin depois da escrita, ou outra execução escrevendo por cima) aborta o
// rollback com `RollbackConflictError` em vez de sobrescrever silenciosamente uma
// mudança mais recente — nenhum `updateMetafield`/`deleteMetafield` é chamado nesse
// caso. Toda restauração bem-sucedida insere uma linha NOVA em `write_log` com
// `triggeredBy: 'rollback'` (D-44, append-only — nunca sobrescreve a linha
// original), mantendo o rollback visível na tela de auditoria do Plano 05-05.
//
// Nenhuma rota HTTP nova é criada para isso — acionamento exclusivo via CLI (D-37).

import { pathToFileURL } from 'node:url';
import { getLastSuccessfulWriteLog, insertWriteLog } from '../src/db/catalog-store.js';
import {
  findMetafield,
  updateMetafield,
  deleteMetafield,
  createMetafield,
} from '../src/nuvemshop-client/client.js';

/**
 * Erro tipado lançado quando o valor atual do Metafield (lido ao vivo) diverge do
 * valor que a última escrita real registrou como gravado — distingue "divergência
 * detectada, rollback abortado por segurança" (D-38) de erros genéricos. Mesma forma
 * de `ApprovalRequiredError` (`src/review/approval-gate.js`).
 */
export class RollbackConflictError extends Error {
  constructor(productId, expected, actual) {
    super(
      `Produto ${productId}: valor atual ("${actual}") diverge do esperado ("${expected}") — rollback abortado.`
    );
    this.name = 'RollbackConflictError';
    this.productId = productId;
  }
}

/**
 * Restaura o Metafield de um produto para o `previousValue` capturado pela última
 * escrita real bem-sucedida — SOMENTE se o valor atual (lido ao vivo) bater
 * exatamente com o `writtenValue` daquela escrita (D-38, comparação estrita ANTES de
 * qualquer efeito). Quando `previousValue` é `null` (o Metafield não existia antes da
 * escrita original), usa `deleteMetafield` em vez de `updateMetafield` com valor
 * vazio. Se o Metafield não existir mais na loja (`findMetafield` → null, ex.: um
 * rollback anterior já o deletou), NÃO dereferencia `existing.id` (CR-01, D-65):
 * recria via `createMetafield` quando há valor a restaurar, ou registra um no-op
 * quando não há. Toda restauração bem-sucedida insere uma linha NOVA em `write_log`
 * com `triggeredBy: 'rollback'` (D-44).
 * @param {{ productId: string }} params
 * @returns {Promise<object>} resultado de `updateMetafield`/`deleteMetafield`/`createMetafield` ou `{ noop: true }`
 * @throws {Error} se não houver nenhuma escrita real registrada para o produto
 * @throws {RollbackConflictError} se o valor atual divergir do esperado
 */
export async function performRollback({ productId }) {
  const lastWrite = getLastSuccessfulWriteLog({ productId });
  if (!lastWrite) {
    throw new Error(`Nenhuma escrita real registrada para o produto ${productId}.`);
  }

  const existing = await findMetafield({ ownerId: productId });
  const currentValue = existing ? existing.value : null;

  if (currentValue !== lastWrite.writtenValue) {
    throw new RollbackConflictError(productId, lastWrite.writtenValue, currentValue);
  }

  const restoredValue = lastWrite.previousValue;

  // CR-01 (D-65): o Metafield pode não existir mais na loja — um rollback anterior
  // já o deletou. Antes desta guarda, `existing.id` era dereferenciado cru em
  // update/deleteMetafield, lançando TypeError num 2º rollback consecutivo. Agora:
  //  - existing == null && restoredValue == null → no-op (nada a restaurar, já ausente);
  //  - existing == null && restoredValue != null → RECRIA via createMetafield
  //    (createMetafield, não updateMetafield, que exigiria um id inexistente);
  //  - existing != null → caminho original (delete se nada a restaurar, senão update).
  let result;
  if (existing == null) {
    result =
      restoredValue == null
        ? { noop: true }
        : await createMetafield({ ownerId: productId, value: restoredValue });
  } else if (restoredValue == null) {
    result = await deleteMetafield({ id: existing.id });
  } else {
    result = await updateMetafield({ id: existing.id, value: restoredValue });
  }

  insertWriteLog({
    productId,
    runId: lastWrite.runId,
    // Nunca dereferencia `existing.id` cru: usa o id do Metafield recriado quando
    // aplicável, ou null no caso no-op (CR-01).
    metafieldId: existing ? existing.id : (result && result.id) || null,
    previousValue: currentValue,
    writtenValue: restoredValue,
    triggeredBy: 'rollback',
    status: 'success',
    errorMessage: null,
    writtenAt: new Date().toISOString(),
  });

  return result;
}

// Idioma ESM padrão (mesma forma de `src/review-server.js`): só executa o corpo do
// CLI quando o módulo é executado diretamente (`node scripts/rollback.js`) — importar
// este módulo em teste NUNCA aciona o rollback real.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const productId = process.argv[2];
  if (!productId) {
    console.error('Uso: node scripts/rollback.js <productId>');
    process.exit(1);
  } else {
    performRollback({ productId })
      .then(() => console.log(`Rollback concluído para o produto ${productId}.`))
      .catch((err) => {
        console.error(err.message);
        process.exit(1);
      });
  }
}
