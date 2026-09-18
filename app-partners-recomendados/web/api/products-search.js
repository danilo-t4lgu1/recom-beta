// GET /api/products-search?q=...&limit=...
// Endpoint serverless para busca e autocomplete de produtos no catálogo ativo.

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
const { searchCatalogProducts } = await import('./_lib/admin-intelligence.js');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    const query = typeof req.query.q === 'string' ? req.query.q : '';
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));

    const products = searchCatalogProducts({
      snapshotProducts: getLatestSnapshotProducts(),
      query,
      limit,
    });

    res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=120');
    res.status(200).json({ products, count: products.length });
  } catch (err) {
    res.status(500).json({ error: 'Internal error searching catalog products', message: err.message });
  }
}
