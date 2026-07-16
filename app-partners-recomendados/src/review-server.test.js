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
//
// Cobre os 4 comportamentos novos do bloco <behavior> do plano 05-05 (GET /audit):
// Test 20: GET /audit com write_log vazio → 200, "Nenhuma escrita real registrada ainda"
// Test 21: GET /audit com N linhas (manual + rollback) → 200, uma linha de tabela
//   por entrada, na mesma ordem retornada por listWriteLog()
// Test 22: valor de write_log com <script>alert(1)</script> nunca aparece cru no HTML
// Test 23: POST /audit → 405
//
// Cobre os 9 comportamentos novos do bloco <behavior> do plano 04-05:
// Test 9: POST /review/999999999/write (sem decisão) → 409, corpo cita
//   "aprovação registrada"
// Test 10: mesma chamada do Test 9 com ?dryRun=false → AINDA 409
// Test 11: POST /review/:productId/approve (sem removedIds) → 303 Location
//   /review, decisão persistida com approvedRecommendationIds = ids calculados
// Test 12: POST /review/:productId/approve com removedIds=<candidato> → decisão
//   persistida NÃO contém o id removido
// Test 13: POST /review/:productId/reject → status 'rejected',
//   approvedRecommendationIds null
// Test 14: POST /review/:productId/write após aprovação (com e sem
//   ?dryRun=false) → 200, mesmo approvedIds/written
// Test 15: POST /review/:productId/approve com corpo > 10.000 bytes → 413
// Test 16: POST /review/:productId/approve com JSON malformado → 400
// Test 17: GET nas 3 rotas de ação → 405

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findMetafield, updateMetafield, createMetafield } from './nuvemshop-client/client.js';
import { notifyWriteFailure } from './review/notify-failure.js';

// Mocka o módulo INTEIRO de client.js (não só as 3 funções de escrita novas) —
// evita quebrar qualquer import futuro de outra função do módulo carregada no
// mesmo teste. Nenhum teste deste arquivo faz uma chamada de rede real à
// Nuvemshop (T-05-06).
vi.mock('./nuvemshop-client/client.js', () => ({
  findMetafield: vi.fn(),
  updateMetafield: vi.fn(),
  createMetafield: vi.fn(),
  deleteMetafield: vi.fn(),
  getMetafields: vi.fn(),
  listCategories: vi.fn(),
  listProducts: vi.fn(),
  getProduct: vi.fn(),
}));

vi.mock('./review/notify-failure.js', () => ({
  notifyWriteFailure: vi.fn(),
}));

let tempDir;
let store;
let reviewServer;
let server;
let baseUrl;

beforeEach(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'review-server-test-'));
  process.env.CATALOG_DB_DIR = tempDir;
  vi.resetModules();
  vi.clearAllMocks();
  // Default seguro: nenhum teste depende do resultado de notifyWriteFailure,
  // só de ela ter sido chamada — sem isso o `.catch(() => {})` do call site em
  // write-executor.js quebraria (vi.fn() sem implementação retorna
  // `undefined`, não uma Promise).
  vi.mocked(notifyWriteFailure).mockResolvedValue({ notified: false });

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

/**
 * Fixture com 2 candidatos elegíveis para o mesmo produto-fonte (mesma cor/
 * tecido/grupo, grade disponível) — necessária para provar D-19/D-20 (Test
 * 12): remover UM candidato via `removedIds` não pode afetar o outro.
 * @returns {number} runId
 */
