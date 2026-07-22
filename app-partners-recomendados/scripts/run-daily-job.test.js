// Testes de scripts/run-daily-job.js (Fase 6, D-45/D-46/D-47/D-48).
//
// Mocka `../src/nuvemshop-client/client.js` inteiro (listCategories, listProducts,
// getMetafields) — mesmo padrão de `ingest-catalog.test.js` — nenhuma chamada de
// rede real acontece aqui. Usa CATALOG_DB_DIR + vi.resetModules() + import dinâmico
// para isolar cada teste em um diretório SQLite temporário próprio, mesma isolação
// de `catalog-store.test.js`/`rollback.test.js`.
//
// Cobre os 4 comportamentos do bloco <behavior> do plano 06-01:
// Test 1: primeira execução do dia -> runIngestion chamado, fila calculada e
//   persistida, retorna { skipped: false, runId, queueLength }
// Test 2: segunda chamada no MESMO dia -> skipped:true, runId igual, queueLength:0,
//   SEM chamar runIngestion de novo (mocks de listCategories/listProducts não
//   recebem chamada adicional), ingestion_runs continua com exatamente 1 linha
// Test 3: importar o módulo nunca dispara chamada de rede nem grava no banco
// Test 4 (D-16): produto com baseline não-nulo e fabric_tag_canonical não mapeado
//   gera entrada real na fila (afterIds: []), seedPendingApprovalQueue grava
//   status pending em approval_queue

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listCategories, listProducts, getMetafields } from '../src/nuvemshop-client/client.js';
import { resolveWriteEnabled, evaluateSnapshotIntegrity } from './run-daily-job.js';

vi.mock('../src/nuvemshop-client/client.js', () => ({
  listCategories: vi.fn(),
  listProducts: vi.fn(),
  getMetafields: vi.fn(),
}));

// A escrita real e as notificações são mockadas — o job de teste NUNCA toca a
// rede nem a loja de produção. `executeScheduledWrite` é um vi.fn controlado por
// teste (asserção de dryRun/ids); `notifyWriteFailure`/`notifyDailySummary` viram
// vi.fn para provar aborto+notificação sem depender de webhook real.
vi.mock('../src/review/write-executor.js', () => ({
  executeScheduledWrite: vi.fn(async ({ recommendedIds = [], dryRun = false } = {}) => ({
    written: !dryRun && recommendedIds.length > 0,
    dryRun: !!dryRun,
    approvedIds: recommendedIds,
  })),
}));

vi.mock('../src/review/notify-failure.js', () => ({
  notifyWriteFailure: vi.fn(async () => ({ notified: false })),
  notifyDailySummary: vi.fn(async () => ({ notified: false })),
}));

/**
 * Semeia um run de ingestão bem-sucedido ANTIGO (started_at = ontem) diretamente
 * no SQLite temporário via uma conexão raw — sem mockar o catalog-store (que
 * gerencia sua própria conexão singleton e precisa dela real para a ingestão). O
 * run antigo tem `products_read` alto para testar a banda da Defesa 1: o guard de
 * idempotência diária (date(started_at)=date('now')) NÃO o considera "de hoje",
 * então runDailyJob prossegue e o compara como "último run bem-sucedido". A
 * conexão raw é fechada imediatamente (lock de arquivo no Windows).
 */
async function seedBackdatedSuccessfulRun(dir, { productsRead, categoryCounts }) {
  // Garante que o schema exista (catalog-store cria as tabelas ao abrir).
  await import('../src/db/catalog-store.js');
  const { default: Database } = await import('better-sqlite3');
  const raw = new Database(join(dir, 'catalog.db'));
  try {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    raw
      .prepare(
        `INSERT INTO ingestion_runs (started_at, finished_at, category_id, category_name, products_read, status, category_counts)
         VALUES (@startedAt, @finishedAt, @categoryId, @categoryName, @productsRead, 'success', @categoryCounts)`
      )
      .run({
        startedAt: yesterday,
        finishedAt: yesterday,
        categoryId: '100',
        categoryName: 'Vestidos',
        productsRead,
        categoryCounts: JSON.stringify(categoryCounts),
      });
  } finally {
    raw.close();
  }
}

