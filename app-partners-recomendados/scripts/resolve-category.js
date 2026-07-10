// Script executável de verificação manual — resolve o category_id real de uma
// categoria por nome (nunca hardcoded, D-01/D-02/Pitfall C) e lista a primeira página
// de produtos reais da categoria, provando a fatia vertical de leitura ponta a ponta
// contra a API real da Nuvemshop (PLAT-02).
//
// Uso: node --env-file=.env scripts/resolve-category.js [nomeCategoria]
// (default "Vestidos" se omitido)

import { listCategories, listProducts } from '../src/nuvemshop-client/client.js';
import { AdaptiveRateLimiter } from '../src/rate-limit/adaptive-limiter.js';

async function main() {
  const targetName = process.argv[2] || 'Vestidos';
  const limiter = new AdaptiveRateLimiter();

  console.log(`\n[1/2] Resolvendo category_id de "${targetName}" via GET /categories...`);
  const categories = await listCategories({ limiter });

  const normalizedTarget = targetName.trim().toLowerCase();
  const match = categories.find(
    (c) => (c.name?.pt || '').trim().toLowerCase() === normalizedTarget
  );

  if (!match) {
    throw new Error(
      `Categoria "${targetName}" não encontrada via GET /categories — confirme o nome exato no admin antes de prosseguir.`
    );
  }

  console.log(`  OK — category_id resolvido: ${match.id} (nome: "${match.name?.pt}")`);

  console.log(
    `\n[2/2] Listando primeira página de produtos da categoria ${match.id} (per_page=200)...`
  );
  const { products, hasNextPage } = await listProducts({
    categoryId: match.id,
    page: 1,
    perPage: 200,
    limiter,
  });

  console.log(`  OK — ${products.length} produtos retornados na primeira página.`);
  console.log(`  hasNextPage: ${hasNextPage}`);
}

main().catch((err) => {
  console.error('\nERRO ao resolver categoria/listar produtos:', err.message);
  process.exit(1);
});
