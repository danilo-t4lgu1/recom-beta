// GET /api/cron-log — relatório dia-a-dia do Card "Cron Diário" do Painel
// Administrativo do Recom (achado 2026-08-10). Mesmo padrão de dashboard.js:
// _lib/catalog-store.js e _data/catalog.db são vendorizados por
// scripts/prepare-admin-api.mjs; o filesystem do bundle é somente-leitura
// (exceto /tmp), então a cópia do banco é feita para /tmp uma vez por cold start.

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

const { listIngestionRuns, listWriteLog, listDailyRecomputeLog } = await import('./_lib/catalog-store.js');
const { buildCronLog } = await import('./_lib/admin-dashboard.js');
const { buildCronLogWorkbook } = await import('./_lib/admin-export.js');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    const rows = buildCronLog({
      ingestionRuns: listIngestionRuns(),
      writeLogRows: listWriteLog(),
      dailyRecomputeLogRows: listDailyRecomputeLog(),
    });
    if (req.query.format === 'xlsx') {
      const buffer = await buildCronLogWorkbook({ rows });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="log_cron.xlsx"');
      res.status(200).send(buffer);
      return;
    }
    res.status(200).json({ rows });
  } catch (err) {
    res.status(500).json({ error: 'Internal error building cron log' });
  }
}
