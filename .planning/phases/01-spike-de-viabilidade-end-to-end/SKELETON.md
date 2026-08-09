# Walking Skeleton — Bot de Produtos Recomendados (Talgui)

**Phase:** 1
**Generated:** 2026-07-09

## Capability Provada de Ponta a Ponta

> Uma frase: a menor capacidade real e visível que exercita a stack inteira.

Um visitante da loja real Talgui, ao abrir a página de um produto de teste específico, vê um bloco "Recomendados" customizado — renderizado por um Script NubeSDK publicado via App Partners, que buscou o dado num endpoint próprio somente-leitura, que por sua vez leu um Metafield gravado via API pública da Nuvemshop — no lugar exato onde o bloco nativo "Produtos Relacionados" aparecia (agora suprimido via CSS/layout).

Esta NÃO é uma aplicação convencional com UI/DB/rotas no sentido tradicional. É um spike de arquitetura de integração de plataforma: a "camada de dados" é a própria Nuvemshop (Metafields), a "UI" é o storefront real da loja renderizado por um Script isolado em Web Worker, e o "deploy" é a publicação do Script via Partners Portal contra a loja de produção. O conceito de walking skeleton é aplicado adaptado a essa natureza: prova-se a cadeia real (auth → escrita → leitura → renderização) em vez de forçar um mapeamento literal para framework web/DB/frontend que não existe neste domínio.

## Decisões Arquiteturais

| Decisão | Escolha | Racional |
|---|---|---|
| Modelo de app Nuvemshop | App Partners privado, não homologado ("Exclusivo para Lojistas Selecionados"), escopo `write_scripts` + NubeSDK | Único caminho que permite Script no storefront; App Sob Medida existente não tem esse escopo (confirmado em PROJECT.md) — registro novo e separado por D-09 |
| Mecanismo de renderização no storefront | NubeSDK (Web Worker isolado, `nube.render()` em UI Slots), NÃO Script API legado | Script API legado bloqueia novas instalações a partir de 30/ago/2026 — inviável para um app novo registrado agora (achado crítico de RESEARCH.md) |
| Armazenamento da recomendação | Metafield do produto (`namespace: recomendados`, `key: produto_sugerido`), via API pública REST | Campo nativo "Produtos Relacionados" só é gravável pelo endpoint interno do admin (sessão de navegador) — confirmado inviável via API de app em PROJECT.md |
| Backend do App Partners | Node.js (≥18 LTS) — servidor mínimo para troca de token, chamadas à API pública da Nuvemshop, e endpoint próprio de leitura | Nenhuma stack de backend pré-existente no projeto; Node.js é o runtime nativo do ecossistema NubeSDK/tsup usado no Script |
| Autenticação | Tentar primeiro token permanente gerado no admin (app privado); fallback para OAuth 2.0 authorization code completo se a opção não existir na tela de registro | RESEARCH.md Pattern 1 — caminho simplificado documentado para apps privados, com fallback documentado em detalhe |
| Exposição de dados ao Script | Endpoint HTTP próprio, público, somente-leitura (GET-only), NUNCA expõe o access_token da Nuvemshop | PLAT-05 — Script roda no navegador do visitante; qualquer token embutido é público (padrão BFF) |
| Supressão do bloco nativo | Edição de CSS/layout no editor de temas do admin da Nuvemshop (D-01) | Decisão travada em CONTEXT.md — testa PLAT-04 sem envolver Script/tema |
| Persistência pós-spike | Metafield e Script permanecem ativos no produto de teste real após aprovação (D-05) — não há rollback/revert desta fase | Produto de teste vira a base real que a Fase 2 escala — não é descartável |
| Layout de diretórios | Dois sub-projetos isolados na raiz: `app-partners-recomendados/` (backend) e `nube-sdk-script/` (Script) | RESEARCH.md `## Recommended Project Structure` — isolamento total do App Sob Medida existente (D-09) |

## Stack Tocada na Fase 1

- [ ] Verificação de compatibilidade de tema/NubeSDK (bloqueador sequencial, antes de qualquer código) — PLAT-03
- [ ] Registro do App Partners novo + fluxo de autenticação (scaffold do backend, sem framework web ainda) — PLAT-01
- [ ] Escrita real — Metafield gravado num produto real via API pública, lido de volta (round-trip) — WRTE-01
- [ ] Leitura — endpoint próprio HTTP somente-leitura, sem expor token da Nuvemshop — PLAT-05
- [ ] "UI" real — Script NubeSDK publicado renderizando bloco visível na página real do produto, no slot correto — FRNT-01
- [ ] Supressão do bloco nativo via CSS/layout no admin, validada visualmente sem artefato remanescente — PLAT-04
- [ ] "Deploy" — Script publicado via Partners Portal contra a loja de produção real (não ambiente local/sandbox)

## Fora de Escopo (Adiado para Fatias Futuras)

- Leitura do catálogo completo (592 produtos) — Fase 2
- Motor de recomendação real (cor + tecido + estoque) — Fase 3; nesta fase o conteúdo do Metafield é escolhido manualmente por D-06
- Painel de aprovação humana formal — Fase 4; D-07 permite exceção pontual só para este 1 produto de teste
- Snapshot/rollback/auditoria de escritas — Fase 5
- Agendamento diário na nuvem / cache com TTL no Script — Fase 6
- Qualquer framework de teste automatizado — este spike é validado empiricamente (captura de tela, round-trip real), não por suíte unitária

## Plano de Fatias Subsequentes

Cada fase seguinte adiciona uma fatia vertical sobre este esqueleto sem alterar as decisões arquiteturais acima:

- Fase 2: escalar a leitura (produto único → 592 produtos) e adicionar padronização/validação contínua de tags de tecido
- Fase 3: substituir o conteúdo do Metafield escolhido manualmente (D-06) pelo motor de recomendação determinístico real
- Fase 4: inserir o gate de aprovação humana formal antes de qualquer escrita real (revertendo a exceção pontual de D-07)
- Fase 5: adicionar snapshot/rollback/auditoria em torno da mesma chamada de escrita de Metafield já provada nesta fase
- Fase 6: mover a execução do motor para agendamento diário na nuvem e adicionar cache local (TTL) no Script já publicado nesta fase
