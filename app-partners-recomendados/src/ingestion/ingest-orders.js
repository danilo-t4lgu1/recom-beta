// Orquestrador de ingestão transacional de PEDIDOS reais da Nuvemshop — base do sinal
// novo de co-compra/market basket (pares de produtos que pessoas realmente compraram
// juntos), distinto do sinal de similaridade (cor/tecido/estoque) já existente.
//
// Encadeia: paginação de TODOS os pedidos (`listOrders`, status=any) -> filtro de
// "pedido qualificado" para a análise de co-compra -> persistência transacional única
// (`orders-store.js`). Mesma disciplina de `ingest-catalog.js`: em caso de exceção em
// qualquer etapa após abrir o run, finaliza a execução com status 'failed' antes de
// relançar — nunca deixa uma order_ingestion_run presa em 'running' silenciosamente.
//
// Confirmado na resposta real da API (`GET /orders`, HTTP 200, 2026-09-16): cada
// pedido tem `order.products[]` com `product_id` (o produto, distinto de `.id`, que é
// o id do ITEM do pedido/variante vendida) e `quantity` — nomes de campo usados
// abaixo. `order.status` observado: "open" (pedido aberto real); `order.payment_status`
// observado: "paid". O enum completo de `status`/`payment_status` não está documentado
// aqui de forma exaustiva (a API não devolve um schema formal) — o filtro de
// qualificação abaixo trata apenas o caso que interessa ao negócio (nunca cancelado +
// pago quando `onlyPaid`), então qualquer outro valor de `status`/`payment_status` cai
// naturalmente em "não qualificado" sem precisar ser enumerado.

import { listOrders } from '../nuvemshop-client/client.js';
import { AdaptiveRateLimiter } from '../rate-limit/adaptive-limiter.js';
import {
  startOrderIngestionRun,
  persistOrderBatch,
  finishOrderIngestionRun,
} from '../db/orders-store.js';

// Achado em execução real contra a API (2026-09-16, loja com ~51.771 pedidos):
// `GET /orders?page=51&per_page=200&status=any` falha com HTTP 422 "Query exceeds
// max allowed limit of 10000" — diferente de `listProducts`/`listAllProducts`
// (catálogo pequeno o bastante para nunca bater esse teto até hoje), a API de
// pedidos tem um limite rígido de paginação por offset (page * per_page <= 10000),
// mesmo quando existem muito mais pedidos além dele. Testado e confirmado: a API
// NÃO suporta paginação por `since_id` (parâmetro aceito sem erro, mas ignorado —
// resultados idênticos independente do valor), mas suporta filtro por
// `created_at_max` (confirmado: reduz corretamente o total de pedidos retornado).
// Solução: "janelar" a paginação por data. Pagina normalmente dentro de uma janela
// (do pedido mais recente possível até o teto de offset); ao bater o teto, abre uma
// NOVA janela usando `created_at_max` = `created_at` do último pedido lido na janela
// anterior, e repete até uma janela terminar (hasNextPage === false) ANTES de bater o
// teto — nesse ponto, chegamos aos pedidos mais antigos da loja. Não depende de
// nenhum valor hardcoded de data ou contagem total (a loja pode crescer): o
// janelamento reage ao erro real da API, não a um número pré-calculado.
const QUERY_EXCEEDS_LIMIT_MARKER = 'Query exceeds max allowed limit';
// WR-02 (mesma disciplina do rate limiter): teto de janelas para nunca laçar
// indefinidamente caso o cursor de data pare de avançar por algum motivo inesperado
// (ex: um número anormal de pedidos com o exato mesmo `created_at`, ao segundo).
const MAX_WINDOWS = 200;

/**
 * Pagina TODOS os pedidos da loja até `hasNextPage === false` (per_page=200,
 * status=any — o filtro de qualificação acontece depois, em `runOrderIngestion`),
 * janelando por `created_at_max` quando a API rejeita a paginação por offset além de
 * 10.000 resultados (ver comentário acima). Uma leitura duplicada de um pedido na
 * fronteira exata entre duas janelas (mesmo `created_at`, ao segundo) é possível mas
 * inofensiva: `orders` é upsert por id e `order_items` é agrupado por Set de
 * productId por pedido na análise (`co-purchase-analysis.js`), então uma duplicata
 * nunca infla um par de co-compra — apenas pode inflar levemente `ordersRead` em
 * casos raros de timestamp exatamente compartilhado na borda da janela.
 * @param {AdaptiveRateLimiter} limiter
 * @returns {Promise<Array<object>>}
 */
