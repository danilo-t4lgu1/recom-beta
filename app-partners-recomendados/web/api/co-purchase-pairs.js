// GET /api/co-purchase-pairs?page=1&limit=25&category=...&onlyInStock=true&sortBy=count
// Endpoint serverless para o Hub de Looks Comprovados (co-purchase intelligence).

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

const { getLatestSnapshotProducts, getAllCoPurchasePairs } = await import('./_lib/catalog-store.js');
const { getCoPurchasePairsReport } = await import('./_lib/admin-intelligence.js');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const category = typeof req.query.category === 'string' && req.query.category ? req.query.category : null;
    const onlyInStock = req.query.onlyInStock === 'true' || req.query.onlyInStock === '1';
    const sortBy = req.query.sortBy === 'count_asc' ? 'count_asc' : 'count';

    const report = getCoPurchasePairsReport({
      coPurchasePairs: getAllCoPurchasePairs(),
      snapshotProducts: getLatestSnapshotProducts(),
      page,
      limit,
      category,
      onlyInStock,
      sortBy,
    });

    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300');
    res.status(200).json(report);
  } catch (err) {
    res.status(500).json({ error: 'Internal error loading co-purchase pairs', message: err.message });
  }
}
