// Ponto ÚNICO de decisão "pode escrever?" (APRV-03/SC#3/D-25).
//
// Restrição estrutural deliberada: esta função recebe a leitura do banco JÁ
// FEITA como parâmetro (`decision`) — nunca abre conexão SQLite própria,
// nunca importa `catalog-store.js`. Isso torna o módulo testável sem banco
// real e reutilizável tanto pelo endpoint HTTP (Plano 04-05) quanto por
// `write-executor.js` (mesmo diretório) sem duplicar a leitura. Zero
// importações neste arquivo (verificado por grep nas acceptance_criteria).

/**
 * Erro tipado lançado quando uma tentativa de escrita não tem aprovação
 * registrada. Distinguível de erros genéricos pelo handler HTTP (Plano
 * 04-05: `err instanceof ApprovalRequiredError` => código de erro dedicado).
 */
export class ApprovalRequiredError extends Error {
  constructor(productId) {
    super(`Produto ${productId} não tem aprovação registrada — escrita recusada.`);
    this.name = 'ApprovalRequiredError';
    this.productId = productId;
  }
}

/**
 * Lança `ApprovalRequiredError` sempre que `decision` for `null`/`undefined`
 * ou seu `status` for diferente de `'approved'` — nunca permite passagem
 * silenciosa (APRV-03). Quando a decisão é válida, retorna o conjunto EXATO
 * de ids aprovados (D-25) — nunca um booleano.
 * @param {string} productId
 * @param {{ status: string, approvedRecommendationIds: string[]|null }|null} decision
 *   Shape de `getApprovalDecision` (Plano 04-01).
 * @returns {string[]}
 */
export function assertApproved(productId, decision) {
  if (!decision || decision.status !== 'approved') {
    throw new ApprovalRequiredError(productId);
  }
  return decision.approvedRecommendationIds;
}