export async function listAllOrders(limiter) {
  const allOrders = [];
  let createdAtMax; // undefined = sem teto superior (janela mais recente primeiro)
  let windowCount = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    windowCount += 1;
    if (windowCount > MAX_WINDOWS) {
      throw new Error(
        `listAllOrders: excedeu ${MAX_WINDOWS} janelas de paginação por data sem chegar ao fim do histórico de pedidos — aborta em vez de laçar indefinidamente (WR-02).`
      );
    }

    let page = 1;
    let hasNextPageInWindow = true;
    let lastOrderInWindow = null;
    let hitOffsetCap = false;

    while (hasNextPageInWindow) {
      let result;
      try {
        result = await listOrders({ page, perPage: 200, limiter, createdAtMax });
      } catch (error) {
        if (error.message.includes(QUERY_EXCEEDS_LIMIT_MARKER)) {
          hitOffsetCap = true;
          break;
        }
        throw error;
      }

      allOrders.push(...result.orders);
      if (result.orders.length > 0) {
        lastOrderInWindow = result.orders[result.orders.length - 1];
      }
      hasNextPageInWindow = result.hasNextPage;
      page += 1;
    }

    if (!hitOffsetCap) {
      // Janela terminou naturalmente (sem bater o teto de offset) — chegamos ao fim
      // do histórico de pedidos da loja.
      return allOrders;
    }

    if (!lastOrderInWindow) {
      throw new Error(
        'listAllOrders: bateu o teto de offset da API sem conseguir ler nenhum pedido na janela atual — impossível progredir (created_at_max não avança).'
      );
    }

    createdAtMax = lastOrderInWindow.created_at;
  }
}

/**
 * Decide se um pedido é "qualificado" para entrar na análise de co-compra: nunca
 * cancelado, e (quando `onlyPaid`) só pago. Um pedido não qualificado ainda é
 * persistido em `orders` (histórico completo) — só fica de fora de `order_items`, para
 * a análise nunca contar carrinho abandonado/cancelado como sinal de "compraram junto".
 * @param {object} order
 * @param {boolean} onlyPaid
 * @returns {boolean}
 */
export function isOrderQualified(order, onlyPaid) {
  if (order.status === 'cancelled') return false;
  return onlyPaid === false || order.payment_status === 'paid';
}

/**
 * Reduz `order.products[]` (1 linha por VARIANTE/item vendido) a 1 entrada por
 * `product_id` ÚNICO, somando `quantity` de linhas duplicadas do mesmo produto no
 * mesmo pedido — a análise de co-compra é por PRODUTO, não por variante (ex: a mesma
 * blusa em duas cores/tamanhos no mesmo pedido conta como 1 produto, quantidade
 * somada, nunca 2 linhas nem 2 pares distintos no cálculo de co-ocorrência).
 * @param {Array<object>} products `order.products` bruto da API
 * @returns {Array<{ productId: string, quantity: number }>}
 */
export function dedupeOrderProductsByProductId(products) {
  const quantityByProductId = new Map();
  for (const product of products || []) {
    const productId = String(product.product_id);
    const quantity = Number(product.quantity) || 0;
    quantityByProductId.set(productId, (quantityByProductId.get(productId) || 0) + quantity);
  }
  return Array.from(quantityByProductId, ([productId, quantity]) => ({ productId, quantity }));
}

/**
 * Orquestra uma execução completa de ingestão de pedidos: pagina TODOS os pedidos ->
 * filtra os qualificados para a análise de co-compra -> persiste tudo (orders para
 * TODOS, order_items só para os qualificados) em uma única transação. Garante que
 * `order_ingestion_runs.status` é sempre finalizado (success ou failed), nunca preso
 * em 'running' — mesma disciplina de `runIngestion` em ingest-catalog.js.
 * @param {{ onlyPaid?: boolean }} [params] `onlyPaid` (default true): exige
 *   `payment_status === 'paid'` além de não-cancelado para um pedido qualificar.
 *   `onlyPaid: false` afrouxa para "qualquer pedido não cancelado" (uso exploratório).
 * @returns {Promise<{ runId: number, ordersRead: number, ordersQualified: number, status: 'success'|'failed' }>}
 */
export async function runOrderIngestion({ onlyPaid = true } = {}) {
  const limiter = new AdaptiveRateLimiter();
  const runId = startOrderIngestionRun();

  let allOrders;
  try {
    allOrders = await listAllOrders(limiter);

    const orders = [];
    const items = [];
    let ordersQualified = 0;

    for (const order of allOrders) {
      const orderId = String(order.id);

      orders.push({
        id: orderId,
        status: order.status ?? null,
        paymentStatus: order.payment_status ?? null,
        createdAt: order.created_at ?? null,
        total: order.total ?? null,
      });

      if (!isOrderQualified(order, onlyPaid)) continue;

      ordersQualified += 1;
      for (const { productId, quantity } of dedupeOrderProductsByProductId(order.products)) {
        items.push({ orderId, productId, quantity });
      }
    }

    persistOrderBatch({ runId, orders, items });

    finishOrderIngestionRun({
      runId,
      status: 'success',
      ordersRead: allOrders.length,
      ordersQualified,
    });

    return { runId, ordersRead: allOrders.length, ordersQualified, status: 'success' };
  } catch (error) {
    // Mesma disciplina de WR-03 em ingest-catalog.js: registra a contagem real já lida
    // antes da exceção, em vez de sempre 0 — `allOrders` pode estar indefinido se a
    // exceção ocorreu durante a própria paginação (ainda antes do loop de persistência).
    finishOrderIngestionRun({
      runId,
      status: 'failed',
      ordersRead: allOrders ? allOrders.length : 0,
      ordersQualified: 0,
    });
    throw error;
  }
}
