// Servidor HTTP de revisão humana (APRV-01/APRV-02) — `node:http` nativo, processo
// e PORTA PRÓPRIA, SEPARADOS do `server.js` público (PLAT-05). Anti-Pattern
// explícita do `04-RESEARCH.md`: "misturar as rotas mutantes do painel de revisão
// no mesmo server.js/porta que serve o endpoint público PLAT-05 aumenta a
// superfície de risco do endpoint público (hoje GET-only e sem auth por design,
// servindo o storefront) sem necessidade — o painel é ferramenta interna local
// (Claude's Discretion do CONTEXT.md), deve viver em processo/porta separados."
//
// Este arquivo (Plano 04-04) entrega só GET /review e GET /review/:productId
// (leitura). Os formulários de "Aprovar"/"Rejeitar"/"Remover" já são renderizados
// com os nomes de campo/action corretos (POST /review/:productId/approve,
// POST /review/:productId/reject) para que o Plano 04-05 só precise ADICIONAR os
// handlers dessas rotas, nunca alterar HTML já escrito.

import { createServer as createHttpServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import {
  getLatestSnapshotProducts,
  getLatestSuccessfulRunId,
  getBaselineForRun,
  getApprovalDecision,
  upsertApprovalDecision,
} from './db/catalog-store.js';
import { buildReviewQueue } from './review/review-queue.js';
import { computeDiff } from './review/diff.js';
import { assertApproved, ApprovalRequiredError } from './review/approval-gate.js';
import { executeApprovedWrite } from './review/write-executor.js';

// REVIEW_PORT: porta própria, NUNCA a porta 3000 padrão de server.js (PLAT-05).
const PORT = process.env.REVIEW_PORT || 3100;

// DRY_RUN_MODE (Pattern 4 do 04-RESEARCH.md): a camada HTTP resolve o valor de
// env UMA VEZ no carregamento do módulo, nunca dentro de uma função de request —
// o valor já resolvido é o que threading para o banner e (Plano 04-05) para o
// default de `?dryRun=`.
const DRY_RUN_MODE = process.env.DRY_RUN !== 'false';

const QUEUE_PATH = /^\/review\/?$/;
const PRODUCT_REVIEW_PATH = /^\/review\/([^/]+)\/?$/;
const APPROVE_PATH = /^\/review\/([^/]+)\/approve\/?$/;
const REJECT_PATH = /^\/review\/([^/]+)\/reject\/?$/;
const WRITE_PATH = /^\/review\/([^/]+)\/write\/?$/;

// Teto explícito antes de acumular o corpo da requisição em memória (T-04-07,
// Pitfall 6 do RESEARCH) — nunca esperar `req.on('end')` para descobrir que o
// corpo era grande demais.
const MAX_BODY_BYTES = 10_000;

/**
 * Erro interno (nunca exportado) — só serve para distinguir o caso 413 dentro
 * deste arquivo, do mesmo jeito que `ApprovalRequiredError` distingue 409.
 */
class BodyTooLargeError extends Error {}

const HTML_ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Escapa `& < > " '` antes de qualquer interpolação em HTML (V5/XSS). Aplicar a
 * TODO valor dinâmico (nome de produto, colorValue, fabricTagCanonical) antes de
 * interpolar em template string de HTML — nunca confiar que dado vindo do
 * catálogo (originado da API externa) é seguro.
 * @param {*} value
 * @returns {string}
 */
export function escapeHtml(value) {
  if (value == null) return '';
  return String(value).replace(/[&<>"']/g, (char) => HTML_ESCAPE_MAP[char]);
}

/**
 * Resposta HTML com `Content-Type`/`Content-Length` corretos — mesmo padrão de
 * `sendJson` em `server.js`, adaptado para HTML.
 * @param {import('node:http').ServerResponse} res
 * @param {number} statusCode
 * @param {string} html
 */
function sendHtml(res, statusCode, html) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(html),
  });
  res.end(html);
}

/**
 * Resposta JSON com `Content-Type`/`Content-Length` corretos — mesmo padrão
 * de `server.js` (rota pública PLAT-05), usado pela rota `/write` (endpoint
 * machine-facing desta fase).
 * @param {import('node:http').ServerResponse} res
 * @param {number} statusCode
 * @param {object} payload
 */
function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

