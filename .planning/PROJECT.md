# Bot de Produtos Recomendados — Talgui

## What This Is

Uma ferramenta interna que automatiza a curadoria da vitrine de "Recomendados" de cada produto na loja Talgui (moda feminina, Nuvemshop plano Next, 592 produtos). Hoje esse trabalho é 100% manual e se desfaz sozinho conforme produtos esgotam. A solução é um motor determinístico (sem IA/ML) que mantém recomendações compatíveis (mesma cor, mesmo tipo de tecido, com estoque disponível) atualizadas automaticamente, com aprovação humana antes de qualquer alteração na loja, rodando na nuvem com retroalimentação diária.

Este projeto já foi iniciado em outra máquina (ver PDF "Resumo Executivo Talgui Recomendados 2026-06-24" trazido pelo usuário) e está sendo retomado aqui. O contexto desse resumo foi incorporado integralmente, com uma correção crítica de escopo descrita abaixo.

## Core Value

A vitrine de "Recomendados" se mantém sempre curada e sem estoque zerado, sem trabalho manual — e sem depender de uma escolha de plataforma (App Sob Medida vs Partners) que se prove tecnicamente inviável a meio do caminho.

## Requirements

### Validated

(Nenhuma ainda — nada foi confirmado como funcional nesta retomada do projeto. Ver nuance crítica abaixo.)

### Validated

- ✓ Nuvemshop expõe API pública de app (App Sob Medida e Partners) para leitura de catálogo/estoque/variantes via `GET /2025-03/{store_id}/products` — testado ao vivo na loja real Talgui, token funcional, `200 OK` com todos os campos documentados (`name`, `categories`, `variants`, `tags`, `has_stock`, etc.) — validação técnica desta retomada, 2026-07-08
- ✓ O campo nativo "Produtos Relacionados" (`alternative_products`/`complementary_products`) **não é gravável nem legível via nenhuma API pública de app** (nem App Sob Medida, nem, por extensão de arquitetura, Partners) — é gravado exclusivamente pelo endpoint interno `cirrus.tiendanube.com/v4/products/{id}`, autenticado por sessão de navegador logado no admin (`X-Access-Token`), não por `Authorization: Bearer` de app. Confirmado por: (1) inspeção de rede do admin capturando o payload real do campo, (2) teste ao vivo mostrando que a API pública não retorna esses campos ao ler o mesmo produto, (3) teste ao vivo mostrando que o endpoint interno rejeita o token de app (404, roteamento diferente do `200` obtido com sessão de navegador). Isso invalida a afirmação do PDF original de que a viabilidade "já foi confirmada" — o teste anterior provavelmente validou outro campo (categoria/tag/ordenação), não o campo nativo de recomendados.
- ✓ Nuvemshop Partners (app privado, "Exclusivo para Lojistas Selecionados", não-homologado) consegue escrever no storefront real da Talgui via `write_scripts` — validado empiricamente porque já está em produção no projeto paralelo de ordenação automática de vitrines do usuário, na mesma loja

### Active

- [ ] Fundação técnica — conexão segura e autenticada com a loja, respeitando rate limits da API
- [ ] Leitura do catálogo e estoque (592 produtos)
- [ ] Leitura das recomendações atuais de cada produto
- [ ] Padronização/limpeza das tags de tecido (pré-requisito de qualidade de dados para o motor de recomendação)
- [ ] Motor de recomendação determinístico: até 8 recomendados por produto, mesma cor + mesmo tipo de tecido + estoque disponível (obrigatório), priorizando maior giro entre elegíveis
- [ ] Painel web de aprovação (substitui a planilha do plano original) — preview "antes vs. depois" revisável antes de qualquer escrita na loja
- [ ] Aprovação humana obrigatória antes de gravar qualquer alteração na loja
- [ ] App Partners privado (não homologado, "Exclusivo para Lojistas Selecionados") com escopo `write_scripts` + NubeSDK — caminho obrigatório confirmado, pois o campo nativo de recomendados não é gravável por nenhuma API de app
- [ ] Motor de recomendação grava resultado em Metafields do produto via API pública (App Sob Medida ou Partners, sem precisar de Script para essa parte)
- [ ] Script (Partners) injetado no storefront que lê os Metafields e renderiza o bloco "Recomendados" customizado, substituindo/complementando o bloco nativo
- [ ] Gravação segura na loja — captura do estado anterior antes de sobrescrever
- [ ] Segurança operacional: modo de simulação (dry-run), log de auditoria, e opção de desfazer (rollback)
- [ ] Execução na nuvem (ex: GitHub Actions ou servidor/cron hospedado) — não depende da máquina pessoal estar ligada
- [ ] Snapshot diário automático: retroalimentação recorrente que recalcula recomendações com base em critérios atualizados de estoque e disponibilidade de cor/tecido

### Out of Scope

- IA/ML para geração de recomendações — motor é 100% baseado em regras determinísticas, auditável e barato
- Edição de tema/Script da loja via App Sob Medida — se necessário, projeto migra para Nuvemshop Partners
- Escrita automática sem aprovação humana — toda gravação na loja passa por aprovação prévia

## Context

**Histórico:** projeto retomado de outra máquina local. Um resumo executivo (PDF, 2026-06-24) documentava 9 etapas, com a Etapa 1 ("Viabilidade") marcada como "Concluída" — alegando que já foi provado que dá para escrever recomendações pela API e a loja exibe corretamente, sem mexer no tema.

