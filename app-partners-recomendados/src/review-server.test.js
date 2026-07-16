// Testes de integração de src/review-server.js (APRV-01/APRV-02, T-04-06,
// T-04-08a, T-04-07b) via fetch() nativo contra porta efêmera — primeira suíte de
// integração HTTP do projeto (04-RESEARCH.md `## Code Examples`).
//
// Isolamento de banco: mesmo padrão de catalog-store.test.js — CATALOG_DB_DIR
// aponta para um diretório temporário NOVO por teste, vi.resetModules() +
// import() dinâmico de ambos os módulos (catalog-store.js e review-server.js)
// depois de setar a env var, closeDbForTests() + rmSync no afterEach (Windows
// EPERM). Nunca toca data/catalog.db real.
//
// Cobre os 8 comportamentos do bloco <behavior> do plano 04-04:
// Test 1: GET /review sem run de ingestão → 200, "Nada para revisar agora"
// Test 2: POST /review → 405
// Test 3: fixture com 2 produtos Look Inteiro (mesma cor/tecido/grupo,
//   hasAvailableGrade true) + baseline vazio para o produto-fonte → GET /review
//   200 com link Revisar para o produto-fonte
// Test 4: GET /review/:productId do produto-fonte → 200, seções "Antes"/"Depois",
//   candidato com badge "Adicionado" (baseline vazio, D-23)
// Test 5: nome de produto com <script>alert(1)</script> nunca aparece cru no HTML
// Test 6: GET /review/999999999 (inexistente) → 404
// Test 7: POST /review/:productId (válido) → 405
// Test 8: GET /review/:productId?removedIds={idDoCandidato} → candidato removido
//   não aparece mais em "Depois"

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let tempDir;
let store;
let reviewServer;
let server;
let baseUrl;

beforeEach(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'review-server-test-'));
  process.env.CATALOG_DB_DIR = tempDir;
  vi.resetModules();

  store = await import('./db/catalog-store.js');
  reviewServer = await import('./review-server.js');

  server = reviewServer.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
  store.closeDbForTests();
  delete process.env.CATALOG_DB_DIR;
  rmSync(tempDir, { recursive: true, force: true });
});

/**
 * Fixture in-file (nunca lê o dump real, mesma disciplina de
 * recommendation-engine.test.js): 2 produtos Look Inteiro, mesma cor/tecido,
 * grade de estoque disponível, MAIS uma linha de recommendationBaselines VAZIA
 * (current_recommended_product_id: null) para o produto-fonte — baseline
 * diferente do que o motor calcula (candidato elegível), exercitando o caminho
 * não-vazio do diff (D-23).
 * @param {string} sourceName nome do produto-fonte (permite injetar payload XSS no Test 5)
 * @returns {number} runId
 */
function seedNonEmptyDiffFixture(store, sourceName = 'Vestido Fonte') {
  const runId = store.startIngestionRun({ categoryId: '1', categoryName: 'Vestidos' });
  store.persistIngestionBatch({
    runId,
    records: {
      products: [
        { id: 'prod-source', name: sourceName, handle: 'vestido-fonte', canonicalUrl: 'https://x/vestido-fonte' },
        { id: 'prod-candidate', name: 'Vestido Candidato', handle: 'vestido-candidato', canonicalUrl: 'https://x/vestido-candidato' },
      ],
      variants: [
        { id: 'var-source', productId: 'prod-source', sku: 'SKU-S', colorValue: 'Preto', sizeValue: 'M', stockTotal: 5 },
        { id: 'var-candidate', productId: 'prod-candidate', sku: 'SKU-C', colorValue: 'Preto', sizeValue: 'M', stockTotal: 5 },
      ],
      snapshots: [
        {
          productId: 'prod-source',
          hasAvailableGrade: 1,
          sizesInStockCount: 3,
          fabricTagRaw: 'algodao',
          fabricTagCanonical: 'Algodão',
          colorValue: 'Preto',
          categoryRaw: 'Vestidos',
          productGroupCanonical: 'Look Inteiro',
          snapshotAt: new Date().toISOString(),
        },
        {
          productId: 'prod-candidate',
          hasAvailableGrade: 1,
          sizesInStockCount: 3,
          fabricTagRaw: 'algodao',
          fabricTagCanonical: 'Algodão',
          colorValue: 'Preto',
          categoryRaw: 'Vestidos',
          productGroupCanonical: 'Look Inteiro',
          snapshotAt: new Date().toISOString(),
        },
      ],
      recommendationBaselines: [
        { productId: 'prod-source', currentRecommendedProductId: null, readAt: new Date().toISOString() },
      ],
    },
  });
  store.finishIngestionRun({ runId, status: 'success', productsRead: 2 });
  return runId;
}

describe('review-server.js', () => {
  it('Test 1: GET /review sem run de ingestão retorna 200 e o estado vazio exato do UI-SPEC', async () => {
    const res = await fetch(`${baseUrl}/review`);
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(body).toContain('Nada para revisar agora');
  });

  it('Test 2: POST /review retorna 405', async () => {
    const res = await fetch(`${baseUrl}/review`, { method: 'POST' });
    expect(res.status).toBe(405);
  });

  it('Test 3: fixture com diff real produz um link Revisar para o produto-fonte em GET /review', async () => {
    seedNonEmptyDiffFixture(store);

    const res = await fetch(`${baseUrl}/review`);
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(body).toContain('href="/review/prod-source"');
  });

  it('Test 4: GET /review/:productId do produto-fonte mostra seções Antes/Depois e badge Adicionado', async () => {
    seedNonEmptyDiffFixture(store);

    const res = await fetch(`${baseUrl}/review/prod-source`);
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(body).toContain('Antes');
    expect(body).toContain('Depois');
    expect(body).toContain('Adicionado');
    expect(body).toContain('prod-candidate');
  });

  it('Test 5: nome de produto com payload <script> nunca aparece cru no HTML (V5/XSS)', async () => {
    seedNonEmptyDiffFixture(store, '<script>alert(1)</script>');

    const res = await fetch(`${baseUrl}/review/prod-source`);
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(body).not.toContain('<script>alert');
    expect(body).toContain('&lt;script&gt;');
  });

  it('Test 6: GET /review/999999999 (productId inexistente) retorna 404', async () => {
    const res = await fetch(`${baseUrl}/review/999999999`);
    expect(res.status).toBe(404);
  });

  it('Test 7: POST /review/:productId (válido) retorna 405', async () => {
    seedNonEmptyDiffFixture(store);

    const res = await fetch(`${baseUrl}/review/prod-source`, { method: 'POST' });
    expect(res.status).toBe(405);
  });

  it('Test 8: GET /review/:productId?removedIds= remove o candidato da seção Depois', async () => {
    seedNonEmptyDiffFixture(store);

    const res = await fetch(`${baseUrl}/review/prod-source?removedIds=prod-candidate`);
    const body = await res.text();

    expect(res.status).toBe(200);
    // Isola só o bloco da coluna "Depois" (entre o heading e o começo de
    // .actions-row) — o form de Aprovar, fora da coluna, legitimamente carrega
    // "prod-candidate" no campo oculto removedIds (o id JÁ removido), então
    // comparar contra o body inteiro daria falso-positivo.
    const afterHeading = body.split('<div class="heading">Depois</div>')[1];
    const afterSection = afterHeading.split('<div class="actions-row">')[0];
    expect(afterSection).not.toContain('prod-candidate');
  });
});
