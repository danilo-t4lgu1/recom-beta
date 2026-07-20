/**
 * storefront-script/main.js
 *
 * v.Alpha — Script API tradicional da Nuvemshop (`write_scripts`, sem NubeSDK).
 *
 * ATENCAO — DEBITO TECNICO EXPLICITO (D-11 em 01-CONTEXT.md):
 * Este script foi construido deliberadamente com a Script API legada (JS puro,
 * acesso direto ao DOM), NAO com NubeSDK, como uma decisao explicita e assumida
 * pelo usuario em 2026-07-10, enquanto a ativacao do NubeSDK para o tema Morelia
 * da loja ainda esta pendente de submissao. Apps sem NubeSDK deixam de poder
 * receber novas instalacoes a partir de 30/ago/2026 e enfrentam remocao
 * progressiva a partir de 30/out/2026 — ou seja, este arquivo tem vida util
 * curta e PRECISARA ser reconstruido em NubeSDK (Web Worker sandbox + UI Slots +
 * nube.render(), sem acesso a `document`) quando a ativacao for aprovada.
 *
 * Este script roda direto no navegador do visitante (injetado via tag <script>
 * pelo Partners Portal), com acesso irrestrito ao DOM — por isso manipulacao
 * direta de `document.*` e esperada e correta aqui (ao contrario do NubeSDK).
 *
 * OBJETIVO (2026-07-20): renderizar o bloco "Recomendados" no MESMO FORMATO do
 * bloco nativo "Produtos Relacionados" do tema Morelia (carrossel Swiper, cards
 * `col-6 col-md-3`), porem alimentado pela saida do nosso motor (ate 8 produtos,
 * dentro dos criterios do projeto), em vez da logica de relacionados do tema.
 * Reusa as classes de CSS do proprio tema (`header-related`, `swiper-*`,
 * `js-item-product`, `js-item-name`) para herdar o estilo nativo, e inicializa
 * uma instancia propria de `window.Swiper` (disponivel globalmente no tema).
 */

