---
phase: 04-preview-e-aprova-o-humana
plan: 04
subsystem: ui
tags: [node:http, ssr, html, xss, vitest, integration-testing, review-panel]

# Dependency graph
requires:
  - phase: 04-preview-e-aprova-o-humana (04-01/04-02)
    provides: getLatestSnapshotProducts/getLatestSuccessfulRunId/getBaselineForRun (catalog-store.js), buildReviewQueue (review-queue.js), computeDiff (diff.js)
provides:
  - "src/review-server.js — servidor HTTP node:http nativo, porta própria (REVIEW_PORT=3100), bind 127.0.0.1, factory createServer() testável"
  - "GET /review — fila de revisão (estado vazio ou tabela com link Revisar), D-22"
  - "GET /review/:productId — diff antes/depois com badges Adicionado/Removido/Mantido, formulário de curadoria (Remover) já funcional via ?removedIds=, formulários Aprovar/Rejeitar já renderizados (rota real fica para 04-05)"
  - "escapeHtml() — proteção XSS aplicada a todo valor dinâmico interpolado em HTML"
  - "src/review-server.test.js — primeira suíte de integração HTTP do projeto via fetch() nativo, 8 comportamentos verdes"
affects: [04-05, 05-escrita-segura]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Servidor de painel interno em processo/porta separados do servidor público (PLAT-05), nunca compartilhando porta 3000"
    - "HTML SSR via template strings puras (sem framework), <style> inline implementando literalmente os tokens do UI-SPEC"
    - "escapeHtml() nomeada, aplicada a todo valor dinâmico antes de interpolar em template string de HTML (V5/XSS)"
    - "Formulários de rotas futuras (approve/reject) já renderizados com action/campo corretos antes da rota existir — próximo plano só adiciona handler, nunca reescreve HTML"

key-files:
  created:
    - app-partners-recomendados/src/review-server.js
    - app-partners-recomendados/src/review-server.test.js
  modified: []

key-decisions:
  - "createServer() é uma factory pura — nunca chama .listen() como efeito colateral de import; só inicia servidor real via guarda import.meta.url === pathToFileURL(process.argv[1]).href"
  - "REVIEW_PORT default 3100 (nunca reusa a porta 3000 padrão de server.js), bind explícito 127.0.0.1 (T-04-07b)"
  - "DRY_RUN_MODE lido do process.env UMA VEZ no carregamento do módulo (Pattern 4 do 04-RESEARCH.md), nunca dentro do handler de request"

requirements-completed: [APRV-01, APRV-02]

# Metrics
duration: 15min
completed: 2026-07-16
status: complete
---

# Phase 04 Plan 04: Servidor de Revisão HTTP (GET /review, GET /review/:productId) Summary

**Servidor `node:http` nativo novo (porta 3100, bind 127.0.0.1) renderiza server-side a fila de revisão e o diff antes/depois por produto, implementando literalmente cores/tipografia/espaçamento/copy do 04-UI-SPEC.md, com escapeHtml() protegendo todo valor dinâmico contra XSS.**

## Performance

- **Duration:** ~15 min
- **Tasks:** 2/2 completos
- **Files modified:** 2 (ambos novos)

## Accomplishments
- `GET /review` mostra o estado vazio exato do UI-SPEC ("Nada para revisar agora") quando nenhum produto mudou, e uma tabela com link "Revisar" por produto quando há mudança (D-22)
- `GET /review/:productId` mostra colunas "Antes"/"Depois" separadas (SC#1) com badges Adicionado/Removido/Mantido corretos, e já lê `?removedIds=` refletindo a curadoria no diff (D-19) sem tocar `recommendation-engine.js`
- `escapeHtml()` protege nome de produto, cor e tecido antes de qualquer interpolação em HTML — comprovado por teste com payload `<script>alert(1)</script>`
- Formulários de aprovação/rejeição (`POST /review/:productId/approve` e `/reject`) já renderizados com os campos/action corretos, prontos para o Plano 04-05 só adicionar os handlers
- Servidor roda em processo e porta próprios (3100, bind `127.0.0.1`), nunca compartilhando o `server.js` público (PLAT-05)
- Primeira suíte de integração HTTP do projeto (`fetch()` nativo contra porta efêmera), 8/8 comportamentos verdes; suíte completa do projeto permanece verde (105/105)

## Task Commits

Each task was committed atomically:

1. **Task 1: review-server.js — HTML SSR, rotas GET, factory testável, bind 127.0.0.1** - `cd94a48` (feat)
2. **Task 2: review-server.test.js — integração via fetch() nativo (RED→GREEN)** - `a1496c5` (test)

_Nota TDD: os 8 testes da Task 2 passaram já na primeira execução contra a implementação da Task 1 (GREEN imediato), exceto por um ajuste no próprio teste (ver Issues Encountered) — nenhum ajuste foi necessário em `review-server.js`._

## Files Created/Modified
- `app-partners-recomendados/src/review-server.js` - servidor HTTP de revisão (createServer factory, escapeHtml, sendHtml, renderPage/renderQueuePage/renderDiffPage/renderProductNotFoundPage)
- `app-partners-recomendados/src/review-server.test.js` - 8 testes de integração via fetch() nativo, banco temporário isolado (CATALOG_DB_DIR)

## Decisions Made
- `createServer()` retorna a instância `http.Server` sem `.listen()` — testável em porta efêmera, nunca sobe servidor real como efeito colateral de import
- `REVIEW_PORT` (default 3100) e bind explícito a `127.0.0.1` — porta e interface nunca compartilhadas com `server.js` público
- `DRY_RUN_MODE` resolvido uma única vez no carregamento do módulo (não em cada request), consistente com o Pattern 4 do `04-RESEARCH.md` que o Plano 04-05 vai reusar

## Deviations from Plan

None - plan executed exactly as written. O único ajuste foi na asserção do próprio Test 8 (ver Issues Encountered), não na implementação.

## Issues Encountered
- Test 8 original comparava `?removedIds=` contra o `body` inteiro da resposta, o que gerava falso-positivo: o formulário "Aprovar recomendações" (fora da coluna "Depois") legitimamente carrega o id já removido no campo oculto `removedIds`, então a string aparecia no HTML por um motivo correto e não relacionado ao bug que o teste queria capturar. Corrigido isolando a asserção ao bloco HTML da coluna "Depois" (entre o heading e o início de `.actions-row`) antes de checar a ausência do id removido — nenhuma mudança em `review-server.js` foi necessária, o comportamento do servidor já estava correto.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- O Plano 04-05 pode adicionar `POST /review/:productId/approve` e `POST /review/:productId/reject` sem alterar nenhum HTML já escrito (formulários já corretos)
- Um operador já consegue abrir o navegador, ver a fila de produtos mudados e o diff detalhado de qualquer um deles — falta só a ação de aprovar/rejeitar ter rota funcional (04-05)
- Nenhum bloqueio conhecido

## Self-Check: PASSED

- FOUND: app-partners-recomendados/src/review-server.js
- FOUND: app-partners-recomendados/src/review-server.test.js
- FOUND commit: cd94a48
- FOUND commit: a1496c5

---
*Phase: 04-preview-e-aprova-o-humana*
*Completed: 2026-07-16*
