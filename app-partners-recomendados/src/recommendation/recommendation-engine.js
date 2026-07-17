// Motor de recomendação determinístico (RULE-01/RULE-02, D-13, D-15, D-16, D-17,
// D-18, D-26 a D-31, D-34, D-35).
//
// Módulo de domínio puro, no formato de `stock-availability.js`: funções nomeadas,
// sem estado, sem I/O. Não importa nenhum outro módulo do projeto — o motor
// consome o flag `hasAvailableGrade` já persistido pela ingestão (fonte única da
// regra D-04, calculada por `hasAvailableGrade()` de `stock-availability.js` sobre
// o shape da API); reimplementar essa regra aqui duplicaria lógica e quebraria a
// pureza estrutural (zero imports) exigida por RULE-02/Success Criteria #4.
//
// Elegibilidade estrita (D-15): tanto a fonte quanto os candidatos precisam ter
// `fabricTagCanonical` não-nulo QUANDO o bloco exige tecido (mesmo-grupo). NÃO
// existe modo alternativo de elegibilidade por cor+estoque quando o tecido está
// ausente no bloco mesmo-grupo (D-16) — isso foi avaliado e rejeitado como regra
// permanente de negócio; é só um workaround manual do usuário fora deste motor,
// enquanto a planilha de tecidos não é importada. Downstream agents NÃO devem
// adicionar esse fallback ao bloco mesmo-grupo. O bloco cruzado (D-28) é a única
// exceção deliberada: tecido nunca é considerado ali, por desenho (D-26 a D-30).
//
// Desempate (D-13/D-14): cascata de estoque em 3 níveis, implementada como três
// comparadores nomeados — `compareByTotalStock` (estoque total → nível 1),
// `compareBySizesWithStock` (distribuição entre tamanhos → nível 2),
// `compareByCentralSizesStock` (estoque em tamanhos centrais → nível 3). Não
// existe conceito de "Grupo" como nível de desempate (D-14, D-30) — a cascata
// decide a ORDEM dentro de cada bloco de grupo, nunca um nível novo. O passo
// final por productId (`compareByProductIdAsc`) NÃO é critério de negócio: é só
// uma guarda de determinismo (RULE-02) para que empates exatos nos três níveis
// produzam sempre a mesma ordem, independente da ordem de entrada do snapshot
// (03-CONTEXT.md classifica esse empate como "muito improvável" na prática).
// Nenhum campo textual de "motivo do desempate" é incluído — os três números
// D-18 (`stockTotal`, `sizesWithStock`, `centralSizesStock`) já tornam o ranking
// auditável (decisão à discretion, 03-CONTEXT.md deixa o campo opcional).
//
// Grupo de Produtos (D-26 a D-31, D-33 a D-35, Fase 03.1): quarta dimensão de
// elegibilidade que decide QUAL POOL de candidatos um produto-fonte pode
// acessar. Look Inteiro (Vestidos/Macacões/Macaquinhos) é auto-contido (D-27) —
// nunca mescla com outro grupo. Partes de Cima e Partes de Baixo mesclam entre
// si (D-28) numa cota fixa 4+4 (`GROUP_QUOTA_PER_SIDE`) com backfill simétrico
// quando um lado tem menos elegíveis que o outro (D-29), sempre respeitando o
// próprio critério de cada bloco e nunca inventando candidato inelegível. As
// constantes/funções de grupo (`GROUP_LOOK_INTEIRO`, `GROUP_PARTES_DE_CIMA`,
// `GROUP_PARTES_DE_BAIXO`, `crossGroupOf`) são DUPLICADAS aqui a partir de
// `product-group.js` (Plano 03.1-01) em vez de importadas — RULE-02 exige zero
// imports no motor; o motor nunca resolve uma categoria crua, só consome
// `productGroupCanonical` já resolvido pela ingestão.
//
// Formato (D-17/D-18, estendido em D-18 nesta fase com `productGroupCanonical`):
// chamada produto a produto (`recommendForProduct`), retorna objetos ricos (não
// apenas IDs) com os números usados no desempate, para a Fase 4 consumir como
// interface de dados auditável.

/**
 * @typedef {object} CatalogProductEntry
 * @property {string} productId - id Nuvemshop como string
 * @property {string|null} name
 * @property {string|null} colorValue - cor representativa do produto (IN-03)
 * @property {string|null} fabricTagCanonical - NULL => produto fora do bloco mesmo-grupo (D-15); bloco cruzado nunca exige (D-28)
 * @property {string|null} productGroupCanonical - 'Look Inteiro' | 'Partes de Cima' | 'Partes de Baixo' | null (D-26); já resolvido pela ingestão
 * @property {boolean} hasAvailableGrade - resultado D-04 persistido na ingestão
 * @property {Array<{variantId: string, sizeValue: string|null, stockTotal: number}>} variants
 */

