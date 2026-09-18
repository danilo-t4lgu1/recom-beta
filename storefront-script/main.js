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
 * OBJETIVO (2026-09-18, Fase 8 Plano 03): renderizar o bloco "Recomendados"
 * como uma trilha de ROLAGEM NATIVA do navegador (flex + overflow-x + scroll-
 * snap), sem nenhuma biblioteca de carrossel de terceiro (Swiper removido) e
 * sem auto-avanco por temporizador — navegacao manual via dois botoes
 * (anterior/proximo, estilo glassmorphism, copiado da UI de Stories ja ao
 * vivo no site). O primeiro card exibe a flag "Sugestao de Look" quando (e so
 * quando) o produto correspondente vem marcado isProvenLook:true pelo backend
 * (Plano 08-02). Alimentado pela saida do nosso motor (ate 8 produtos, dentro
 * dos criterios do projeto).
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
  //   card:    .js-item-name.item-name (nome), trilha propria .rec-track (2026-09-18)
  // Mantem o bloco nativo oculto (ele mostra os relacionados do tema, nao os
  // nossos) e insere ESTE bloco na posicao D-03, com rolagem nativa propria.
  // Preço: exibe o preço ATUAL (promocional, quando houver) — igual à página do
  // produto — com o preço cheio riscado + flag de % quando em promoção (D-52).
  // Estilos do bloco injetados UMA vez (classes + media queries). Preferido a
  // estilos inline porque os refinamentos sao responsivos (desktop != mobile) e
  // usam efeitos (glassmorphism) que inline nao cobre bem. Escopados por #BLOCK_ID.
  var STYLE_ID = 'recomendados-motor-styles';
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var B = '#' + BLOCK_ID + ' ';
    var css =
      '#' + BLOCK_ID + '{margin:24px 0;}' +
      B + '.recomendados-motor-header{display:block !important;text-align:center;margin-bottom:16px;}' +
      B + '.rec-img{width:100%;height:auto;display:block;border-radius:4px;object-fit:cover;aspect-ratio:3/4;}' +
      B + '.rec-name{font-size:1.14rem;line-height:1.3;margin:8px 0 4px;min-height:2.5em;}' +
      B + '.rec-price{margin-top:5px;line-height:1.3;}' +
      B + '.rec-old{text-decoration:line-through;color:#999;font-size:.94rem;margin-right:6px;}' +
      B + '.rec-now{font-weight:700;font-size:1.15rem;}' +
      B + '.rec-flag{display:inline-block;background:#1a1a1a;color:#fff;font-size:.88rem;font-weight:700;padding:2px 7px;border-radius:4px;margin-left:6px;vertical-align:middle;}' +
      B + '.rec-sizes{display:flex;flex-wrap:wrap;gap:5px;margin-top:10px;}' +
      // Chip com glassmorphism (~40%): fundo translucido + blur + borda sutil.
      B + '.rec-chip{display:inline-block;min-width:26px;text-align:center;padding:2px 5px;border:1px solid rgba(190,190,190,.4);border-radius:6px;font-size:13px;line-height:1.4;color:#222;background:rgba(255,255,255,.4);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);}' +
      // Indisponivel: risco diagonal PRETO + 20% mais transparente (opacity .8).
      B + '.rec-chip.off{color:#888;opacity:.8;background-image:linear-gradient(to top right,transparent calc(50% - .8px),#1a1a1a calc(50% - .8px),#1a1a1a calc(50% + .8px),transparent calc(50% + .8px));}' +
      // Trilha de rolagem nativa (substitui o Swiper): flex + overflow-x +
      // scroll-snap, sem lib de terceiro nem auto-avanco por temporizador.
      B + '.rec-viewport{position:relative;}' +
      B + '.rec-track{display:flex;gap:14px;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;}' +
      B + '.rec-track::-webkit-scrollbar{display:none;}' +
      B + '.rec-card{scroll-snap-align:start;flex:0 0 58%;max-width:58%;}' +
      // Botoes de navegacao (glassmorphism, copiados da UI de Stories ja ao
      // vivo no site) — circulares, sobrepostos as bordas da trilha.
      B + '.rec-nav{border:1px solid rgba(255,255,255,.16);position:absolute;top:50%;transform:translateY(-50%);width:44px;height:44px;min-width:44px;min-height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(20,20,20,.55);color:#fff;box-shadow:0 1px 4px rgba(0,0,0,.2);cursor:pointer;}' +
      B + '.rec-nav-prev{left:-4px;}' +
      B + '.rec-nav-next{right:-4px;}' +
      '@supports (backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)){' +
      B + '.rec-nav{-webkit-backdrop-filter:blur(16px) saturate(130%);backdrop-filter:blur(16px) saturate(130%);}' +
      '}' +
      // Container de flags sobre a imagem do card (preparado para empilhar
      // multiplas flags no futuro; este plano so insere o selo de Look).
      B + '.rec-flags{position:absolute;top:10px;left:10px;z-index:2;display:flex;flex-direction:column;gap:6px;}' +
      B + '.rec-look-badge{font-family:Poppins,sans-serif;font-size:11px;font-weight:600;color:#fff;background:#000;padding:4px 8px;border-radius:2px;text-transform:uppercase;letter-spacing:.22px;}' +
      // DESKTOP (>=768): bloco ~20% menor (nome/preco/chip), mas FLAG +30%.
      '@media (min-width:768px){' +
      B + '.rec-name{font-size:.92rem;}' +
      B + '.rec-now{font-size:1.2rem;}' + // +30% no desktop (preco promocional)
      B + '.rec-old{font-size:.98rem;}' + // +30% no desktop (preco cheio riscado)
      B + '.rec-flag{font-size:1.14rem;padding:3px 9px;}' +
      B + '.rec-chip{min-width:21px;font-size:10.5px;padding:2px 4px;}' +
      B + '.rec-card{flex:0 0 23.5%;max-width:23.5%;}' +
      B + '.rec-track{gap:16px;}' +
      '}' +
      // MOBILE (<=767): grade de tamanho ~10% menor p/ caber XPP/34 numa linha.
      '@media (max-width:767px){' +
      B + '.rec-chip{min-width:23px;font-size:11.7px;padding:2px 4px;}' +
      B + '.rec-sizes{gap:4px;}' +
      '}';
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.appendChild(document.createTextNode(css));
    (document.head || document.documentElement).appendChild(st);
  }

  function buildPriceHtml(product) {
    var current = escapeHtml(formatPrice(product.price));
    if (!current) return '';
    if (product.onSale && product.regularPrice) {
      var regular = escapeHtml(formatPrice(product.regularPrice));
      var flag = product.discountPercent
        ? '<span class="rec-flag">-' + product.discountPercent + '%</span>'
        : '';
      return (
        '<div class="item-price rec-price">' +
        '<span class="rec-old">' + regular + '</span>' +
        '<span class="rec-now">' + current + '</span>' +
        flag +
        '</div>'
      );
    }
    return '<div class="item-price rec-price"><span class="rec-now">' + current + '</span></div>';
  }

  // Grade de tamanhos: indicador sutil abaixo do preço. Tamanho disponível =
  // legível; indisponível = cinza com risco diagonal (linear-gradient inline,
  // sem depender de CSS externo). Somente indicador — sem add-to-cart (limitação
  // nativa da Nuvemshop para seleção de tamanho antes do carrinho).
  function buildSizesHtml(sizes) {
    if (!Array.isArray(sizes) || !sizes.length) return '';
    var chips = sizes
      .map(function (s) {
        var label = escapeHtml(s.size);
        return '<span class="rec-chip' + (s.available ? '' : ' off') + '">' + label + '</span>';
      })
      .join('');
    return '<div class="item-sizes rec-sizes">' + chips + '</div>';
  }

  // -------------------------------------------------------------------------
  // Flag "Sugestao de Look": SOMENTE no primeiro card (index 0) e SOMENTE
  // quando o backend marca o produto como isProvenLook:true (Plano 08-02).
  // Funcao pura, nunca lanca — testada em main.test.js.
  // -------------------------------------------------------------------------
  function shouldShowLookFlag(product, index) {
    if (index !== 0) return false;
    if (!product) return false;
    return product.isProvenLook === true;
  }

  function buildSlideHtml(product, index) {
    var safeUrl = escapeHtml(product.url);
    var safeName = escapeHtml(product.name);
    var safeImage = product.image ? escapeHtml(product.image) : null;

    // Primeiro slide nunca usa loading="lazy": e o unico com chance real de ser
    // o elemento LCP da PDP (o bloco carrega cedo via evento onfirstinteraction,
    // que dispara com scroll/clique/toque — nao so apos o load completo da
    // pagina). Lazy nesse slide especifico atrasa o fetch mesmo com a imagem no
    // viewport. Slides seguintes permanecem lazy (genuinamente fora da tela
    // inicial do carrossel).
    var loadingAttr = index === 0 ? ' loading="eager" fetchpriority="high"' : ' loading="lazy"';
    var imageHtml = safeImage
      ? '<img class="rec-img" src="' + safeImage + '" alt="' + safeName + '"' + loadingAttr + '>'
      : '';

    // O texto do selo e os SVGs de navegacao (buildBlockHtml) sao literais
    // estaticos do proprio script, nunca interpolados a partir de `product`
    // (T-08-03-01) — so isProvenLook (boolean) decide a exibicao.
    var lookFlagHtml = shouldShowLookFlag(product, index)
      ? '<div class="rec-flags"><span class="rec-look-badge">Sugestão de Look</span></div>'
      : '';

    return (
      '<div class="rec-card">' +
      '<a href="' + safeUrl + '" class="item-link" style="display:block;text-decoration:none;color:inherit;">' +
      '<div class="item-image" style="margin-bottom:8px;position:relative;">' + lookFlagHtml + imageHtml + '</div>' +
      '<div class="js-item-name item-name rec-name">' + safeName + '</div>' +
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
      // Sem override de fonte: as classes nativas do tema (.section-title
      // .section-title-products-home / .link-text) estilizam identico ao
      // "NOVIDADES" da home (fonte Graphik Wide Trial 24px/500 uppercase; link
      // Poppins sublinhado). So mantemos margem/centralizacao pelo wrapper.
      '<h2 class="section-title section-title-products-home" style="margin:0 0 6px;">RECOMENDADOS</h2>' +
      '<a class="link-text" href="/produtos" style="display:inline-block;">Compre Agora</a>' +
      '</div>' +
      '<div class="rec-viewport">' +
      '<div class="rec-track">' + slides + '</div>' +
      '<button type="button" class="rec-nav rec-nav-prev" aria-label="Ver recomendação anterior">' +
      '<svg viewBox="0 0 16 16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"><path d="M10 2L4 8l6 6"></path></svg>' +
      '</button>' +
      '<button type="button" class="rec-nav rec-nav-next" aria-label="Ver próxima recomendação">' +
      '<svg viewBox="0 0 16 16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"><path d="M6 2l6 6-6 6"></path></svg>' +
      '</button>' +
      '</div>' +
      '</div>'
    );
  }

  // Navegacao do carrossel: rolagem nativa via scrollBy, sem lib de terceiro
  // e sem auto-avanco por temporizador (substitui integralmente o antigo
  // initSwiper). Uma falha aqui nunca impede a renderizacao dos cards
  // (T-08-03-03) — trilha e cards continuam roláveis via CSS nativo mesmo
  // sem os botoes funcionando.
  function initCarouselNav(blockEl) {
    try {
      if (!blockEl) return;
      var track = blockEl.querySelector('.rec-track');
      if (!track) return;
      var prevBtn = blockEl.querySelector('.rec-nav-prev');
      var nextBtn = blockEl.querySelector('.rec-nav-next');

      // Sem overflow real (poucos produtos recomendados o bastante pra caber
      // inteiros no viewport — comum em pares "Sugestão de Look" de cor rara,
      // com poucos candidatos elegíveis do motor clássico pra completar a
      // vitrine) os botões não têm nada pra rolar: ficam visíveis mas sem
      // nenhum efeito ao clicar, parecendo quebrados (bug reportado em
      // produção, 2026-09-18). Oculta os dois nesse caso — nunca só um, pra
      // não sobrar uma seta sozinha sem funcionalidade.
      if (track.scrollWidth <= track.clientWidth + 1) {
        if (prevBtn) prevBtn.style.display = 'none';
        if (nextBtn) nextBtn.style.display = 'none';
        return;
      }

      // Gap real lido do CSS computado (não hardcoded) — o valor difere entre
      // mobile (14px) e desktop (16px, media query >=768px), então um valor
      // fixo desalinhava a distância de rolagem com o tamanho real do card.
      var computedGap = parseFloat(window.getComputedStyle(track).columnGap);
      var GAP_PX = isNaN(computedGap) ? 14 : computedGap;
      var firstCard = track.querySelector('.rec-card');
      var distance = firstCard
        ? firstCard.getBoundingClientRect().width + GAP_PX
        : track.clientWidth;

      if (prevBtn) {
        prevBtn.addEventListener('click', function () {
          track.scrollBy({ left: -distance, behavior: 'smooth' });
        });
      }
      if (nextBtn) {
        nextBtn.addEventListener('click', function () {
          track.scrollBy({ left: distance, behavior: 'smooth' });
        });
      }
    } catch (e) {
      /* falha na navegacao nunca impede a renderizacao dos cards */
    }
  }

  function renderRecommendationBlock(products) {
    if (!products || !products.length) return false;
    if (document.getElementById(BLOCK_ID)) return true; // ja renderizado (idempotente)

    injectStyles();
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

    initCarouselNav(document.getElementById(BLOCK_ID));
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
      shouldShowLookFlag: shouldShowLookFlag,
    };
    return;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
