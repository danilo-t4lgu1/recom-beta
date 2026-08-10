// `npm run sync:admin-api` — vendoriza pra DENTRO de web/ (api/_lib, api/_data)
// os arquivos que web/api/dashboard.js precisa em runtime (lógica de leitura +
// o próprio catalog.db). Precisa ser um passo MANUAL/commitado, não um passo de
// build da Vercel: este projeto Vercel tem Root Directory =
// app-partners-recomendados/web, e a Vercel NÃO expõe arquivos fora da Root
// Directory durante o build — só o que já está commitado dentro de web/ existe
// no ambiente de build. Cópia verbatim (não reescreve import nem lógica) —
// catalog-store.js resolve schema.sql relativo a si mesmo (import.meta.url),
// então continua funcionando depois de copiado.
//
// Rodar de novo (e commitar o resultado) sempre que: (a) data/catalog.db for
// atualizado pelo job diário — ver .github/workflows/daily-recompute.yml, que
// roda isso automaticamente no mesmo commit-back; ou (b) catalog-store.js/
// schema.sql/admin-dashboard.js/admin-export.js mudarem de conteúdo.

import { copyFileSync, mkdirSync } from 'node:fs';
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
  [join(PROJECT_ROOT, 'data', 'catalog.db'), join(DATA_DIR, 'catalog.db')],
];

for (const [from, to] of files) {
  copyFileSync(from, to);
  console.log(`[prepare-admin-api] ${from} -> ${to}`);
}
