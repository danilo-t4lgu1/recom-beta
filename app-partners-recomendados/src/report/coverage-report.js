// Relatório de cobertura DIAGNÓSTICO (D-59/D-60/D-57) — módulo de domínio PURO.
//
// Prova, sobre o catálogo inteiro, quantos produtos-fonte COM ESTOQUE de fato
// recebem recomendação e, para os que ficam ZERADOS, o MOTIVO item a item; mais
// um caminho de REPROCESSO que sinaliza fontes sem tecido canônico para o usuário
// taguear e rerodar (fecha a lacuna que reduz a cobertura de 1º peso, D-60).
//
// Read-only e determinístico: recebe o snapshot já materializado (shape
// `CatalogProductEntry` de `getLatestSnapshotProducts`) e chama o motor via
// `recommendForProduct`. Mesma disciplina de `diff.js`/`review-queue.js`: o único
// import de projeto é o motor; nenhum I/O próprio (o CLI faz a leitura do banco).
// Nunca escreve na loja nem no banco — é diagnóstico (T-07-18/T-07-19).
//
// Definição de COBERTO (D-59): uma fonte com estoque é coberta se
// `recommendForProduct(id, catalog).length > 0` (1º OU 2º peso — sem meta % fixa;
// `headlineCoveragePct` é só acompanhamento). O motivo das zeradas segue a
// precedência oculta > sem cor > sem par mesma-cor-em-estoque no grupo elegível
// (D-60/D-57) — a mesma ordem com que o motor barra a fonte em `recommendForProduct`
// (published === false primeiro, colorValue == null depois, senão o piso E+C do
// grupo não encontrou par).

import { recommendForProduct } from '../recommendation/recommendation-engine.js';

/** Motivo de zerada por fonte oculta (D-58/D-60): `published === false`. */
export const REASON_HIDDEN = 'oculta';

/** Motivo de zerada por fonte sem cor (D-60): `colorValue == null`. */
export const REASON_NO_COLOR = 'sem cor';

/**
 * Motivo de zerada padrão (D-57/D-60): a fonte tem estoque e cor, mas nenhum par
 * mesma-cor-com-estoque no grupo elegível — a consequência aceita de manter a cor
 * sempre obrigatória e Look Inteiro auto-contido.
 */
export const REASON_NO_PAIR = 'sem par mesma-cor-em-estoque no grupo elegível';

/** Rótulo do reprocesso (D-60): fonte sem tecido canônico para taguear e rerodar. */
export const REPROCESS_LABEL = 'sem tecido canônico — taguear e rerodar';

/**
 * Determina o MOTIVO de uma fonte ZERADA com a precedência de D-60/D-57, espelhando
 * a ordem das guardas fail-closed de `recommendForProduct` (D-58): oculta primeiro
 * (`published === false`, estritamente `=== false` — `null`/`undefined` pré-migração
 * nunca conta), depois sem cor (`colorValue == null`), senão o piso E+C do grupo
 * não achou par mesma-cor-em-estoque (inclui grupo nulo/desconhecido, que o motor
 * também fecha).
 * @param {import('../recommendation/recommendation-engine.js').CatalogProductEntry} source
 * @returns {string}
 */
function zeroedReason(source) {
  if (source.published === false) return REASON_HIDDEN;
  if (source.colorValue == null) return REASON_NO_COLOR;
  return REASON_NO_PAIR;
}

/**
 * @typedef {object} GroupCoverage
 * @property {number} totalSourcesInStock
 * @property {number} covered
 * @property {number} zeroed
 */

/**
 * @typedef {object} CoverageReport
 * @property {number} totalSourcesInStock - fontes com `hasAvailableGrade` verdadeiro
 * @property {number} covered - fontes com >=1 recomendação (1º ou 2º peso, D-59)
 * @property {Array<{ productId: string, reason: string, group: string|null }>} zeroed
 * @property {string[]} reprocess - productIds de fontes com estoque sem tecido canônico (D-60)
 * @property {Record<string, GroupCoverage>} byGroup - agregados por grupo canônico
 * @property {number} headlineCoveragePct - covered/total*100 arredondado (informativo, D-59)
 */

/**
 * Constrói o relatório de cobertura sobre o catálogo inteiro (D-59/D-60). PURO:
 * não muta a entrada, sem relógio/aleatoriedade/rede/I/O. Itera as fontes COM
 * ESTOQUE (`hasAvailableGrade` verdadeiro) — as demais são invisíveis ao relatório,
 * mesma seleção do protótipo `_scope.js`. Para cada fonte com estoque chama
 * `recommendForProduct(productId, catalogProducts)`: length > 0 => coberta;
 * caso contrário => zerada com motivo (`zeroedReason`). Coleta em paralelo o
 * caminho de reprocesso (fonte com estoque e `fabricTagCanonical == null`) e os
 * agregados por grupo. `headlineCoveragePct` é acompanhamento (D-59), 0 quando não
 * há fontes com estoque (nunca divide por zero).
 * @param {import('../recommendation/recommendation-engine.js').CatalogProductEntry[]} catalogProducts
 * @returns {CoverageReport}
 */
export function buildCoverageReport(catalogProducts) {
  const catalog = Array.isArray(catalogProducts) ? catalogProducts : [];

  let totalSourcesInStock = 0;
  let covered = 0;
  const zeroed = [];
  const reprocess = [];
  const byGroup = {};

  for (const source of catalog) {
    if (!source || !source.hasAvailableGrade) continue;

    totalSourcesInStock += 1;
    const productId = String(source.productId);
    const group = source.productGroupCanonical ?? null;
    const groupKey = group == null ? 'null' : group;

    if (!byGroup[groupKey]) {
      byGroup[groupKey] = { totalSourcesInStock: 0, covered: 0, zeroed: 0 };
    }
    byGroup[groupKey].totalSourcesInStock += 1;

    // Reprocesso (D-60): sinaliza para taguear tecido e rerodar — independente de
    // a fonte estar coberta por 2º peso (o objetivo é subir cobertura de 1º peso).
    if (source.fabricTagCanonical == null) {
      reprocess.push(productId);
    }

    const recommendationCount = recommendForProduct(productId, catalog).length;
    if (recommendationCount > 0) {
      covered += 1;
      byGroup[groupKey].covered += 1;
    } else {
      zeroed.push({ productId, reason: zeroedReason(source), group });
      byGroup[groupKey].zeroed += 1;
    }
  }

  const headlineCoveragePct =
    totalSourcesInStock === 0 ? 0 : Math.round((covered / totalSourcesInStock) * 100);

  return {
    totalSourcesInStock,
    covered,
    zeroed,
    reprocess,
    byGroup,
    headlineCoveragePct,
  };
}
