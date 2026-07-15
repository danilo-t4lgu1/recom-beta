// Testes de src/ingestion/product-group.js (RULE-01, D-26 a D-31, Pitfall 3
// do 03.1-RESEARCH.md).
//
// Cobre os 11 comportamentos do bloco <behavior> do plano 03.1-01:
// Test 1: as 11 categorias conhecidas resolvem para o grupo canônico correto
// Test 2: categoria fora do mapa retorna null, nunca lança
// Test 3: entrada não-string retorna null, nunca lança
// Test 4: normalização trim + case-insensitive
// Test 5: crossGroupOf mescla Partes de Cima <-> Partes de Baixo (D-28)
// Test 6: crossGroupOf(Look Inteiro)/desconhecido/null retornam null (D-27)
// Test 7: extractCategoryRaw extrai corretamente do shape real da API
// Test 8: extractCategoryRaw nunca lança para shape ausente/malformado
// Test 9: auditProductGroups conta frequency corretamente entre produtos
// Test 10: auditProductGroups inclui em unmapped toda categoria não mapeada
// Test 11: auditProductGroups nunca lança para lote vazio/produtos sem categories[]

import { describe, it, expect } from 'vitest';
import {
  resolveProductGroup,
  crossGroupOf,
  extractCategoryRaw,
  auditProductGroups,
  GROUP_LOOK_INTEIRO,
  GROUP_PARTES_DE_CIMA,
  GROUP_PARTES_DE_BAIXO,
} from './product-group.js';

describe('resolveProductGroup', () => {
  it('resolve as 11 categorias conhecidas (D-26) para o grupo canônico correto (Test 1)', () => {
    expect(resolveProductGroup('Vestidos')).toBe(GROUP_LOOK_INTEIRO);
    expect(resolveProductGroup('Macacões')).toBe(GROUP_LOOK_INTEIRO);
    expect(resolveProductGroup('Macaquinhos')).toBe(GROUP_LOOK_INTEIRO);
    expect(resolveProductGroup('Blusas')).toBe(GROUP_PARTES_DE_CIMA);
    expect(resolveProductGroup('Croppeds')).toBe(GROUP_PARTES_DE_CIMA);
    expect(resolveProductGroup('Corsets')).toBe(GROUP_PARTES_DE_CIMA);
    expect(resolveProductGroup('Camisas e Coletes')).toBe(GROUP_PARTES_DE_CIMA);
    expect(resolveProductGroup('Blazers e Jaquetas')).toBe(GROUP_PARTES_DE_CIMA);
    expect(resolveProductGroup('Calças')).toBe(GROUP_PARTES_DE_BAIXO);
    expect(resolveProductGroup('Shorts')).toBe(GROUP_PARTES_DE_BAIXO);
    expect(resolveProductGroup('Saias')).toBe(GROUP_PARTES_DE_BAIXO);
  });

  it('retorna null para categoria fora do mapa, nunca lança (Test 2)', () => {
    expect(resolveProductGroup('Acessórios')).toBeNull();
    expect(resolveProductGroup('Calçados')).toBeNull();
    expect(() => resolveProductGroup('categoria-inexistente')).not.toThrow();
  });

  it('retorna null para entrada não-string, nunca lança (Test 3)', () => {
    expect(resolveProductGroup(null)).toBeNull();
    expect(resolveProductGroup(undefined)).toBeNull();
    expect(resolveProductGroup(42)).toBeNull();
    expect(() => resolveProductGroup(null)).not.toThrow();
    expect(() => resolveProductGroup(undefined)).not.toThrow();
    expect(() => resolveProductGroup(42)).not.toThrow();
  });

  it('normaliza por trim + case-insensitive (Test 4)', () => {
    expect(resolveProductGroup(' Blusas ')).toBe(GROUP_PARTES_DE_CIMA);
    expect(resolveProductGroup('BLUSAS')).toBe(GROUP_PARTES_DE_CIMA);
    expect(resolveProductGroup('blusas')).toBe(GROUP_PARTES_DE_CIMA);
    expect(resolveProductGroup('Blusas')).toBe(GROUP_PARTES_DE_CIMA);
  });
});

