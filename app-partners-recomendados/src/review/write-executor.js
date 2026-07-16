// Ponto ÚNICO de entrada para "escrever a recomendação aprovada" (APRV-04/
// SC#4, Pitfall 5 do RESEARCH).
//
// Nesta fase, escrever de verdade na Nuvemshop está fora de escopo (Fase 5/
// WRTE-01-05) — os dois ramos (`dryRun` true/false) resolvem para o MESMO
// stub propositalmente. O que importa é a FORMA da função (parâmetro
// explícito, gate primeiro) que a Fase 5 reusa sem redesenho, substituindo só
// o corpo do `if (!dryRun)`. `dryRun` é SEMPRE parâmetro explícito — nunca
// lido de `process.env` dentro deste módulo (isso é responsabilidade da
// camada HTTP no Plano 04-05, que resolve o valor uma vez e o passa já
// pronto).

import { assertApproved } from './approval-gate.js';

/**
 * `assertApproved` é chamado como a PRIMEIRA operação do corpo, antes de
 * qualquer outro efeito — o gate nunca pode ser contornado passando direto
 * para a lógica de escrita (APRV-03/SC#3). Propaga `ApprovalRequiredError`
 * se `decision` não é `'approved'`.
 *
 * `dryRun:true` e `dryRun:false` produzem o MESMO resultado nesta fase (ambos
 * stub — escrita real é Fase 5), e nenhum dos dois faz qualquer chamada de
 * rede (Pitfall 5). `dryRun` ausente (undefined) é tratado como falsy —
 * equivalente a `dryRun: false` no fluxo desta fase, já que ambos os ramos
 * são idênticos hoje.
 * @param {{ productId: string, decision: object|null, dryRun?: boolean }} params
 * @returns {{ productId: string, approvedIds: string[], dryRun: boolean, written: false, reason: string }}
 */
export function executeApprovedWrite({ productId, decision, dryRun }) {
  const approvedIds = assertApproved(productId, decision);

  if (!dryRun) {
    // Fase 5 substitui esta linha por uma chamada real (ex: updateMetafield).
    // Nesta fase: stub — nenhuma chamada de rede é feita.
  }

  return { productId, approvedIds, dryRun: !!dryRun, written: false, reason: 'stub — escrita real é Fase 5' };
}
