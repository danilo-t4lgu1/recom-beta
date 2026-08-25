// Testes de `circuit-breaker.js` (disjuntor churn/apagão, D-63).
//
// Módulo PURO, zero-import, zero-I/O — testado por pureza (mesma disciplina de
// `review-queue.js`/`product-group.js`). Nenhum mock necessário: entradas
// controladas, saída determinística. O disjuntor é a segunda rede de segurança
// (a Defesa 1 é a primeira) contra uma escrita em massa perigosa: churn (fração
// do conjunto que muda vs. baseline gravado) e apagão (fração dos que TINHAM
// recomendação e ficariam vazios).

import { describe, it, expect } from 'vitest';
import { setsEqual, tripBreaker } from './circuit-breaker.js';

/** Constrói um baseline `Map<string, string[]>` a partir de um objeto simples. */
function baselineOf(obj) {
  return new Map(Object.entries(obj).map(([k, v]) => [String(k), v]));
}

describe('setsEqual', () => {
  it('true para os mesmos ids em ordem diferente (ignora ordem)', () => {
    expect(setsEqual(['1', '2', '3'], ['3', '1', '2'])).toBe(true);
  });

  it('true comparando number vs string (coerção por String, sem falso-positivo)', () => {
    expect(setsEqual([1, 2], ['1', '2'])).toBe(true);
  });

  it('false para tamanhos diferentes', () => {
    expect(setsEqual(['1'], ['1', '2'])).toBe(false);
  });

  it('false quando um id difere', () => {
    expect(setsEqual(['1', '2'], ['1', '3'])).toBe(false);
  });

  it('true para dois vazios; trata null/undefined como vazio', () => {
    expect(setsEqual([], [])).toBe(true);
    expect(setsEqual(null, undefined)).toBe(true);
    expect(setsEqual([], null)).toBe(true);
  });
});

describe('tripBreaker (disjuntor D-63)', () => {
  it('isFirstRollout:true NUNCA dispara, mesmo com churn/apagão de 100%', () => {
    // 3 produtos que TINHAM recomendação e ficariam todos vazios => churn 100%,
    // apagão 100% — mas o 1º rollout é explicitamente isento (D-63/D-64).
    const toWrite = [
      { productId: 'a', recommendedIds: [] },
      { productId: 'b', recommendedIds: [] },
      { productId: 'c', recommendedIds: [] },
    ];
    const baseline = baselineOf({ a: ['x'], b: ['y'], c: ['z'] });
    const result = tripBreaker({ toWrite, baseline, isFirstRollout: true });
    expect(result.trip).toBe(false);
  });

  it('churn 40% (>30%) dispara com reason citando churn', () => {
    // 10 produtos; 4 mudam para um conjunto diferente NÃO-vazio (não é apagão),
    // 6 permanecem iguais ao baseline => churn 4/10 = 40%, apagão 0%.
    const toWrite = [];
    const base = {};
    for (let i = 0; i < 10; i++) {
      const id = `p${i}`;
      if (i < 4) {
        base[id] = ['old'];
        toWrite.push({ productId: id, recommendedIds: ['new'] }); // mudou (não vazio)
      } else {
        base[id] = ['same'];
        toWrite.push({ productId: id, recommendedIds: ['same'] }); // igual
      }
    }
    const result = tripBreaker({ toWrite, baseline: baselineOf(base), isFirstRollout: false });
    expect(result.trip).toBe(true);
    expect(result.reason).toMatch(/churn/i);
  });

  it('apagão 20% (>10%) dispara com reason citando apagão, sem estourar o churn antes', () => {
    // 10 produtos, todos TINHAM recomendação (hadBefore=10). 2 ficam vazios
    // (apagão 2/10 = 20%). churn = 2/10 = 20% (< 30%) => a checagem de churn NÃO
    // dispara antes; o apagão é quem dispara.
    const toWrite = [];
    const base = {};
    for (let i = 0; i < 10; i++) {
      const id = `p${i}`;
      base[id] = ['old'];
      toWrite.push({ productId: id, recommendedIds: i < 2 ? [] : ['old'] });
    }
    const result = tripBreaker({ toWrite, baseline: baselineOf(base), isFirstRollout: false });
    expect(result.trip).toBe(true);
    expect(result.reason).toMatch(/apag/i);
  });

  it('churn 10% e apagão 5% NÃO disparam', () => {
    // 20 produtos, todos com baseline (hadBefore=20). 1 vira vazio (apagão 1/20=5%),
    // 1 muda para conjunto diferente não-vazio => churn total 2/20 = 10%.
    const toWrite = [];
    const base = {};
    for (let i = 0; i < 20; i++) {
      const id = `p${i}`;
      base[id] = ['old'];
      if (i === 0) toWrite.push({ productId: id, recommendedIds: [] }); // apagão
      else if (i === 1) toWrite.push({ productId: id, recommendedIds: ['new'] }); // churn
      else toWrite.push({ productId: id, recommendedIds: ['old'] }); // igual
    }
    const result = tripBreaker({ toWrite, baseline: baselineOf(base), isFirstRollout: false });
    expect(result.trip).toBe(false);
  });

  it('conjunto vazio (nada a gravar) não dispara', () => {
    expect(tripBreaker({ toWrite: [], baseline: new Map(), isFirstRollout: false }).trip).toBe(false);
  });

  it('limiares customizados são respeitados (churnMax mais apertado dispara antes)', () => {
    const toWrite = [
      { productId: 'a', recommendedIds: ['new'] },
      { productId: 'b', recommendedIds: ['old'] },
      { productId: 'c', recommendedIds: ['old'] },
      { productId: 'd', recommendedIds: ['old'] },
    ];
    const baseline = baselineOf({ a: ['old'], b: ['old'], c: ['old'], d: ['old'] });
    // churn 1/4 = 25%: default (30%) não dispara; churnMax 0.10 dispara.
    expect(tripBreaker({ toWrite, baseline, isFirstRollout: false }).trip).toBe(false);
    expect(tripBreaker({ toWrite, baseline, isFirstRollout: false, churnMax: 0.1 }).trip).toBe(true);
  });
});