describe('crossGroupOf', () => {
  it('devolve o grupo cruzado para Partes de Cima/Baixo (D-28) (Test 5)', () => {
    expect(crossGroupOf(GROUP_PARTES_DE_CIMA)).toBe(GROUP_PARTES_DE_BAIXO);
    expect(crossGroupOf(GROUP_PARTES_DE_BAIXO)).toBe(GROUP_PARTES_DE_CIMA);
  });

  it('retorna null para Look Inteiro (auto-contido, D-27), desconhecido e null (Test 6)', () => {
    expect(crossGroupOf(GROUP_LOOK_INTEIRO)).toBeNull();
    expect(crossGroupOf('valor desconhecido')).toBeNull();
    expect(crossGroupOf(null)).toBeNull();
    expect(crossGroupOf(undefined)).toBeNull();
  });
});

describe('extractCategoryRaw', () => {
  it('extrai corretamente de um produto com shape real da API (Test 7)', () => {
    const product = {
      categories: [
        {
          id: 123,
          name: { pt: 'Blusas', es: 'Blusas ES', en: 'Blouses' },
          handle: { pt: 'blusas' },
          parent: null,
          subcategories: [],
        },
      ],
    };
    expect(extractCategoryRaw(product)).toBe('Blusas');
  });

  it('retorna null (nunca lança) para shape ausente/vazio/malformado (Test 8)', () => {
    expect(extractCategoryRaw({ categories: [] })).toBeNull();
    expect(extractCategoryRaw({})).toBeNull();
    expect(extractCategoryRaw(null)).toBeNull();
    expect(extractCategoryRaw(undefined)).toBeNull();
    expect(extractCategoryRaw({ categories: [{ id: 1 }] })).toBeNull();
    expect(extractCategoryRaw({ categories: [{ id: 1, name: {} }] })).toBeNull();
    expect(extractCategoryRaw({ categories: [{ id: 1, name: { pt: 42 } }] })).toBeNull();
    expect(() => extractCategoryRaw(null)).not.toThrow();
    expect(() => extractCategoryRaw(undefined)).not.toThrow();
    expect(() => extractCategoryRaw({})).not.toThrow();
  });
});

describe('auditProductGroups', () => {
  it('conta frequency corretamente por categoria bruta distinta entre produtos diferentes (Test 9)', () => {
    const products = [
      { categories: [{ name: { pt: 'Blusas' } }] },
      { categories: [{ name: { pt: 'Blusas' } }] },
      { categories: [{ name: { pt: 'Calças' } }] },
    ];
    const { frequency } = auditProductGroups(products);
    expect(frequency.get('Blusas')).toBe(2);
    expect(frequency.get('Calças')).toBe(1);
  });

  it('inclui em unmapped toda categoria não mapeada, e NÃO inclui as 11 conhecidas (Test 10)', () => {
    const products = [
      { categories: [{ name: { pt: 'Blusas' } }] },
      { categories: [{ name: { pt: 'Acessórios' } }] },
    ];
    const { unmapped } = auditProductGroups(products);
    expect(unmapped.has('Acessórios')).toBe(true);
    expect(unmapped.has('Blusas')).toBe(false);
  });

  it('nunca lança para lote vazio/undefined ou produtos sem categories[] extraível (Test 11)', () => {
    expect(() => auditProductGroups([])).not.toThrow();
    expect(() => auditProductGroups(undefined)).not.toThrow();

    const products = [
      { categories: [] },
      {},
      { categories: [{ name: { pt: 'Blusas' } }] },
    ];
    const { frequency, unmapped } = auditProductGroups(products);
    expect(frequency.size).toBe(1);
    expect(frequency.get('Blusas')).toBe(1);
    expect(unmapped.size).toBe(0);
  });
});
