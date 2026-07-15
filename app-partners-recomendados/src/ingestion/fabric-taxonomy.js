// Auditoria contínua de taxonomia de tags de tecido (DATA-03).
//
// DECISÃO CONFIRMADA POR CHECKPOINT HUMANO (Task 0 do plano 02-02, Open Question A4
// do 02-RESEARCH.md): a tag de tipo de tecido vive no campo NATIVO `product.tags`
// (string separada por vírgula, o mesmo campo já usado hoje para tags de
// marketing/SEO como "moda fashion", "vestido", "ziper") — não em um Metafield
// customizado dedicado. Essa resposta foi registrada explicitamente pelo usuário
// (ver 02-02-SUMMARY.md), não assumida. Consequência direta: esta função lê
// `product.tags` diretamente, exatamente como 02-RESEARCH.md `## Architecture
// Patterns > Pattern 3` já descrevia como caminho A. Se a decisão futuramente mudar
// para Metafield customizado, este módulo precisará receber a lista de tags já
// extraída via `getMetafields()` em vez de ler `product.tags` — não é o caso hoje.
//
// D-06 confirma que hoje nenhum produto Vestidos tem tag de tecido preenchida — esta
// função audita o que existir a cada execução (incluindo canonicalMap vazio na
// primeira execução), nunca gera relatório de "produtos sem tag" (D-08) e nunca
// trata tag não mapeada como erro (D-09) — apenas registra em `unmapped`.
//
// NUNCA implementa fuzzy-matching/similaridade de string (Pitfall 6 de PITFALLS.md,
// T-02-07) — apenas comparação exata de string contra as chaves de `canonicalMap`.

// D-32 (2026-07-15, confirmado pelo usuário após implementação massiva de tags
// de tecido no catálogo real): as tags de tecido aparecem no campo `product.tags`
// como STRINGS COMPOSTAS ("vestido malha midi", "crepe liso azul marinho",
// "vestido alfaiataria"), nunca isoladas — um match por IGUALDADE EXATA de
// string (o desenho original D-06/D-09) exigiria uma linha curada em
// fabric_tag_canonical_map para cada variante composta, o que não escala.
// `resolveFabricTagFromTags` resolve por CONTENÇÃO de uma palavra-chave
// conhecida dentro da tag bruta — isto NÃO é fuzzy-matching/similaridade
// aproximada (Levenshtein etc., ainda proibido por T-02-07/Pitfall 6): é
// comparação exata de substring contra uma lista fechada e conhecida dos tipos
// de tecido reais da Talgui (confirmada pelo usuário, ~90% do que a loja
// trabalha), portanto determinística e auditável (RULE-02).
// D-32 também confirma: bengaline é um subtipo de malha e deve ser tratado como
// malha para fins de match do motor (produtos bengaline e produtos malha são
// elegíveis entre si).
const FABRIC_KEYWORD_TO_CANONICAL = new Map([
  ['bengaline', 'malha'],
  ['malha', 'malha'],
  ['crepe', 'crepe'],
  ['alfaiataria', 'alfaiataria'],
  ['tricoline', 'tricoline'],
  ['tule', 'tule'],
  ['cetim', 'cetim'],
]);

/**
 * Resolve o tecido canônico de um produto a partir da lista de tags brutas já
 * separadas (trim aplicado), buscando a primeira tag que CONTÉM uma das
 * palavras-chave conhecidas de tecido (case-insensitive, substring exato — D-32).
 * Nunca lança. Retorna `{ fabricTagRaw: null, fabricTagCanonical: null }` quando
 * nenhuma tag contém um tipo de tecido conhecido (produto fica fora do motor,
 * D-15, sem erro).
 * @param {string[]} rawTags
 * @returns {{ fabricTagRaw: string|null, fabricTagCanonical: string|null }}
 */
export function resolveFabricTagFromTags(rawTags) {
  const tags = Array.isArray(rawTags) ? rawTags : [];
  for (const tag of tags) {
    if (typeof tag !== 'string') continue;
    const normalized = tag.trim().toLowerCase();
    for (const [keyword, canonical] of FABRIC_KEYWORD_TO_CANONICAL) {
      if (normalized.includes(keyword)) {
        return { fabricTagRaw: tag.trim(), fabricTagCanonical: canonical };
      }
    }
  }
  return { fabricTagRaw: null, fabricTagCanonical: null };
}

/**
 * Audita as tags brutas de tecido de um lote de produtos, contando frequência e
 * identificando tags ausentes do mapa canônico — sem nenhuma forma de
 * normalização/fuzzy-matching automática. Roda a cada execução do job de
 * ingestão (não script avulso).
 * @param {Array<{ tags?: string|null }>} products lote de produtos desta execução
 * @param {Map<string, string>} canonicalMap mapa raw_tag -> canonical_value (pode estar vazio)
 * @returns {{ frequency: Map<string, number>, unmapped: Set<string> }}
 */
export function auditFabricTags(products, canonicalMap) {
  const frequency = new Map();
  const unmapped = new Set();

  for (const product of products || []) {
    const rawTagsString = (product && product.tags) || '';
    const fabricTags = rawTagsString
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);

    for (const rawTag of fabricTags) {
      frequency.set(rawTag, (frequency.get(rawTag) || 0) + 1);
      if (!canonicalMap.has(rawTag)) unmapped.add(rawTag);
    }
  }

  return { frequency, unmapped };
}
