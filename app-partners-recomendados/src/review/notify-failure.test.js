// Testes de `notify-failure.js` (WRTE-05/D-39/D-40, Pitfall 5 do 05-RESEARCH.md).
//
// Stub de `globalThis.fetch` por teste (mesmo padrão de `client.test.js`/Test 10 de
// `write-executor.test.js`): salva/restaura o fetch original em beforeEach/afterEach.
// `WRITE_FAILURE_WEBHOOK_URL` é salvo/restaurado/limpo entre testes (nunca vazar entre
// casos).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { notifyWriteFailure } from './notify-failure.js';

describe('notifyWriteFailure', () => {
  const originalFetch = globalThis.fetch;
  const originalWebhookUrl = process.env.WRITE_FAILURE_WEBHOOK_URL;

  beforeEach(() => {
    delete process.env.WRITE_FAILURE_WEBHOOK_URL;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalWebhookUrl === undefined) {
      delete process.env.WRITE_FAILURE_WEBHOOK_URL;
    } else {
      process.env.WRITE_FAILURE_WEBHOOK_URL = originalWebhookUrl;
    }
  });

  it('retorna notified:false sem chamar fetch quando webhook não está configurado', async () => {
    globalThis.fetch = () => {
      throw new Error('fetch NUNCA deveria ser chamado sem webhook configurado');
    };

    const result = await notifyWriteFailure({
      productId: '123',
      error: new Error('falha ao gravar'),
      triggeredBy: 'operador',
    });

    expect(result).toEqual({ notified: false, reason: 'webhook not configured' });
  });

  it('faz POST com payload correto (sem dados de autenticação) e retorna notified:true em sucesso', async () => {
    process.env.WRITE_FAILURE_WEBHOOK_URL = 'https://hooks.example.com/webhook';
    let captured = null;
    globalThis.fetch = async (url, options) => {
      captured = { url, method: options.method, headers: options.headers, body: JSON.parse(options.body) };
      return new Response('', { status: 200 });
    };

    const result = await notifyWriteFailure({
      productId: '123',
      error: new Error('falha ao gravar'),
      triggeredBy: 'operador',
    });

    expect(result).toEqual({ notified: true });
    expect(captured.url).toBe('https://hooks.example.com/webhook');
    expect(captured.method).toBe('POST');
    expect(captured.headers['Content-Type']).toBe('application/json');
    expect(captured.body.productId).toBe('123');
    expect(captured.body.triggeredBy).toBe('operador');
    expect(captured.body.error).toBe('falha ao gravar');
    expect(typeof captured.body.timestamp).toBe('string');
    expect(captured.body.text).toContain('falha ao gravar');
    expect(captured.body.content).toBe(captured.body.text);
    expect(captured.body.accessToken).toBeUndefined();
    expect(captured.headers.Authorization).toBeUndefined();
  });

  it('retorna notified:false com reason de status quando a resposta não é ok', async () => {
    process.env.WRITE_FAILURE_WEBHOOK_URL = 'https://hooks.example.com/webhook';
    globalThis.fetch = async () => new Response('erro', { status: 500 });

    const result = await notifyWriteFailure({
      productId: '123',
      error: new Error('falha ao gravar'),
      triggeredBy: 'operador',
    });

    expect(result).toEqual({ notified: false, reason: 'webhook status 500' });
  });

  it('Pitfall 5: exceção do fetch NUNCA propaga — await não rejeita, mesmo com fetch que lança', async () => {
    process.env.WRITE_FAILURE_WEBHOOK_URL = 'https://hooks.example.com/webhook';
    globalThis.fetch = () => {
      throw new Error('rede fora do ar');
    };

    await expect(
      notifyWriteFailure({
        productId: '123',
        error: new Error('falha ao gravar'),
        triggeredBy: 'operador',
      })
    ).resolves.toEqual({ notified: false, reason: 'rede fora do ar' });
  });
});
