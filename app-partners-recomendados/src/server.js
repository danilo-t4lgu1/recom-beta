// Servidor HTTP mínimo (módulo `http` nativo do Node, sem framework) expondo
// GET /recommendations/:productId (PLAT-05). GET-only: qualquer outro método
// nessa rota retorna 405 Method Not Allowed, garantindo que o endpoint é
// genuinamente somente-leitura (V4 Access Control, ASVS L1).

import { createServer } from 'node:http';
import { getRecommendations } from './api/recommendations.js';

const PORT = process.env.PORT || 3000;

const RECOMMENDATIONS_PATH = /^\/recommendations\/([^/]+)\/?$/;

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const match = url.pathname.match(RECOMMENDATIONS_PATH);

  if (!match) {
    sendJson(res, 404, { error: 'Not found' });
    return;
  }

  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method Not Allowed' });
    return;
  }

  const productId = match[1];

  try {
    const result = await getRecommendations(productId);
    sendJson(res, 200, result);
  } catch (err) {
    sendJson(res, 500, { error: 'Internal error fetching recommendations' });
  }
});

server.listen(PORT, () => {
  console.log(`recommendations server listening on port ${PORT}`);
});

export default server;
