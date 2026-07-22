// Orquestrador do job agendado da operação diária autônoma na nuvem (Fase 6,
// D-45/D-46/D-47/D-48). Ponto de entrada único invocado pelo workflow do GitHub
// Actions (Plano 06-02): guard de idempotência diária -> ingestão -> fila de
// aprovação -> checkpoint do WAL.
//
// Uso: node scripts/run-daily-job.js [categoria1] [categoria2] ...
//
// Este orquestrador nunca aciona escrita real na loja — só popula a fila de
// aprovação (D-47, Out of Scope do PROJECT.md permanece travado). Nenhum caminho
// deste arquivo importa o módulo que executa escrita real de Metafield na loja;
// aprovação/escrita continuam exclusivamente manuais via painel web já existente.
//
// D-48/FEED-01/SC#2 (achado central da pesquisa desta fase, Pitfall 2 do
// 06-RESEARCH.md): rodar este script duas vezes no mesmo dia (UTC) NUNCA cria um
// segundo run_id bem-sucedido — a segunda chamada detecta a run de hoje via
// getSuccessfulRunForToday() e retorna cedo, sem chamar runIngestion de novo. Sem
// este guard, uma decisão de aprovação humana já dada para o run de hoje
// "desapareceria" ao ser substituída por um novo run_id.
//
// D-45/D-46/Pitfall 1: o checkpoint explícito do WAL (mescla + fecha a conexão) é
// acionado como ÚLTIMA operação do bloco de CLI abaixo, nunca dentro da função
// exportada — garante que escritas em modo WAL sobrevivam ao fim do processo Node
// efêmero antes de qualquer commit-back em CI.

import { pathToFileURL } from 'node:url';
import { runIngestion } from '../src/ingestion/ingest-catalog.js';
import {
  getSuccessfulRunForToday,
  seedPendingApprovalQueue,
  checkpointAndCloseDb,
  getLatestSnapshotProducts,
  getLatestSuccessfulRunId,
  getBaselineForRun,
  getLastSuccessfulIngestionRunSummary,
  getLastWrittenValuesForAllProducts,
} from '../src/db/catalog-store.js';
import { buildReviewQueue } from '../src/review/review-queue.js';
import { notifyWriteFailure, notifyDailySummary } from '../src/review/notify-failure.js';
import { executeScheduledWrite } from '../src/review/write-executor.js';
import { recommendForProduct } from '../src/recommendation/recommendation-engine.js';
import { tripBreaker, setsEqual } from '../src/review/circuit-breaker.js';
import { ALL_TAXONOMY_CATEGORY_NAMES } from '../src/ingestion/product-group.js';

// Banda mínima da Defesa 1 (D-66, à discrição): o total lido hoje não pode cair
// abaixo de 70% do último run bem-sucedido, senão trata-se de leitura truncada e
// a escrita é abortada. Ajustável se o catálogo tiver sazonalidade acentuada.
const MIN_SNAPSHOT_BAND_RATIO = 0.7;

/**
 * Orquestra uma execução do job diário: guard de idempotência (D-48) -> ingestão
 * completa (`runIngestion`, reaproveitada sem alteração) -> leitura do snapshot mais
 * recente + baseline (mesma sequência de `GET /review` de `review-server.js`, nunca
 * reimplementada aqui) -> cálculo da fila via `buildReviewQueue` -> persistência via
 * `seedPendingApprovalQueue`. NUNCA fecha a conexão SQLite nem chama `process.exit`
 * — ambos pertencem exclusivamente ao bloco de CLI abaixo (mesma disciplina de
 * `performRollback` em `rollback.js`, que também não fecha o processo).
 *
 * Primeira execução do dia (sem run bem-sucedido hoje): chama `runIngestion`,
 * calcula e persiste a fila, retorna `{ skipped: false, runId, queueLength,
 * ingestionResult }`.
 *
 * Segunda chamada no MESMO dia (já existe run success hoje): retorna
 * `{ skipped: true, runId: <run existente>, queueLength: 0 }` imediatamente, SEM
 * chamar `runIngestion` — nenhuma chamada de rede adicional acontece.
 *
 * `allowSameDayRerun` (achado do 1º rollout supervisionado, 07-08/D-64): o fluxo
 * "dry-run agora, escrita real depois no MESMO dia" colide com este guard — sem
 * bypass explícito, a chamada de escrita real cairia no skip e não gravaria nada
 * (workflow verde, zero efeito). Default `false` preserva 100% o comportamento
 * original do guard (D-48) para o cron agendado — só o `workflow_dispatch` manual
 * passa `true` (nunca o `schedule`), então o cron automático NUNCA reingere/roda
 * duas vezes sozinho no mesmo dia.
 * @param {{ categoryNames?: string[], allowSameDayRerun?: boolean }} [params]
 * @returns {Promise<{ skipped: boolean, runId: number|null, queueLength: number, ingestionResult?: object }>}
 */
