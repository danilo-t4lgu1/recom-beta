// Testes de src/ingestion/ingest-catalog.js (RULE-01, D-33, Pitfall 1/Pitfall 3 do
// 03.1-RESEARCH.md).
//
// Primeiro teste automatizado deste arquivo. Mocka `../nuvemshop-client/client.js`
// inteiro (listCategories, listProducts, getMetafields) — nenhuma chamada de rede real
// nunca acontece aqui. Usa CATALOG_DB_DIR (seam de testabilidade do Plano 03.1-03) +
// vi.resetModules() + import dinâmico para isolar cada teste em um diretório SQLite
// temporário próprio, nunca tocando data/catalog.db real.
//
// Cobre os 5 comportamentos do bloco <behavior> do plano 03.1-04:
// Test 1: ingestão de UMA categoria (retrocompatível, categoryName) — categoryRaw/
//   productGroupCanonical extraídos e persistidos corretamente
// Test 2 (D-33, o mais importante): runIngestion({ categoryNames: [...] }) com produtos
//   diferentes por categoria — getLatestSnapshotProducts() retorna produtos de AMBAS as
//   categorias juntos, sob o MESMO run_id
// Test 3 (Pitfall 3): categoria de produto não mapeada nunca lança — productGroupCanonical
//   fica null, console.warn é chamado citando a categoria não mapeada
// Test 4: chamada antiga (categoryName, sem categoryNames) continua funcionando
// Test 5 (T-03.1-04): produto duplicado entre categorias mescladas é deduplicado — nenhuma
//   linha duplicada em products/variants para o mesmo product.id

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listCategories, listProducts, getMetafields } from '../nuvemshop-client/client.js';
import { resolveMinSizesInStock } from './ingest-catalog.js';

vi.mock('../nuvemshop-client/client.js', () => ({
  listCategories: vi.fn(),
  listProducts: vi.fn(),
  getMetafields: vi.fn(),
}));

// Categorias reais da loja (usadas para resolver o category_id via GET /categories,
// nunca hardcoded no ingest-catalog.js em si — só aqui no fixture do teste).
const STORE_CATEGORIES = [
  { id: 100, name: { pt: 'Vestidos' } },
  { id: 200, name: { pt: 'Blusas' } },
  { id: 300, name: { pt: 'Calças' } },
];

/**
 * Monta um produto mínimo e realista no shape da API pública Nuvemshop, com grade de
 * estoque disponível (>=3 tamanhos com estoque > 0, D-04) por padrão.
 */
function makeProduct({ id, categoryName, colorValue = 'Preto', tags = '' }) {
  return {
    id,
    name: { pt: `Produto ${id}` },
    handle: { pt: `produto-${id}` },
    canonical_url: `https://loja-talgui.example/produto-${id}`,
    tags,
    attributes: [{ pt: 'Cor' }, { pt: 'Tamanho' }],
    variants: [
      { id: `${id}-v1`, values: [{ pt: colorValue }, { pt: 'P' }], inventory_levels: [{ location_id: 'loc-1', stock: 5 }] },
      { id: `${id}-v2`, values: [{ pt: colorValue }, { pt: 'M' }], inventory_levels: [{ location_id: 'loc-1', stock: 5 }] },
      { id: `${id}-v3`, values: [{ pt: colorValue }, { pt: 'G' }], inventory_levels: [{ location_id: 'loc-1', stock: 5 }] },
    ],
    categories: [{ id: 999, name: { pt: categoryName } }],
  };
}

let tempDir;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'ingest-catalog-test-'));
  process.env.CATALOG_DB_DIR = tempDir;
  vi.resetModules();
  vi.clearAllMocks();
  listCategories.mockResolvedValue(STORE_CATEGORIES);
  getMetafields.mockResolvedValue([]);
});

afterEach(async () => {
  // Fecha o handle nativo do SQLite antes de remover o diretório temporário (mesma
  // necessidade documentada em catalog-store.test.js para o Windows).
  const store = await import('../db/catalog-store.js');
  store.closeDbForTests();
  delete process.env.CATALOG_DB_DIR;
  rmSync(tempDir, { recursive: true, force: true });
});

