---
phase: 02-ingest-o-de-cat-logo-e-qualidade-de-dados
plan: 01
subsystem: api
tags: [nuvemshop, rate-limiting, pagination, vitest, fetch]

# Dependency graph
requires:
  - phase: 01-spike-de-viabilidade-end-to-end
    provides: "nuvemshop-client/client.js (getProduct/createMetafield/getMetafields), nuvemshop-auth.js (getAccessToken), padrão de wrapper HTTP sem framework"
provides:
  - "listCategories() e listProducts({categoryId, page, perPage}) exportados em client.js, com paginação real via Link header + fallback por tamanho de página"
  - "AdaptiveRateLimiter (classe) e fetchWithRateLimit() em src/rate-limit/adaptive-limiter.js, lendo x-rate-limit-remaining/x-rate-limit-reset reais a cada resposta"
  - "scripts/resolve-category.js — prova manual de resolução de category_id por nome + listagem paginada, verificada contra a loja real (category_id=36839648 para 'Vestidos')"
  - "vitest configurado como primeiro framework de teste do projeto (npm run test)"
affects: [02-02, 02-03, ingestão de catálogo, motor de recomendação Fase 3]

# Tech tracking
tech-stack:
  added: [vitest@^4.1.10]
  patterns:
    - "fetchWithRateLimit(url, options, limiter) como wrapper obrigatório de fetch para toda chamada paginada — limiter opcional, cria instância descartável se ausente"
    - "hasNextPage derivado de Link header rel=\"next\" OU fallback por tamanho de página, nunca apenas um dos dois isoladamente"
    - "AdaptiveRateLimiter: buffer de segurança remaining <= 2 antes de esperar; nunca espera antes da 1ª resposta real (remaining === null)"

key-files:
  created:
    - app-partners-recomendados/src/rate-limit/adaptive-limiter.js
    - app-partners-recomendados/src/rate-limit/adaptive-limiter.test.js
    - app-partners-recomendados/scripts/resolve-category.js
  modified:
    - app-partners-recomendados/src/nuvemshop-client/client.js
    - app-partners-recomendados/package.json

key-decisions:
  - "Rate limiter implementado como classe pequena caseira (não bottleneck), seguindo RESEARCH.md — volume desta fase (poucas dezenas de chamadas por execução) não justifica biblioteca de filas externa"
  - "listCategories() não pagina múltiplas páginas (per_page=200 cobre o catálogo de categorias inteiro esperado), mas loga aviso se rel=\"next\" estiver presente para não mascarar silenciosamente uma lista incompleta"

patterns-established:
  - "Pattern: toda função de client.js que faz requisição de rede aceita limiter opcional e chama fetchWithRateLimit em vez de fetch cru"
  - "Pattern: scripts manuais de verificação (scripts/*.js) seguem o estilo de roundtrip-metafield.js — sem framework CLI, argumentos posicionais via process.argv, execução via node --env-file=.env"

requirements-completed: [PLAT-02]

# Metrics
duration: 25min
completed: 2026-07-10
status: complete
---

# Phase 2 Plan 1: Cliente paginado + rate limiter adaptativo Summary

**Cliente Nuvemshop estendido com listagem paginada de categorias/produtos e rate limiter adaptativo que lê x-rate-limit-* reais (nunca hardcoded), validado ponta a ponta contra a loja Talgui real — category_id de "Vestidos" resolvido (36839648), 1ª página de 200 produtos listada com hasNextPage=true.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-07-10T19:04:21Z (aprox., início da leitura de contexto)
- **Completed:** 2026-07-10T19:29:00Z (aprox.)
- **Tasks:** 3
- **Files modified:** 5 (2 modificados, 3 criados; +package-lock.json gerado pela instalação do vitest)

