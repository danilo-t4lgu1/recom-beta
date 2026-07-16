// Ponto ÚNICO de entrada para "escrever a recomendação aprovada" (APRV-04/
// SC#4, Pitfall 5 do RESEARCH).
//
// Fase 5: o stub de fases anteriores foi substituído por uma escrita real.
// `assertApproved` continua sendo a PRIMEIRA operação do corpo — o gate nunca
// é reaberto ou contornável (D-25/APRV-03). `dryRun:true` é o ÚNICO ramo com
// ZERO chamadas de rede/DB (nenhuma das funções de `client.js`/
// `catalog-store.js`/`notify-failure.js` é invocada nesse ramo). `dryRun`
// ausente (`undefined`) é tratado como falsy pela checagem `if (dryRun)` — cai
// no ramo REAL (mudança de comportamento deliberada vs. fases anteriores,
// quando ambos os ramos resolviam para o mesmo stub). `dryRun` continua
// SEMPRE sendo um parâmetro explícito, nunca lido de `process.env` dentro
// deste módulo — isso é responsabilidade da camada HTTP (`review-server.js`).

import { assertApproved } from './approval-gate.js';
import { findMetafield, updateMetafield, createMetafield } from '../nuvemshop-client/client.js';
import { insertWriteLog } from '../db/catalog-store.js';
import { notifyWriteFailure } from './notify-failure.js';

/**
 * `assertApproved` é chamado como a PRIMEIRA operação do corpo, antes de
 * qualquer outro efeito — o gate nunca pode ser contornado passando direto
 * para a lógica de escrita (APRV-03/SC#3). Propaga `ApprovalRequiredError`
 * se `decision` não é `'approved'`.
 *
 * `dryRun:true` retorna cedo com ZERO I/O (nenhuma chamada de rede/DB).
 * `dryRun:false` (ou ausente) executa a escrita REAL: lê o Metafield existente
 * ao vivo via `findMetafield` (D-43/Pitfall 1 — nunca assume upsert por POST
 * repetido), grava via `updateMetafield` (se já existir) ou `createMetafield`
 * (se não existir), registra exatamente uma linha em `write_log` (sucesso ou
 * falha, WRTE-04) e, em caso de falha, dispara `notifyWriteFailure` sem nunca
 * mascarar o erro original propagado ao chamador (Pitfall 5/WRTE-05).
 * @param {{ productId: string, decision: object|null, dryRun?: boolean, runId?: number|null }} params
 * @returns {Promise<{ productId: string, approvedIds: string[], dryRun: boolean, written: boolean, reason?: string }>}
 */
export async function executeApprovedWrite({ productId, decision, dryRun, runId }) {
  const approvedIds = assertApproved(productId, decision);

  if (dryRun) {
    return { productId, approvedIds, dryRun: true, written: false, reason: 'dry run' };
  }

  const newValue = JSON.stringify(approvedIds);

  try {
    const existing = await findMetafield({ ownerId: productId });
    const previousValue = existing ? existing.value : null;

    const result = existing
      ? await updateMetafield({ id: existing.id, value: newValue })
      : await createMetafield({ ownerId: productId, value: newValue });

    insertWriteLog({
      productId,
      runId,
      metafieldId: result.id,
      previousValue,
      writtenValue: newValue,
      triggeredBy: 'manual',
      status: 'success',
      errorMessage: null,
      writtenAt: new Date().toISOString(),
    });

    return { productId, approvedIds, dryRun: false, written: true };
  } catch (err) {
    insertWriteLog({
      productId,
      runId,
      metafieldId: null,
      previousValue: null,
      writtenValue: newValue,
      triggeredBy: 'manual',
      status: 'failed',
      errorMessage: err.message,
      writtenAt: new Date().toISOString(),
    });

    // Segunda linha de defesa (Pitfall 5): `notifyWriteFailure` já nunca lança
    // por construção (Plano 05-01), mas este call site nunca deve depender só
    // disso — o `.catch(() => {})` garante que uma falha inesperada no
    // próprio webhook jamais substitua o erro original relançado abaixo.
    await notifyWriteFailure({ productId, error: err, triggeredBy: 'manual' }).catch(() => {});

    throw err;
  }
}
