/**
 * storefront-script/main.test.js
 *
 * Primeiro teste automatizado deste script (Wave 0 gap do 06-VALIDATION.md).
 * Cobre getCachedRecommendation/setCachedRecommendation (cache TTL de 24h,
 * D-50) via um storage fake injetado - sem jsdom, sem window/document reais.
 *
 * Interop CJS->ESM: main.js exporta as duas funcoes via `module.exports`
 * apenas quando `typeof module !== 'undefined'` (nunca verdadeiro num
 * <script> classico real no navegador) - guard adicionado neste mesmo plano.
 *
 * Rodar A PARTIR DA RAIZ DO REPOSITORIO:
 *   node app-partners-recomendados/node_modules/vitest/vitest.mjs run storefront-script/main.test.js
 * (storefront-script/ nao tem package.json/vitest proprio; rodar de dentro de
 * app-partners-recomendados/ NAO encontra este arquivo - confirmado
 * empiricamente durante o planejamento desta fase.)
 */

import { describe, it, expect } from 'vitest';
import { getCachedRecommendation, setCachedRecommendation } from './main.js';

// Storage fake simples apoiado num objeto JS puro (sem Map/classe, mesmo
// estilo do resto do projeto) - implementa so o subset usado por main.js.
function createFakeStorage(initial) {
  var data = initial || {};
  return {
    getItem: function (key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem: function (key, value) {
      data[key] = value;
    }
  };
}

describe('getCachedRecommendation', function () {
  it('retorna os dados cacheados quando dentro do TTL de 24h (cache hit)', function () {
    var storage = createFakeStorage();
    var now = 1000000;
    var payload = { recommendedProductId: '123', recommendedProduct: { name: 'X' } };

    setCachedRecommendation(storage, '349886153', payload, now);

    var result = getCachedRecommendation(storage, '349886153', now + 1000);
    expect(result).toEqual(payload);
  });

  it('retorna null quando o cache expirou (>24h desde cachedAt)', function () {
    var storage = createFakeStorage();
    var now = 1000000;
    var payload = { recommendedProductId: '123', recommendedProduct: { name: 'X' } };
    var TTL_MS = 24 * 60 * 60 * 1000;

    setCachedRecommendation(storage, '349886153', payload, now);

    var result = getCachedRecommendation(storage, '349886153', now + TTL_MS + 1);
    expect(result).toBeNull();
  });

  it('retorna null quando nao ha nenhuma entrada para o productId (storage vazio)', function () {
    var storage = createFakeStorage();
    var result = getCachedRecommendation(storage, '349886153', 1000000);
    expect(result).toBeNull();
  });

  it('retorna null (nunca lanca) quando o valor gravado e JSON invalido/corrompido', function () {
    var storage = createFakeStorage({ recomendados_cache_349886153: '{not valid json' });
    var result;
    expect(function () {
      result = getCachedRecommendation(storage, '349886153', 1000000);
    }).not.toThrow();
    expect(result).toBeNull();
  });

  it('isola por chave: cache gravado para um productId nunca e retornado para outro productId', function () {
    var storage = createFakeStorage();
    var now = 1000000;
    var payload = { recommendedProductId: '123', recommendedProduct: { name: 'X' } };

    setCachedRecommendation(storage, '349886153', payload, now);

    var result = getCachedRecommendation(storage, '321418552', now + 1000);
    expect(result).toBeNull();
  });
});

describe('setCachedRecommendation', function () {
  it('nunca lanca quando storage.setItem lanca uma excecao (Safari modo privado/quota excedida)', function () {
    var storage = {
      getItem: function () {
        return null;
      },
      setItem: function () {
        throw new Error('QuotaExceededError');
      }
    };

    expect(function () {
      setCachedRecommendation(storage, '349886153', { recommendedProductId: '1' }, 1000000);
    }).not.toThrow();
  });
});
