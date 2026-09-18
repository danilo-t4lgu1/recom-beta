// GET /api/catalog-health
// Endpoint serverless para o monitor de saúde do catálogo (11 categorias) e disjuntor.

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

const { getLatestSnapshotProducts, listWriteLog, listDailyRecomputeLog } = await import(
  './_lib/catalog-store.js'
);
const { getCatalogHealth } = await import('./_lib/admin-intelligence.js');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    const health = getCatalogHealth({
      snapshotProducts: getLatestSnapshotProducts(),
      writeLogRows: listWriteLog(),
      dailyRecomputeLogRows: listDailyRecomputeLog(),
    });

    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300');
    res.status(200).json(health);
  } catch (err) {
    res.status(500).json({ error: 'Internal error loading catalog health', message: err.message });
  }
}
