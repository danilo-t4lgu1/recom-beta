// GET /api/recommendations-inspect?productId=...
// Endpoint serverless para inspeção determinística ao vivo de recomendações por produto.

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

const { getLatestSnapshotProducts } = await import('./_lib/catalog-store.js');
const { inspectProductRecommendations } = await import('./_lib/admin-intelligence.js');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const productId = req.query.productId;
  if (!productId || typeof productId !== 'string') {
    res.status(400).json({ error: 'Missing required query parameter: productId' });
    return;
  }

  try {
    const result = inspectProductRecommendations({
      productId,
      snapshotProducts: getLatestSnapshotProducts(),
      maxRecommendations: 8,
    });

    if (result.notFound) {
      res.status(404).json({ error: 'Product not found in active snapshot', notFound: true });
      return;
    }

    res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=60');
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: 'Internal error inspecting recommendations', message: err.message });
  }
}