describe('tripBreaker — escalonamento por dias-sem-sucesso (D-63 revisão, 2026-08-25)', () => {
  // Achado: um abort congela o baseline (write_log só avança em sucesso); sem
  // escalonar o limiar pelos dias decorridos, o churn acumulado de N dias é
  // medido contra o mesmo limiar de 1 dia e o disjuntor nunca destrava sozinho
  // (visto na prática: 11→25/08/2026, 14 aborts seguidos, churn 68%→87,6%).

  function churnToWriteAt(fraction, total = 10) {
    const toWrite = [];
    const base = {};
    const changedCount = Math.round(fraction * total);
    for (let i = 0; i < total; i++) {
      const id = `p${i}`;
      base[id] = ['old'];
      toWrite.push({ productId: id, recommendedIds: i < changedCount ? ['new'] : ['old'] });
    }
    return { toWrite, baseline: baselineOf(base) };
  }

  it('daysSinceLastSuccess ausente/≤1: comportamento idêntico ao pré-revisão (churn 40% dispara)', () => {
    const { toWrite, baseline } = churnToWriteAt(0.4);
    expect(tripBreaker({ toWrite, baseline, isFirstRollout: false }).trip).toBe(true);
    expect(tripBreaker({ toWrite, baseline, isFirstRollout: false, daysSinceLastSuccess: 1 }).trip).toBe(true);
    expect(tripBreaker({ toWrite, baseline, isFirstRollout: false, daysSinceLastSuccess: 0.5 }).trip).toBe(true);
  });

  it('churn 40% NÃO dispara com 2 dias sem sucesso (limiar efetivo escala para 60%)', () => {
    const { toWrite, baseline } = churnToWriteAt(0.4);
    const result = tripBreaker({ toWrite, baseline, isFirstRollout: false, daysSinceLastSuccess: 2 });
    expect(result.trip).toBe(false);
  });

  it('churn 68% (caso real de 13/08) dispara com 1 dia mas passa com 3 dias', () => {
    const { toWrite, baseline } = churnToWriteAt(0.68, 100);
    expect(tripBreaker({ toWrite, baseline, isFirstRollout: false, daysSinceLastSuccess: 1 }).trip).toBe(true);
    expect(tripBreaker({ toWrite, baseline, isFirstRollout: false, daysSinceLastSuccess: 3 }).trip).toBe(false);
  });

  it('teto absoluto (churnCeiling): mesmo com muitos dias acumulados, churn 95% ainda dispara', () => {
    const { toWrite, baseline } = churnToWriteAt(0.95, 100);
    // 100 dias * 30% estouraria muito o teto sem o cap — churnCeiling (default 90%) prevalece.
    const result = tripBreaker({ toWrite, baseline, isFirstRollout: false, daysSinceLastSuccess: 100 });
    expect(result.trip).toBe(true);
    expect(result.reason).toMatch(/90%/);
  });

  it('apagão também escala: 20% de apagão não dispara com 3 dias sem sucesso (limiar efetivo 30%)', () => {
    const toWrite = [];
    const base = {};
    for (let i = 0; i < 10; i++) {
      const id = `p${i}`;
      base[id] = ['old'];
      toWrite.push({ productId: id, recommendedIds: i < 2 ? [] : ['old'] });
    }
    const result = tripBreaker({
      toWrite,
      baseline: baselineOf(base),
      isFirstRollout: false,
      daysSinceLastSuccess: 3,
    });
    expect(result.trip).toBe(false);
  });
});
