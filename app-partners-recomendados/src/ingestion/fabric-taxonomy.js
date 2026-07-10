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
