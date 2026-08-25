// Disjuntor automático da escrita em massa (D-63) — a SEGUNDA rede de segurança
// (a Defesa 1 de integridade do snapshot é a primeira, a Defesa 2 referencial é a
// terceira). Antes de efetivar as escritas de um run diário, mede a magnitude da
// mudança que SERIA gravada contra o baseline realmente gravado na loja
// (`write_log`, via `getLastWrittenValuesForAllProducts`) e ABORTA + notifica se:
//   - churn > churnMax: fração dos produtos cujo conjunto novo difere do baseline
//     é grande demais (mudança em massa suspeita, bug ou dado anômalo);
//   - apagão > blackoutMax: fração dos que TINHAM recomendação e ficariam vazios
//     (uma leitura truncada que escapou da Defesa 1 nunca vira apagão da vitrine).
//
// O 1º rollout supervisionado (D-64) é explicitamente ISENTO via `isFirstRollout`
// (o churn é naturalmente ~100% quando ainda não há baseline gravado).
//
// Módulo PURO: zero-import, zero-I/O, sem relógio/aleatoriedade/rede. Recebe o
// conjunto já calculado e o baseline como dados; nunca lê o banco nem o ambiente.

/**
 * Compara dois conjuntos de ids ignorando ordem, por String (mesma semântica de
 * `hasChanged` em review-queue.js — reordenação pura não é mudança; tipos mistos
 * number/string não geram falso-positivo). `null`/`undefined` são tratados como
 * conjunto vazio.
 * @param {(string|number)[]|null|undefined} a
 * @param {(string|number)[]|null|undefined} b
 * @returns {boolean}
 */
export function setsEqual(a, b) {
  const setA = new Set((a || []).map(String));
  const setB = new Set((b || []).map(String));
  if (setA.size !== setB.size) return false;
  for (const id of setA) {
    if (!setB.has(id)) return false;
  }
  return true;
}

/**
 * Escala um limiar-base pelos dias decorridos desde o último sucesso, até um
 * teto absoluto — achado 2026-08-25 (D-63 revisão): sem isso, um abort congela
 * o baseline (`getLastWrittenValuesForAllProducts` só avança em sucesso), o que
 * infla o churn do dia seguinte contra o MESMO limiar fixo e quase garante outro
 * abort — visto na prática (11→25/08/2026: 14 aborts seguidos, churn subindo de
 * 68% a 87,6% dia após dia, nunca convergindo sozinho). `daysSinceLastSuccess`
 * nulo/≤1 não escala (comportamento idêntico ao pré-revisão).
 * @param {number} base
 * @param {number|null|undefined} daysSinceLastSuccess
 * @param {number} ceiling
 * @returns {number}
 */
function scaleThreshold(base, daysSinceLastSuccess, ceiling) {
  const days = Number.isFinite(daysSinceLastSuccess) && daysSinceLastSuccess > 1 ? daysSinceLastSuccess : 1;
  return Math.min(base * days, ceiling);
}

/**
 * Decide se o disjuntor deve DISPARAR (abortar a escrita) para um batch diário.
 *
 * @param {{
 *   toWrite: Array<{ productId: string|number, recommendedIds: (string|number)[] }>,
 *   baseline: Map<string, (string|number)[]>,
 *   isFirstRollout?: boolean,
 *   churnMax?: number,
 *   blackoutMax?: number,
 *   daysSinceLastSuccess?: number|null,
 *   churnCeiling?: number,
 *   blackoutCeiling?: number,
 * }} params
 *   - `toWrite`: conjunto calculado para ESTE run (um item por produto-fonte
 *     considerado; `recommendedIds` é o conjunto novo, `[]` significa vitrine
 *     esvaziada). É o conjunto COMPLETO do catálogo elegível, não só os diffs —
 *     é o denominador do churn/apagão.
 *   - `baseline`: `Map<productId, ids[]>` do último valor gravado por produto
 *     (`getLastWrittenValuesForAllProducts`). Produto sem entrada = `[]`.
 *   - `isFirstRollout`: quando true, NUNCA dispara (isenção D-63/D-64).
 *   - `churnMax` (default 0.30) / `blackoutMax` (default 0.10): limiares-base
 *     para 1 dia de defasagem, à discrição (D-63), ajustáveis.
 *   - `daysSinceLastSuccess`: dias corridos desde o último `write_log` com
 *     `status='success'` (`getLastSuccessfulWriteTimestamp`), calculado pelo
 *     CHAMADOR (módulo permanece puro/zero-I/O/zero-relógio). `null`/`undefined`/
 *     `≤1` => sem escalonamento, idêntico ao comportamento pré-revisão.
 *   - `churnCeiling` (default 0.90) / `blackoutCeiling` (default 0.50): teto
 *     absoluto do escalonamento — o disjuntor nunca fica inteiramente inerte,
 *     mesmo com muitos dias acumulados.
 * @returns {{ trip: boolean, reason?: string }}
 */
export function tripBreaker({
  toWrite,
  baseline,
  isFirstRollout = false,
  churnMax = 0.3,
  blackoutMax = 0.1,
  daysSinceLastSuccess = null,
  churnCeiling = 0.9,
  blackoutCeiling = 0.5,
}) {
  if (isFirstRollout) {
    return { trip: false, reason: '1º rollout supervisionado — disjuntor isento (D-63/D-64)' };
  }

  const items = Array.isArray(toWrite) ? toWrite : [];
  const base = baseline instanceof Map ? baseline : new Map();
  const total = items.length;

  let changed = 0;
  let hadBefore = 0;
  let blackedOut = 0;

  for (const item of items) {
    const before = base.get(String(item.productId)) || [];
    const newIds = item.recommendedIds || [];
    if (!setsEqual(before, newIds)) changed += 1;
    if (before.length > 0) {
      hadBefore += 1;
      if (newIds.length === 0) blackedOut += 1;
    }
  }

  const churn = total > 0 ? changed / total : 0;
  const blackout = hadBefore > 0 ? blackedOut / hadBefore : 0;

  const effectiveChurnMax = scaleThreshold(churnMax, daysSinceLastSuccess, churnCeiling);
  const effectiveBlackoutMax = scaleThreshold(blackoutMax, daysSinceLastSuccess, blackoutCeiling);

  if (churn > effectiveChurnMax) {
    return {
      trip: true,
      reason: `churn ${(churn * 100).toFixed(1)}% > ${(effectiveChurnMax * 100).toFixed(0)}% — escrita em massa abortada (D-63)`,
    };
  }
  if (blackout > effectiveBlackoutMax) {
    return {
      trip: true,
      reason: `apagão ${(blackout * 100).toFixed(1)}% > ${(effectiveBlackoutMax * 100).toFixed(0)}% — abortado para não esvaziar a vitrine (D-63)`,
    };
  }

  return { trip: false };
}
