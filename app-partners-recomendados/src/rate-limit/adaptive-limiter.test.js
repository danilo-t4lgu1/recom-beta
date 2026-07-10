// Testes do rate limiter adaptativo (PLAT-02/D-05) — cobre os 5 comportamentos do
// 02-01-PLAN.md Task 2: leitura dinâmica dos headers x-rate-limit-*, nunca um delay
// fixo hardcoded.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AdaptiveRateLimiter } from './adaptive-limiter.js';

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
