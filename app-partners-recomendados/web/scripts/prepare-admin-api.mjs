// `npm run sync:admin-api` — vendoriza pra DENTRO de web/ (api/_lib, api/_data)
// os arquivos que as rotas serverless do painel precisam em runtime (lógica de leitura +
// o próprio catalog.db). Precisa ser um passo MANUAL/commitado, não um passo de
// build da Vercel: este projeto Vercel tem Root Directory =
// app-partners-recomendados/web, e a Vercel NÃO expõe arquivos fora da Root
// Directory durante o build — só o que já está commitado dentro de web/ existe
// no ambiente de build.
//
// Rodar de novo (e commitar o resultado) sempre que: (a) data/catalog.db for
// atualizado pelo job diário — ver .github/workflows/daily-recompute.yml; ou
// (b) catalog-store.js/schema.sql/admin-dashboard.js/admin-intelligence.js/recommendation-engine.js mudarem.

import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = join(__dirname, '..');
const PROJECT_ROOT = join(WEB_ROOT, '..');

const LIB_DIR = join(WEB_ROOT, 'api', '_lib');
const DATA_DIR = join(WEB_ROOT, 'api', '_data');

mkdirSync(LIB_DIR, { recursive: true });
mkdirSync(DATA_DIR, { recursive: true });

const files = [
  [join(PROJECT_ROOT, 'src', 'db', 'catalog-store.js'), join(LIB_DIR, 'catalog-store.js')],
  [join(PROJECT_ROOT, 'src', 'db', 'schema.sql'), join(LIB_DIR, 'schema.sql')],
  [join(PROJECT_ROOT, 'src', 'api', 'admin-dashboard.js'), join(LIB_DIR, 'admin-dashboard.js')],
  [join(PROJECT_ROOT, 'src', 'api', 'admin-export.js'), join(LIB_DIR, 'admin-export.js')],
  [join(PROJECT_ROOT, 'src', 'recommendation', 'recommendation-engine.js'), join(LIB_DIR, 'recommendation-engine.js')],
  [join(PROJECT_ROOT, 'data', 'catalog.db'), join(DATA_DIR, 'catalog.db')],
];

for (const [from, to] of files) {
  copyFileSync(from, to);
  console.log(`[prepare-admin-api] ${from} -> ${to}`);
}

// Cópia de admin-intelligence com ajuste do caminho relativo para o recommendation-engine vendorizado em _lib
const intelSrcPath = join(PROJECT_ROOT, 'src', 'api', 'admin-intelligence.js');
const intelDestPath = join(LIB_DIR, 'admin-intelligence.js');
let intelContent = readFileSync(intelSrcPath, 'utf8');
intelContent = intelContent.replace(
  "from '../recommendation/recommendation-engine.js'",
  "from './recommendation-engine.js'"
);
writeFileSync(intelDestPath, intelContent);
console.log(`[prepare-admin-api] ${intelSrcPath} -> ${intelDestPath} (with adjusted imports)`);