function seedMultiCandidateFixture(store) {
  const runId = store.startIngestionRun({ categoryId: '1', categoryName: 'Vestidos' });
  store.persistIngestionBatch({
    runId,
    records: {
      products: [
        { id: 'prod-source', name: 'Vestido Fonte', handle: 'vestido-fonte', canonicalUrl: 'https://x/vestido-fonte' },
        { id: 'prod-candidate-1', name: 'Vestido Candidato 1', handle: 'vestido-candidato-1', canonicalUrl: 'https://x/vestido-candidato-1' },
        { id: 'prod-candidate-2', name: 'Vestido Candidato 2', handle: 'vestido-candidato-2', canonicalUrl: 'https://x/vestido-candidato-2' },
      ],
      variants: [
        { id: 'var-source', productId: 'prod-source', sku: 'SKU-S', colorValue: 'Preto', sizeValue: 'M', stockTotal: 5 },
        { id: 'var-candidate-1', productId: 'prod-candidate-1', sku: 'SKU-C1', colorValue: 'Preto', sizeValue: 'M', stockTotal: 5 },
        { id: 'var-candidate-2', productId: 'prod-candidate-2', sku: 'SKU-C2', colorValue: 'Preto', sizeValue: 'M', stockTotal: 5 },
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
          productId: 'prod-candidate-1',
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
          productId: 'prod-candidate-2',
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
  store.finishIngestionRun({ runId, status: 'success', productsRead: 3 });
  return runId;
}

/**
 * Seed mínimo de 1 produto real (via ingestão, nunca SQL cru) — pré-requisito
 * de `insertWriteLog` porque `write_log.product_id` referencia `products(id)`
 * e better-sqlite3 habilita `PRAGMA foreign_keys=ON` por padrão.
 * @returns {number} runId
 */
function seedProductForWriteLog(store, productId) {
  const runId = store.startIngestionRun({ categoryId: '1', categoryName: 'Vestidos' });
  store.persistIngestionBatch({
    runId,
    records: {
      products: [{ id: productId, name: 'Produto Teste', handle: productId, canonicalUrl: `https://x/${productId}` }],
    },
  });
  store.finishIngestionRun({ runId, status: 'success', productsRead: 1 });
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

  it('Test 9: POST /review/999999999/write sem nenhuma decisão registrada retorna 409 citando aprovação', async () => {
    const res = await fetch(`${baseUrl}/review/999999999/write`, { method: 'POST' });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toContain('aprovação registrada');
  });

  it('Test 10: mesma chamada do Test 9 com ?dryRun=false AINDA retorna 409 (gate independe de dryRun)', async () => {
    const res = await fetch(`${baseUrl}/review/999999999/write?dryRun=false`, { method: 'POST' });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toContain('aprovação registrada');
  });

  it('Test 11: POST /review/:productId/approve sem removedIds persiste approved com o conjunto calculado pelo motor', async () => {
    const runId = seedNonEmptyDiffFixture(store);

    const res = await fetch(`${baseUrl}/review/prod-source/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: '',
      redirect: 'manual',
    });

    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/review');

    const decision = store.getApprovalDecision({ productId: 'prod-source', runId });
    expect(decision.status).toBe('approved');
    expect(decision.approvedRecommendationIds).toEqual(['prod-candidate']);
  });

  it('Test 12: POST /review/:productId/approve com removedIds exclui o candidato removido e mantém o restante', async () => {
    const runId = seedMultiCandidateFixture(store);

    const res = await fetch(`${baseUrl}/review/prod-source/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'removedIds=prod-candidate-1',
      redirect: 'manual',
    });

    expect(res.status).toBe(303);

    const decision = store.getApprovalDecision({ productId: 'prod-source', runId });
    expect(decision.approvedRecommendationIds).not.toContain('prod-candidate-1');
    expect(decision.approvedRecommendationIds).toContain('prod-candidate-2');
  });

  it('Test 13: POST /review/:productId/reject persiste status rejected com approvedRecommendationIds null', async () => {
    const runId = seedNonEmptyDiffFixture(store);

    const res = await fetch(`${baseUrl}/review/prod-source/reject`, { method: 'POST', redirect: 'manual' });

    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/review');

    const decision = store.getApprovalDecision({ productId: 'prod-source', runId });
    expect(decision.status).toBe('rejected');
    expect(decision.approvedRecommendationIds).toBeNull();
  });

  it('Test 14: POST /review/:productId/write após aprovação com dryRun=false executa a escrita real e retorna written:true', async () => {
    seedNonEmptyDiffFixture(store);
    await fetch(`${baseUrl}/review/prod-source/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: '',
    });

    const resDefault = await fetch(`${baseUrl}/review/prod-source/write`, { method: 'POST' });
    const bodyDefault = await resDefault.json();

    expect(resDefault.status).toBe(200);
    expect(bodyDefault.approvedIds).toEqual(['prod-candidate']);
    expect(bodyDefault.written).toBe(false);

    vi.mocked(findMetafield).mockResolvedValue(null);
    vi.mocked(createMetafield).mockResolvedValue({ id: 'mf-test' });

    const resExplicit = await fetch(`${baseUrl}/review/prod-source/write?dryRun=false`, { method: 'POST' });
    const bodyExplicit = await resExplicit.json();

    expect(resExplicit.status).toBe(200);
    expect(bodyExplicit.approvedIds).toEqual(bodyDefault.approvedIds);
    expect(bodyExplicit.written).toBe(true);
  });

  it('Test 19: falha real durante POST /write (dryRun=false, aprovação válida) retorna 500 e notifica a falha', async () => {
    seedNonEmptyDiffFixture(store);
    await fetch(`${baseUrl}/review/prod-source/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: '',
    });

    vi.mocked(findMetafield).mockResolvedValue(null);
    vi.mocked(createMetafield).mockRejectedValue(new Error('falha simulada'));

    const res = await fetch(`${baseUrl}/review/prod-source/write?dryRun=false`, { method: 'POST' });

    expect(res.status).toBe(500);
    expect(notifyWriteFailure).toHaveBeenCalledTimes(1);
  });

  it('Test 15: POST /review/:productId/approve com corpo maior que o limite retorna 413 sem travar', async () => {
    const hugeBody = 'removedIds=' + 'a'.repeat(20_000);

    const res = await fetch(`${baseUrl}/review/prod-source/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: hugeBody,
    });

    expect(res.status).toBe(413);
  });

  it('Test 16: POST /review/:productId/approve com JSON malformado retorna 400', async () => {
    const res = await fetch(`${baseUrl}/review/prod-source/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    });

    expect(res.status).toBe(400);
  });

  it('Test 17: GET nas 3 rotas de ação (approve/reject/write) retorna 405', async () => {
    const resApprove = await fetch(`${baseUrl}/review/prod-source/approve`, { method: 'GET' });
    const resReject = await fetch(`${baseUrl}/review/prod-source/reject`, { method: 'GET' });
    const resWrite = await fetch(`${baseUrl}/review/prod-source/write`, { method: 'GET' });

    expect(resApprove.status).toBe(405);
    expect(resReject.status).toBe(405);
    expect(resWrite.status).toBe(405);
  });

  it('Test 18 (CR-01 regression): POST /review/:productId/reject antes de qualquer run bem-sucedido nunca retorna 500', async () => {
    // Banco temporário vazio, sem seed algum — mesma condição do Test 1, mas
    // exercitando reject em vez de GET /review. getLatestSuccessfulRunId()
    // retorna null aqui; approval_queue.run_id é NOT NULL no schema, então sem
    // a guarda de CR-01 o upsert lançaria SqliteError e o catch-all do router
    // devolveria 500.
    const res = await fetch(`${baseUrl}/review/produto-qualquer/reject`, { method: 'POST' });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain('ingestão');
  });

  it('Test 20: GET /audit com write_log vazio retorna 200 e o estado vazio', async () => {
    const res = await fetch(`${baseUrl}/audit`);
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(body).toContain('Nenhuma escrita real registrada ainda');
  });

  it('Test 21: GET /audit com linhas manual e rollback lista uma linha de tabela por entrada, na ordem de listWriteLog()', async () => {
    const runId = seedProductForWriteLog(store, 'prod-audit');

    store.insertWriteLog({
      productId: 'prod-audit',
      runId,
      metafieldId: 'mf-1',
      previousValue: 'prod-old',
      writtenValue: 'prod-new',
      triggeredBy: 'manual',
      status: 'success',
      errorMessage: null,
      writtenAt: '2026-07-16T10:00:00Z',
    });
    store.insertWriteLog({
      productId: 'prod-audit',
      runId,
      metafieldId: 'mf-1',
      previousValue: 'prod-new',
      writtenValue: 'prod-old',
      triggeredBy: 'rollback',
      status: 'success',
      errorMessage: null,
      writtenAt: '2026-07-16T11:00:00Z',
    });

    const res = await fetch(`${baseUrl}/audit`);
    const body = await res.text();
    const entries = store.listWriteLog();

    expect(res.status).toBe(200);
    expect(entries).toHaveLength(2);
    expect(body).toContain('manual');
    expect(body).toContain('rollback');

    const manualIndex = body.indexOf('manual');
    const rollbackIndex = body.indexOf('rollback');
    // entries[0] é a mais recente segundo listWriteLog() (rollback, written_at
    // mais tardio) — a ORDEM da resposta HTTP deve corresponder à ordem
    // retornada pela função, não recalcular ordenação própria.
    expect(entries[0].triggeredBy).toBe('rollback');
    expect(rollbackIndex).toBeLessThan(manualIndex);
  });

  it('Test 22: valor de write_log com payload <script> nunca aparece cru no HTML de GET /audit (V5/XSS)', async () => {
    const runId = seedProductForWriteLog(store, 'prod-audit-xss');

    store.insertWriteLog({
      productId: 'prod-audit-xss',
      runId,
      metafieldId: 'mf-1',
      previousValue: 'prod-old',
      writtenValue: '<script>alert(1)</script>',
      triggeredBy: 'manual',
      status: 'failed',
      errorMessage: 'falha simulada',
      writtenAt: '2026-07-16T10:00:00Z',
    });

    const res = await fetch(`${baseUrl}/audit`);
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(body).not.toContain('<script>alert(1)</script>');
    expect(body).toContain('&lt;script&gt;');
  });

  it('Test 23: POST /audit retorna 405', async () => {
    const res = await fetch(`${baseUrl}/audit`, { method: 'POST' });
    expect(res.status).toBe(405);
  });
});
