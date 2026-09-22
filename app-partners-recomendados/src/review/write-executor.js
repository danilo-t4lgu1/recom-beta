// Ponto ÚNICO de entrada para "escrever a recomendação" (APRV-04/SC#4,
// Pitfall 5 do RESEARCH). Dois caminhos distintos: `executeApprovedWrite`
// (manual, guardado pelo gate APRV-03) e `executeScheduledWrite` (automático
// do job diário, D-61 — SEM gate prévio, com Defesa 2 referencial D-67). Ambos
// compartilham a mecânica de escrita (`writeRecommendationMetafield`) com
// `triggered_by` parametrizado; o caminho scheduled NUNCA fabrica uma decisão
// `approved` (Anti-Pattern do protótipo `_batch-write.js`).
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
 *
 * O caminho manual NUNCA rastreia `matchReason` retroativamente — sempre grava
 * `provenLookIds: []` (decisão de negócio: ids aprovados manualmente vêm de
 * uma decisão humana armazenada, sem nenhum conceito de matchReason associado).
 * @param {{ productId: string, decision: object|null, dryRun?: boolean, runId?: number|null }} params
 * @returns {Promise<{ productId: string, approvedIds: string[], dryRun: boolean, written: boolean, reason?: string }>}
 */
export async function executeApprovedWrite({ productId, decision, dryRun, runId }) {
  const approvedIds = assertApproved(productId, decision);

  if (dryRun) {
    return { productId, approvedIds, dryRun: true, written: false, reason: 'dry run' };
  }

  await writeRecommendationMetafield({
    productId,
    approvedIds,
    provenLookIds: [],
    triggeredBy: 'manual',
    runId,
  });

  return { productId, approvedIds, dryRun: false, written: true };
}

/**
 * Normalização de cor: mesma convenção do motor (`normalizeMatchValue` em
 * `recommendation-engine.js`) — trim + minúsculas para strings, valor inalterado
 * caso contrário. Reimplementada localmente (função não exportada pelo motor)
 * para manter este módulo sem dependência do grafo de recomendação.
 * @param {*} value
 * @returns {*}
 */
