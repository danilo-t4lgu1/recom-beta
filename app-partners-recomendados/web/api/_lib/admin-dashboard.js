// Agregação de leitura para o Painel Administrativo do Recom. Módulo de domínio
// PURO (mesma disciplina de coverage-report.js/engine-certification.js): recebe
// os dados já materializados (snapshot, últimos valores escritos, resumo do
// último run) e só soma/conta — nenhum I/O próprio, nenhuma escrita, nunca
// consulta a Nuvemshop. O chamador HTTP (admin-server.js) faz toda a leitura.
//
// "Produtos relacionados" usa o estado REALMENTE gravado (write_log via
// getLastWrittenValuesForAllProducts), não o que o motor computaria agora —
// reflete o que está de fato ao vivo na loja, que é o que o usuário quer
// auditar visualmente.

/**
 * @param {{
 *   snapshotProducts: Array<{ productId: string, name: string|null, fabricTagCanonical: string|null,
 *     variants: Array<{ stockTotal: number }> }>,
 *   lastWrittenByProduct: Map<string, string[]>,
 *   lastRunSummary: { runId: number, status: string, startedAt: string, finishedAt: string|null,
 *     productsRead: number|null } | null,
 * }} params
 * @returns {{
 *   relatedProducts: { count: number, totalProducts: number },
 *   relatedProductsStock: { totalUnitsInStock: number, zeroStockCount: number,
 *     items: Array<{ productId: string, name: string|null, stockTotal: number }> },
 *   fabricTagFilled: { count: number, total: number },
 *   lastCronRun: { runId: number, status: string, startedAt: string, finishedAt: string|null,
 *     productsRead: number|null } | null,
 * }}
 */
export function buildAdminDashboard({ snapshotProducts, lastWrittenByProduct, lastRunSummary }) {
  const productsById = new Map(snapshotProducts.map((p) => [String(p.productId), p]));

  let relatedCount = 0;
  const recommendedTargetIds = new Set();
  for (const [productId, recommendedIds] of lastWrittenByProduct.entries()) {
    if (recommendedIds.length === 0) continue;
    relatedCount += 1;
    for (const targetId of recommendedIds) recommendedTargetIds.add(String(targetId));
    void productId;
  }

  let totalUnitsInStock = 0;
  let zeroStockCount = 0;
  const items = [];
  for (const targetId of recommendedTargetIds) {
    const product = productsById.get(targetId);
    const stockTotal = product
      ? product.variants.reduce((sum, v) => sum + (Number(v.stockTotal) || 0), 0)
      : 0;
    totalUnitsInStock += stockTotal;
    if (stockTotal === 0) zeroStockCount += 1;
    items.push({ productId: targetId, name: product ? product.name : null, stockTotal });
  }
  items.sort((a, b) => a.stockTotal - b.stockTotal);

  const fabricTagCount = snapshotProducts.filter((p) => p.fabricTagCanonical != null).length;

  return {
    relatedProducts: { count: relatedCount, totalProducts: snapshotProducts.length },
    relatedProductsStock: { totalUnitsInStock, zeroStockCount, items },
    fabricTagFilled: { count: fabricTagCount, total: snapshotProducts.length },
    lastCronRun: lastRunSummary,
  };
}

/**
 * Detalhamento do Card "Tecido preenchido em tags" (achado 2026-08-10): agrega o
 * catálogo por `fabricTagCanonical` (Grupo de Tecidos — Alfaiataria, Malha, Crepe,
 * Tule, Couro PU, etc., os valores que existirem hoje em `fabric_tag_canonical_map`,
 * nunca uma lista fixa hardcoded aqui) e monta as linhas produto-a-produto usadas
 * tanto pela expansão do card (resumo por grupo) quanto pelo export Excel (linhas
 * completas). Módulo de domínio PURO — mesma disciplina de `buildAdminDashboard`.
 * @param {{ snapshotProducts: Array<{ productId: string, name: string|null,
 *   fabricTagCanonical: string|null, variants: Array<{ sku: string|null, stockTotal: number }> }> }} params
 * @returns {{
 *   total: number,
 *   filledCount: number,
 *   missingCount: number,
 *   byGroup: Array<{ group: string, count: number }>,
 *   rows: Array<{ productId: string, name: string|null, sku: string|null,
 *     stockTotal: number, hasTag: boolean, fabricTagCanonical: string|null }>,
 * }}
 */
export function buildFabricTagDetail({ snapshotProducts }) {
  const rows = [];
  const byGroupCount = new Map();
  let missingCount = 0;

  for (const product of snapshotProducts) {
    const stockTotal = product.variants.reduce((sum, v) => sum + (Number(v.stockTotal) || 0), 0);
    const firstSkuVariant = product.variants.find((v) => v.sku != null);
    const hasTag = product.fabricTagCanonical != null;

    if (hasTag) {
      byGroupCount.set(
        product.fabricTagCanonical,
        (byGroupCount.get(product.fabricTagCanonical) || 0) + 1
      );
    } else {
      missingCount += 1;
    }

    rows.push({
      productId: product.productId,
      name: product.name,
      sku: firstSkuVariant ? firstSkuVariant.sku : null,
      stockTotal,
      hasTag,
      fabricTagCanonical: product.fabricTagCanonical,
    });
  }

  const byGroup = Array.from(byGroupCount.entries())
    .map(([group, count]) => ({ group, count }))
    .sort((a, b) => b.count - a.count);

  return {
    total: snapshotProducts.length,
    filledCount: snapshotProducts.length - missingCount,
    missingCount,
    byGroup,
    rows,
  };
}

