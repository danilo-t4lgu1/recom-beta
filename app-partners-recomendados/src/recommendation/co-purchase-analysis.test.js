// Testes de src/recommendation/co-purchase-analysis.js.
//
// Test 1: par abaixo do minCoOccurrence é excluído (C+D count=1, E+F count=2, ambos
//   < minCoOccurrence=3 default)
// Test 2 (o mais importante): números redondos, lift calculado à mão e conferido —
//   10 pedidos totais, produto A em 5 pedidos, produto B em 4 pedidos, co-ocorrência
//   A+B = 4 pedidos.
//     support        = 4/10 = 0.4
//     confidenceAtoB = 4/5  = 0.8
//     confidenceBtoA = 4/4  = 1.0
//     lift           = 0.4 / (0.5 * 0.4) = 0.4 / 0.2 = 2.0  (> 1, associação positiva real)
// Test 3: pedido com produto duplicado (mesmo productId 2x) não conta o mesmo par
//   duas vezes dentro do mesmo pedido

import { describe, it, expect } from 'vitest';
import { computeCoPurchasePairs } from './co-purchase-analysis.js';

function item(orderId, productId) {
  return { orderId, productId, quantity: 1 };
}

describe('computeCoPurchasePairs', () => {
  it('exclui pares abaixo de minCoOccurrence e mantém apenas o par que bate o limiar', () => {
    const orderItems = [
      // A+B co-ocorrem em 4 pedidos (o1..o4)
      item('o1', 'A'), item('o1', 'B'),
      item('o2', 'A'), item('o2', 'B'),
      item('o3', 'A'), item('o3', 'B'),
      item('o4', 'A'), item('o4', 'B'),
      // A sozinho em mais 1 pedido (total A = 5 pedidos)
      item('o5', 'A'),
      // C+D co-ocorrem em só 1 pedido (< minCoOccurrence=3)
      item('o6', 'C'),
      item('o7', 'D'),
      item('o8', 'C'), item('o8', 'D'),
      // E+F co-ocorrem em 2 pedidos (< minCoOccurrence=3)
      item('o9', 'E'), item('o9', 'F'),
      item('o10', 'E'), item('o10', 'F'),
    ];

    const pairs = computeCoPurchasePairs(orderItems, { minCoOccurrence: 3 });

    expect(pairs).toHaveLength(1);
    expect(pairs[0].productIdA).toBe('A');
    expect(pairs[0].productIdB).toBe('B');
    expect(pairs[0].count).toBe(4);
  });

  it('calcula support/confidence/lift corretos com números redondos (conferido à mão)', () => {
    const orderItems = [
      item('o1', 'A'), item('o1', 'B'),
      item('o2', 'A'), item('o2', 'B'),
      item('o3', 'A'), item('o3', 'B'),
      item('o4', 'A'), item('o4', 'B'),
      item('o5', 'A'),
      item('o6', 'C'),
      item('o7', 'D'),
      item('o8', 'C'), item('o8', 'D'),
      item('o9', 'E'), item('o9', 'F'),
      item('o10', 'E'), item('o10', 'F'),
    ];

    const pairs = computeCoPurchasePairs(orderItems, { minCoOccurrence: 3 });
    const pairAB = pairs.find((p) => p.productIdA === 'A' && p.productIdB === 'B');

    expect(pairAB.support).toBeCloseTo(0.4, 10);
    expect(pairAB.confidenceAtoB).toBeCloseTo(0.8, 10);
    expect(pairAB.confidenceBtoA).toBeCloseTo(1.0, 10);
    expect(pairAB.lift).toBeCloseTo(2.0, 10);
  });

  it('produto duplicado no mesmo pedido não conta o mesmo par duas vezes', () => {
    const orderItems = [
      item('o1', 'X'),
      item('o1', 'X'), // mesma variante/linha duplicada do mesmo produto no mesmo pedido
      item('o1', 'Y'),
    ];

    const pairs = computeCoPurchasePairs(orderItems, { minCoOccurrence: 1 });

    expect(pairs).toHaveLength(1);
    expect(pairs[0].count).toBe(1);
  });
});