function normalizeColor(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

/**
 * Defesa 2 referencial (D-67): reconfere cada id recomendado contra o snapshot
 * atual (`snapshotById`, `Map<string, CatalogProductEntry>` do run vigente),
 * mantendo apenas os ids cujo candidato: existe no snapshot, está visível
 * (`published !== false` — `null`/`undefined` pré-migração NÃO conta como oculto,
 * D-58/A6), tem grade de estoque disponível (`hasAvailableGrade`) e cuja cor
 * normalizada bate com a cor normalizada da fonte. Função pura, sem I/O, nunca
 * lança para entradas ausentes. Preserva a ordem dos ids de entrada.
 *
 * Exceção à exigência de cor (achado 2026-09-17): um candidato listado em
 * `sourceEntry.provenLookPartnerIds` (par de "Look Automático" comprovado por
 * co-compra real, ver `recommendation-engine.js`/`buildProvenLookPool`) nunca
 * é descartado por cor diferente — o motor já decidiu deliberadamente que essa
 * exigência não se aplica a esse caso (é sinal de compra real, não inferência
 * por atributo), e sem esta exceção a Defesa 2 apagava silenciosamente todo
 * par de peso 0 antes de chegar à loja, mesmo com estoque/visibilidade OK.
 * Estoque e visibilidade continuam obrigatórios mesmo para esses ids.
 * @param {{ colorValue: string|null, provenLookPartnerIds?: Array<{productId: string, count: number}> }} sourceEntry - CatalogProductEntry da fonte
 * @param {string[]} recommendedIds - ids candidatos calculados pelo motor
 * @param {Map<string, { published?: boolean|null, hasAvailableGrade?: boolean, colorValue?: string|null }>} snapshotById
 * @returns {string[]} subconjunto referencialmente válido dos `recommendedIds`
 */
export function filterReferentiallyValid(sourceEntry, recommendedIds, snapshotById) {
  const sourceColor = normalizeColor(sourceEntry ? sourceEntry.colorValue : null);
  const provenLookIds = new Set(
    (sourceEntry && Array.isArray(sourceEntry.provenLookPartnerIds)
      ? sourceEntry.provenLookPartnerIds
      : []
    ).map((p) => String(p.productId))
  );

  return recommendedIds.filter((id) => {
    const candidate = snapshotById.get(String(id));
    if (!candidate) return false; // não existe no snapshot atual
    if (candidate.published === false) return false; // oculto (D-58/D-67)
    if (!candidate.hasAvailableGrade) return false; // sem estoque
    if (provenLookIds.has(String(id))) return true; // Look comprovado: cor não se aplica
    return normalizeColor(candidate.colorValue) === sourceColor; // mesma cor
  });
}

/**
 * Caminho de escrita AUTOMÁTICO do job diário (D-61) — grava a recomendação SEM
 * passar pelo gate de aprovação prévia (`assertApproved` NÃO é chamado; o portão
 * do APRV-03 foi aposentado para o modo automático). NUNCA constrói um objeto de
 * decisão `{ status: 'approved' }` (Anti-Pattern do protótipo `_batch-write.js`):
 * o caminho `scheduled` é distinto e grava `triggered_by: 'scheduled'` no
 * `write_log`.
 *
 * Antes de qualquer escrita aplica a Defesa 2 (`filterReferentiallyValid`,
 * D-67) contra o snapshot atual; se HAVIA candidatos e TODOS foram
 * descartados, retorna uma lacuna de cobertura (`written: false`,
 * `reason: 'coverage-gap'`) sem gravar lixo. Diferente de `recommendedIds`
 * JÁ vir vazio do motor (fonte sem estoque/despublicada, ou zero candidatos
 * elegíveis) — esse é o resultado FINAL, não uma lacuna, e precisa ser
 * gravado pra limpar um metafield antigo (bug corrigido 2026-09-22: antes,
 * `approvedIds.length === 0` virava coverage-gap nos dois casos, então um
 * produto que devesse ficar sem vitrine NUNCA tinha seu metafield antigo
 * sobrescrito — a vitrine obsoleta ficava visível indefinidamente; achado ao
 * vivo quando Camisa Dália/Blusa Nathaly continuaram mostrando dado de antes
 * da correção do motor mesmo depois de duas execuções reais). `dryRun:true`
 * retorna cedo com ZERO I/O (base do kill switch D-62, mesmo padrão de
 * `executeApprovedWrite`).
 *
 * `provenLookIds` é a lista CANDIDATA de "Sugestão de Look Automática"
 * (`matchReason: 'proven_look'`) calculada pelo chamador (`run-daily-job.js`),
 * ainda não filtrada pela Defesa 2. O valor efetivamente persistido é sempre a
 * interseção entre esse candidato e `approvedIds` (pós-Defesa-2) — um id de
 * Look comprovado nunca é gravado se já foi descartado por falta de
 * estoque/visibilidade/inexistência no snapshot atual.
 * @param {{ productId: string, recommendedIds: string[], provenLookIds?: string[], dryRun?: boolean, runId?: number|null, sourceEntry: object, snapshotById: Map<string, object> }} params
 * @returns {Promise<{ productId: string, approvedIds: string[], dryRun?: boolean, written: boolean, reason?: string }>}
 */
export async function executeScheduledWrite({
  productId,
  recommendedIds,
  provenLookIds = [],
  dryRun,
  runId,
  sourceEntry,
  snapshotById,
}) {
  // Defesa 2 (D-67): descarta ids inválidos ANTES de qualquer escrita.
  const hadCandidates = Array.isArray(recommendedIds) && recommendedIds.length > 0;
  const approvedIds = filterReferentiallyValid(sourceEntry, recommendedIds, snapshotById);

  // Lacuna de cobertura de verdade: HAVIA candidatos e a Defesa 2 descartou
  // todos (referência inválida/oculta/sem estoque/cor diferente) — dado
  // suspeito, nunca grava. Um conjunto JÁ vazio na entrada não passa por
  // aqui (bug corrigido 2026-09-22, ver docstring acima) — segue para
  // gravar de verdade, inclusive limpando um metafield antigo.
  if (hadCandidates && approvedIds.length === 0) {
    return { productId, approvedIds: [], written: false, reason: 'coverage-gap' };
  }

  if (dryRun) {
    return { productId, approvedIds, dryRun: true, written: false, reason: 'dry run' };
  }

  // Interseção com approvedIds pós-Defesa-2: um id de Look nunca é persistido
  // se a própria Defesa 2 já o descartou (T-08-01-02).
  const approvedIdSet = new Set(approvedIds.map((id) => String(id)));
  const writtenProvenLookIds = (Array.isArray(provenLookIds) ? provenLookIds : [])
    .map((id) => String(id))
    .filter((id) => approvedIdSet.has(id));

  await writeRecommendationMetafield({
    productId,
    approvedIds,
    provenLookIds: writtenProvenLookIds,
    triggeredBy: 'scheduled',
    runId,
  });

  return { productId, approvedIds, dryRun: false, written: true };
}

/**
 * Mecânica de escrita compartilhada pelos caminhos manual e scheduled: lê o
 * Metafield existente ao vivo via `findMetafield` (D-43/Pitfall 1 — nunca assume
 * upsert), grava via `updateMetafield` (se já existe) ou `createMetafield` (se
 * não), registra exatamente uma linha em `write_log` (sucesso ou falha, WRTE-04)
 * e, em caso de falha, dispara `notifyWriteFailure` sem mascarar o erro original
 * (Pitfall 5/WRTE-05). `triggeredBy` é parametrizado ('manual' | 'scheduled') e
 * fluído para o `write_log` e para a notificação de falha — este helper NUNCA
 * decide sozinho o gatilho.
 *
 * O valor persistido no Metafield é um OBJETO `{ ids, provenLookIds }` (não mais
 * um array JSON puro): `ids` é sempre `approvedIds` (mesmo conteúdo/ordem de
 * sempre); `provenLookIds` marca quais desses ids (se algum) são "Sugestão de
 * Look Automática" (`matchReason: 'proven_look'`) — sempre `[]` no caminho
 * manual, e no caminho scheduled já vem pré-interseccionado com `approvedIds`
 * pelo chamador (`executeScheduledWrite`).
 * @param {{ productId: string, approvedIds: string[], provenLookIds?: string[], triggeredBy: 'manual'|'scheduled', runId?: number|null }} params
 * @returns {Promise<void>}
 */
async function writeRecommendationMetafield({
  productId,
  approvedIds,
  provenLookIds = [],
  triggeredBy,
  runId,
}) {
  const newValue = JSON.stringify({ ids: approvedIds, provenLookIds });

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
      triggeredBy,
      status: 'success',
      errorMessage: null,
      writtenAt: new Date().toISOString(),
    });
  } catch (err) {
    insertWriteLog({
      productId,
      runId,
      metafieldId: null,
      previousValue: null,
      writtenValue: newValue,
      triggeredBy,
      status: 'failed',
      errorMessage: err.message,
      writtenAt: new Date().toISOString(),
    });

    // Segunda linha de defesa (Pitfall 5): `notifyWriteFailure` já nunca lança
    // por construção (Plano 05-01), mas este call site nunca deve depender só
    // disso — o `.catch(() => {})` garante que uma falha inesperada no
    // próprio webhook jamais substitua o erro original relançado abaixo.
    await notifyWriteFailure({ productId, error: err, triggeredBy }).catch(() => {});

    throw err;
  }
}