/**
 * @typedef {object} Recommendation
 * @property {string} productId
 * @property {string} colorValue - valor usado no match de cor
 * @property {string|null} fabricTagCanonical - valor usado no match de tecido; pode ser null no bloco cruzado (D-28)
 * @property {string|null} productGroupCanonical - grupo do candidato retornado (D-18 estendido)
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

// D-26: os 3 grupos canônicos de produto. DUPLICADOS de `product-group.js`
// (Plano 03.1-01), nunca importados — RULE-02 exige zero imports no motor; o
// motor só consome `productGroupCanonical` já resolvido pela ingestão, nunca
// uma categoria crua nem o mapa de resolução.
export const GROUP_LOOK_INTEIRO = 'Look Inteiro';
export const GROUP_PARTES_DE_CIMA = 'Partes de Cima';
export const GROUP_PARTES_DE_BAIXO = 'Partes de Baixo';

/** D-28: cota fixa por lado na mescla Partes de Cima/Baixo — nunca valor mágico inline. */
export const GROUP_QUOTA_PER_SIDE = 4;

/**
 * Devolve o grupo cruzado que mescla com o grupo dado (D-28: Partes de Cima
 * <-> Partes de Baixo). Look Inteiro é auto-contido (D-27) — devolve `null`,
 * assim como qualquer valor desconhecido/nulo (nunca lança, nunca assume um
 * par por padrão). Função interna (não exportada) — duplicada de
 * `product-group.js` (Plano 03.1-01) por RULE-02.
 * @param {string|*} group
 * @returns {'Partes de Cima'|'Partes de Baixo'|null}
 */