## Accomplishments
- `listCategories()` e `listProducts({categoryId, page, perPage})` exportados em `client.js`, reaproveitando `buildHeaders`/`assertOk`/`API_BASE` existentes sem alterar `getProduct`/`createMetafield`/`getMetafields`
- `AdaptiveRateLimiter` (classe) e `fetchWithRateLimit()` implementados via TDD (RED→GREEN), cobrindo os 5 comportamentos do plano com vitest + fake timers
- `scripts/resolve-category.js` executado com sucesso contra a loja real: resolveu `category_id=36839648` para "Vestidos" via `GET /categories` (nunca hardcoded) e listou 200 produtos na primeira página (`hasNextPage: true`, consistente com os ~628 produtos esperados por D-01)

## Task Commits

Each task was committed atomically:

1. **Task 2 (RED): failing test for adaptive rate limiter** - `448f48f` (test)
2. **Task 1: listCategories()/listProducts() em client.js** - `24bc9b7` (feat)
3. **Task 2 (GREEN): AdaptiveRateLimiter + fetchWithRateLimit** - `75d5463` (feat)
4. **Task 3: resolve-category.js, verificado contra a loja real** - `63d0279` (feat)

_Nota: Task 2 é `tdd="true"` — commit RED (test) foi feito antes do commit GREEN (feat) de Task 1, pois o teste foi escrito e confirmado como falho antes da implementação do limiter, que é uma dependência de import de client.js. A ordem de commits no git log reflete RED → (Task 1: client.js, que já importa o módulo do limiter) → GREEN (Task 2: adaptive-limiter.js) → Task 3._

**Plan metadata:** (este commit, a seguir)

## Files Created/Modified
- `app-partners-recomendados/src/nuvemshop-client/client.js` - adiciona `listCategories()` e `listProducts()`, mantendo funções existentes inalteradas
- `app-partners-recomendados/src/rate-limit/adaptive-limiter.js` - `AdaptiveRateLimiter` (updateFromHeaders/waitIfNeeded) + `fetchWithRateLimit()`
- `app-partners-recomendados/src/rate-limit/adaptive-limiter.test.js` - 5 testes cobrindo os comportamentos do rate limiter (vitest + fake timers)
- `app-partners-recomendados/scripts/resolve-category.js` - script de verificação manual, resolve category_id por nome e lista 1ª página de produtos
- `app-partners-recomendados/package.json` - adiciona `vitest` como devDependency e script `"test": "vitest run"`

## Decisions Made
- Rate limiter caseiro (não `bottleneck`), conforme recomendação de RESEARCH.md — volume desta fase não justifica biblioteca de filas externa
- `listCategories()` não implementa paginação de múltiplas páginas (per_page=200 já cobre o esperado), mas loga aviso via `console.warn` se detectar `rel="next"`, para não mascarar silenciosamente uma lista incompleta

## Deviations from Plan

None - plan executado exatamente como especificado.

## Issues Encountered
None.

## User Setup Required

None - nenhuma configuração externa necessária. `vitest` foi instalado localmente via `npm install -D vitest` dentro de `app-partners-recomendados/`.

## Next Phase Readiness
- `client.js` agora suporta leitura em lote paginada de categorias e produtos, com throttling adaptativo real — pronto para o Plano 02 (ingestão/persistência) construir sobre esta base sem herdar dados incompletos ou quebrar com 429 em volume
- `category_id` real de "Vestidos" confirmado (36839648) via execução real, evitando qualquer hardcode nas próximas plans desta fase
- Nenhum bloqueio identificado

---
*Phase: 02-ingest-o-de-cat-logo-e-qualidade-de-dados*
*Completed: 2026-07-10*

## Self-Check: PASSED

- FOUND: app-partners-recomendados/src/nuvemshop-client/client.js
- FOUND: app-partners-recomendados/src/rate-limit/adaptive-limiter.js
- FOUND: app-partners-recomendados/src/rate-limit/adaptive-limiter.test.js
- FOUND: app-partners-recomendados/scripts/resolve-category.js
- FOUND: commit 448f48f (test)
- FOUND: commit 24bc9b7 (feat)
- FOUND: commit 75d5463 (feat)
- FOUND: commit 63d0279 (feat)