const STORE_CATEGORIES = [{ id: 100, name: { pt: 'Vestidos' } }];

/**
 * Monta um produto mínimo e realista no shape da API pública Nuvemshop, com grade
 * de estoque disponível (>=3 tamanhos com estoque > 0, D-04) por padrão e SEM
 * nenhuma tag de tecido mapeável (D-16) — mesmo fixture de `ingest-catalog.test.js`.
 */
function makeProduct({ id, colorValue = 'Preto', published = true, inStock = true }) {
  const stock = inStock ? 5 : 0; // grade disponível exige >=3 tamanhos com estoque>0 (D-04)
  return {
    id,
    name: { pt: `Produto ${id}` },
    handle: { pt: `produto-${id}` },
    canonical_url: `https://loja-talgui.example/produto-${id}`,
    tags: '',
    published,
    attributes: [{ pt: 'Cor' }, { pt: 'Tamanho' }],
    variants: [
      { id: `${id}-v1`, values: [{ pt: colorValue }, { pt: 'P' }], inventory_levels: [{ location_id: 'loc-1', stock }] },
      { id: `${id}-v2`, values: [{ pt: colorValue }, { pt: 'M' }], inventory_levels: [{ location_id: 'loc-1', stock }] },
      { id: `${id}-v3`, values: [{ pt: colorValue }, { pt: 'G' }], inventory_levels: [{ location_id: 'loc-1', stock }] },
    ],
    categories: [{ id: 999, name: { pt: 'Vestidos' } }],
  };
}

let tempDir;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'run-daily-job-test-'));
  process.env.CATALOG_DB_DIR = tempDir;
  vi.resetModules();
  vi.clearAllMocks();
  listCategories.mockResolvedValue(STORE_CATEGORIES);
  listProducts.mockResolvedValue({ products: [], hasNextPage: false });
  getMetafields.mockResolvedValue([]);
});

afterEach(async () => {
  // Fecha o handle nativo do SQLite antes de remover o diretório temporário (mesma
  // necessidade documentada em catalog-store.test.js para o Windows).
  const store = await import('../src/db/catalog-store.js');
  store.closeDbForTests();
  delete process.env.CATALOG_DB_DIR;
  rmSync(tempDir, { recursive: true, force: true });
});

