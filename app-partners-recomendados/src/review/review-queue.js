// Camada de domínio pura que decide O QUE entra na fila de revisão humana
// (APRV-01, D-22, D-23). Módulo sem I/O, sem servidor HTTP, sem SQLite —
// importa SOMENTE `recommendForProduct` do motor (nunca reimplementa
// elegibilidade/cascata D-13, mesma disciplina "Don't Hand-Roll" do
// `04-RESEARCH.md`).
//
// `hasChanged` (D-23): compara dois conjuntos de ids IGNORANDO ordem — uma
// reordenação pura do motor (mesmos ids, ordem diferente) nunca é tratada como
// mudança. Comparação sempre por String (tipos mistos number/string não geram
// falso-positivo).
//
// `buildReviewQueue` (D-22): para cada produto do catálogo, calcula o
// "depois" via `recommendForProduct` e compara com o "antes"
// (`baselineMap.get(productId)`). Só produtos com diff real (D-23) entram no
// array retornado — o resto nunca aparece na fila de revisão.

import { recommendForProduct } from '../recommendation/recommendation-engine.js';

/**
 * Compara dois conjuntos de ids ignorando ordem (D-23 — reordenação pura não
 * é mudança). Comparação por String: tipos mistos number/string não geram
 * falso-positivo. `before.size !== after.size` já basta para diferença de
 * tamanho; senão, qualquer id de `before` ausente em `after` já basta.
 * @param {(string|number)[]} beforeIds
 * @param {(string|number)[]} afterIds
 * @returns {boolean}
 */
export function hasChanged(beforeIds, afterIds) {
  const before = new Set((beforeIds || []).map(String));
  const after = new Set((afterIds || []).map(String));

  if (before.size !== after.size) return true;

  for (const id of before) {
    if (!after.has(id)) return true;
  }

  return false;
}

/**
 * Monta a fila de revisão (D-22): para cada produto do `catalogProducts`,
 * calcula o "depois" via `recommendForProduct` e compara com o "antes"
 * (`baselineMap.get(productId)`, mesmo shape de `getBaselineForRun`, Plano
 * 04-01 — `Map<string, string|null>`). Produto sem entrada no `baselineMap`
 * é tratado como `beforeIds: []`. Produto SEM mudança (D-23) não entra no
 * array retornado. Nunca lança para catálogo vazio/undefined ou baselineMap
 * ausente — tratados como vazios.
 * @param {import('../recommendation/recommendation-engine.js').CatalogProductEntry[]} catalogProducts
 * @param {Map<string, string|null>} baselineMap
 * @returns {Array<{ productId: string, name: string|null, beforeIds: string[], afterIds: string[] }>}
 */
export function buildReviewQueue(catalogProducts, baselineMap) {
  const catalog = Array.isArray(catalogProducts) ? catalogProducts : [];
  const baseline = baselineMap instanceof Map ? baselineMap : new Map();

  const queue = [];

  for (const product of catalog) {
    if (!product) continue;

    const productId = String(product.productId);
    const baselineValue = baseline.has(productId) ? baseline.get(productId) : null;
    const beforeIds = baselineValue != null ? [String(baselineValue)] : [];
    const afterIds = recommendForProduct(productId, catalog).map((r) => String(r.productId));

    if (hasChanged(beforeIds, afterIds)) {
      queue.push({
        productId,
        name: product.name ?? null,
        beforeIds,
        afterIds,
      });
    }
  }

  return queue;
}
