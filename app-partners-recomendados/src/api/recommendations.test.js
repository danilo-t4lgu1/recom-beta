// Testes de `recommendations.js` (PLAT-05, Plano 08-02).
//
// `nuvemshop-client/client.js` é SEMPRE mockado (`vi.mock`, mesmo estilo de
// `write-executor.test.js` linhas 37-41) — nenhum teste deste arquivo faz uma
// chamada de rede real à Nuvemshop. `vi.clearAllMocks()` em `beforeEach` isola
// cada teste.
//
// Task 1: parseRecommendedIds retrocompatível (array puro, id único legado,
// objeto novo {ids, provenLookIds}) + parseProvenLookIds nova (só resolve o
// formato objeto, nunca lança).

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getMetafields, getProduct } from '../nuvemshop-client/client.js';
import { parseRecommendedIds, parseProvenLookIds } from './recommendations.js';

vi.mock('../nuvemshop-client/client.js', () => ({
  getMetafields: vi.fn(),
  getProduct: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('parseRecommendedIds', () => {
  it('Test 1: array puro antigo retorna os mesmos ids (comportamento inalterado)', () => {
    expect(parseRecommendedIds('["1","2"]')).toEqual(['1', '2']);
  });

  it('Test 2: id único legado retorna [id] (comportamento inalterado)', () => {
    expect(parseRecommendedIds('123')).toEqual(['123']);
  });

  it('Test 3: formato objeto novo {ids, provenLookIds} retorna só ids', () => {
    expect(parseRecommendedIds('{"ids":["1","2"],"provenLookIds":["1"]}')).toEqual(['1', '2']);
  });

  it('Test 4: null/undefined/string vazia retorna []', () => {
    expect(parseRecommendedIds(null)).toEqual([]);
    expect(parseRecommendedIds(undefined)).toEqual([]);
    expect(parseRecommendedIds('')).toEqual([]);
  });

  it('Test 5: string não-JSON retorna [rawValue] (comportamento inalterado)', () => {
    expect(parseRecommendedIds('not-json')).toEqual(['not-json']);
  });
});

describe('parseProvenLookIds', () => {
  it('Test 6: formato objeto novo retorna provenLookIds', () => {
    expect(parseProvenLookIds('{"ids":["1","2"],"provenLookIds":["1"]}')).toEqual(['1']);
  });

  it('Test 7: array puro antigo retorna [] (sem conceito de Look comprovado)', () => {
    expect(parseProvenLookIds('["1","2"]')).toEqual([]);
  });

  it('Test 8: id único legado retorna []', () => {
    expect(parseProvenLookIds('123')).toEqual([]);
  });

  it('Test 9: null/JSON inválido nunca lança e retorna []', () => {
    expect(() => parseProvenLookIds(null)).not.toThrow();
    expect(parseProvenLookIds(null)).toEqual([]);
    expect(() => parseProvenLookIds('not-json')).not.toThrow();
    expect(parseProvenLookIds('not-json')).toEqual([]);
  });
});