function crossGroupOf(group) {
  if (group === GROUP_PARTES_DE_CIMA) return GROUP_PARTES_DE_BAIXO;
  if (group === GROUP_PARTES_DE_BAIXO) return GROUP_PARTES_DE_CIMA;
  return null;
}

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
 * Verifica se `candidate` é elegível como recomendação para `source` DENTRO de
 * um grupo-alvo específico (`targetGroup`). Regras, na ordem: candidato nulo,
 * auto-exclusão (mesmo productId), grade de estoque indisponível, cor nula, e
 * grupo do candidato diferente de `targetGroup` (D-26 a D-30 — isto sozinho já
 * barra candidatos de grupo `null`/diferente, incluindo Look Inteiro contra
 * outro grupo, D-27).
 *
 * Tecido — OVERRIDE do usuário em 2026-07-17 (reverte D-15/D-16, "elegibilidade
 * estrita sem fallback"): tecido passa a ser OPCIONAL DOS DOIS LADOS. Quando
 * `considerFabric` é truthy (bloco mesmo-grupo), o tecido só FILTRA quando
 * AMBOS — fonte e candidato — têm tecido canônico preenchido (aí exige bater
 * após normalização); se qualquer lado estiver sem tecido, cai para cor+estoque
 * (peça sem tecido deixa de ser inelegível). Quando `considerFabric` é falsy
 * (bloco cruzado, D-28), o tecido NUNCA é considerado. Em ambos os casos a cor
 * sempre precisa bater.
 * @param {CatalogProductEntry} source
 * @param {CatalogProductEntry} candidate
 * @param {string|null} targetGroup
 * @param {{ considerFabric: boolean }} options
 * @returns {boolean}
 */
function isEligibleCandidateInGroup(source, candidate, targetGroup, { considerFabric }) {
  if (!candidate) return false;
  if (String(candidate.productId) === String(source.productId)) return false;
  if (!candidate.hasAvailableGrade) return false;
  if (candidate.colorValue == null) return false;
  if (candidate.productGroupCanonical !== targetGroup) return false;

  if (considerFabric) {
    const bothHaveFabric =
      source.fabricTagCanonical != null && candidate.fabricTagCanonical != null;
    if (bothHaveFabric) {
      const sameFabric =
        normalizeMatchValue(candidate.fabricTagCanonical) ===
        normalizeMatchValue(source.fabricTagCanonical);
      if (!sameFabric) return false;
    }
  }

  return normalizeMatchValue(candidate.colorValue) === normalizeMatchValue(source.colorValue);
}

/**
 * Monta e ordena (cascata D-13, `compareRecommendations`) o pool de
 * candidatos elegíveis de um grupo-alvo específico dentro do `catalog`.
 * Função interna, não exportada — não corta em `maxRecommendations`, quem
 * chama decide o corte/composição de cota (`composeGroupQuota`).
 * @param {CatalogProductEntry} source
 * @param {CatalogProductEntry[]} catalog
 * @param {string|null} targetGroup
 * @param {{ considerFabric: boolean }} options
 * @returns {Recommendation[]}
 */
function buildSortedPool(source, catalog, targetGroup, { considerFabric }) {
  return catalog
    .filter((candidate) => isEligibleCandidateInGroup(source, candidate, targetGroup, { considerFabric }))
    .map(buildRecommendation)
    .sort(compareRecommendations);
}

/**
 * Compõe a cota fixa 4+4 (D-28) entre o pool mesmo-grupo (`samePoolSorted`) e
 * o pool cruzado (`crossPoolSorted`), com backfill simétrico (D-29): quando um
 * lado tem menos elegíveis que `quota`, o outro lado preenche os slots vazios
 * usando SEU PRÓPRIO restante (o pool já ordenado pela cascata D-13, a partir
 * de onde sua própria cota parou), respeitando seu próprio critério de
 * elegibilidade — NUNCA inventando candidato inelegível (D-29). Se a soma de
 * `samePoolSorted.length + crossPoolSorted.length` for menor que `cap`, o
 * resultado final tem menos que `cap` itens — esperado e correto (D-29). Ordem
 * final obrigatória (D-35): bloco mesmo-grupo completo (cota + seu backfill)
 * antes do bloco cruzado completo (cota + seu backfill).
 * @param {Recommendation[]} samePoolSorted
 * @param {Recommendation[]} crossPoolSorted
 * @param {{ quota?: number, cap?: number }} [options]
 * @returns {Recommendation[]}
 */
function composeGroupQuota(
  samePoolSorted,
  crossPoolSorted,
  { quota = GROUP_QUOTA_PER_SIDE, cap = MAX_RECOMMENDATIONS } = {}
) {
  const same = samePoolSorted.slice(0, quota);
  const cross = crossPoolSorted.slice(0, quota);

  const sameShortfall = quota - same.length;
  const crossShortfall = quota - cross.length;

  const crossBackfill =
    crossShortfall > 0 ? samePoolSorted.slice(quota, quota + crossShortfall) : [];
  const sameBackfill =
    sameShortfall > 0 ? crossPoolSorted.slice(quota, quota + sameShortfall) : [];

  return [...same, ...sameBackfill, ...cross, ...crossBackfill].slice(0, cap);
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
    productGroupCanonical: candidate.productGroupCanonical ?? null,
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
 * Motor de recomendação determinístico (RULE-01/RULE-02, D-26 a D-31, D-34,
 * D-35). Recebe um `productId` e o array de produtos do snapshot (D-17,
 * chamada produto a produto) e devolve até `maxRecommendations` recomendações
 * (D-18) elegíveis. Look Inteiro (grupo auto-contido, D-27) exige mesma cor +
 * grade de estoque disponível + mesmo grupo, na ordem da cascata D-13
 * (`compareRecommendations`); o tecido é OPCIONAL dos dois lados (override
 * 2026-07-17, reverte D-15/D-16): só filtra quando fonte E candidato têm tecido
 * canônico preenchido, senão vale só cor+estoque.
 * Partes de Cima e Partes de Baixo mesclam entre si (D-28): até
 * `GROUP_QUOTA_PER_SIDE` do mesmo grupo (cor+estoque, tecido opcional dos dois
 * lados) + até `GROUP_QUOTA_PER_SIDE` do grupo cruzado (cor+estoque, tecido
 * nunca considerado), com backfill simétrico (D-29) quando um lado tem menos
 * elegíveis que o outro. Entrada malformada, produto-fonte ausente, fonte sem
 * cor, ou fonte com `productGroupCanonical` nulo/desconhecido (fail-closed,
 * T-03.1-02) retornam `[]`, nunca lança (convenção T-02-06). Fonte sem tecido
 * canônico agora gera recomendações em qualquer grupo (não é mais inelegível,
 * override 2026-07-17). Função pura:
 * ordena cópias dos arrays de candidatos (nunca muta `catalogProducts` nem os
 * objetos de entrada), sem relógio/aleatoriedade/rede/importações. O corte em
 * `maxRecommendations` acontece APÓS a ordenação completa de cada bloco
 * (RULE-01 seleciona os melhores da cascata, não os primeiros da entrada).
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
  if (source.colorValue == null) return [];

  // Fail-closed (T-03.1-02): grupo-fonte nulo/desconhecido nunca é elegível
  // por padrão. Sem esta guarda, dois produtos com `productGroupCanonical:
  // null` (categoria não mapeada) que também coincidissem em cor+tecido+
  // estoque se tornariam elegíveis um para o outro — fail-open incorreto.
  const sourceGroup = source.productGroupCanonical;
  if (sourceGroup == null) return [];

  const crossGroup = crossGroupOf(sourceGroup);

  if (!crossGroup) {
    // Look Inteiro (ou qualquer grupo não-mesclável): auto-contido (D-27).
    // Tecido opcional dos dois lados (override 2026-07-17, reverte D-15/D-16):
    // fonte sem tecido NÃO é mais inelegível — cai para cor+estoque dentro do
    // grupo; fonte com tecido casa por tecido apenas contra candidatos que
    // também têm tecido (regra em isEligibleCandidateInGroup).
    return buildSortedPool(source, catalog, sourceGroup, { considerFabric: true }).slice(
      0,
      maxRecommendations
    );
  }

  // Partes de Cima/Baixo: mescla com cota 4+4 (D-28). Bloco mesmo-grupo com
  // tecido opcional dos dois lados (override 2026-07-17); bloco cruzado nunca
  // considera tecido (D-28). Fonte sem tecido gera AMBOS os blocos por
  // cor+estoque.
  const samePool = buildSortedPool(source, catalog, sourceGroup, { considerFabric: true });
  const crossPool = buildSortedPool(source, catalog, crossGroup, { considerFabric: false });

  return composeGroupQuota(samePool, crossPool, {
    quota: GROUP_QUOTA_PER_SIDE,
    cap: maxRecommendations,
  });
}
