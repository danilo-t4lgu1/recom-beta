/**
 * storefront-script/main.js
 *
 * v.Alpha — Script API tradicional da Nuvemshop (`write_scripts`, sem NubeSDK).
 *
 * ATENCAO — DEBITO TECNICO EXPLICITO (D-11 em 01-CONTEXT.md):
 * Este script foi construido deliberadamente com a Script API legada (JS puro,
 * acesso direto ao DOM), NAO com NubeSDK, como uma decisao explicita e assumida
 * pelo usuario em 2026-07-10, enquanto a ativacao do NubeSDK para o tema Morelia
 * da loja ainda esta pendente de aprovacao externa. Apps sem NubeSDK deixam de
 * poder receber novas instalacoes a partir de 30/ago/2026 e enfrentam remocao
 * progressiva a partir de 30/out/2026 — ou seja, este arquivo tem vida util
 * garantida de poucas semanas e PRECISARA ser reconstruido do zero em NubeSDK
 * (modelo de execucao totalmente diferente: Web Worker sandbox + UI Slots +
 * nube.render(), sem acesso a `document`) quando a ativacao for aprovada. Nao
 * tratar este arquivo como base incremental para o script NubeSDK futuro.
 *
 * Este script roda direto no navegador do visitante (injetado via tag <script>
 * pelo Partners Portal), com acesso irrestrito ao DOM — por isso manipulacao
 * direta de `document.*` e esperada e correta aqui (ao contrario do NubeSDK).
 */

