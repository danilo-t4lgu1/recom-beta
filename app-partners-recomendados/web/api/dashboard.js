// GET /api/dashboard — Painel Administrativo do Recom. Serverless function do
// projeto Vercel SEPARADO do endpoint público de recomendações (a proteção
// Vercel Authentication liga só neste projeto; o endpoint público que o
// storefront consome ao vivo continua sem login em outro projeto, intocado).
//
// _lib/catalog-store.js e _data/catalog.db são vendorizados no build por
// scripts/prepare-admin-api.mjs (ver esse arquivo para o porquê). O filesystem
// do bundle da função é somente-leitura (exceto /tmp) — catalog-store.js abre o
// banco em leitura-escrita (WAL + migração idempotente), então a cópia é feita
// para /tmp uma vez por cold start antes de importar o módulo.

import { existsSync, copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMP_DB_DIR = '/tmp/recom-admin-db';

function ensureWritableDbCopy() {
  mkdirSync(TMP_DB_DIR, { recursive: true });
  const dest = join(TMP_DB_DIR, 'catalog.db');
  if (!existsSync(dest)) {
    copyFileSync(join(__dirname, '_data', 'catalog.db'), dest);
  }
  process.env.CATALOG_DB_DIR = TMP_DB_DIR;
}

ensureWritableDbCopy();

const { getLatestSnapshotProducts, getLastWrittenValuesForAllProducts, getLastSuccessfulIngestionRunSummary } =
  await import('./_lib/catalog-store.js');
const { buildAdminDashboard } = await import('./_lib/admin-dashboard.js');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    const dashboard = buildAdminDashboard({
      snapshotProducts: getLatestSnapshotProducts(),
      lastWrittenByProduct: getLastWrittenValuesForAllProducts(),
      lastRunSummary: getLastSuccessfulIngestionRunSummary(),
    });
    res.status(200).json(dashboard);
  } catch (err) {
    res.status(500).json({ error: 'Internal error building dashboard' });
  }
}
