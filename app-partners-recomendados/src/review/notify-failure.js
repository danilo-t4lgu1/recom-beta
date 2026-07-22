// Notificação de falha de escrita (WRTE-05, D-39/D-40) — dispara um webhook (Slack ou
// Discord, à escolha do operador) quando a escrita automática de um Metafield falha.
//
// NUNCA lança — nem quando o webhook está ausente, nem quando a chamada de rede falha
// (Pitfall 5 do 05-RESEARCH.md). Uma falha na notificação não pode mascarar/derrubar o
// fluxo maior que a chamou. Uma única tentativa de fetch, sem retry (T-05-02) — falha é
// só logada, nunca re-tentada.
//
// O payload NUNCA inclui credenciais/segredos de autenticação — só productId,
// triggeredBy, error.message e timestamp (T-05-01).

/**
 * Notifica uma falha de escrita via webhook configurado em
 * `WRITE_FAILURE_WEBHOOK_URL`. Degrada graciosamente se a variável estiver ausente/vazia
 * (não chama fetch). Nunca lança.
 * @param {{ productId: string|number, error: Error, triggeredBy: string }} params
 * @returns {Promise<{ notified: boolean, reason?: string }>}
 */
export async function notifyWriteFailure({ productId, error, triggeredBy }) {
  const webhookUrl = process.env.WRITE_FAILURE_WEBHOOK_URL;

  if (!webhookUrl) {
    console.warn(
      'notifyWriteFailure: WRITE_FAILURE_WEBHOOK_URL ausente ou vazio — falha registrada apenas localmente (sem notificação).'
    );
    return { notified: false, reason: 'webhook not configured' };
  }

  try {
    const message = `Falha ao gravar recomendação (produto ${productId}, gatilho ${triggeredBy}): ${error.message}`;

    const payload = {
      text: message,
      content: message,
      productId,
      triggeredBy,
      error: error.message,
      timestamp: new Date().toISOString(),
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error(
        `notifyWriteFailure: webhook respondeu com status ${response.status} — notificação NÃO confirmada.`
      );
      return { notified: false, reason: `webhook status ${response.status}` };
    }

    return { notified: true };
  } catch (err) {
    console.error(`notifyWriteFailure: falha ao chamar o webhook — ${err.message}`);
    return { notified: false, reason: err.message };
  }
}

/**
 * Resumo diário do regime automático (D-69) — reusa o MESMO webhook
 * (`WRITE_FAILURE_WEBHOOK_URL`) e o MESMO contrato de `notifyWriteFailure`:
 * degrada graciosamente se o webhook estiver ausente/vazio (não chama fetch),
 * uma única tentativa sem retry, NUNCA lança, e o payload NUNCA inclui
 * credenciais/segredos (só o resumo do que mudou + timestamp, V7/T-07-16).
 *
 * `summary` é o balanço do run: `{ alterados, zerados, novos, dryRun?, aborted?,
 * reason? }`. É serializado no payload e resumido textualmente em `text`/`content`
 * (compatível com Slack e Discord, como `notifyWriteFailure`).
 * @param {{ summary: { alterados?: number, zerados?: number, novos?: number,
 *   dryRun?: boolean, aborted?: string, reason?: string } }} params
 * @returns {Promise<{ notified: boolean, reason?: string }>}
 */
export async function notifyDailySummary({ summary }) {
  const webhookUrl = process.env.WRITE_FAILURE_WEBHOOK_URL;

  if (!webhookUrl) {
    console.warn(
      'notifyDailySummary: WRITE_FAILURE_WEBHOOK_URL ausente ou vazio — resumo diário registrado apenas localmente (sem notificação).'
    );
    return { notified: false, reason: 'webhook not configured' };
  }

  try {
    const s = summary || {};
    const alterados = s.alterados || 0;
    const zerados = s.zerados || 0;
    const novos = s.novos || 0;
    const modo = s.aborted
      ? `ABORTADO (${s.aborted}${s.reason ? `: ${s.reason}` : ''})`
      : s.dryRun
        ? 'dry-run (nada gravado)'
        : 'escrita real';
    const message =
      `Resumo diário da recomendação [${modo}]: ` +
      `${alterados} alterado(s), ${zerados} zerado(s), ${novos} novo(s).`;

    const payload = {
      text: message,
      content: message,
      summary: s,
      timestamp: new Date().toISOString(),
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error(
        `notifyDailySummary: webhook respondeu com status ${response.status} — notificação NÃO confirmada.`
      );
      return { notified: false, reason: `webhook status ${response.status}` };
    }

    return { notified: true };
  } catch (err) {
    console.error(`notifyDailySummary: falha ao chamar o webhook — ${err.message}`);
    return { notified: false, reason: err.message };
  }
}