/**
 * Acumula o corpo bruto da requisição com um teto explícito de bytes (T-04-07,
 * Pitfall 6 do RESEARCH) — ao exceder `MAX_BODY_BYTES`, rejeita IMEDIATAMENTE
 * com `BodyTooLargeError` e chama `req.destroy()`, nunca continuando a
 * acumular o restante do corpo em memória.
 * @param {import('node:http').IncomingMessage} req
 * @returns {Promise<string>}
 */
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let bytes = 0;
    let tooLarge = false;
    const chunks = [];

    req.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        // Nunca continuar acumulando (Pitfall 6/T-04-07): a partir daqui o
        // chunk é descartado, não empilhado em `chunks`, então o corpo real
        // nunca cresce em memória além de ~MAX_BODY_BYTES mesmo que o
        // cliente continue enviando dados. Deliberadamente NÃO chamamos
        // `req.destroy()` aqui — isso derrubaria o socket compartilhado
        // pela resposta antes do 413 poder ser escrito (Rule 1: o
        // `req.destroy()` sugerido verbatim no RESEARCH mataria a conexão
        // antes de qualquer `res.write`); a rejeição real acontece em
        // `req.on('end', ...)`, depois que a conexão drenou naturalmente.
        tooLarge = true;
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (tooLarge) {
        reject(new BodyTooLargeError('Corpo da requisição excede o limite permitido'));
        return;
      }
      resolve(Buffer.concat(chunks).toString('utf-8'));
    });

    req.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Extrai `removedIds` do corpo de `POST /review/:productId/approve` — o
 * ÚNICO campo aceito do corpo desta rota. Nunca existe um caminho de código
 * que leia um campo "approvedIds"/"ids aprovados" direto do cliente (ver
 * `<objective>` do Plano 04-05 para a justificativa de segurança/D-19/D-20):
 * o conjunto final aprovado é SEMPRE recomputado no servidor via
 * `computeDiff`, nunca aceito literalmente do corpo da requisição.
 * @param {string} rawBody
 * @param {string|undefined} contentType
 * @returns {string[]}
 */
