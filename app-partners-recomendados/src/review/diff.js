// Camada de domínio pura que responde "o que exatamente mudou neste produto,
// e o que acontece se eu remover um item?" (APRV-01, D-19, D-20, D-21).
// Módulo sem I/O, sem servidor HTTP, sem SQLite — importa SOMENTE
// `recommendForProduct` do motor.
//
// Pitfall 1 do `04-RESEARCH.md` (verificado por leitura direta de
// `recommendation-engine.js`): `composeGroupQuota` tem a cota 4+4
// (`GROUP_QUOTA_PER_SIDE`) FIXA independente do `maxRecommendations`/`cap`
// recebido — chamar o motor com um `maxRecommendations` maior NUNCA revela um
// "9º candidato" para produtos de Partes de Cima/Baixo. Por isso
// `recomputeAfterRemoval` (D-20) funciona filtrando o CATÁLOGO de entrada
// (removendo os ids removidos do array `catalogProducts` antes de chamar
// `recommendForProduct` de novo) — nunca tentando "pedir mais" do motor. Esta
// é a única abordagem que funciona corretamente para os 3 grupos de produto
// (Look Inteiro, Partes de Cima, Partes de Baixo) sem tocar
// `recommendation-engine.js` nem duplicar `composeGroupQuota`/
// `buildSortedPool`/cascata D-13.

import { recommendForProduct } from '../recommendation/recommendation-engine.js';

// Backfill via recomputação com catálogo filtrado (D-20, Pattern 1 do
// RESEARCH, verbatim) — nunca duplica os internos do motor (cascata D-13 e a
// composição de cota do grupo cruzado), só filtra o array de entrada.
/**
 * Filtra `removedIds` do CATÁLOGO de entrada e chama `recommendForProduct`
 * de novo — reproduz fielmente "rodar a seleção sem esses candidatos" para
 * os 3 grupos de produto (Look Inteiro, Partes de Cima, Partes de Baixo),
 * sem reimplementar nenhum interno do motor. Um id de `removedIds` que não
 * corresponde a nenhum produto do catálogo é ignorado silenciosamente pelo
 * filtro — nunca pode inserir um candidato (T-04-04).
 * @param {string} productId
 * @param {import('../recommendation/recommendation-engine.js').CatalogProductEntry[]} catalogProducts
 * @param {(string|number)[]} removedIds
 * @returns {import('../recommendation/recommendation-engine.js').Recommendation[]}
 */
export function recomputeAfterRemoval(productId, catalogProducts, removedIds) {
  const removed = new Set((removedIds || []).map(String));
  const filteredCatalog = (catalogProducts || []).filter(
    (p) => p && !removed.has(String(p.productId))
  );
  return recommendForProduct(productId, filteredCatalog);
}

/**
 * Diff completo antes/depois de um produto (D-19/D-21). `engineComputedIds`
 * é a saída do motor ANTES de qualquer remoção (auditoria/debug — sempre
 * calculado, mesmo quando `removedIds` está vazio). `afterIds` é o conjunto
 * final CURADO (pós-remoção+backfill), o que se aprova. `items` traz cada id
 * envolvido com um status explícito: `added` (novo no cálculo curado, não
 * estava em `beforeIds`), `removed` (estava em `beforeIds`, ausente do
 * cálculo curado) ou `kept` (presente em ambos).
 *
 * Nota de design (D-19/Pitfall 2 do RESEARCH): este é o motivo pelo qual a
 * Fase 4 nunca precisa "validar que o conjunto aprovado é subconjunto do
 * calculado" — `afterIds` SEMPRE vem de `recommendForProduct`/
 * `recomputeAfterRemoval`, nunca de um valor aceito diretamente de um
 * chamador externo; `removedIds` só pode ENCOLHER o pool (ids que não
 * existem no resultado atual são ignorados silenciosamente pelo filtro,
 * nunca adicionam nada).
 * @param {string} productId
 * @param {import('../recommendation/recommendation-engine.js').CatalogProductEntry[]} catalogProducts
 * @param {(string|number)[]} beforeIds
 * @param {{ removedIds?: (string|number)[] }} [options]
 * @returns {{
 *   productId: string,
 *   beforeIds: string[],
 *   afterIds: string[],
 *   engineComputedIds: string[],
 *   items: Array<{ productId: string, status: 'added'|'removed'|'kept', recommendation: import('../recommendation/recommendation-engine.js').Recommendation|null }>
 * }}
 */
export function computeDiff(productId, catalogProducts, beforeIds, { removedIds = [] } = {}) {
  const engineAfter = recommendForProduct(productId, catalogProducts);
  const curatedAfter =
    removedIds && removedIds.length > 0
      ? recomputeAfterRemoval(productId, catalogProducts, removedIds)
      : engineAfter;

  const normalizedBeforeIds = (beforeIds || []).map(String);
  const beforeSet = new Set(normalizedBeforeIds);
  const afterSet = new Set(curatedAfter.map((r) => String(r.productId)));

  const removedItems = normalizedBeforeIds
    .filter((id) => !afterSet.has(id))
    .map((id) => ({ productId: id, status: 'removed', recommendation: null }));

  const afterItems = curatedAfter.map((r) => {
    const id = String(r.productId);
    return { productId: id, status: beforeSet.has(id) ? 'kept' : 'added', recommendation: r };
  });

  return {
    productId: String(productId),
    beforeIds: normalizedBeforeIds,
    afterIds: curatedAfter.map((r) => String(r.productId)),
    engineComputedIds: engineAfter.map((r) => String(r.productId)),
    items: [...removedItems, ...afterItems],
  };
}