describe('runDailyJob', () => {
  it('primeira execução do dia chama runIngestion, calcula e persiste a fila (Test 1)', async () => {
    const produto1 = makeProduct({ id: 'produto-1' });
    listProducts.mockImplementation(async ({ categoryId }) => {
      if (String(categoryId) === '100') return { products: [produto1], hasNextPage: false };
      return { products: [], hasNextPage: false };
    });
    getMetafields.mockResolvedValue([
      { namespace: 'recomendados', key: 'produto_sugerido', value: 'produto-antigo' },
    ]);

    const { runDailyJob } = await import('./run-daily-job.js');
    const result = await runDailyJob({});

    expect(result.skipped).toBe(false);
    expect(typeof result.runId).toBe('number');
    expect(result.queueLength).toBe(1);
    expect(listCategories).toHaveBeenCalledTimes(1);

    const store = await import('../src/db/catalog-store.js');
    const changes = store.listApprovalQueueChanges({ runId: result.runId });
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ productId: 'produto-1', status: 'pending' });
  });

  it('segunda chamada no MESMO dia retorna skipped:true sem chamar runIngestion de novo, ingestion_runs continua com 1 linha (Test 2)', async () => {
    const produto1 = makeProduct({ id: 'produto-1' });
    listProducts.mockImplementation(async ({ categoryId }) => {
      if (String(categoryId) === '100') return { products: [produto1], hasNextPage: false };
      return { products: [], hasNextPage: false };
    });

    const { runDailyJob } = await import('./run-daily-job.js');
    const first = await runDailyJob({});
    expect(first.skipped).toBe(false);
    expect(listCategories).toHaveBeenCalledTimes(1);
    expect(listProducts).toHaveBeenCalledTimes(1);

    const second = await runDailyJob({});

    expect(second).toEqual({ skipped: true, runId: first.runId, queueLength: 0 });
    // Nenhuma chamada adicional aos mocks de listCategories/listProducts.
    expect(listCategories).toHaveBeenCalledTimes(1);
    expect(listProducts).toHaveBeenCalledTimes(1);

    const store = await import('../src/db/catalog-store.js');
    // Confirma via leitura direta (nunca reimplementando lógica de contagem já
    // exposta pelo módulo): getLatestSuccessfulRunId() ainda aponta para a
    // primeira (e única) run bem-sucedida do dia.
    expect(store.getLatestSuccessfulRunId()).toBe(first.runId);
  });

  it('importar o módulo NUNCA dispara chamada de rede nem grava no banco (Test 3, guard de CLI)', async () => {
    await import('./run-daily-job.js');

    expect(listCategories).not.toHaveBeenCalled();
    expect(listProducts).not.toHaveBeenCalled();
    expect(getMetafields).not.toHaveBeenCalled();

    const store = await import('../src/db/catalog-store.js');
    expect(store.getLatestSuccessfulRunId()).toBeNull();
  });

  it('produto com baseline não-nulo e fabric_tag_canonical não mapeado gera entrada real (afterIds: []) e grava pending em approval_queue (Test 4, D-16)', async () => {
    const produtoSemTecido = makeProduct({ id: 'produto-sem-tecido' });
    listProducts.mockImplementation(async ({ categoryId }) => {
      if (String(categoryId) === '100') return { products: [produtoSemTecido], hasNextPage: false };
      return { products: [], hasNextPage: false };
    });
    getMetafields.mockResolvedValue([
      { namespace: 'recomendados', key: 'produto_sugerido', value: 'produto-recomendado-antigo' },
    ]);

    const { runDailyJob } = await import('./run-daily-job.js');
    const result = await runDailyJob({});

    expect(result.skipped).toBe(false);

    const store = await import('../src/db/catalog-store.js');
    const baseline = store.getBaselineForRun({ runId: result.runId });
    expect(baseline.get('produto-sem-tecido')).toBe('produto-recomendado-antigo');

    const changes = store.listApprovalQueueChanges({ runId: result.runId });
    const entry = changes.find((c) => c.productId === 'produto-sem-tecido');
    expect(entry).toBeDefined();
    expect(entry.status).toBe('pending');
  });
});

// Kill switch (D-62): resolveWriteEnabled é uma função PURA — lê process.env no
// momento da chamada e decide se o regime diário grava de verdade. Default
// SEGURO: ausência de configuração => false (dry-run), nunca escrita acidental
// (A1/D-62). WRITE_OVERRIDE (input do workflow_dispatch, 1º rollout supervisionado
// D-64) tem prioridade sobre WRITE_ENABLED (repository variable persistente).
describe('resolveWriteEnabled (kill switch D-62)', () => {
  const originalOverride = process.env.WRITE_OVERRIDE;
  const originalEnabled = process.env.WRITE_ENABLED;

  const restore = (key, value) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };

  beforeEach(() => {
    delete process.env.WRITE_OVERRIDE;
    delete process.env.WRITE_ENABLED;
  });

  afterEach(() => {
    restore('WRITE_OVERRIDE', originalOverride);
    restore('WRITE_ENABLED', originalEnabled);
  });

  it("WRITE_OVERRIDE='true' => true (input do dispatch tem prioridade)", () => {
    process.env.WRITE_OVERRIDE = 'true';
    process.env.WRITE_ENABLED = 'false';
    expect(resolveWriteEnabled()).toBe(true);
  });

  it("WRITE_OVERRIDE='false' => false mesmo com WRITE_ENABLED='true' (override manual desliga)", () => {
    process.env.WRITE_OVERRIDE = 'false';
    process.env.WRITE_ENABLED = 'true';
    expect(resolveWriteEnabled()).toBe(false);
  });

  it('ambos ausentes => false (default seguro = dry-run, A1/D-62)', () => {
    expect(resolveWriteEnabled()).toBe(false);
  });

  it("WRITE_ENABLED='true' e WRITE_OVERRIDE ausente => true (regime persistente ligado)", () => {
    process.env.WRITE_ENABLED = 'true';
    expect(resolveWriteEnabled()).toBe(true);
  });

  it("qualquer valor inesperado de WRITE_ENABLED (ex.: '1', 'yes') => false (fail-safe)", () => {
    process.env.WRITE_ENABLED = '1';
    expect(resolveWriteEnabled()).toBe(false);
    process.env.WRITE_ENABLED = 'yes';
    expect(resolveWriteEnabled()).toBe(false);
  });

  it("WRITE_OVERRIDE vazio (input não preenchido no dispatch) cai no WRITE_ENABLED", () => {
    process.env.WRITE_OVERRIDE = '';
    process.env.WRITE_ENABLED = 'true';
    expect(resolveWriteEnabled()).toBe(true);
  });
});