describe('ingest-catalog.js', () => {
  it('ingere UMA categoria (categoryName, retrocompatível) persistindo categoryRaw/productGroupCanonical corretos (Test 1)', async () => {
    const blusa1 = makeProduct({ id: 'blusa-1', categoryName: 'Blusas' });
    listProducts.mockImplementation(async ({ categoryId }) => {
      if (String(categoryId) === '200') return { products: [blusa1], hasNextPage: false };
      return { products: [], hasNextPage: false };
    });

    const { runIngestion } = await import('./ingest-catalog.js');
    const result = await runIngestion({ categoryName: 'Blusas' });

    expect(result.status).toBe('success');
    expect(result.productsRead).toBe(1);

    const { getLatestSnapshotProducts } = await import('../db/catalog-store.js');
    const rows = getLatestSnapshotProducts();
    const found = rows.find((row) => row.productId === 'blusa-1');
    expect(found).toBeDefined();
    expect(found.productGroupCanonical).toBe('Partes de Cima');
  });

  it('runIngestion({ categoryNames }) mescla DUAS categorias sob o MESMO run_id — getLatestSnapshotProducts() retorna produtos de ambas juntos (Test 2, D-33)', async () => {
    const blusa1 = makeProduct({ id: 'blusa-1', categoryName: 'Blusas' });
    const calca1 = makeProduct({ id: 'calca-1', categoryName: 'Calças' });
    listProducts.mockImplementation(async ({ categoryId }) => {
      if (String(categoryId) === '200') return { products: [blusa1], hasNextPage: false };
      if (String(categoryId) === '300') return { products: [calca1], hasNextPage: false };
      return { products: [], hasNextPage: false };
    });

    const { runIngestion } = await import('./ingest-catalog.js');
    const result = await runIngestion({ categoryNames: ['Blusas', 'Calças'] });

    expect(result.status).toBe('success');
    expect(result.productsRead).toBe(2);

    const { getLatestSnapshotProducts } = await import('../db/catalog-store.js');
    const rows = getLatestSnapshotProducts();
    const ids = rows.map((row) => row.productId);
    expect(ids).toContain('blusa-1');
    expect(ids).toContain('calca-1');

    const blusaRow = rows.find((row) => row.productId === 'blusa-1');
    const calcaRow = rows.find((row) => row.productId === 'calca-1');
    expect(blusaRow.productGroupCanonical).toBe('Partes de Cima');
    expect(calcaRow.productGroupCanonical).toBe('Partes de Baixo');
  });

  it('categoria de produto não mapeada nunca lança — productGroupCanonical fica null e console.warn é chamado (Test 3, Pitfall 3)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const acessorio1 = makeProduct({ id: 'acessorio-1', categoryName: 'Acessórios' });
    listProducts.mockImplementation(async ({ categoryId }) => {
      if (String(categoryId) === '200') return { products: [acessorio1], hasNextPage: false };
      return { products: [], hasNextPage: false };
    });

    const { runIngestion } = await import('./ingest-catalog.js');

    await expect(runIngestion({ categoryName: 'Blusas' })).resolves.toMatchObject({ status: 'success' });

    const { getLatestSnapshotProducts } = await import('../db/catalog-store.js');
    const rows = getLatestSnapshotProducts();
    const found = rows.find((row) => row.productId === 'acessorio-1');
    expect(found).toBeDefined();
    expect(found.productGroupCanonical).toBeNull();

    const warnedAboutAcessorios = warnSpy.mock.calls.some((call) =>
      call.some((arg) => typeof arg === 'string' && arg.includes('Acessórios'))
    );
    expect(warnedAboutAcessorios).toBe(true);

    warnSpy.mockRestore();
  });

  it('chamada antiga (categoryName, sem categoryNames) continua funcionando exatamente como antes (Test 4, retrocompatibilidade)', async () => {
    const vestido1 = makeProduct({ id: 'vestido-1', categoryName: 'Vestidos' });
    listProducts.mockImplementation(async ({ categoryId }) => {
      if (String(categoryId) === '100') return { products: [vestido1], hasNextPage: false };
      return { products: [], hasNextPage: false };
    });

    const { runIngestion } = await import('./ingest-catalog.js');
    const result = await runIngestion({ categoryName: 'Vestidos' });

    expect(result.status).toBe('success');
    expect(result.productsRead).toBe(1);
    expect(result).toHaveProperty('unmappedTagCount');
    expect(result).toHaveProperty('unmappedCategoryCount');

    const { getLatestSnapshotProducts } = await import('../db/catalog-store.js');
    const rows = getLatestSnapshotProducts();
    const found = rows.find((row) => row.productId === 'vestido-1');
    expect(found).toBeDefined();
    expect(found.productGroupCanonical).toBe('Look Inteiro');
  });

  it('produto duplicado entre categorias mescladas é deduplicado — nenhuma linha duplicada por product.id (Test 5, T-03.1-04)', async () => {
    const shared = makeProduct({ id: 'shared-1', categoryName: 'Blusas' });
    const blusaOnly = makeProduct({ id: 'blusa-only', categoryName: 'Blusas' });
    const calcaOnly = makeProduct({ id: 'calca-only', categoryName: 'Calças' });
    listProducts.mockImplementation(async ({ categoryId }) => {
      if (String(categoryId) === '200') return { products: [shared, blusaOnly], hasNextPage: false };
      if (String(categoryId) === '300') return { products: [shared, calcaOnly], hasNextPage: false };
      return { products: [], hasNextPage: false };
    });

    const { runIngestion } = await import('./ingest-catalog.js');
    const result = await runIngestion({ categoryNames: ['Blusas', 'Calças'] });

    expect(result.status).toBe('success');
    expect(result.productsRead).toBe(3); // shared-1 + blusa-only + calca-only, nunca 4

    const { getLatestSnapshotProducts } = await import('../db/catalog-store.js');
    const rows = getLatestSnapshotProducts();
    const sharedRows = rows.filter((row) => row.productId === 'shared-1');
    expect(sharedRows.length).toBe(1);
  });
});

describe('resolveMinSizesInStock (toggle de liquidação, override 2026-07-17)', () => {
  it('default 3 quando o ambiente está ausente/vazio/inválido (regra original D-04)', () => {
    expect(resolveMinSizesInStock(undefined)).toBe(3);
    expect(resolveMinSizesInStock('')).toBe(3);
    expect(resolveMinSizesInStock('abc')).toBe(3);
    expect(resolveMinSizesInStock('0')).toBe(3); // < 1 cai no default seguro
    expect(resolveMinSizesInStock('-2')).toBe(3);
  });

  it('afrouxa para o valor do ambiente quando é inteiro >= 1', () => {
    expect(resolveMinSizesInStock('1')).toBe(1); // modo liquidação: qualquer tamanho com estoque
    expect(resolveMinSizesInStock('2')).toBe(2);
    expect(resolveMinSizesInStock('3')).toBe(3);
    expect(resolveMinSizesInStock('5')).toBe(5);
  });
});
