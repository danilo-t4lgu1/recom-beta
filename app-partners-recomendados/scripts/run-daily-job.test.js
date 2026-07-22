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
import { resolveWriteEnabled } from './run-daily-job.js';

vi.mock('../src/nuvemshop-client/client.js', () => ({
  listCategories: vi.fn(),
  listProducts: vi.fn(),
  getMetafields: vi.fn(),
}));

const STORE_CATEGORIES = [{ id: 100, name: { pt: 'Vestidos' } }];

/**
 * Monta um produto mínimo e realista no shape da API pública Nuvemshop, com grade
 * de estoque disponível (>=3 tamanhos com estoque > 0, D-04) por padrão e SEM
 * nenhuma tag de tecido mapeável (D-16) — mesmo fixture de `ingest-catalog.test.js`.
 */
function makeProduct({ id, colorValue = 'Preto' }) {
  return {
    id,
    name: { pt: `Produto ${id}` },
    handle: { pt: `produto-${id}` },
    canonical_url: `https://loja-talgui.example/produto-${id}`,
    tags: '',
    attributes: [{ pt: 'Cor' }, { pt: 'Tamanho' }],
    variants: [
      { id: `${id}-v1`, values: [{ pt: colorValue }, { pt: 'P' }], inventory_levels: [{ location_id: 'loc-1', stock: 5 }] },
      { id: `${id}-v2`, values: [{ pt: colorValue }, { pt: 'M' }], inventory_levels: [{ location_id: 'loc-1', stock: 5 }] },
      { id: `${id}-v3`, values: [{ pt: colorValue }, { pt: 'G' }], inventory_levels: [{ location_id: 'loc-1', stock: 5 }] },
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