// Defesa 1 de integridade do snapshot (D-66) — função pura. Uma leitura truncada
// da API (categoria colapsada a 0, ou total muito abaixo do último run) NUNCA pode
// virar um apagão em massa: a Defesa 1 aborta a escrita ANTES de qualquer gravação.
describe('evaluateSnapshotIntegrity (Defesa 1 D-66)', () => {
  it('ok quando toda categoria tem >0 e não há run anterior (primeira ingestão)', () => {
    const result = evaluateSnapshotIntegrity({
      categoryCounts: { Vestidos: 10, Blusas: 5 },
      previousProductsRead: null,
      currentProductsRead: 15,
    });
    expect(result.ok).toBe(true);
  });

  it('aborta quando alguma categoria voltou com 0 produtos (leitura truncada)', () => {
    const result = evaluateSnapshotIntegrity({
      categoryCounts: { Vestidos: 10, Blusas: 0 },
      previousProductsRead: null,
      currentProductsRead: 10,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/Blusas/);
  });

  it('aborta quando o total cai abaixo de 70% do último run bem-sucedido (banda)', () => {
    const result = evaluateSnapshotIntegrity({
      categoryCounts: { Vestidos: 60 },
      previousProductsRead: 100,
      currentProductsRead: 60, // 60 < 70
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/total/i);
  });

  it('ok quando o total fica dentro da banda (>=70% do último run)', () => {
    const result = evaluateSnapshotIntegrity({
      categoryCounts: { Vestidos: 80 },
      previousProductsRead: 100,
      currentProductsRead: 80, // 80 >= 70
    });
    expect(result.ok).toBe(true);
  });

  it('aborta quando não há nenhuma contagem de categoria (snapshot vazio)', () => {
    const result = evaluateSnapshotIntegrity({
      categoryCounts: {},
      previousProductsRead: null,
      currentProductsRead: 0,
    });
    expect(result.ok).toBe(false);
  });
});

describe('runDailyJob — Defesa 1 integração (D-66)', () => {
  it('categoria com 0 produtos: aborta com aborted:integrity, notifica e NÃO grava', async () => {
    listCategories.mockResolvedValue([
      { id: 100, name: { pt: 'Vestidos' } },
      { id: 101, name: { pt: 'Blusas' } },
    ]);
    const produto1 = makeProduct({ id: 'produto-1' });
    listProducts.mockImplementation(async ({ categoryId }) => {
      if (String(categoryId) === '100') return { products: [produto1], hasNextPage: false };
      return { products: [], hasNextPage: false }; // Blusas volta vazia => 0 produtos
    });

    const { runDailyJob } = await import('./run-daily-job.js');
    const { notifyWriteFailure } = await import('../src/review/notify-failure.js');
    const { executeScheduledWrite } = await import('../src/review/write-executor.js');

    const result = await runDailyJob({ categoryNames: ['Vestidos', 'Blusas'] });

    expect(result.aborted).toBe('integrity');
    expect(notifyWriteFailure).toHaveBeenCalledTimes(1);
    expect(notifyWriteFailure).toHaveBeenCalledWith(
      expect.objectContaining({ productId: 'daily-job', triggeredBy: 'scheduled' })
    );
    expect(executeScheduledWrite).not.toHaveBeenCalled();
  });

  it('total abaixo da banda vs último run: aborta com aborted:integrity, notifica e NÃO grava', async () => {
    listCategories.mockResolvedValue([{ id: 100, name: { pt: 'Vestidos' } }]);
    const produto1 = makeProduct({ id: 'produto-1' });
    listProducts.mockImplementation(async ({ categoryId }) => {
      if (String(categoryId) === '100') return { products: [produto1], hasNextPage: false };
      return { products: [], hasNextPage: false };
    });

    // Último run bem-sucedido (ontem) leu 100 produtos — hoje só leu 1 (1 < 70% de 100).
    await seedBackdatedSuccessfulRun(tempDir, {
      productsRead: 100,
      categoryCounts: { Vestidos: 100 },
    });

    const { runDailyJob } = await import('./run-daily-job.js');
    const { notifyWriteFailure } = await import('../src/review/notify-failure.js');
    const { executeScheduledWrite } = await import('../src/review/write-executor.js');

    const result = await runDailyJob({ categoryNames: ['Vestidos'] });

    expect(result.aborted).toBe('integrity');
    expect(notifyWriteFailure).toHaveBeenCalledTimes(1);
    expect(executeScheduledWrite).not.toHaveBeenCalled();
  });
});

/**
 * Semeia, via conexão raw, um run ANTIGO (ontem) + um produto + uma linha de
 * write_log 'success' para esse produto — dando a ele um baseline de vitrine já
 * gravada. Usado para testar o apagão intencional (D-54/D-68): uma fonte que
 * TINHA recomendação e ficou inelegível (esgotada/oculta) vira escrita de
 * conjunto vazio. `products_read` baixo mantém a banda da Defesa 1 satisfeita.
 */
async function seedBackdatedProductWriteLog(dir, { productId, writtenValue, productsRead = 1 }) {
  await import('../src/db/catalog-store.js');
  const { default: Database } = await import('better-sqlite3');
  const raw = new Database(join(dir, 'catalog.db'));
  try {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const info = raw
      .prepare(
        `INSERT INTO ingestion_runs (started_at, finished_at, category_id, category_name, products_read, status, category_counts)
         VALUES (@startedAt, @startedAt, '100', 'Vestidos', @productsRead, 'success', @cc)`
      )
      .run({ startedAt: yesterday, productsRead, cc: JSON.stringify({ Vestidos: productsRead }) });
    const runId = Number(info.lastInsertRowid);
    raw
      .prepare(`INSERT OR IGNORE INTO products (id, name) VALUES (@id, @name)`)
      .run({ id: String(productId), name: `Produto ${productId}` });
    raw
      .prepare(
        `INSERT INTO write_log (product_id, run_id, metafield_id, previous_value, written_value, triggered_by, status, error_message, written_at)
         VALUES (@productId, @runId, 'mf-1', NULL, @writtenValue, 'scheduled', 'success', NULL, @writtenAt)`
      )
      .run({
        productId: String(productId),
        runId,
        writtenValue: JSON.stringify(writtenValue),
        writtenAt: yesterday,
      });
  } finally {
    raw.close();
  }
}

describe('runDailyJob — escrita automática (D-61/D-68), Defesa 2 wiring (D-67), resumo (D-69)', () => {
  const envKeys = ['WRITE_ENABLED', 'WRITE_OVERRIDE', 'FIRST_ROLLOUT'];
  const savedEnv = {};

  beforeEach(() => {
    for (const k of envKeys) {
      savedEnv[k] = process.env[k];
      delete process.env[k];
    }
    // Duas fontes Vestidos, mesma cor, ambas com grade e visíveis (elegíveis).
    listCategories.mockResolvedValue([{ id: 100, name: { pt: 'Vestidos' } }]);
  });

  afterEach(() => {
    for (const k of envKeys) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
  });

  it('kill switch off (dry-run): executeScheduledWrite com dryRun:true para os diffs; resumo enviado; sem escrita real', async () => {
    process.env.FIRST_ROLLOUT = 'true'; // isenta o disjuntor (baseline vazio => churn 100%)
    const a = makeProduct({ id: 'prod-a' });
    const b = makeProduct({ id: 'prod-b' });
    listProducts.mockResolvedValue({ products: [a, b], hasNextPage: false });

    const { runDailyJob } = await import('./run-daily-job.js');
    const { executeScheduledWrite } = await import('../src/review/write-executor.js');
    const { notifyDailySummary, notifyWriteFailure } = await import('../src/review/notify-failure.js');

    const result = await runDailyJob({ categoryNames: ['Vestidos'] });

    expect(result.aborted).toBeUndefined();
    expect(executeScheduledWrite).toHaveBeenCalled();
    for (const call of executeScheduledWrite.mock.calls) {
      expect(call[0].dryRun).toBe(true);
    }
    // Ambas as fontes elegíveis com diff (baseline vazio) recebem escrita.
    const writtenIds = executeScheduledWrite.mock.calls.map((c) => c[0].productId).sort();
    expect(writtenIds).toEqual(['prod-a', 'prod-b']);
    // snapshotById passado para a Defesa 2 (D-67).
    expect(executeScheduledWrite.mock.calls[0][0].snapshotById).toBeInstanceOf(Map);
    expect(notifyDailySummary).toHaveBeenCalledTimes(1);
    expect(notifyWriteFailure).not.toHaveBeenCalled();
  });

  it('kill switch on: executeScheduledWrite com dryRun:false só para elegíveis+diff; fonte oculta (sem baseline) não recebe escrita', async () => {
    process.env.WRITE_OVERRIDE = 'true';
    process.env.FIRST_ROLLOUT = 'true';
    const a = makeProduct({ id: 'prod-a' });
    const b = makeProduct({ id: 'prod-b' });
    const hidden = makeProduct({ id: 'prod-hidden', published: false });
    listProducts.mockResolvedValue({ products: [a, b, hidden], hasNextPage: false });

    const { runDailyJob } = await import('./run-daily-job.js');
    const { executeScheduledWrite } = await import('../src/review/write-executor.js');

    await runDailyJob({ categoryNames: ['Vestidos'] });

    const calls = executeScheduledWrite.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call[0].dryRun).toBe(false);
    }
    const writtenIds = calls.map((c) => c[0].productId);
    expect(writtenIds).toContain('prod-a');
    expect(writtenIds).toContain('prod-b');
    // Fonte oculta sem baseline NUNCA vira alvo de escrita.
    expect(writtenIds).not.toContain('prod-hidden');
  });

  it('apagão intencional: fonte esgotada que TINHA vitrine vira escrita de conjunto vazio (D-54/D-68)', async () => {
    process.env.WRITE_OVERRIDE = 'true';
    process.env.FIRST_ROLLOUT = 'true'; // isenta o disjuntor do apagão 100%
    // Baseline gravado ontem para prod-esgotada.
    await seedBackdatedProductWriteLog(tempDir, {
      productId: 'prod-esgotada',
      writtenValue: ['rec-antiga'],
      productsRead: 1,
    });
    const esgotada = makeProduct({ id: 'prod-esgotada', inStock: false });
    listProducts.mockResolvedValue({ products: [esgotada], hasNextPage: false });

    const { runDailyJob } = await import('./run-daily-job.js');
    const { executeScheduledWrite } = await import('../src/review/write-executor.js');

    await runDailyJob({ categoryNames: ['Vestidos'] });

    const call = executeScheduledWrite.mock.calls.find((c) => c[0].productId === 'prod-esgotada');
    expect(call).toBeDefined();
    expect(call[0].recommendedIds).toEqual([]); // conjunto vazio (apagão)
  });

  it('disjuntor disparado (churn 100%, não-1º-rollout): nenhuma escrita real + notifyWriteFailure', async () => {
    // FIRST_ROLLOUT ausente => disjuntor ativo; baseline vazio => churn 100% > 30%.
    const a = makeProduct({ id: 'prod-a' });
    const b = makeProduct({ id: 'prod-b' });
    listProducts.mockResolvedValue({ products: [a, b], hasNextPage: false });

    const { runDailyJob } = await import('./run-daily-job.js');
    const { executeScheduledWrite } = await import('../src/review/write-executor.js');
    const { notifyWriteFailure } = await import('../src/review/notify-failure.js');

    const result = await runDailyJob({ categoryNames: ['Vestidos'] });

    expect(result.aborted).toBe('circuit-breaker');
    expect(executeScheduledWrite).not.toHaveBeenCalled();
    expect(notifyWriteFailure).toHaveBeenCalledWith(
      expect.objectContaining({ productId: 'daily-job', triggeredBy: 'scheduled' })
    );
  });
});
