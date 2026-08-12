// Relatório de CERTIFICAÇÃO do motor (read-only, diagnóstico) — módulo de domínio
// PURO, mesma família de coverage-report.js (D-59/D-60).
//
// Responde três perguntas concretas sobre o motor em produção, comparando o que foi
// REALMENTE ESCRITO na loja (getLastWrittenValuesForAllProducts — última linha
// status='success' por produto em write_log) contra o que o motor RECOMPUTARIA agora
// dado o snapshot de catálogo mais recente (recommendForProduct):
//
//   1. Leitura/atualização de estoque: uma fonte cujo produto recomendado saiu de
//      estoque desaparece do recompute fresco (`removed`) — se isso nunca acontece
//      quando deveria, o estoque não está sendo lido/refletido.
//   2. Ranking respeitado: para os ids em comum entre o que foi escrito e o recompute
//      fresco, a ORDEM relativa se mantém (`rankingPreserved`) — o motor ordena por
//      peso (1º > 2º) e depois pela cascata de desempate (D-13/D-55/D-56/D-57).
//   3. Backfill após remoção por elegibilidade (stockout/etc.): quando um id escrito
//      não sobrevive no recompute fresco, uma NOVA sugestão elegível deveria ocupar a
//      vaga (`added.length >= removed.length` -> renovação correta); se não houver
//      substituto (`added.length < removed.length`), é um caso a investigar
//      (`STATUS_SEM_BACKFILL`).
//
// Read-only e determinístico: recebe o snapshot já materializado (mesmo shape
// `CatalogProductEntry` de getLatestSnapshotProducts) e o mapa de última escrita bem-
// sucedida por produto (getLastWrittenValuesForAllProducts). Nunca escreve na loja
// nem no banco.

import { recommendForProduct } from '../recommendation/recommendation-engine.js';

/** Escrito == recompute fresco, mesmo conjunto e mesma ordem. */
export const STATUS_OK = 'ok_identico';

/** Itens removidos (estoque/elegibilidade) e substituídos por novo(s) elegível(is). */
export const STATUS_RENOVACAO = 'drift_renovacao_ok';

/** Itens removidos SEM substituto — vaga ficou menor, precisa de investigação. */
export const STATUS_SEM_BACKFILL = 'drift_sem_backfill';

/** Produto com escrita em write_log que não aparece mais no snapshot atual (despublicado/removido do catálogo). */
export const STATUS_NAO_ENCONTRADO = 'produto_nao_encontrado_no_snapshot';

/**
 * @typedef {object} CertificationRow
 * @property {string} productId
 * @property {string|null} group
 * @property {boolean|null} hasStock
 * @property {string[]} writtenIds - último conjunto gravado com sucesso (write_log)
 * @property {string[]} freshIds - recompute AGORA contra o snapshot mais recente
 * @property {string[]} removed - estava escrito, não sobrevive no recompute fresco
 * @property {string[]} added - não estava escrito, aparece no recompute fresco
 * @property {boolean|null} rankingPreserved - ordem relativa dos ids em comum é igual
 * @property {string} status
 */

/**
 * @typedef {object} CertificationReport
 * @property {{totalProdutosComEscrita: number, identico: number, renovacaoOk: number, semBackfill: number, rankingQuebrado: number, naoEncontrado: number}} summary
 * @property {CertificationRow[]} rows
 */

function idsOf(recommendations) {
  return recommendations.map((r) => String(r.productId));
}

/**
 * Constrói o relatório de certificação comparando write_log (última escrita bem-
 * sucedida por produto) contra um recompute fresco do motor sobre o snapshot atual.
 * PURO: não muta as entradas, sem relógio/aleatoriedade/rede/I/O.
 * @param {import('../recommendation/recommendation-engine.js').CatalogProductEntry[]} catalogProducts
 * @param {Map<string, string[]>} lastWrittenByProduct
 * @returns {CertificationReport}
 */
export function buildCertificationReport(catalogProducts, lastWrittenByProduct) {
  const catalog = Array.isArray(catalogProducts) ? catalogProducts : [];
  const writtenMap = lastWrittenByProduct instanceof Map ? lastWrittenByProduct : new Map();
  const catalogById = new Map(catalog.map((p) => [String(p.productId), p]));

  const rows = [];

  for (const [rawProductId, rawWrittenIds] of writtenMap.entries()) {
    const productId = String(rawProductId);
    const writtenIds = Array.isArray(rawWrittenIds) ? rawWrittenIds.map(String) : [];
    const source = catalogById.get(productId);

    if (!source) {
      rows.push({
        productId,
        group: null,
        hasStock: null,
        writtenIds,
        freshIds: [],
        removed: [...writtenIds],
        added: [],
        rankingPreserved: null,
        status: STATUS_NAO_ENCONTRADO,
      });
      continue;
    }

    const freshIds = idsOf(recommendForProduct(productId, catalog));
    const writtenSet = new Set(writtenIds);
    const freshSet = new Set(freshIds);
    const removed = writtenIds.filter((id) => !freshSet.has(id));
    const added = freshIds.filter((id) => !writtenSet.has(id));

    const commonWritten = writtenIds.filter((id) => freshSet.has(id));
    const commonFresh = freshIds.filter((id) => writtenSet.has(id));
    const rankingPreserved = commonWritten.join('|') === commonFresh.join('|');

    let status;
    if (removed.length === 0 && added.length === 0) {
      status = STATUS_OK;
    } else if (removed.length > 0 && added.length < removed.length) {
      status = STATUS_SEM_BACKFILL;
    } else {
      status = STATUS_RENOVACAO;
    }

    rows.push({ productId, group: source.productGroupCanonical ?? null, hasStock: source.hasAvailableGrade, writtenIds, freshIds, removed, added, rankingPreserved, status });
  }

  const summary = {
    totalProdutosComEscrita: rows.length,
    identico: rows.filter((r) => r.status === STATUS_OK).length,
    renovacaoOk: rows.filter((r) => r.status === STATUS_RENOVACAO).length,
    semBackfill: rows.filter((r) => r.status === STATUS_SEM_BACKFILL).length,
    rankingQuebrado: rows.filter((r) => r.rankingPreserved === false).length,
    naoEncontrado: rows.filter((r) => r.status === STATUS_NAO_ENCONTRADO).length,
  };

  return { summary, rows };
}
