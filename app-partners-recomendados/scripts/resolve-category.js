// Script executável de verificação manual — resolve o category_id real de uma
// categoria por nome (nunca hardcoded, D-01/D-02/Pitfall C) e lista a primeira página
// de produtos reais da categoria, provando a fatia vertical de leitura ponta a ponta
// contra a API real da Nuvemshop (PLAT-02).
//
// Uso: node --env-file=.env scripts/resolve-category.js [nomeCategoria]
// (default "Vestidos" se omitido)

import { listProducts } from '../src/nuvemshop-client/client.js';
import { AdaptiveRateLimiter } from '../src/rate-limit/adaptive-limiter.js';
import { resolveCategoryIdByName } from '../src/ingestion/ingest-catalog.js';

async function main() {
  const targetName = process.argv[2] || 'Vestidos';
  const limiter = new AdaptiveRateLimiter();

  console.log(`\n[1/2] Resolvendo category_id de "${targetName}" via GET /categories...`);
  // WR-05: reaproveita a mesma lógica de match de ingest-catalog.js — nunca
  // reimplementada aqui, para não divergir se a regra de match mudar.
  const category = await resolveCategoryIdByName(targetName, limiter);

  console.log(`  OK — category_id resolvido: ${category.id} (nome: "${category.name}")`);

  console.log(
    `\n[2/2] Listando primeira página de produtos da categoria ${category.id} (per_page=200)...`
  );
  const { products, hasNextPage } = await listProducts({
    categoryId: category.id,
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
