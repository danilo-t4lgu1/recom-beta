// Motor de recomendação determinístico (RULE-01/RULE-02, D-13, D-15, D-16, D-17, D-18).
//
// Módulo de domínio puro, no formato de `stock-availability.js`: funções nomeadas,
// sem estado, sem I/O. Não importa nenhum outro módulo do projeto — o motor
// consome o flag `hasAvailableGrade` já persistido pela ingestão (fonte única da
// regra D-04, calculada por `hasAvailableGrade()` de `stock-availability.js` sobre
// o shape da API); reimplementar essa regra aqui duplicaria lógica e quebraria a
// pureza estrutural (zero imports) exigida por RULE-02/Success Criteria #4.
//
// Elegibilidade estrita (D-15): tanto a fonte quanto os candidatos precisam ter
// `fabricTagCanonical` não-nulo. NÃO existe modo alternativo de elegibilidade por
// cor+estoque quando o tecido está ausente (D-16) — isso foi avaliado e rejeitado
// como regra permanente de negócio; é só um workaround manual do usuário fora
// deste motor, enquanto a planilha de tecidos não é importada. Downstream agents
// NÃO devem adicionar esse fallback ao código.
//
// Desempate (D-13/D-14): cascata de estoque em 3 níveis, implementada como três
// comparadores nomeados — `compareByTotalStock` (estoque total → nível 1),
// `compareBySizesWithStock` (distribuição entre tamanhos → nível 2),
// `compareByCentralSizesStock` (estoque em tamanhos centrais → nível 3). Não
// existe conceito de "Grupo" (D-14) — a cascata é o critério de negócio completo
// e final. O passo final por productId (`compareByProductIdAsc`) NÃO é critério
// de negócio: é só uma guarda de determinismo (RULE-02) para que empates exatos
// nos três níveis produzam sempre a mesma ordem, independente da ordem de entrada
// do snapshot (03-CONTEXT.md classifica esse empate como "muito improvável" na
// prática). Nenhum campo textual de "motivo do desempate" é incluído — os três
// números D-18 (`stockTotal`, `sizesWithStock`, `centralSizesStock`) já tornam o
// ranking auditável (decisão à discretion, 03-CONTEXT.md deixa o campo opcional).
//
// Formato (D-17/D-18): chamada produto a produto (`recommendForProduct`), retorna
// objetos ricos (não apenas IDs) com os números usados no desempate, para a
// Fase 4 consumir como interface de dados auditável.

/**
 * @typedef {object} CatalogProductEntry
 * @property {string} productId - id Nuvemshop como string
 * @property {string|null} name
 * @property {string|null} colorValue - cor representativa do produto (IN-03)
 * @property {string|null} fabricTagCanonical - NULL => produto fora do motor (D-15)
 * @property {boolean} hasAvailableGrade - resultado D-04 persistido na ingestão
 * @property {Array<{variantId: string, sizeValue: string|null, stockTotal: number}>} variants
 */

/**
 * @typedef {object} Recommendation
 * @property {string} productId
 * @property {string} colorValue - valor usado no match de cor
 * @property {string} fabricTagCanonical - valor usado no match de tecido
 * @property {number} stockTotal - soma de variants[].stockTotal (nível 1 da cascata D-13)
 * @property {number} sizesWithStock - contagem de variantes com stockTotal > 0 (nível 2)
 * @property {number} centralSizesStock - soma de stockTotal nos tamanhos centrais (nível 3)
 * @property {Array<{sizeValue: string|null, stock: number}>} stockBySize - distribuição por grade (D-18)
 */

/** RULE-01: limite máximo de recomendações por produto, nunca valor mágico inline. */
export const MAX_RECOMMENDATIONS = 8;

/** D-13 nível 3: tamanhos centrais em grade de letra. */
export const CENTRAL_SIZES_LETTER = ['P', 'M', 'G'];

/** D-13 nível 3: tamanhos centrais em grade numérica. */
export const CENTRAL_SIZES_NUMERIC = ['36', '38', '40'];

/**
 * Normaliza um valor de match (cor ou tecido canônico) para comparação
 * trim + minúsculas, mesma convenção de `findAttributeIndex` em
 * `ingest-catalog.js`. Valores não-string (incluindo null/undefined) são
 * retornados como estão — nunca lança.
 * @param {*} value
 * @returns {*}
 */