function parseRemovedIds(rawBody, contentType) {
  let raw;

  if (contentType && contentType.includes('application/json')) {
    const parsed = rawBody ? JSON.parse(rawBody) : {};
    raw = parsed.removedIds;
  } else {
    const params = new URLSearchParams(rawBody);
    raw = params.get('removedIds');
  }

  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string') {
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

// Tokens visuais LITERAIS do 04-UI-SPEC.md — cores, tipografia, espaçamento.
const PAGE_STYLE = `
  :root {
    --color-bg: #FFFFFF;
    --color-secondary: #F5F5F5;
    --color-accent: #2563EB;
    --color-destructive: #DC2626;
    --color-neutral: #6B7280;
    --space-xs: 4px;
    --space-sm: 8px;
    --space-md: 16px;
    --space-lg: 24px;
    --space-xl: 32px;
    --space-2xl: 48px;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--color-bg);
    color: #111827;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 16px;
    font-weight: 400;
    line-height: 1.5;
  }
  .page-container { padding: var(--space-lg); max-width: 960px; margin: 0 auto; }
  .display { font-size: 28px; font-weight: 600; line-height: 1.2; margin: 0 0 var(--space-xl) 0; }
  .heading { font-size: 20px; font-weight: 600; line-height: 1.2; margin: 0 0 var(--space-md) 0; }
  .label { font-size: 14px; font-weight: 600; line-height: 1.2; }
  .dry-run-banner {
    background: var(--color-secondary);
    color: #111827;
    font-size: 14px;
    font-weight: 600;
    line-height: 1.2;
    padding: var(--space-md);
    margin-bottom: var(--space-xl);
    border-left: 4px solid var(--color-accent);
  }
  .empty-state { margin-top: var(--space-2xl); margin-bottom: var(--space-2xl); }
  .empty-state .empty-body { font-size: 16px; font-weight: 400; line-height: 1.5; color: #111827; }
  table.queue-table { width: 100%; border-collapse: collapse; }
  table.queue-table th { text-align: left; font-size: 14px; font-weight: 600; line-height: 1.2; background: var(--color-secondary); padding: var(--space-sm) var(--space-md); }
  table.queue-table td { padding: var(--space-sm) var(--space-md); border-bottom: 1px solid var(--color-secondary); }
  table.queue-table tr:nth-child(even) td { background: var(--color-secondary); }
  a.link-revisar { color: var(--color-accent); font-weight: 600; text-decoration: none; }
  a.link-revisar:focus { outline: 2px solid var(--color-accent); }
  .diff-columns { display: flex; gap: var(--space-lg); }
  .diff-column { flex: 1; }
  .diff-card {
    background: var(--color-secondary);
    padding: var(--space-md);
    margin-bottom: var(--space-md);
    border-left: 4px solid transparent;
  }
  .diff-card.added { border-left-color: var(--color-accent); }
  .diff-card.removed { border-left-color: var(--color-destructive); }
  .diff-card .item-meta { font-size: 16px; font-weight: 400; line-height: 1.5; margin-top: var(--space-xs); }
  .badge {
    display: inline-block;
    font-size: 14px;
    font-weight: 600;
    line-height: 1.2;
    padding: 2px var(--space-sm);
    border-radius: 4px;
    margin-left: var(--space-xs);
  }
  .badge-added { color: var(--color-accent); border: 1px solid var(--color-accent); }
  .badge-removed { color: var(--color-destructive); border: 1px solid var(--color-destructive); }
  .badge-kept { color: var(--color-neutral); border: 1px solid var(--color-neutral); }
  .actions-row { margin-top: var(--space-xl); display: flex; gap: var(--space-sm); }
  .btn { font-size: 14px; font-weight: 600; line-height: 1.2; padding: var(--space-sm) var(--space-md); border: none; cursor: pointer; }
  .btn:focus { outline: 2px solid var(--color-accent); }
  .btn-accent { background: var(--color-accent); color: #FFFFFF; }
  .btn-destructive { background: var(--color-destructive); color: #FFFFFF; }
  .remove-form { display: inline; margin-left: var(--space-sm); }
`;

/**
 * Monta o HTML completo da página (`<!DOCTYPE html>`, `<head>` com `<style>`
 * literal per 04-UI-SPEC.md, `<body>` com banner de dry-run quando
 * `DRY_RUN_MODE` for `true`) envolvendo `bodyHtml`.
 * @param {string} title
 * @param {string} bodyHtml
 * @returns {string}
 */
function renderPage(title, bodyHtml) {
  const banner = DRY_RUN_MODE
    ? `<div class="dry-run-banner">Modo simulação ativo — nenhuma escrita real será feita na loja.</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>${PAGE_STYLE}</style>
</head>
<body>
  <div class="page-container">
    ${banner}
    ${bodyHtml}
  </div>
</body>
</html>`;
}

/**
 * Renderiza a fila de revisão (D-22): estado vazio exato do UI-SPEC quando
 * `queueEntries` está vazio, ou uma tabela com um link "Revisar" por entrada.
 * @param {Array<{ productId: string, name: string|null, beforeIds: string[], afterIds: string[] }>} queueEntries
 * @returns {string}
 */
function renderQueuePage(queueEntries) {
  if (!queueEntries || queueEntries.length === 0) {
    return renderPage(
      'Fila de Revisão',
      `<div class="empty-state">
        <div class="display">Nada para revisar agora</div>
        <div class="empty-body">Nenhum produto tem uma proposta de recomendação diferente do estado atual. Isso é esperado enquanto as tags de tecido do catálogo ainda não foram preenchidas — volte depois da próxima ingestão.</div>
      </div>`
    );
  }

  const rows = queueEntries
    .map(
      (entry) => `<tr>
        <td>${escapeHtml(entry.name || entry.productId)}</td>
        <td><a class="link-revisar" href="/review/${escapeHtml(entry.productId)}">Revisar</a></td>
      </tr>`
    )
    .join('');

  return renderPage(
    'Fila de Revisão',
    `<div class="display">Fila de Revisão</div>
    <table class="queue-table">
      <thead><tr><th>Produto</th><th>Ação</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`
  );
}

/**
 * Corpo simples para a resposta 404 de um productId inexistente no catálogo.
 * @param {string} productId
 * @returns {string}
 */
function renderProductNotFoundPage(productId) {
  return renderPage(
    'Produto não encontrado',
    `<div class="heading">Produto não encontrado</div>
    <div>Nenhum produto com id ${escapeHtml(productId)} foi encontrado no catálogo.</div>`
  );
}

/**
 * Renderiza o diff antes/depois de um produto (D-19 a D-23, SC#1): colunas
 * separadas "Antes" e "Depois", badges Adicionado/Removido/Mantido, e os
 * formulários de curadoria (Remover) e aprovação/rejeição (Plano 04-05 adiciona
 * os handlers, nunca precisa alterar este HTML).
 * @param {{ product: object, diff: object, catalogProducts: Array<object>, removedIds: string[] }} params
 * @returns {string}
 */
function renderDiffPage({ product, diff, catalogProducts, removedIds }) {
  const catalog = Array.isArray(catalogProducts) ? catalogProducts : [];
  const productsById = new Map(catalog.map((p) => [String(p.productId), p]));
  const afterSet = new Set(diff.afterIds);
  const removedIdsCsv = (removedIds || []).join(',');

  const beforeRows = diff.beforeIds
    .map((id) => {
      const found = productsById.get(id);
      const name = found ? found.name : null;
      const isRemovedFromAfter = !afterSet.has(id);
      const badge = isRemovedFromAfter
        ? '<span class="badge badge-removed">Removido</span>'
        : '';
      return `<div class="diff-card${isRemovedFromAfter ? ' removed' : ''}">
        <div class="item-meta">${escapeHtml(name || id)} (${escapeHtml(id)})${badge}</div>
      </div>`;
    })
    .join('');

  const afterItems = diff.items.filter((item) => item.status !== 'removed');

  const afterRows = afterItems
    .map((item) => {
      const badgeClass = item.status === 'added' ? 'badge-added' : 'badge-kept';
      const badgeLabel = item.status === 'added' ? 'Adicionado' : 'Mantido';
      const rec = item.recommendation;
      const metaParts = [];
      if (rec) {
        if (rec.colorValue != null) metaParts.push(`Cor: ${escapeHtml(rec.colorValue)}`);
        if (rec.fabricTagCanonical != null) {
          metaParts.push(`Tecido: ${escapeHtml(rec.fabricTagCanonical)}`);
        }
        metaParts.push(`Estoque: ${escapeHtml(rec.stockTotal)}`);
      }
      const meta = metaParts.length > 0 ? `<div class="item-meta">${metaParts.join(' · ')}</div>` : '';
      const nextRemovedIds = [...(removedIds || []), item.productId].join(',');

      return `<div class="diff-card${item.status === 'added' ? ' added' : ''}">
        <div class="item-meta">${escapeHtml(item.productId)}<span class="badge ${badgeClass}">${badgeLabel}</span></div>
        ${meta}
        <form class="remove-form" method="GET" action="/review/${escapeHtml(product.productId)}">
          <input type="hidden" name="removedIds" value="${escapeHtml(nextRemovedIds)}">
          <button type="submit" class="btn btn-destructive">Remover</button>
        </form>
      </div>`;
    })
    .join('');

  return `<div class="display">Revisão: ${escapeHtml(product.name || product.productId)}</div>
    <div class="diff-columns">
      <div class="diff-column">
        <div class="heading">Antes</div>
        ${beforeRows || '<div class="item-meta">Nenhum item.</div>'}
      </div>
      <div class="diff-column">
        <div class="heading">Depois</div>
        ${afterRows || '<div class="item-meta">Nenhum item.</div>'}
      </div>
    </div>
    <div class="actions-row">
      <form method="POST" action="/review/${escapeHtml(product.productId)}/approve">
        <input type="hidden" name="removedIds" value="${escapeHtml(removedIdsCsv)}">
        <button type="submit" class="btn btn-accent">Aprovar recomendações</button>
      </form>
      <form method="POST" action="/review/${escapeHtml(product.productId)}/reject">
        <button type="submit" class="btn btn-destructive">Rejeitar produto</button>
      </form>
    </div>`;
}

/**
 * Factory pura (nunca inicia servidor por efeito colateral de import) — retorna
 * uma instância `http.Server` SEM chamar `.listen()`, testável em porta efêmera.
 * @returns {import('node:http').Server}
 */
export function createServer() {
  return createHttpServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

      const approveMatch = url.pathname.match(APPROVE_PATH);
      if (approveMatch) {
        if (req.method !== 'POST') {
          sendHtml(res, 405, renderPage('Método não permitido', '<div>Método não permitido.</div>'));
          return;
        }

        const productId = decodeURIComponent(approveMatch[1]);

        let rawBody;
        try {
          rawBody = await readRawBody(req);
        } catch (err) {
          if (err instanceof BodyTooLargeError) {
            sendJson(res, 413, { error: 'Corpo da requisição excede o limite permitido' });
            return;
          }
          throw err;
        }

        let removedIds;
        try {
          removedIds = parseRemovedIds(rawBody, req.headers['content-type']);
        } catch (err) {
          sendJson(res, 400, { error: 'Corpo da requisição inválido' });
          return;
        }

        const catalogProducts = getLatestSnapshotProducts();
        const product = catalogProducts.find((p) => String(p.productId) === productId);

        if (!product) {
          sendHtml(res, 404, renderProductNotFoundPage(productId));
          return;
        }

        const runId = getLatestSuccessfulRunId();
        const baselineMap = getBaselineForRun({ runId });
        const baselineValue = baselineMap.has(productId) ? baselineMap.get(productId) : null;
        const beforeIds = baselineValue != null ? [String(baselineValue)] : [];

        const diff = computeDiff(productId, catalogProducts, beforeIds, { removedIds });

        upsertApprovalDecision({
          productId,
          runId,
          status: 'approved',
          approvedRecommendationIds: diff.afterIds,
          decidedAt: new Date().toISOString(),
        });

        res.writeHead(303, { Location: '/review' });
        res.end();
        return;
      }

      const rejectMatch = url.pathname.match(REJECT_PATH);
      if (rejectMatch) {
        if (req.method !== 'POST') {
          sendHtml(res, 405, renderPage('Método não permitido', '<div>Método não permitido.</div>'));
          return;
        }

        const productId = decodeURIComponent(rejectMatch[1]);

        // Drena a conexão e ignora o conteúdo/erro — nada do corpo é
        // necessário para rejeitar (rejeitar não precisa de removedIds).
        await readRawBody(req).catch(() => {});

        const runId = getLatestSuccessfulRunId();
        upsertApprovalDecision({
          productId,
          runId,
          status: 'rejected',
          approvedRecommendationIds: null,
          decidedAt: new Date().toISOString(),
        });

        res.writeHead(303, { Location: '/review' });
        res.end();
        return;
      }

      const writeMatch = url.pathname.match(WRITE_PATH);
      if (writeMatch) {
        if (req.method !== 'POST') {
          sendHtml(res, 405, renderPage('Método não permitido', '<div>Método não permitido.</div>'));
          return;
        }

        const productId = decodeURIComponent(writeMatch[1]);

        // Drena a conexão e ignora o conteúdo/erro — a rota /write não lê
        // nada do corpo, só da query string (?dryRun=).
        await readRawBody(req).catch(() => {});

        const dryRunParam = url.searchParams.get('dryRun');
        const dryRun = dryRunParam != null ? dryRunParam !== 'false' : DRY_RUN_MODE;

        const runId = getLatestSuccessfulRunId();
        const decision = runId != null ? getApprovalDecision({ productId, runId }) : null;

        try {
          const result = executeApprovedWrite({ productId, decision, dryRun });
          sendJson(res, 200, result);
        } catch (err) {
          if (err instanceof ApprovalRequiredError) {
            sendJson(res, 409, { error: err.message });
            return;
          }
          sendJson(res, 500, { error: 'Internal error' });
        }
        return;
      }

      if (QUEUE_PATH.test(url.pathname)) {
        if (req.method !== 'GET') {
          sendHtml(res, 405, renderPage('Método não permitido', '<div>Método não permitido.</div>'));
          return;
        }

        const catalogProducts = getLatestSnapshotProducts();
        const runId = getLatestSuccessfulRunId();
        const baselineMap = getBaselineForRun({ runId });
        const queue = buildReviewQueue(catalogProducts, baselineMap);
        sendHtml(res, 200, renderQueuePage(queue));
        return;
      }

      const productMatch = url.pathname.match(PRODUCT_REVIEW_PATH);
      if (productMatch) {
        if (req.method !== 'GET') {
          sendHtml(res, 405, renderPage('Método não permitido', '<div>Método não permitido.</div>'));
          return;
        }

        const productId = decodeURIComponent(productMatch[1]);
        const catalogProducts = getLatestSnapshotProducts();
        const product = catalogProducts.find((p) => String(p.productId) === productId);

        if (!product) {
          sendHtml(res, 404, renderProductNotFoundPage(productId));
          return;
        }

        const removedIds = (url.searchParams.get('removedIds') || '')
          .split(',')
          .filter(Boolean);

        const runId = getLatestSuccessfulRunId();
        const baselineMap = getBaselineForRun({ runId });
        const baselineValue = baselineMap.has(productId) ? baselineMap.get(productId) : null;
        const beforeIds = baselineValue != null ? [String(baselineValue)] : [];

        const diff = computeDiff(productId, catalogProducts, beforeIds, { removedIds });

        sendHtml(
          res,
          200,
          renderPage(
            `Revisão: ${product.name || product.productId}`,
            renderDiffPage({ product, diff, catalogProducts, removedIds })
          )
        );
        return;
      }

      sendHtml(res, 404, renderPage('Não encontrado', '<div>Página não encontrada.</div>'));
    } catch (err) {
      sendHtml(res, 500, renderPage('Erro interno', '<div>Erro interno ao processar a requisição.</div>'));
    }
  });
}

// Idioma ESM padrão: só inicia um servidor real quando o módulo é executado
// diretamente (ex.: `node src/review-server.js`) — importar este módulo em teste
// NUNCA sobe um servidor real nem ocupa uma porta.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createServer();
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`review server listening on http://127.0.0.1:${PORT}`);
  });
}