/**
 * Kill switch operacional do regime diário de escrita automática (D-62). Espelha
 * `resolveMinSizesInStock` (ingest-catalog.js): decide se as escritas deste run
 * são REAIS ou dry-run, lido de variáveis de ambiente mapeadas pelo workflow do
 * GitHub Actions — nunca depende da máquina do usuário.
 *
 * Precedência (A1/D-62): `WRITE_OVERRIDE` (input `write` do `workflow_dispatch`,
 * usado no 1º rollout supervisionado D-64) tem prioridade — `'true'` liga,
 * `'false'` desliga mesmo com o regime persistente ligado. Ausente/vazio, cai em
 * `WRITE_ENABLED` (repository variable persistente): só `'true'` liga. QUALQUER
 * outro caso (ambos ausentes, valores inesperados como `'1'`/`'yes'`) resolve para
 * `false` — ausência de configuração explícita SEMPRE significa dry-run seguro,
 * nunca escrita acidental na loja de produção.
 * @returns {boolean} true => grava de verdade; false => dry-run (loga, não escreve)
 */
export function resolveWriteEnabled() {
  const override = process.env.WRITE_OVERRIDE;
  if (override === 'true') return true;
  if (override === 'false') return false;
  return process.env.WRITE_ENABLED === 'true';
}

/**
 * Defesa 1 de integridade do snapshot (D-66) — função PURA. Confirma que a
 * ingestão devolveu um catálogo plausível e completo ANTES de qualquer escrita:
 * uma leitura truncada da API (rate-limit/paginação parcial) NUNCA pode virar um
 * apagão em massa da vitrine.
 *
 * Aborta (retorna `{ ok: false, reason }`) se:
 *   1. alguma categoria ingerida voltou com 0 produtos (ou contagem não-numérica);
 *   2. nenhuma categoria retornou contagem (snapshot vazio/totalmente truncado);
 *   3. o total lido caiu abaixo de `minBandRatio` (default 70%) do total do último
 *      run bem-sucedido — só quando existe um run anterior com total positivo (a
 *      primeira ingestão da vida não tem baseline de banda e passa).
 *
 * `categoryCounts` é a contagem BRUTA por categoria capturada na ingestão (D-66),
 * chaveada pela mesma grafia que a ingestão resolveu — checar as entradas
 * presentes evita divergência com uma lista externa de nomes solicitados.
 * @param {{
 *   categoryCounts: Record<string, number>,
 *   previousProductsRead: number|null|undefined,
 *   currentProductsRead: number,
 *   minBandRatio?: number,
 * }} params
 * @returns {{ ok: boolean, reason?: string }}
 */
