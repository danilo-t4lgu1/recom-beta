// Testes de `write-executor.js` (APRV-04/SC#4, Pitfall 5 do RESEARCH).
//
// Tests 8/9 usam decisões mockadas (objeto literal, sem SQLite, mesma
// disciplina de `approval-gate.test.js`). Test 10 salva `globalThis.fetch`
// original antes de substituir por um stub que lança, e restaura depois —
// prova comportamental de que nem o ramo "não dry-run" faz qualquer chamada
// de rede nesta fase.

import { describe, it, expect, afterEach } from 'vitest';
import { ApprovalRequiredError } from './approval-gate.js';
import { executeApprovedWrite } from './write-executor.js';

describe('executeApprovedWrite', () => {
  it('Test 7: lança ApprovalRequiredError (propagada de assertApproved) quando decision é null', () => {
    expect(() =>
      executeApprovedWrite({ productId: '1', decision: null, dryRun: true })
    ).toThrow(ApprovalRequiredError);
  });

  it("Test 8: com decisão 'approved' e dryRun:true, NÃO lança e retorna shape stub esperado", () => {
    const decision = { status: 'approved', approvedRecommendationIds: ['2'] };
    const result = executeApprovedWrite({ productId: '1', decision, dryRun: true });

    expect(result).toEqual({
      productId: '1',
      approvedIds: ['2'],
      dryRun: true,
      written: false,
      reason: expect.stringContaining('stub'),
    });
  });

  it('Test 9: mesma decisão do Test 8 com dryRun:false produz o MESMO shape/valores (só dryRun difere)', () => {
    const decision = { status: 'approved', approvedRecommendationIds: ['2'] };
    const resultDryRun = executeApprovedWrite({ productId: '1', decision, dryRun: true });
    const resultReal = executeApprovedWrite({ productId: '1', decision, dryRun: false });

    expect(resultReal.approvedIds).toEqual(resultDryRun.approvedIds);
    expect(resultReal.written).toBe(resultDryRun.written);
    expect(resultReal.reason).toBe(resultDryRun.reason);
    expect(resultReal.dryRun).toBe(false);
    expect(resultDryRun.dryRun).toBe(true);
  });

  describe('Test 10: nenhuma chamada de rede é feita mesmo com dryRun:false', () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('stub de fetch que lança nunca é invocado', () => {
      globalThis.fetch = () => {
        throw new Error('fetch NUNCA deveria ser chamado nesta fase');
      };

      const decision = { status: 'approved', approvedRecommendationIds: ['2'] };
      expect(() =>
        executeApprovedWrite({ productId: '1', decision, dryRun: false })
      ).not.toThrow();
    });
  });

  it('Test 11: dryRun ausente (undefined) não lança erro de tipo — tratado como falsy', () => {
    const decision = { status: 'approved', approvedRecommendationIds: ['2'] };
    let result;
    expect(() => {
      result = executeApprovedWrite({ productId: '1', decision });
    }).not.toThrow();
    expect(result.dryRun).toBeFalsy();
    expect(result.approvedIds).toEqual(['2']);
    expect(result.written).toBe(false);
  });
});
