// Testes de `client.js` (Wave 0 gap — primeira suíte de testes deste módulo).
//
// Stub de `globalThis.fetch` por teste (mesmo padrão do Test 10 de
// `write-executor.test.js`): salva/restaura o fetch original em beforeEach/afterEach,
// capturando url/method/body de cada chamada para asserção. Todas as funções lêem
// credenciais via `getAccessToken()`, então `NUVEMSHOP_ACCESS_TOKEN`/`NUVEMSHOP_STORE_ID`
// são setados em process.env antes de cada teste e restaurados depois (nunca vazar).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  findMetafield,
  updateMetafield,
  deleteMetafield,
  createMetafield,
} from './client.js';

describe('nuvemshop-client', () => {
  const originalFetch = globalThis.fetch;
  const originalAccessToken = process.env.NUVEMSHOP_ACCESS_TOKEN;
  const originalStoreId = process.env.NUVEMSHOP_STORE_ID;

  beforeEach(() => {
    process.env.NUVEMSHOP_ACCESS_TOKEN = 'fake-token';
    process.env.NUVEMSHOP_STORE_ID = 'fake-store';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env.NUVEMSHOP_ACCESS_TOKEN = originalAccessToken;
    process.env.NUVEMSHOP_STORE_ID = originalStoreId;
  });

  describe('findMetafield', () => {
    it('encontra o Metafield cujo namespace/key batem com os defaults', async () => {
      globalThis.fetch = async () =>
        new Response(
          JSON.stringify([
            { id: 1, namespace: 'outro', key: 'x', value: 'nope' },
            { id: 2, namespace: 'recomendados', key: 'produto_sugerido', value: '123' },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );

      const result = await findMetafield({ ownerId: '999' });
      expect(result).toEqual({
        id: 2,
        namespace: 'recomendados',
        key: 'produto_sugerido',
        value: '123',
      });
    });

    it('retorna null quando nenhum item bate namespace+key (sem lançar)', async () => {
      globalThis.fetch = async () =>
        new Response(JSON.stringify([{ id: 1, namespace: 'outro', key: 'x' }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });

      const result = await findMetafield({ ownerId: '999' });
      expect(result).toBeNull();
    });

    it('retorna null quando getMetafields retorna lista vazia', async () => {
      globalThis.fetch = async () =>
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });

      const result = await findMetafield({ ownerId: '999' });
      expect(result).toBeNull();
    });
  });

  describe('updateMetafield', () => {
    it('envia PUT com method/url/body corretos e retorna o Metafield atualizado', async () => {
      let captured = null;
      globalThis.fetch = async (url, options) => {
        captured = { url, method: options.method, body: options.body };
        return new Response(JSON.stringify({ id: 42, value: 'novo-valor' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const result = await updateMetafield({ id: 42, value: 'novo-valor' });

      expect(captured.method).toBe('PUT');
      expect(captured.url).toContain('/metafields/42');
      expect(JSON.parse(captured.body)).toEqual({ value: 'novo-valor' });
      expect(result).toEqual({ id: 42, value: 'novo-valor' });
    });

    it('propaga erro quando a resposta não é ok', async () => {
      globalThis.fetch = async () =>
        new Response('erro interno', { status: 500 });

      await expect(updateMetafield({ id: 42, value: 'x' })).rejects.toThrow(
        /falhou \(status 500\)/
      );
    });
  });

  describe('deleteMetafield', () => {
    it('envia DELETE para a URL correta', async () => {
      let captured = null;
      globalThis.fetch = async (url, options) => {
        captured = { url, method: options.method };
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      await deleteMetafield({ id: 7 });

      expect(captured.method).toBe('DELETE');
      expect(captured.url).toContain('/metafields/7');
    });

    it('trata corpo vazio retornando {} sem lançar', async () => {
      globalThis.fetch = async () => new Response('', { status: 200 });

      const result = await deleteMetafield({ id: 7 });
      expect(result).toEqual({});
    });
  });

  describe('createMetafield (retrocompatibilidade sem limiter)', () => {
    it('continua funcionando quando chamado sem limiter, passando pelo fetch mockado com headers corretos', async () => {
      let captured = null;
      globalThis.fetch = async (url, options) => {
        captured = { url, method: options.method, headers: options.headers };
        return new Response(JSON.stringify({ id: 1, value: '123' }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const result = await createMetafield({ ownerId: '999', value: '123' });

      expect(captured.method).toBe('POST');
      expect(captured.url).toContain('/metafields');
      expect(captured.headers.Authorization).toBe('Bearer fake-token');
      expect(captured.headers['User-Agent']).toContain('TalguiRecomendados');
      expect(result).toEqual({ id: 1, value: '123' });
    });
  });
});
