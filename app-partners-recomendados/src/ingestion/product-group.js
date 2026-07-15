// Resolução de Grupo de Produtos (RULE-01, D-26 a D-31, D-33/D-34/D-35).
//
// Este módulo estende o motor de recomendação (Fase 3) com uma quarta
// dimensão de elegibilidade — Grupo de Produtos — que decide QUAL POOL de
// candidatos um produto pode acessar (Look Inteiro auto-contido vs. mescla
// Partes de Cima/Baixo), nunca um nível extra da cascata de desempate D-13
// (D-30/D-31 — "Grupo" aqui não reabre D-14, a decisão de descartar Grupo
// como critério de DESEMPATE, tomada na Fase 3).
//
// D-26: os 3 grupos e o mapeamento fechado de categoria Nuvemshop -> grupo:
//   Look Inteiro = Vestidos, Macacões, Macaquinhos
//   Partes de Cima = Blusas, Croppeds, Corsets, Camisas e Coletes, Blazers e Jaquetas
//   Partes de Baixo = Calças, Shorts, Saias
// Confirmado pelo usuário como exaustivo: a loja não trabalha com categorias
// fora desses 3 grupos hoje (03.1-CONTEXT.md).
//
// D-27: Look Inteiro é auto-contido — nunca mescla com Partes de Cima/Baixo.
// D-28: Partes de Cima e Partes de Baixo mesclam entre si (cota 4+4, ver
// recommendation-engine.js para a composição da cota — este módulo só
// resolve QUAL é o grupo cruzado, não implementa a cota).
//
// Divergência crítica em relação a `fabric-taxonomy.js` (D-32): tecido
// resolve por CONTENÇÃO de palavra-chave porque a tag é texto livre
// composto ("vestido malha midi"). Categoria resolve por IGUALDADE EXATA
// após normalizar (trim + minúsculas) porque é um enum fechado de valor
// único por produto (D-26) — NUNCA usar `.includes()`/substring aqui, só
// `Map.get` após normalização. Usar contenção aqui criaria falsos positivos
// entre nomes de categoria que compartilham substring.
//
// Pitfall 3 (03.1-RESEARCH.md): ao contrário de tecido não mapeado (D-09,
// esperado — planilha ainda não importada), categoria não mapeada aqui é
// INESPERADA (D-26 confirma exaustividade das 11 categorias conhecidas) —
// pode ser variação de grafia, categoria nova criada no admin, ou erro de
// extração do campo `categories[]`. `auditProductGroups` torna essa
// ocorrência sempre visível (frequency + unmapped), nunca silenciosa; quem
// consome `unmapped` (Plano 03.1-04, ingestão) deve logar de forma visível
// (`console.warn`), não apenas descartar.
//
// Módulo puro, zero I/O, zero import — mesmo padrão de `fabric-taxonomy.js`.
// É consumido pela ingestão (Plano 03.1-04, que grava `productGroupCanonical`
// já resolvido em `catalog_snapshots`). O motor de recomendação (Plano
// 03.1-02) NUNCA importa este arquivo — duplica as constantes/funções de
// grupo internamente para preservar zero-import (RULE-02); o motor só
// consome o valor já resolvido, nunca uma categoria crua nem este mapa.

export const GROUP_LOOK_INTEIRO = 'Look Inteiro';
export const GROUP_PARTES_DE_CIMA = 'Partes de Cima';
export const GROUP_PARTES_DE_BAIXO = 'Partes de Baixo';

// D-26: mapeamento fechado, confirmado pelo usuário como exaustivo no
// catálogo real. Chave = categoria normalizada (trim + minúsculas), grafia
// EXATA com acento (não a grafia sem acento do pseudocódigo de
// 03.1-RESEARCH.md — ver correção documentada no bloco <interfaces> do
// plano 03.1-01: a categoria real da Nuvemshop usa a grafia com acento
// correta em português, "Calças"/"Macacões", nunca "calcas"/"macacoes").
const CATEGORY_TO_GROUP_MAP = new Map([
  ['vestidos', GROUP_LOOK_INTEIRO],
  ['macacões', GROUP_LOOK_INTEIRO],
  ['macaquinhos', GROUP_LOOK_INTEIRO],
  ['blusas', GROUP_PARTES_DE_CIMA],
  ['croppeds', GROUP_PARTES_DE_CIMA],
  ['corsets', GROUP_PARTES_DE_CIMA],
  ['camisas e coletes', GROUP_PARTES_DE_CIMA],
  ['blazers e jaquetas', GROUP_PARTES_DE_CIMA],
  ['calças', GROUP_PARTES_DE_BAIXO],
  ['shorts', GROUP_PARTES_DE_BAIXO],
  ['saias', GROUP_PARTES_DE_BAIXO],
]);