function nextCalendarDayUTC(dateKey) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/**
 * Constrói o relatório dia-a-dia do Card "Cron Diário" (achado 2026-08-10),
 * juntando 3 fontes: `ingestionRuns` (Status/Catalogo — uma linha por dia, a
 * execução `status='success'` mais recente daquele dia), um SWEEP cronológico de
 * `writeLogRows` para reconstruir `related` HISTÓRICO (write_log não guarda um
 * agregado por dia, só eventos individuais de escrita — a única forma correta de
 * saber "quantos produtos tinham recomendação em 10/08" é replaying os eventos em
 * ordem até aquele instante) e `dailyRecomputeLogRows` (Daily_Recompute — só
 * existe a partir de 2026-08-10, dias anteriores ficam `dailyRecompute: null`,
 * gap de dado documentado, não um bug).
 *
 * Preenche TODO dia do calendário entre o primeiro e o último run bem-sucedido,
 * inclusive dias SEM nenhum run (ex: 2026-07-23, 502 da Cloudflare) — esses viram
 * `status: 'NÃO ATUALIZADO'` explícito, nunca um buraco silencioso no relatório.
 * Módulo de domínio PURO: recebe tudo já materializado, nenhuma leitura própria.
 * @param {{
 *   ingestionRuns: Array<{ runId: number, startedAt: string, finishedAt: string|null, status: string, productsRead: number|null }>,
 *   writeLogRows: Array<{ productId: string, writtenValue: string|null, status: string, writtenAt: string }>,
 *   dailyRecomputeLogRows: Array<{ startedAt: string, status: 'ok'|'error' }>,
 * }} params
 * @returns {Array<{ date: string, time: string|null, status: 'ATUALIZADO'|'NÃO ATUALIZADO',
 *   catalog: number|null, related: number|null, dailyRecompute: 'OK'|'ERROR'|null }>}
 */
export function buildCronLog({ ingestionRuns, writeLogRows, dailyRecomputeLogRows }) {
  const successRuns = ingestionRuns
    .filter((r) => r.status === 'success')
    .sort((a, b) => (a.startedAt < b.startedAt ? -1 : a.startedAt > b.startedAt ? 1 : 0));
  if (successRuns.length === 0) return [];

  const latestRunByDay = new Map();
  for (const run of successRuns) {
    const day = run.startedAt.slice(0, 10);
    latestRunByDay.set(day, run); // successRuns já ordenado ASC — a última atribuição vence
  }

  const latestDailyRecomputeByDay = new Map();
  for (const row of dailyRecomputeLogRows) {
    const day = row.startedAt.slice(0, 10);
    const existing = latestDailyRecomputeByDay.get(day);
    if (!existing || row.startedAt > existing.startedAt) latestDailyRecomputeByDay.set(day, row);
  }

  // Sweep cronológico: avança um cursor pelos writes 'success' ordenados por
  // writtenAt, mantendo o ÚLTIMO conjunto conhecido por produto — reconstrói o
  // estado exato "como estava até este instante", não o estado atual.
  const sortedWrites = writeLogRows
    .filter((w) => w.status === 'success')
    .sort((a, b) => (a.writtenAt < b.writtenAt ? -1 : a.writtenAt > b.writtenAt ? 1 : 0));
  const lastWrittenByProduct = new Map();
  let writeCursor = 0;
  function relatedCountAsOf(timestamp) {
    while (writeCursor < sortedWrites.length && sortedWrites[writeCursor].writtenAt <= timestamp) {
      const w = sortedWrites[writeCursor];
      let ids = [];
      try {
        const parsed = JSON.parse(w.writtenValue);
        ids = Array.isArray(parsed) ? parsed : [];
      } catch {
        ids = [];
      }
      lastWrittenByProduct.set(w.productId, ids);
      writeCursor += 1;
    }
    let count = 0;
    for (const ids of lastWrittenByProduct.values()) {
      if (ids.length > 0) count += 1;
    }
    return count;
  }

  const firstDay = successRuns[0].startedAt.slice(0, 10);
  const lastDay = successRuns[successRuns.length - 1].startedAt.slice(0, 10);

  const rows = [];
  for (let day = firstDay; day <= lastDay; day = nextCalendarDayUTC(day)) {
    const run = latestRunByDay.get(day);
    const dailyRecompute = latestDailyRecomputeByDay.get(day);
    rows.push({
      date: day,
      time: run ? run.startedAt.slice(11, 16) : null,
      status: run ? 'ATUALIZADO' : 'NÃO ATUALIZADO',
      catalog: run ? run.productsRead : null,
      related: run ? relatedCountAsOf(run.finishedAt || run.startedAt) : null,
      dailyRecompute: dailyRecompute ? dailyRecompute.status.toUpperCase() : null,
    });
  }
  return rows;
}
