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

  // URL do backend proprio (Task 1 deste plano — app-partners-recomendados).
  // Para este v.Alpha aponta para um endereco local/tunel temporario; sera
  // finalizada com a URL publica real no plano de publicacao (01-05 / Wave 4).
  var BACKEND_URL = 'http://localhost:3000';

  // Posicao exata documentada em 01-04-SUMMARY.md (D-03): o bloco customizado
  // deve renderizar como irmao, entre o bloco "compre junto" e a secao de
  // descricao do produto — mesmo lugar onde o bloco nativo "Produtos
  // Relacionados" aparecia antes de ser suprimido via CSS (01-04).
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
    var url = BACKEND_URL + '/recommendations/' + encodeURIComponent(productId);
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
  // LIMITACAO CONHECIDA DESTE v.Alpha (documentada tambem em SUMMARY.md):
  // renderiza apenas um link/rotulo simples com o ID do produto recomendado —
  // nao busca nome/imagem/preco do produto recomendado (isso exigiria uma
  // segunda chamada, por exemplo a getProduct() ja existente no client.js do
  // backend, exposta via um novo endpoint). Aceitavel para validar o pipeline
  // ponta-a-ponta (Metafield -> endpoint proprio -> Script -> DOM real).
  function renderRecommendationBlock(recommendedProductId) {
    var html =
      '<div id="recomendados-alpha-block" style="margin: 16px 0;">' +
      '<h2 style="font-size: 1.1em; margin-bottom: 8px;">Recomendados</h2>' +
      '<a href="/produtos/' + encodeURIComponent(recommendedProductId) + '" ' +
      'data-recommended-product-id="' + encodeURIComponent(recommendedProductId) + '">' +
      'Ver produto recomendado (ID ' + recommendedProductId + ')' +
      '</a>' +
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
        if (data && data.recommendedProductId) {
          var inserted = renderRecommendationBlock(data.recommendedProductId);
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
