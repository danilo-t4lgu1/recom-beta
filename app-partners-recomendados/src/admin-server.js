// Servidor HTTP mínimo (módulo `http` nativo, sem framework, mesmo estilo de
// server.js/review-server.js) expondo GET /api/dashboard para o Painel
// Administrativo do Recom (React). Somente-leitura: nenhuma rota de escrita
// existe aqui — aprovação/rejeição/escrita continuam exclusivas do
// review-server.js. CORS restrito à origem do painel (ADMIN_PANEL_ORIGIN),
// mesma disciplina de api/recommendations/[productId].js.

import { createServer as createHttpServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import {
  getLatestSnapshotProducts,
  getLastWrittenValuesForAllProducts,
  getLastSuccessfulIngestionRunSummary,
  listIngestionRuns,
  listWriteLog,
  listDailyRecomputeLog,
} from './db/catalog-store.js';
import { buildAdminDashboard, buildFabricTagDetail, buildCronLog } from './api/admin-dashboard.js';
import { buildFabricTagWorkbook, buildCronLogWorkbook } from './api/admin-export.js';

const PORT = process.env.ADMIN_PORT || 3200;
const ADMIN_PANEL_ORIGIN = process.env.ADMIN_PANEL_ORIGIN || 'http://localhost:5174';

const DASHBOARD_PATH = /^\/api\/dashboard\/?$/;
const FABRIC_TAGS_PATH = /^\/api\/fabric-tags\/?$/;
const CRON_LOG_PATH = /^\/api\/cron-log\/?$/;

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': ADMIN_PANEL_ORIGIN,
  });
  res.end(body);
}

function sendXlsx(res, buffer, filename) {
  res.writeHead(200, {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Length': buffer.length,
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Access-Control-Allow-Origin': ADMIN_PANEL_ORIGIN,
  });
  res.end(buffer);
}

/**
 * Factory pura (nunca inicia servidor por efeito colateral de import, mesmo
 * padrão de review-server.js) — retorna uma instância `http.Server` SEM
 * chamar `.listen()`, testável em porta efêmera.
 * @returns {import('node:http').Server}
 */
export function createServer() {
  return createHttpServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': ADMIN_PANEL_ORIGIN,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
      });
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'Method Not Allowed' });
      return;
    }

    if (DASHBOARD_PATH.test(url.pathname)) {
      try {
        const dashboard = buildAdminDashboard({
          snapshotProducts: getLatestSnapshotProducts(),
          lastWrittenByProduct: getLastWrittenValuesForAllProducts(),
          lastRunSummary: getLastSuccessfulIngestionRunSummary(),
        });
        sendJson(res, 200, dashboard);
      } catch (err) {
        sendJson(res, 500, { error: 'Internal error building dashboard' });
      }
      return;
    }

    if (FABRIC_TAGS_PATH.test(url.pathname)) {
      try {
        const detail = buildFabricTagDetail({ snapshotProducts: getLatestSnapshotProducts() });
        if (url.searchParams.get('format') === 'xlsx') {
          const buffer = await buildFabricTagWorkbook({ rows: detail.rows });
          sendXlsx(res, buffer, 'catalogo_tags_tecidos.xlsx');
        } else {
          sendJson(res, 200, detail);
        }
      } catch (err) {
        sendJson(res, 500, { error: 'Internal error building fabric tag detail' });
      }
      return;
    }

    if (CRON_LOG_PATH.test(url.pathname)) {
      try {
        const log = buildCronLog({
          ingestionRuns: listIngestionRuns(),
          writeLogRows: listWriteLog(),
          dailyRecomputeLogRows: listDailyRecomputeLog(),
        });
        if (url.searchParams.get('format') === 'xlsx') {
          const buffer = await buildCronLogWorkbook({ rows: log });
          sendXlsx(res, buffer, 'log_cron.xlsx');
        } else {
          sendJson(res, 200, { rows: log });
        }
      } catch (err) {
        sendJson(res, 500, { error: 'Internal error building cron log' });
      }
      return;
    }

    sendJson(res, 404, { error: 'Not found' });
  });
}

// Só inicia um servidor real quando o módulo é executado diretamente (ex.:
// `node src/admin-server.js`) — importar este módulo em teste nunca sobe um
// servidor real nem ocupa uma porta (mesma convenção de review-server.js).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createServer();
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`admin server listening on http://127.0.0.1:${PORT}`);
  });
}