**Nuance crítica (motivo da correção de escopo):** o usuário não tem certeza de ter validado essa viabilidade como de fato funcional em loja real. Além disso, em outro projeto anterior, o usuário descobriu ao final que a API de "App Sob Medida" (custom app) da Nuvemshop **não permite edição de Scripts** — não se comunica com a escrita nativa de Scripts da API da Nuvemshop. Isso não invalida necessariamente este projeto, porque o escopo real aqui é ler/escrever **dados de produto** (recomendações), não editar tema ou Script. Mas como o usuário não tem certeza de que a validação anterior foi de fato confirmada como funcional, a Etapa 1 do roadmap original foi rebaixada de "Concluída" para "Pendente de revalidação" e vira a primeira etapa real deste projeto.

**Resultado da revalidação (2026-07-08):** confirmado que o caminho App Sob Medida sozinho **não é viável** para este projeto. O campo nativo "Produtos Relacionados" só é gravável pelo endpoint interno do admin da Nuvemshop (sessão de navegador), inacessível a qualquer app via API pública. A arquitetura definida é:
1. Motor de recomendação roda na nuvem, lê catálogo/estoque via API pública (App Sob Medida ou Partners, tanto faz para essa parte) e grava o resultado em Metafields do produto (API pública, sem Script).
2. Um App Partners privado (não homologado, "Exclusivo para Lojistas Selecionados") com escopo `write_scripts` + NubeSDK injeta um Script no storefront que lê os Metafields e renderiza um bloco "Recomendados" customizado.
3. Esse mecanismo (Script via Partners escrevendo no storefront real da Talgui) já está validado em produção pelo projeto paralelo de ordenação automática de vitrines do usuário, na mesma loja — reduz o risco de novidade tecnológica.

Evidência técnica da investigação (não-destrutiva, sem alterar dados reais):
- Captura de rede do admin (DevTools) mostrando que a gravação de "Produtos relacionados" chama `PATCH https://cirrus.tiendanube.com/v4/products/{id}?sync-refresh=true` com payload `{alternative_products: [{id, order}], complementary_products: [...]}`, autenticado via header `X-Access-Token` de sessão de navegador (não `Authorization: Bearer` de app).
- `GET /2025-03/{store_id}/products/{id}` via API pública de app (token válido) no mesmo produto retornou `200 OK` mas sem os campos `alternative_products`/`complementary_products`/`related_products` — confirmando que não existem no contrato de API pública.
- `GET https://cirrus.tiendanube.com/v4/products/{id}` usando `Authorization: Bearer` de app retornou `404` (o endpoint interno não reconhece autenticação de app).

**Visão de futuro (v2 do PDF) incorporada como requisito ativo, não mais como "fora de escopo":**
- Agendador que roda sozinho periodicamente para recompor a vitrine automaticamente = snapshot diário retroalimentado (estoque + cor/tecido)
- Painel web de aprovação como alternativa à planilha → já definido como abordagem do MVP nesta retomada (não planilha)

**Execução:** roda na nuvem (GitHub Actions ou servidor/cron hospedado), não depende de máquina pessoal ligada — necessário para sustentar o snapshot diário.

## Constraints

- **Plataforma**: Nuvemshop plano Next, loja real "Talgui" (592 produtos) — qualquer escrita precisa respeitar rate limits da API (2 req/s, buffer de 40)
- **Modelo de app**: Nuvemshop Partners, app privado não homologado ("Exclusivo para Lojistas Selecionados"), com escopo `write_scripts` + NubeSDK — confirmado como obrigatório em 2026-07-08, pois o campo nativo de recomendados não é acessível via API pública de nenhum app
- **Sem IA/ML**: motor de recomendação deve ser determinístico e auditável
- **Segurança**: nenhuma escrita na loja sem aprovação humana prévia; toda escrita deve capturar estado anterior e permitir rollback

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Rebaixar Etapa 1 ("Viabilidade") de Concluída para Pendente de revalidação | Usuário não tinha certeza de ter confirmado a escrita via API em loja real como funcional | ✓ Good — revalidação concluída, confirmou que a premissa do PDF estava errada |
| Migrar para Nuvemshop Partners privado (write_scripts) como caminho obrigatório | Confirmado empiricamente em 2026-07-08 que o campo nativo "Produtos Relacionados" só é gravável pelo endpoint interno do admin (sessão de navegador), inacessível a App Sob Medida ou qualquer API pública de app | ✓ Good |
| Arquitetura: motor grava em Metafields (API pública) + Script (Partners) renderiza bloco customizado no storefront | Contorna a limitação do campo nativo sem depender do endpoint interno da Nuvemshop; reaproveita mecanismo já validado em produção pelo projeto paralelo de ordenação | ✓ Good |
| Painel web de aprovação no MVP em vez de planilha | Usuário optou por adiantar a v2 do PDF (painel web) já no MVP desta retomada | ✓ Good |
| Execução na nuvem (não máquina pessoal) | Necessário para sustentar snapshot diário automático sem depender da máquina estar ligada | ✓ Good |
| Snapshot diário tratado como requisito ativo, não v2 fora de escopo | Usuário quer retroalimentação automática via estoque/cor/tecido incluída neste projeto | ✓ Good |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-07-08 after initialization*