function normalizeMatchValue(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

/**
 * Verifica se `candidate` é elegível como recomendação para `source`: cor e
 * tecido canônico iguais após normalização, tecido canônico e cor não-nulos
 * (D-15, sem fallback por cor+estoque per D-16), grade de estoque disponível
 * (`hasAvailableGrade`), e productId diferente do da fonte (auto-exclusão).
 * @param {CatalogProductEntry} source
 * @param {CatalogProductEntry} candidate
 * @returns {boolean}
 */
function isEligibleCandidate(source, candidate) {
  if (!candidate) return false;
  if (String(candidate.productId) === String(source.productId)) return false;
  if (!candidate.hasAvailableGrade) return false;
  if (candidate.fabricTagCanonical == null) return false;
  if (candidate.colorValue == null) return false;

  const sameColor =
    normalizeMatchValue(candidate.colorValue) === normalizeMatchValue(source.colorValue);
  const sameFabric =
    normalizeMatchValue(candidate.fabricTagCanonical) ===
    normalizeMatchValue(source.fabricTagCanonical);

  return sameColor && sameFabric;
}

/**
 * Monta o objeto rico D-18 para um candidato elegível. `stockTotal` soma
 * `variants[].stockTotal` (ausente/negativo tratado como 0); `sizesWithStock`
 * conta variantes com estoque > 0; `centralSizesStock` soma o estoque das
 * variantes cujo tamanho (trim + maiúsculas) está em CENTRAL_SIZES_LETTER ou
 * CENTRAL_SIZES_NUMERIC; `stockBySize` preserva a ordem de entrada das variantes.
 * @param {CatalogProductEntry} candidate
 * @returns {Recommendation}
 */
function buildRecommendation(candidate) {
  const variants = Array.isArray(candidate.variants) ? candidate.variants : [];

  let stockTotal = 0;
  let sizesWithStock = 0;
  let centralSizesStock = 0;
  const stockBySize = [];

  for (const variant of variants) {
    const rawStock = variant && typeof variant.stockTotal === 'number' ? variant.stockTotal : 0;
    const stock = rawStock > 0 ? rawStock : 0;

    stockTotal += stock;
    if (stock > 0) sizesWithStock += 1;

    const sizeValue = variant ? variant.sizeValue : null;
    const normalizedSize =
      typeof sizeValue === 'string' ? sizeValue.trim().toUpperCase() : sizeValue;
    if (
      CENTRAL_SIZES_LETTER.includes(normalizedSize) ||
      CENTRAL_SIZES_NUMERIC.includes(normalizedSize)
    ) {
      centralSizesStock += stock;
    }

    stockBySize.push({ sizeValue, stock });
  }

  return {
    productId: candidate.productId,
    colorValue: candidate.colorValue,
    fabricTagCanonical: candidate.fabricTagCanonical,
    stockTotal,
    sizesWithStock,
    centralSizesStock,
    stockBySize,
  };
}

/**
 * Nível 1 da cascata D-13: maior estoque total primeiro.
 * @param {Recommendation} a
 * @param {Recommendation} b
 * @returns {number}
 */
function compareByTotalStock(a, b) {
  return b.stockTotal - a.stockTotal;
}

/**
 * Nível 2 da cascata D-13: mais tamanhos com estoque > 0 primeiro.
 * @param {Recommendation} a
 * @param {Recommendation} b
 * @returns {number}
 */
function compareBySizesWithStock(a, b) {
  return b.sizesWithStock - a.sizesWithStock;
}

/**
 * Nível 3 da cascata D-13: maior estoque em tamanhos centrais primeiro
 * (P/M/G ou 36/38/40, ambas as convenções já resolvidas por `buildRecommendation`).
 * @param {Recommendation} a
 * @param {Recommendation} b
 * @returns {number}
 */
function compareByCentralSizesStock(a, b) {
  return b.centralSizesStock - a.centralSizesStock;
}

/**
 * Guarda de determinismo (RULE-02), NÃO critério de negócio (D-14): quando os
 * três níveis da cascata D-13 empatam exatamente, desempata por productId
 * numérico ascendente, garantindo a mesma saída independente da ordem de
 * entrada do snapshot.
 * @param {Recommendation} a
 * @param {Recommendation} b
 * @returns {number}
 */
function compareByProductIdAsc(a, b) {
  return Number(a.productId) - Number(b.productId);
}

/**
 * Composição completa da cascata D-13 (níveis 1-3) + guarda de determinismo
 * final (RULE-02). Cada nível só decide quando o(s) anterior(es) empatam
 * exatamente (curto-circuito via `||`, comparadores retornam 0 em empate).
 * @param {Recommendation} a
 * @param {Recommendation} b
 * @returns {number}
 */
function compareRecommendations(a, b) {
  return (
    compareByTotalStock(a, b) ||
    compareBySizesWithStock(a, b) ||
    compareByCentralSizesStock(a, b) ||
    compareByProductIdAsc(a, b)
  );
}

/**
 * Motor de recomendação determinístico (RULE-01/RULE-02). Recebe um `productId`
 * e o array de produtos do snapshot (D-17, chamada produto a produto) e devolve
 * até `maxRecommendations` recomendações (D-18) elegíveis: mesma cor, mesmo
 * tecido canônico (D-15, sem fallback D-16), grade de estoque disponível — na
 * ordem da cascata D-13 (`compareRecommendations`). Entrada malformada,
 * produto-fonte ausente, ou produto-fonte sem tecido canônico/cor (D-15)
 * retornam `[]`, nunca lança (convenção T-02-06). Função pura: ordena uma cópia
 * do array de candidatos (nunca muta `catalogProducts` nem os objetos de
 * entrada), sem relógio/aleatoriedade/rede/importações. O corte em
 * `maxRecommendations` acontece APÓS a ordenação completa (RULE-01 seleciona os
 * melhores da cascata, não os primeiros da entrada).
 * @param {string} productId
 * @param {CatalogProductEntry[]} catalogProducts
 * @param {{ maxRecommendations?: number }} [options]
 * @returns {Recommendation[]}
 */
export function recommendForProduct(
  productId,
  catalogProducts,
  { maxRecommendations = MAX_RECOMMENDATIONS } = {}
) {
  const catalog = Array.isArray(catalogProducts) ? catalogProducts : [];
  const targetId = String(productId);
  const source = catalog.find((product) => product && String(product.productId) === targetId);

  if (!source) return [];
  if (source.fabricTagCanonical == null || source.colorValue == null) return [];

  const recommendations = catalog
    .filter((candidate) => isEligibleCandidate(source, candidate))
    .map(buildRecommendation);

  return [...recommendations].sort(compareRecommendations).slice(0, maxRecommendations);
}