export function evaluateSnapshotIntegrity({
  categoryCounts,
  previousProductsRead,
  currentProductsRead,
  minBandRatio = MIN_SNAPSHOT_BAND_RATIO,
}) {
  const counts = categoryCounts && typeof categoryCounts === 'object' ? categoryCounts : {};
  const names = Object.keys(counts);

  if (names.length === 0) {
    return { ok: false, reason: 'nenhuma categoria retornou contagem — snapshot vazio/truncado, escrita abortada (D-66)' };
  }

  for (const name of names) {
    const count = counts[name];
    if (!(typeof count === 'number' && count > 0)) {
      return {
        ok: false,
        reason: `categoria "${name}" voltou com ${count} produto(s) — leitura truncada, escrita abortada (D-66)`,
      };
    }
  }

  if (typeof previousProductsRead === 'number' && previousProductsRead > 0) {
    const floor = previousProductsRead * minBandRatio;
    if (typeof currentProductsRead === 'number' && currentProductsRead < floor) {
      return {
        ok: false,
        reason:
          `total lido (${currentProductsRead}) abaixo de ${Math.round(minBandRatio * 100)}% do último run ` +
          `bem-sucedido (${previousProductsRead}) — leitura truncada, escrita abortada (D-66)`,
      };
    }
  }

  return { ok: true };
}

export async function runDailyJob({ categoryNames, allowSameDayRerun = false } = {}) {
  const existingRunId = getSuccessfulRunForToday();

  if (existingRunId != null && !allowSameDayRerun) {
    console.log(
      `runDailyJob: já existe uma execução bem-sucedida hoje (run_id=${existingRunId}) — ` +
        'pulando ingestão para preservar decisões de aprovação já registradas (D-48/SC#2).'
    );
    return { skipped: true, runId: existingRunId, queueLength: 0 };
  }

  // Defesa 1 (D-66): captura o resumo do ÚLTIMO run bem-sucedido ANTES de ingerir —
  // depois da ingestão, `getLastSuccessfulIngestionRunSummary` já apontaria para o
  // run recém-criado (hoje), inutilizando a comparação de banda vs. o run anterior.
  const previousSummary = getLastSuccessfulIngestionRunSummary();

  const ingestionResult = await runIngestion(categoryNames ? { categoryNames } : undefined);

  const runId = getLatestSuccessfulRunId();

  // Defesa 1 (D-66): valida a integridade do snapshot antes de qualquer escrita.
  // Leitura truncada (categoria com 0, snapshot vazio, ou total fora da banda vs.
  // o run anterior) ABORTA a fase de escrita e notifica — nunca toca a loja.
  const integrity = evaluateSnapshotIntegrity({
    categoryCounts: ingestionResult.categoryCounts,
    previousProductsRead: previousSummary ? previousSummary.productsRead : null,
    currentProductsRead: ingestionResult.productsRead,
  });

  if (!integrity.ok) {
    console.error(`runDailyJob: Defesa 1 abortou a escrita — ${integrity.reason}`);
    await notifyWriteFailure({
      productId: 'daily-job',
      error: new Error(integrity.reason),
      triggeredBy: 'scheduled',
    });
    return { skipped: false, runId, queueLength: 0, ingestionResult, aborted: 'integrity' };
  }

  const catalogProducts = getLatestSnapshotProducts();
  const baselineMap = getBaselineForRun({ runId });
  const queueEntries = buildReviewQueue(catalogProducts, baselineMap);

  // Fila de aprovação preservada (D-47 -> D-61): não é mais o gate de escrita, mas
  // continua sendo registrada como histórico/verificação opcional pós-escrita.
  seedPendingApprovalQueue({ runId, queueEntries });

  // --- Escrita automática recorrente (D-61/D-68), cercada pelo disjuntor (D-63),
  // pelo kill switch (D-62) e pela Defesa 2 referencial (D-67, dentro de
  // executeScheduledWrite). ---
  const dryRun = !resolveWriteEnabled();
  const isFirstRollout = process.env.FIRST_ROLLOUT === 'true';
  const writeBaseline = getLastWrittenValuesForAllProducts();
  const snapshotById = new Map(catalogProducts.map((p) => [String(p.productId), p]));

  // Conjunto COMPLETO calculado (denominador do disjuntor): cada fonte elegível
  // (com grade e visível, D-54/D-58) recebe suas recs; uma fonte que TINHA vitrine
  // e ficou inelegível vira apagão intencional (conjunto vazio, contabilizado pelo
  // disjuntor — Open Question 3). Fonte inelegível SEM baseline não gera nada.
  const computed = [];
  for (const source of catalogProducts) {
    const productId = String(source.productId);
    const eligible = source.hasAvailableGrade && source.published !== false;
    const hadBaseline = (writeBaseline.get(productId) || []).length > 0;

    if (eligible) {
      const recommendedIds = recommendForProduct(productId, catalogProducts).map((r) =>
        String(r.productId)
      );
      computed.push({ productId, recommendedIds, sourceEntry: source });
    } else if (hadBaseline) {
      computed.push({ productId, recommendedIds: [], sourceEntry: source });
    }
  }

  // Disjuntor (D-63): mede churn/apagão do conjunto completo vs. o último valor
  // gravado por produto; aborta+notifica se exceder o limiar (1º rollout isento).
  const breaker = tripBreaker({ toWrite: computed, baseline: writeBaseline, isFirstRollout });
  if (breaker.trip) {
    console.error(`runDailyJob: disjuntor abortou a escrita — ${breaker.reason}`);
    await notifyWriteFailure({
      productId: 'daily-job',
      error: new Error(breaker.reason),
      triggeredBy: 'scheduled',
    });
    await notifyDailySummary({
      summary: { alterados: 0, zerados: 0, novos: 0, aborted: 'circuit-breaker', reason: breaker.reason },
    });
    return { skipped: false, runId, queueLength: queueEntries.length, ingestionResult, aborted: 'circuit-breaker' };
  }

  // Grava só os com diff real vs. baseline (D-68); a Defesa 2 (D-67) roda DENTRO de
  // executeScheduledWrite (recebe snapshotById). dryRun vem do kill switch (D-62).
  let alterados = 0;
  let zerados = 0;
  let novos = 0;
  for (const item of computed) {
    const before = writeBaseline.get(item.productId) || [];
    if (setsEqual(before, item.recommendedIds)) continue; // sem diff, não grava (D-68)

    await executeScheduledWrite({
      productId: item.productId,
      recommendedIds: item.recommendedIds,
      dryRun,
      runId,
      sourceEntry: item.sourceEntry,
      snapshotById,
    });

    if (before.length === 0 && item.recommendedIds.length > 0) novos += 1;
    else if (before.length > 0 && item.recommendedIds.length === 0) zerados += 1;
    else alterados += 1;
  }

  const summary = { alterados, zerados, novos, dryRun };
  await notifyDailySummary({ summary });

  return { skipped: false, runId, queueLength: queueEntries.length, ingestionResult, summary };
}

