// Testes de src/ingestion/fabric-taxonomy.js (DATA-03).
//
// Confirmado no checkpoint humano (Task 0, Open Question A4, 02-02-SUMMARY.md):
// a tag de tecido vive no campo NATIVO `product.tags` (string separada por vírgula,
// compartilhada com outras tags de marketing/SEO já existentes) — não um Metafield
// customizado. Estes testes leem `product.tags` diretamente, seguindo Pattern 3 do
// 02-RESEARCH.md.

import { describe, it, expect } from 'vitest';
import { auditFabricTags } from './fabric-taxonomy.js';

describe('auditFabricTags', () => {
  it('retorna unmapped vazio quando todas as tags brutas existem no canonicalMap (Test 1)', () => {
    const products = [{ tags: 'algodão, viscose' }, { tags: 'algodão' }];
    const canonicalMap = new Map([
      ['algodão', 'Algodão'],
      ['viscose', 'Viscose'],
    ]);
    const { unmapped } = auditFabricTags(products, canonicalMap);
    expect(unmapped.size).toBe(0);
  });

  it('inclui em unmapped qualquer tag bruta ausente do canonicalMap (Test 2)', () => {
    const products = [{ tags: 'algodão, tecido-novo' }];
    const canonicalMap = new Map([['algodão', 'Algodão']]);
    const { unmapped } = auditFabricTags(products, canonicalMap);
    expect(unmapped.has('tecido-novo')).toBe(true);
    expect(unmapped.has('algodão')).toBe(false);
  });

  it('conta frequency corretamente somando entre produtos diferentes (Test 3)', () => {
    const products = [
      { tags: 'algodão, moda fashion' },
      { tags: 'algodão' },
      { tags: 'algodão, viscose' },
    ];
    const canonicalMap = new Map();
    const { frequency } = auditFabricTags(products, canonicalMap);
    expect(frequency.get('algodão')).toBe(3);
    expect(frequency.get('moda fashion')).toBe(1);
    expect(frequency.get('viscose')).toBe(1);
  });

  it('não lança exceção e ignora product.tags vazio/null/ausente (Test 4)', () => {
    const products = [
      { tags: '' },
      { tags: null },
      {},
      { tags: 'algodão' },
    ];
    const canonicalMap = new Map();
    expect(() => auditFabricTags(products, canonicalMap)).not.toThrow();
    const { frequency } = auditFabricTags(products, canonicalMap);
    expect(frequency.size).toBe(1);
    expect(frequency.get('algodão')).toBe(1);
  });

  it('não faz fuzzy-matching/normalização — capitalizações distintas contam separadamente (Test 5)', () => {
    const products = [{ tags: 'viscose, Viscose' }];
    const canonicalMap = new Map(); // vazio: não normaliza nada
    const { frequency, unmapped } = auditFabricTags(products, canonicalMap);
    expect(frequency.get('viscose')).toBe(1);
    expect(frequency.get('Viscose')).toBe(1);
    expect(unmapped.has('viscose')).toBe(true);
    expect(unmapped.has('Viscose')).toBe(true);
  });
});