(function () {
  'use strict';

  // -------------------------------------------------------------------------
  // Configuracao
  // -------------------------------------------------------------------------
  var BACKEND_URL = 'https://app-partners-recomendados.vercel.app';

  // Posicao exata documentada em 01-04-SUMMARY.md (D-03): o bloco customizado
  // renderiza entre o bloco "compre junto" e a secao de descricao do produto —
  // mesmo lugar onde o bloco nativo "Produtos Relacionados" aparecia.
  var ANCHOR_BEFORE_SELECTOR = '#product-description';
  var ANCHOR_AFTER_SELECTOR = '#compre-junto-block';

  var BLOCK_ID = 'recomendados-motor-block';

  // Cache TTL de 24h (D-50, FRNT-02/SC#4).
  var CACHE_TTL_MS = 24 * 60 * 60 * 1000;
  var CACHE_KEY_PREFIX = 'recomendados_cache_';

  // -------------------------------------------------------------------------
  // Passo 1: id do produto atual (window.LS.product.id — ver 01-05)
  // -------------------------------------------------------------------------
  function getCurrentProductId() {
    if (
      window.LS &&
      window.LS.product &&
      typeof window.LS.product.id !== 'undefined' &&
      window.LS.product.id !== null
    ) {
      return String(window.LS.product.id);
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Passo 2: buscar recomendacoes no backend proprio (PLAT-05)
  // -------------------------------------------------------------------------
  function fetchRecommendation(productId) {
    var url = BACKEND_URL + '/api/recommendations/' + encodeURIComponent(productId);
    return fetch(url, { method: 'GET' }).then(function (response) {
      if (!response.ok) {
        throw new Error('recommendations endpoint respondeu status ' + response.status);
      }
      return response.json();
    });
  }

  // -------------------------------------------------------------------------
  // Passo 2.5: cache TTL de 24h (D-50) — funcoes puras testaveis por injecao
  // -------------------------------------------------------------------------
  function getCachedRecommendation(storage, productId, now) {
    var raw = storage.getItem(CACHE_KEY_PREFIX + productId);
    if (!raw) return null;
    var parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return null;
    }
    if (now - parsed.cachedAt > CACHE_TTL_MS) return null;
    return parsed.data;
  }

  function setCachedRecommendation(storage, productId, data, now) {
    try {
      storage.setItem(CACHE_KEY_PREFIX + productId, JSON.stringify({ data: data, cachedAt: now }));
    } catch (e) {
      /* Safari privado/quota — degrada silenciosamente (mesma disciplina do fetch.catch) */
    }
  }

  // -------------------------------------------------------------------------
  // Passo 3: normalizar o payload para uma lista de produtos
  // -------------------------------------------------------------------------
  //
  // Aceita o formato novo (recommendedProducts: []) e o legado (recommendedProduct
  // singular), para nunca quebrar durante a transicao do backend.
  function extractProducts(data) {
    if (!data) return [];
    if (Array.isArray(data.recommendedProducts) && data.recommendedProducts.length) {
      return data.recommendedProducts;
    }
    if (data.recommendedProduct) return [data.recommendedProduct];
    return [];
  }

  // -------------------------------------------------------------------------
  // Passo 4: escaping de saida (CR-01 da Fase 1 — nome/URL vem do catalogo,
  // editavel pelo lojista; nunca concatenar cru no HTML)
  // -------------------------------------------------------------------------
  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatPrice(price) {
    if (price == null || price === '') return '';
    // A API devolve preco como string "349.90"; exibe no padrao BRL "R$ 349,90".
    var normalized = String(price).replace('.', ',');
    return 'R$ ' + normalized;
  }

  // -------------------------------------------------------------------------
  // Passo 5: renderizar o bloco no FORMATO NATIVO + inicializar o carrossel
  // -------------------------------------------------------------------------
  //
  // Reusa as classes do tema Morelia (capturadas ao vivo em 2026-07-20):
  //   header:  .header-related > h2.section-title.section-title-products-home
  //   card:    .swiper-slide.js-item-product.item-product + .js-item-name.item-name
  // Mantem o bloco nativo oculto (ele mostra os relacionados do tema, nao os
  // nossos) e insere ESTE bloco na posicao D-03, com Swiper proprio.
  function buildSlideHtml(product) {
    var safeUrl = escapeHtml(product.url);
    var safeName = escapeHtml(product.name);
    var safeImage = product.image ? escapeHtml(product.image) : null;
    var priceText = escapeHtml(formatPrice(product.price));

    var imageHtml = safeImage
      ? '<img src="' + safeImage + '" alt="' + safeName + '" loading="lazy" ' +
        'style="width:100%;height:auto;display:block;border-radius:4px;object-fit:cover;aspect-ratio:3/4;">'
      : '';

    return (
      '<div class="swiper-slide js-item-product item-product col-grid" style="height:auto;">' +
      '<a href="' + safeUrl + '" class="item-link" style="display:block;text-decoration:none;color:inherit;">' +
      '<div class="item-image" style="margin-bottom:8px;">' + imageHtml + '</div>' +
      '<div class="js-item-name item-name" style="font-size:.85rem;line-height:1.25;margin-bottom:4px;">' + safeName + '</div>' +
      (priceText ? '<div class="item-price" style="font-weight:600;">' + priceText + '</div>' : '') +
      '</a>' +
      '</div>'
    );
  }

  function buildBlockHtml(products) {
    var slides = products.map(buildSlideHtml).join('');
    return (
      '<div class="container-fluid position-relative" id="' + BLOCK_ID + '" style="margin:24px 0;">' +
      '<div class="header-related">' +
      '<h2 class="section-title section-title-products-home">Recomendados</h2>' +
      '</div>' +
      '<div class="swiper js-recomendados-swiper products-section section-products-related position-relative" style="overflow:hidden;">' +
      '<div class="swiper-wrapper">' + slides + '</div>' +
      '<div class="swiper-pagination js-recomendados-pagination" style="position:relative;margin-top:12px;"></div>' +
      '</div>' +
      '</div>'
    );
  }

  function initSwiper() {
    if (typeof window.Swiper === 'undefined') {
      // Sem Swiper (tema mudou/nao carregou): o bloco ainda aparece como grid
      // rolavel horizontalmente; nao e erro fatal.
      return;
    }
    try {
      // eslint-disable-next-line no-new
      new window.Swiper('.js-recomendados-swiper', {
        slidesPerView: 2,
        spaceBetween: 12,
        watchOverflow: true,
        breakpoints: { 768: { slidesPerView: 4, spaceBetween: 16 } },
        pagination: { el: '.js-recomendados-pagination', clickable: true },
      });
    } catch (e) {
      /* init do carrossel nunca derruba o bloco */
    }
  }

  function renderRecommendationBlock(products) {
    if (!products || !products.length) return false;
    if (document.getElementById(BLOCK_ID)) return true; // ja renderizado (idempotente)

    var html = buildBlockHtml(products);
    var beforeEl = document.querySelector(ANCHOR_BEFORE_SELECTOR);
    var afterEl = document.querySelector(ANCHOR_AFTER_SELECTOR);

    if (beforeEl) {
      beforeEl.insertAdjacentHTML('beforebegin', html);
    } else if (afterEl) {
      afterEl.insertAdjacentHTML('afterend', html);
    } else {
      return false;
    }

    initSwiper();
    return true;
  }

  // -------------------------------------------------------------------------
  // Orquestracao
  // -------------------------------------------------------------------------
  function init() {
    var productId = getCurrentProductId();
    if (!productId) return; // nao e pagina de produto

    var cached = getCachedRecommendation(window.sessionStorage, productId, Date.now());
    if (cached) {
      var cachedProducts = extractProducts(cached);
      if (cachedProducts.length) renderRecommendationBlock(cachedProducts);
      return; // cache hit: zero chamada de rede nova (FRNT-02/SC#4)
    }

    fetchRecommendation(productId)
      .then(function (data) {
        setCachedRecommendation(window.sessionStorage, productId, data, Date.now());
        var products = extractProducts(data);
        if (products.length) {
          var inserted = renderRecommendationBlock(products);
          if (!inserted) {
            console.warn(
              '[recomendados-motor] Nao encontrei ' +
                ANCHOR_BEFORE_SELECTOR + ' nem ' + ANCHOR_AFTER_SELECTOR + ' para ancorar o bloco.'
            );
          }
        }
      })
      .catch(function (err) {
        console.warn('[recomendados-motor] Falha ao buscar recomendacoes:', err);
      });
  }

  // Guard de exportacao SOMENTE para teste (main.test.js): permite importar as
  // funcoes puras sem executar o restante (que depende de document/window reais).
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      getCachedRecommendation: getCachedRecommendation,
      setCachedRecommendation: setCachedRecommendation,
      extractProducts: extractProducts,
      formatPrice: formatPrice,
    };
    return;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
