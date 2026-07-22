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
} from '../src/db/catalog-store.js';
import { buildReviewQueue } from '../src/review/review-queue.js';
import { notifyWriteFailure } from '../src/review/notify-failure.js';
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
 * @param {{ categoryNames?: string[] }} [params]
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

export async function runDailyJob({ categoryNames } = {}) {
  const existingRunId = getSuccessfulRunForToday();

  if (existingRunId != null) {
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

  seedPendingApprovalQueue({ runId, queueEntries });

  return { skipped: false, runId, queueLength: queueEntries.length, ingestionResult };
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

  runDailyJob({ categoryNames })
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
