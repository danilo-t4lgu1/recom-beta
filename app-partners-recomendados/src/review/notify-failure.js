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