/**
 * Resolve a categoria bruta de um produto Nuvemshop (`product.categories[0].name.pt`,
 * já extraída por `extractCategoryRaw`) para um dos 3 grupos canônicos (D-26).
 * Resolução por IGUALDADE EXATA após normalizar (trim + minúsculas) — nunca
 * substring/fuzzy, ao contrário do resolver de tecido (D-32). Categoria fora
 * do mapa fechado retorna `null` explícito (fail-closed) — nunca lança, nunca
 * assume um grupo default "por segurança" (T-03.1-02).
 * @param {string|*} categoryRaw
 * @returns {'Look Inteiro'|'Partes de Cima'|'Partes de Baixo'|null}
 */
export function resolveProductGroup(categoryRaw) {
  if (typeof categoryRaw !== 'string') return null;
  return CATEGORY_TO_GROUP_MAP.get(categoryRaw.trim().toLowerCase()) ?? null;
}

/**
 * Devolve o grupo cruzado que mescla com o grupo dado (D-28: Partes de Cima
 * <-> Partes de Baixo). Look Inteiro é auto-contido (D-27) — devolve `null`,
 * assim como qualquer valor desconhecido/nulo (nunca lança, nunca assume um
 * par por padrão).
 * @param {string|*} group
 * @returns {'Partes de Cima'|'Partes de Baixo'|null}
 */
export function crossGroupOf(group) {
  if (group === GROUP_PARTES_DE_CIMA) return GROUP_PARTES_DE_BAIXO;
  if (group === GROUP_PARTES_DE_BAIXO) return GROUP_PARTES_DE_CIMA;
  return null;
}

/**
 * Extrai a categoria bruta (`name.pt`) do shape real de produto retornado
 * pela API pública da Nuvemshop (`product.categories[0].name.pt`), com
 * guardas de nulidade em cada nível de navegação. Nunca lança, nunca assume
 * shape completo presente — mesma convenção defensiva de
 * `findAttributeIndex`/`extractVariantValueByAttributeName` em
 * `ingest-catalog.js`. Retorna `null` em qualquer ponto de falha (produto
 * ausente, `categories` ausente/vazio, primeiro elemento sem `name.pt`
 * string).
 * @param {object|*} product objeto produto no shape da API pública
 * @returns {string|null}
 */
export function extractCategoryRaw(product) {
  const categories = product?.categories;
  if (!Array.isArray(categories) || categories.length === 0) return null;

  const categoryPt = categories[0]?.name?.pt;
  if (typeof categoryPt !== 'string') return null;

  return categoryPt.trim();
}

/**
 * Audita a categoria bruta de um lote de produtos, contando frequência e
 * identificando toda categoria que `resolveProductGroup` não resolve para
 * nenhum grupo conhecido (Pitfall 3 do 03.1-RESEARCH.md) — mesmo formato de
 * retorno de `auditFabricTags` (`{ frequency, unmapped }`), mas iterando via
 * `extractCategoryRaw` (não `product.tags`). Ao contrário de tecido não
 * mapeado (esperado, D-09), categoria não mapeada é INESPERADA (D-26
 * confirma exaustividade) — esta função existe para tornar essa ocorrência
 * sempre visível, nunca silenciosa. Produtos cujo `extractCategoryRaw`
 * retorna `null` são pulados (não há categoria bruta nenhuma para auditar,
 * não incrementam `frequency` nem entram em `unmapped`). Nunca lança, mesmo
 * para lote vazio/undefined.
 * @param {Array<object>} products lote de produtos desta execução
 * @returns {{ frequency: Map<string, number>, unmapped: Set<string> }}
 */
export function auditProductGroups(products) {
  const frequency = new Map();
  const unmapped = new Set();

  for (const product of products || []) {
    const categoryRaw = extractCategoryRaw(product);
    if (categoryRaw == null) continue;

    frequency.set(categoryRaw, (frequency.get(categoryRaw) || 0) + 1);
    if (resolveProductGroup(categoryRaw) == null) unmapped.add(categoryRaw);
  }

  return { frequency, unmapped };
}
