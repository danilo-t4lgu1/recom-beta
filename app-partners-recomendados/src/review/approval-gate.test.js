// Testes de `approval-gate.js` (APRV-03/SC#3, D-25).
//
// Todos os testes usam `decision` como objeto literal MOCKADO — nunca SQLite,
// nunca `catalog-store.js`. `assertApproved` é síncrona e sem I/O; o único
// jeito de provar isso é não importar nenhum módulo de banco aqui.

import { describe, it, expect } from 'vitest';
import { ApprovalRequiredError, assertApproved } from './approval-gate.js';

describe('assertApproved', () => {
  it('Test 1: lança ApprovalRequiredError quando a decisão é null (inexistente)', () => {
    expect(() => assertApproved('1', null)).toThrow(ApprovalRequiredError);
  });

  it("Test 2: lança ApprovalRequiredError quando a decisão existe mas status é 'rejected'", () => {
    expect(() =>
      assertApproved('1', { status: 'rejected', approvedRecommendationIds: null })
    ).toThrow(ApprovalRequiredError);
  });

  it("Test 3: lança ApprovalRequiredError para qualquer status diferente de 'approved' (ex: 'pending')", () => {
    expect(() =>
      assertApproved('1', { status: 'pending', approvedRecommendationIds: null })
    ).toThrow(ApprovalRequiredError);
  });

  it("Test 4: NÃO lança e retorna exatamente o conjunto aprovado (D-25) quando status é 'approved'", () => {
    const decision = { status: 'approved', approvedRecommendationIds: ['2', '3'] };
    let result;
    expect(() => {
      result = assertApproved('1', decision);
    }).not.toThrow();
    expect(result).toEqual(['2', '3']);
  });

  it('Test 5: o erro lançado tem .name, .productId e mensagem informativa com o productId', () => {
    try {
      assertApproved('42', null);
      throw new Error('esperava que assertApproved lançasse');
    } catch (err) {
      expect(err.name).toBe('ApprovalRequiredError');
      expect(err.productId).toBe('42');
      expect(err.message).toContain('42');
    }
  });

  it('Test 6: assertApproved é síncrona e não faz I/O — decision mockado manualmente já basta', () => {
    // Nenhum import de catalog-store.js/SQLite neste arquivo de teste — a
    // própria ausência de import já é a prova estrutural. Este teste apenas
    // confirma que a chamada com objeto literal funciona sem qualquer setup
    // assíncrono (sem await, sem Promise).
    const decision = { status: 'approved', approvedRecommendationIds: [] };
    const result = assertApproved('1', decision);
    expect(result).toEqual([]);
  });
});