// Idioma ESM padrão (mesma forma de `rollback.js`/`src/review-server.js`): só
// executa o corpo do CLI quando o módulo é executado diretamente — importar este
// módulo em teste NUNCA dispara chamada de rede nem grava nada no banco.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Sem argumentos, o job diário na nuvem ingere o CATÁLOGO COMPLETO (as 11
  // categorias de taxonomia, D-26) — não apenas "Vestidos". Passar categorias
  // explícitas na linha de comando continua funcionando (sobrepõe o default).
  // A lista canônica vem de product-group.js (fonte única) para evitar digitar
  // nomes acentuados no YAML do workflow.
  const categoryNames =
    process.argv.slice(2).length > 0 ? process.argv.slice(2) : ALL_TAXONOMY_CATEGORY_NAMES;

  // Bypass do guard de mesmo dia (07-08/D-64) — só o workflow_dispatch manual do
  // GitHub Actions define esta env var; o cron agendado NUNCA a define (ver YAML).
  const allowSameDayRerun = process.env.ALLOW_SAME_DAY_RERUN === 'true';

  runDailyJob({ categoryNames, allowSameDayRerun })
    .then((result) => {
      console.log('\n=== Resumo da execução do job diário ===');
      console.log(`  skipped: ${result.skipped}`);
      console.log(`  run_id: ${result.runId}`);
      console.log(`  Itens na fila de aprovação (novos, D-47): ${result.queueLength}`);
      console.log('==========================================\n');

      checkpointAndCloseDb();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('\nERRO durante o job diário:', err.message);
      await notifyWriteFailure({ productId: 'daily-job', error: err, triggeredBy: 'scheduled' });
      process.exit(1);
    });
}
