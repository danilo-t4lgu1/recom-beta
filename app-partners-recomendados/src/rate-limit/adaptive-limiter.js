// Rate limiter adaptativo para a API pública da Nuvemshop (PLAT-02, D-05).
//
// A API usa leaky bucket: x-rate-limit-limit (tamanho do bucket), x-rate-limit-remaining
// (requisições restantes) e x-rate-limit-reset (ms até o bucket esvaziar). Este módulo lê
// esses headers em toda resposta real e ajusta o próximo delay dinamicamente — nunca um
// valor fixo hardcoded (T-02-01).
//
// Fonte: tiendanube.github.io/api-documentation/intro — ver 02-RESEARCH.md Pattern 2.

/**
 * Mantém o estado de rate limit observado a partir das respostas reais da API e decide
 * quando esperar antes do próximo request, sem nunca assumir um valor de delay fixo.
 */
export class AdaptiveRateLimiter {
  constructor() {
    /** @type {number|null} requisições restantes no bucket, desconhecido até a 1ª resposta real */
    this.remaining = null;
    /** @type {number|null} ms até o bucket esvaziar, conforme informado pela API */
    this.resetMs = null;
  }

  /**
   * Atualiza o estado a partir dos headers de uma resposta real. Headers ausentes NÃO
   * sobrescrevem o último valor conhecido (nunca reseta para null silenciosamente).
   * @param {Headers} headers
   */
  updateFromHeaders(headers) {
    const remaining = headers.get('x-rate-limit-remaining');
    const reset = headers.get('x-rate-limit-reset');
    if (remaining !== null) this.remaining = Number(remaining);
    if (reset !== null) this.resetMs = Number(reset);
  }

  /**
   * Espera antes do próximo request se o buffer de segurança (remaining <= 2) foi
   * atingido. Antes de qualquer resposta real (remaining === null), retorna
   * imediatamente — nunca assume timing sem dado real.
   * @returns {Promise<void>}
   */
  async waitIfNeeded() {
    if (this.remaining === null) return;

    if (this.remaining <= 2 && this.resetMs) {
      await new Promise((resolve) => setTimeout(resolve, this.resetMs));
    }
  }
}

const MAX_429_RETRIES = 5; // WR-02: teto de tentativas — nunca recursão irrestrita

// Gateway/infra transitórios observados em produção (ex: Cloudflare 502 na frente da
// api.tiendanube.com, 2026-07-23) — nunca refletem um erro de lógica da nossa chamada,
// diferente de um 500 genérico da própria API, que pode indicar payload inválido e por
// isso NÃO entra neste conjunto (propaga imediato via assertOk, como antes).
const TRANSIENT_STATUSES = new Set([502, 503, 504]);
const MAX_TRANSIENT_RETRIES = 3; // WR-02 aplicado a 5xx/erro de rede: teto de tentativas
const TRANSIENT_BACKOFF_BASE_MS = 500; // backoff exponencial: 500ms, 1000ms, 2000ms

/**
 * Wrapper de fetch com throttling adaptativo (PLAT-02): espera se necessário, executa o
 * request, atualiza o limiter a partir dos headers reais da resposta, e faz retry em
 * 429 usando o x-rate-limit-reset real (nunca um backoff fixo). Também faz retry com
 * backoff exponencial para erros transitórios de gateway/infra (502/503/504) e para
 * falhas de rede (fetch rejeitando, ex: ECONNRESET/timeout) — cenário real do 502
 * Cloudflare que derrubou o cron diário em 2026-07-23 sem nenhuma nova tentativa. Se
 * limiter não for passado, cria uma instância local descartável para não quebrar
 * chamadas sem limiter explícito. Após o teto de tentativas (429 ou transitório), lança
 * erro / devolve a última resposta ruim em vez de recursar indefinidamente (WR-02) —
 * evita que um job de ingestão fique preso para sempre em caso de quota esgotada ou
 * incidente prolongado na API.
 * @param {string} url
 * @param {RequestInit} [options]
 * @param {AdaptiveRateLimiter} [limiter]
 * @param {number} [attempt] tentativas de 429 já feitas
 * @param {number} [transientAttempt] tentativas de 5xx transitório/erro de rede já feitas
 * @returns {Promise<Response>}
 */
export async function fetchWithRateLimit(
  url,
  options,
  limiter = new AdaptiveRateLimiter(),
  attempt = 0,
  transientAttempt = 0
) {
  await limiter.waitIfNeeded();

  let response;
  try {
    response = await fetch(url, options);
  } catch (networkError) {
    if (transientAttempt >= MAX_TRANSIENT_RETRIES) {
      throw new Error(
        `fetchWithRateLimit: excedeu ${MAX_TRANSIENT_RETRIES} tentativas após erro de rede para ${url}: ${networkError.message}`
      );
    }
    await new Promise((resolve) => setTimeout(resolve, TRANSIENT_BACKOFF_BASE_MS * 2 ** transientAttempt));
    return fetchWithRateLimit(url, options, limiter, attempt, transientAttempt + 1);
  }

  limiter.updateFromHeaders(response.headers);

  if (response.status === 429) {
    if (attempt >= MAX_429_RETRIES) {
      throw new Error(`fetchWithRateLimit: excedeu ${MAX_429_RETRIES} tentativas de 429 para ${url}`);
    }
    const resetMs = Number(response.headers.get('x-rate-limit-reset')) || 2000;
    await new Promise((resolve) => setTimeout(resolve, resetMs));
    return fetchWithRateLimit(url, options, limiter, attempt + 1, transientAttempt);
  }

  if (TRANSIENT_STATUSES.has(response.status)) {
    if (transientAttempt >= MAX_TRANSIENT_RETRIES) {
      // Teto atingido: devolve a última resposta (não lança aqui) para que assertOk do
      // client produza a mesma mensagem de erro de sempre, com o corpo real da resposta.
      return response;
    }
    await new Promise((resolve) => setTimeout(resolve, TRANSIENT_BACKOFF_BASE_MS * 2 ** transientAttempt));
    return fetchWithRateLimit(url, options, limiter, attempt, transientAttempt + 1);
  }

  return response;
}
