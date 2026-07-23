// Testes do rate limiter adaptativo (PLAT-02/D-05) — cobre os 5 comportamentos do
// 02-01-PLAN.md Task 2: leitura dinâmica dos headers x-rate-limit-*, nunca um delay
// fixo hardcoded.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AdaptiveRateLimiter, fetchWithRateLimit } from './adaptive-limiter.js';

describe('AdaptiveRateLimiter', () => {
  describe('updateFromHeaders', () => {
    it('atualiza remaining e resetMs (Number) quando os headers estão presentes', () => {
      const limiter = new AdaptiveRateLimiter();
      const headers = new Headers({
        'x-rate-limit-remaining': '5',
        'x-rate-limit-reset': '1200',
      });

      limiter.updateFromHeaders(headers);

      expect(limiter.remaining).toBe(5);
      expect(typeof limiter.remaining).toBe('number');
      expect(limiter.resetMs).toBe(1200);
      expect(typeof limiter.resetMs).toBe('number');
    });

    it('não sobrescreve remaining/resetMs quando os headers estão ausentes', () => {
      const limiter = new AdaptiveRateLimiter();
      limiter.updateFromHeaders(
        new Headers({ 'x-rate-limit-remaining': '10', 'x-rate-limit-reset': '900' })
      );

      limiter.updateFromHeaders(new Headers());

      expect(limiter.remaining).toBe(10);
      expect(limiter.resetMs).toBe(900);
    });
  });

  describe('waitIfNeeded', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('retorna imediatamente quando remaining é null (estado inicial)', async () => {
      const limiter = new AdaptiveRateLimiter();
      expect(limiter.remaining).toBeNull();

      const promise = limiter.waitIfNeeded();
      await vi.advanceTimersByTimeAsync(0);

      await expect(promise).resolves.toBeUndefined();
    });

    it('espera pelo menos resetMs ms quando remaining <= 2', async () => {
      const limiter = new AdaptiveRateLimiter();
      limiter.remaining = 2;
      limiter.resetMs = 1000;

      let resolved = false;
      const promise = limiter.waitIfNeeded().then(() => {
        resolved = true;
      });

      await vi.advanceTimersByTimeAsync(999);
      expect(resolved).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      await promise;
      expect(resolved).toBe(true);
    });

    it('retorna imediatamente quando remaining > 2', async () => {
      const limiter = new AdaptiveRateLimiter();
      limiter.remaining = 3;
      limiter.resetMs = 5000;

      const promise = limiter.waitIfNeeded();
      await vi.advanceTimersByTimeAsync(0);

      await expect(promise).resolves.toBeUndefined();
    });
  });
});

describe('fetchWithRateLimit — retry de erros transitórios (502/503/504 e rede)', () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = realFetch;
  });

  it('reintenta em 502 e retorna a resposta OK assim que a chamada seguinte funciona', async () => {
    let calls = 0;
    globalThis.fetch = vi.fn(async () => {
      calls += 1;
      if (calls === 1) return new Response('bad gateway', { status: 502 });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    const promise = fetchWithRateLimit('https://api.tiendanube.com/v1/x/metafields/products');
    await vi.advanceTimersByTimeAsync(500);
    const response = await promise;

    expect(calls).toBe(2);
    expect(response.status).toBe(200);
  });

  it('devolve a última resposta ruim (não lança) após esgotar as tentativas de 503', async () => {
    globalThis.fetch = vi.fn(async () => new Response('service unavailable', { status: 503 }));

    const promise = fetchWithRateLimit('https://api.tiendanube.com/v1/x/metafields/products');
    await vi.advanceTimersByTimeAsync(500 + 1000 + 2000);
    const response = await promise;

    expect(globalThis.fetch).toHaveBeenCalledTimes(4); // tentativa inicial + 3 retries
    expect(response.status).toBe(503);
  });

  it('não reintenta em 500 (propagado imediatamente, comportamento preexistente)', async () => {
    globalThis.fetch = vi.fn(async () => new Response('erro interno', { status: 500 }));

    const response = await fetchWithRateLimit('https://api.tiendanube.com/v1/x/metafields/products');

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(500);
  });

  it('reintenta quando fetch rejeita (erro de rede, ex: ECONNRESET) e depois sucede', async () => {
    let calls = 0;
    globalThis.fetch = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new Error('ECONNRESET');
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    const promise = fetchWithRateLimit('https://api.tiendanube.com/v1/x/metafields/products');
    await vi.advanceTimersByTimeAsync(500);
    const response = await promise;

    expect(calls).toBe(2);
    expect(response.status).toBe(200);
  });

  it('lança erro descritivo após esgotar tentativas de erro de rede persistente', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('ECONNRESET');
    });

    const promise = fetchWithRateLimit('https://api.tiendanube.com/v1/x/metafields/products');
    const assertion = expect(promise).rejects.toThrow(/excedeu 3 tentativas após erro de rede/);
    await vi.advanceTimersByTimeAsync(500 + 1000 + 2000);
    await assertion;

    expect(globalThis.fetch).toHaveBeenCalledTimes(4);
  });
});
