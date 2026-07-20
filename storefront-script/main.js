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
    var n = Number(price);
    if (isNaN(n)) return '';
    // Sempre 2 casas no padrao BRL: 99.9 -> "R$ 99,90"; 289.9 -> "R$ 289,90".
    return 'R$ ' + n.toFixed(2).replace('.', ',');
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
  // Preço: exibe o preço ATUAL (promocional, quando houver) — igual à página do
  // produto — com o preço cheio riscado + flag de % quando em promoção (D-52).
  function buildPriceHtml(product) {
    var current = escapeHtml(formatPrice(product.price));
    if (!current) return '';
    if (product.onSale && product.regularPrice) {
      var regular = escapeHtml(formatPrice(product.regularPrice));
      var flag = product.discountPercent
        ? '<span style="display:inline-block;background:#1a1a1a;color:#fff;font-size:.68rem;font-weight:700;' +
          'padding:1px 5px;border-radius:3px;margin-left:6px;vertical-align:middle;">-' +
          product.discountPercent + '%</span>'
        : '';
      return (
        '<div class="item-price" style="margin-top:4px;line-height:1.3;">' +
        '<span style="text-decoration:line-through;color:#999;font-size:.78rem;margin-right:6px;">' + regular + '</span>' +
        '<span style="font-weight:700;">' + current + '</span>' +
        flag +
        '</div>'
      );
    }
    return '<div class="item-price" style="margin-top:4px;font-weight:700;">' + current + '</div>';
  }

  // Grade de tamanhos: indicador sutil abaixo do preço. Tamanho disponível =
  // legível; indisponível = cinza com risco diagonal (linear-gradient inline,
  // sem depender de CSS externo). Somente indicador — sem add-to-cart (limitação
  // nativa da Nuvemshop para seleção de tamanho antes do carrinho).
  function buildSizesHtml(sizes) {
    if (!Array.isArray(sizes) || !sizes.length) return '';
    var base =
      'display:inline-block;min-width:22px;text-align:center;padding:1px 4px;border:1px solid #e3e3e3;' +
      'border-radius:3px;font-size:11px;line-height:1.4;';
    var chips = sizes
      .map(function (s) {
        var label = escapeHtml(s.size);
        if (s.available) {
          return '<span style="' + base + 'color:#222;">' + label + '</span>';
        }
        return (
          '<span style="' + base + 'color:#bbb;border-color:#eee;' +
          'background-image:linear-gradient(to top right, transparent calc(50% - 0.7px), #cc2b2b calc(50% - 0.7px), #cc2b2b calc(50% + 0.7px), transparent calc(50% + 0.7px));">' +
          label + '</span>'
        );
      })
      .join('');
    return '<div class="item-sizes" style="display:flex;flex-wrap:wrap;gap:4px;margin-top:8px;">' + chips + '</div>';
  }

  function buildSlideHtml(product) {
    var safeUrl = escapeHtml(product.url);
    var safeName = escapeHtml(product.name);
    var safeImage = product.image ? escapeHtml(product.image) : null;

    var imageHtml = safeImage
      ? '<img src="' + safeImage + '" alt="' + safeName + '" loading="lazy" ' +
        'style="width:100%;height:auto;display:block;border-radius:4px;object-fit:cover;aspect-ratio:3/4;">'
      : '';

    return (
      '<div class="swiper-slide js-item-product item-product col-grid" style="height:auto;">' +
      '<a href="' + safeUrl + '" class="item-link" style="display:block;text-decoration:none;color:inherit;">' +
      '<div class="item-image" style="margin-bottom:8px;">' + imageHtml + '</div>' +
      '<div class="js-item-name item-name" style="font-size:.95rem;line-height:1.3;margin-bottom:4px;min-height:2.5em;">' + safeName + '</div>' +
      buildPriceHtml(product) +
      buildSizesHtml(product.sizes) +
      '</a>' +
      '</div>'
    );
  }

  function buildBlockHtml(products) {
    var slides = products.map(buildSlideHtml).join('');
    // Header com 2 blocos de texto CENTRALIZADOS (reaplicando o layout nativo):
    // "RECOMENDADOS" (maior, sans-serif) + "Compre Agora" (menor, sublinhado).
    return (
      '<div class="container-fluid position-relative" id="' + BLOCK_ID + '" style="margin:24px 0;">' +
      '<div class="recomendados-motor-header" style="display:block !important;text-align:center;margin-bottom:16px;">' +
      '<h2 class="section-title section-title-products-home" ' +
      'style="font-family:Arial,Helvetica,sans-serif;font-size:1.35rem;letter-spacing:.04em;margin:0 0 4px;">RECOMENDADOS</h2>' +
      '<a class="link-text" href="/produtos" ' +
      'style="display:inline-block;font-size:.82rem;text-decoration:underline;color:#555;">Compre Agora</a>' +
      '</div>' +
      '<div class="swiper js-recomendados-swiper products-section section-products-related position-relative" style="overflow:hidden;">' +
      '<div class="swiper-wrapper">' + slides + '</div>' +
      '<div class="swiper-pagination js-recomendados-pagination" style="position:relative;margin-top:12px;"></div>' +
      '</div>' +
      '</div>'
    );
  }

  function initSwiper(slideCount) {
    if (typeof window.Swiper === 'undefined') {
      // Sem Swiper (tema mudou/nao carregou): o bloco ainda aparece como grid
      // rolavel horizontalmente; nao e erro fatal.
      return;
    }
    // Só faz sentido loop/autoplay quando há mais slides do que cabem na tela.
    var perView = (window.innerWidth || 1024) >= 768 ? 4 : 2;
    var enableLoop = slideCount > perView;
    try {
      var sw = new window.Swiper('.js-recomendados-swiper', {
        slidesPerView: 2,
        spaceBetween: 12,
        watchOverflow: true,
        grabCursor: true, // arrastar no desktop (segurar o clique) + toque no mobile
        loop: enableLoop,
        breakpoints: { 768: { slidesPerView: 4, spaceBetween: 16 } },
        pagination: { el: '.js-recomendados-pagination', clickable: true },
      });
      // Autoplay de 3s por interval próprio (não depende do módulo Autoplay do
      // build de Swiper do tema). disableOnInteraction implícito: se o usuário
      // arrastar, o próximo tick só avança a partir da posição atual.
      if (enableLoop) {
        setInterval(function () {
          try { sw.slideNext(400); } catch (e) { /* nunca derruba o bloco */ }
        }, 3000);
      }
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

    initSwiper(products.length);
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