(function () {
  'use strict';

  // -------------------------------------------------------------------------
  // Configuracao
  // -------------------------------------------------------------------------

  // URL do backend proprio (app-partners-recomendados), publicada no Wave 4
  // (01-05) como Vercel Serverless Function no MESMO projeto que ja hospeda
  // os webhooks LGPD (plano 01-02): https://app-partners-recomendados.vercel.app.
  // Rota correspondente: api/recommendations/[productId].js (convencao de rota
  // dinamica do Vercel) — por isso o path abaixo e '/api/recommendations/'
  // (nao '/recommendations/', usado apenas pelo server.js local de 01-03).
  var BACKEND_URL = 'https://app-partners-recomendados.vercel.app';

  // Posicao exata documentada em 01-04-SUMMARY.md (D-03): o bloco customizado
  // deve renderizar como irmao, entre o bloco "compre junto" e a secao de
  // descricao do produto — mesmo lugar onde o bloco nativo "Produtos
  // Relacionados" aparecia antes de ser suprimido via CSS (01-04).
  // Reconfirmado no Wave 4 (01-05, Task 1 adaptada per override D-11): os dois
  // seletores abaixo (#product-description / #compre-junto-block) continuam
  // batendo exatamente com a posicao documentada em 01-04-SUMMARY.md — nenhum
  // ajuste foi necessario. Nao ha slot NubeSDK nem build/bundle step neste
  // v.Alpha (Script API tradicional), entao a Task 1 original do plano
  // (ajustar slot `nube.render()` + rebuild `tsup`) nao se aplica.
  var ANCHOR_BEFORE_SELECTOR = '#product-description';
  var ANCHOR_AFTER_SELECTOR = '#compre-junto-block';

  // -------------------------------------------------------------------------
  // Passo 1: obter o ID do produto atual da pagina real
  // -------------------------------------------------------------------------
  //
  // Mecanismo escolhido: `window.LS.product.id`.
  //
  // Por que: inspecionando o HTML real publicado em
  // https://talgui.com.br/produtos/vestido-elaine-preto/ (curl -s -L, 2026-07-10),
  // o tema (familia Nuvemshop/LojaIntegrada "Morelia") expoe um objeto global
  // `LS.product` inline no <script> da propria pagina, contendo o produto atual:
  //
  //   LS.product = {
  //       id : 349886153,
  //       name : 'Vestido Elaine Preto',
  //       requires_shipping: true,
  //       ...
  //   };
  //
  // Essa atribuicao aparece exatamente 1 vez na pagina (confirmado via busca no
  // HTML bruto), diferente de outros campos como `data-product-id="..."` (que
  // aparecem repetidos nos cards de produtos relacionados/vitrine — nao servem
  // para identificar o produto principal da pagina) ou o destructure inline
  // `const { id: productId, price: productPrice } = {...}` usado internamente
  // pelo tema para tracking de analytics (nao e um global estavel, e uma
  // variavel de escopo de funcao). `window.LS.product.id` e a fonte mais
  // confiavel: e um global explicito, atribuido uma unica vez, exatamente para
  // este proposito (o proprio tema o usa para `LS.currency`, `LS.cart`, etc.).
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
  // Passo 2: buscar a recomendacao no backend proprio
  // -------------------------------------------------------------------------
  //
  // Fala SOMENTE com o endpoint proprio (Task 1 deste plano). Nunca chama a
  // API publica oficial da Nuvemshop (Tiendanube) diretamente — nenhum
  // access_token/client_secret da Nuvemshop e embutido neste arquivo
  // client-side (mesma fronteira PLAT-05 do endpoint do backend).
  function fetchRecommendation(productId) {
    var url = BACKEND_URL + '/api/recommendations/' + encodeURIComponent(productId);
    return fetch(url, { method: 'GET' })
      .then(function (response) {
        if (!response.ok) {
          throw new Error('recommendations endpoint respondeu status ' + response.status);
        }
        return response.json();
      });
  }

  // -------------------------------------------------------------------------
  // Passo 3: renderizar o bloco "Recomendados" no DOM
  // -------------------------------------------------------------------------
  //
  // Correcao pos-verificacao-visual do Wave 4: a primeira versao deste v.Alpha
  // linkava para `/produtos/{id}` (ID numerico), que sempre resulta em 404 —
  // a rota real da Nuvemshop usa o "Identificador URL" (handle) do produto,
  // nao o ID. O backend agora retorna `recommendedProduct.url` ja pronto
  // (canonical_url da API publica), alem de nome/imagem/preco, entao o bloco
  // deixou de ser so um link de texto generico.
  function renderRecommendationBlock(recommendedProduct) {
    var imageHtml = recommendedProduct.image
      ? '<img src="' + recommendedProduct.image + '" alt="' + recommendedProduct.name + '" ' +
        'style="width: 80px; height: 80px; object-fit: cover; border-radius: 4px; flex-shrink: 0;">'
      : '';
    var priceHtml = recommendedProduct.price
      ? '<div style="color: #555; margin-top: 4px;">R$ ' + recommendedProduct.price + '</div>'
      : '';

    // Envolvido em .container-fluid.position-relative para herdar o mesmo
    // padding/alinhamento horizontal que as demais secoes da pagina de produto
    // ja usam neste tema (Morelia) — sem isso, o bloco ficava colado na borda
    // esquerda da tela, fora do alinhamento do restante do conteudo (achado da
    // verificacao visual do Wave 4).
    var html =
      '<div class="container-fluid position-relative">' +
      '<div id="recomendados-alpha-block" style="margin: 16px 0;">' +
      '<h2 style="font-size: 1.1em; margin-bottom: 8px;">Recomendados</h2>' +
      '<a href="' + recommendedProduct.url + '" ' +
      'data-recommended-product-id="' + encodeURIComponent(recommendedProduct.name) + '" ' +
      'style="display: flex; align-items: center; gap: 12px; text-decoration: none; color: inherit;">' +
      imageHtml +
      '<div>' +
      '<div style="font-weight: 600;">' + recommendedProduct.name + '</div>' +
      priceHtml +
      '</div>' +
      '</a>' +
      '</div>' +
      '</div>';

    var beforeEl = document.querySelector(ANCHOR_BEFORE_SELECTOR);
    var afterEl = document.querySelector(ANCHOR_AFTER_SELECTOR);

    if (beforeEl) {
      // Insere como irmao, imediatamente antes de #product-description —
      // exatamente a posicao documentada em 01-04-SUMMARY.md (D-03).
      beforeEl.insertAdjacentHTML('beforebegin', html);
      return true;
    }

    if (afterEl) {
      // Fallback: insere como irmao, imediatamente depois de #compre-junto-block,
      // caso #product-description nao esteja presente no DOM no momento da
      // execucao (ex: carregamento assincrono de outro bloco).
      afterEl.insertAdjacentHTML('afterend', html);
      return true;
    }

    return false;
  }

  // -------------------------------------------------------------------------
  // Orquestracao
  // -------------------------------------------------------------------------

  function init() {
    var productId = getCurrentProductId();

    if (!productId) {
      // Nao estamos numa pagina de produto (ou o tema mudou a variavel global) —
      // nao faz sentido tentar renderizar recomendacoes.
      return;
    }

    fetchRecommendation(productId)
      .then(function (data) {
        if (data && data.recommendedProductId && data.recommendedProduct) {
          var inserted = renderRecommendationBlock(data.recommendedProduct);
          if (!inserted) {
            console.warn(
              '[recomendados-alpha] Nao foi possivel encontrar ' +
              ANCHOR_BEFORE_SELECTOR + ' nem ' + ANCHOR_AFTER_SELECTOR +
              ' no DOM para ancorar o bloco de recomendacao.'
            );
          }
        }
      })
      .catch(function (err) {
        console.warn('[recomendados-alpha] Falha ao buscar recomendacao:', err);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
