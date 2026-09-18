# SPEC: Fase 11 — Painel de Exibição e Gestão do App Recom

> **Status:** FINALIZED  
> **Milestone:** v1.0  
> **Subsystem:** `app-partners-recomendados/web`  
> **Assignee:** Antigravity  
> **Skills:** frontend-design, backend-architect  

---

## 1. Contexto e Problema

O painel administrativo do Recomendados (`web/`, implantado em produção como `recom-admin-talgui.vercel.app` e integrado ao hub *Talgui App Center*) foi criado em uma sessão inicial com um escopo mínimo focado em 4 cartões estáticos:
1. Contagem de produtos com recomendação ativa.
2. Contagem de produtos sem estoque no carrossel.
3. Cobertura de tags de tecido.
4. Histórico recente de execuções do cron.

Com a evolução recente do projeto nas Fases 07 e 08:
- Ingestão de **51.776 pedidos reais** e derivação de **1.373 pares de co-compra** (`co_purchase_pairs`).
- Motor determinístico operando em modelo de **3 pesos** (Peso 0: Look Comprovado, Peso 1: E+C+T, Peso 2: E+C).
- Disjuntor de segurança monitorando limiares de churn e apagão.
- Novo carrossel nativo com exibição do selo **Sugestão de Look**.

**O painel administrativo tornou-se uma área desatualizada e inexplorada em relação ao poder do motor:** a equipe da loja hoje não tem uma forma visual e rápida de inspecionar quais produtos estão sendo sugeridos para uma peça específica, não consegue visualizar os pares de co-compra ativos e não possui diagnóstico visual da saúde do catálogo por categoria.

---

## 2. Objetivos da Fase 11

Transformar o painel administrativo do App Recom em uma **Central de Inteligência e Gestão de Vitrines**, permitindo:
1. **Inspecionar Recomendações por Produto:** Buscar qualquer produto do catálogo e ver a vitrine exata gerada pelo motor com os motivos de match (`matchReason`) de cada item.
2. **Explorar o Grafo de Looks Comprovados:** Visualizar e filtrar os pares de co-compra reais (Peça de Cima ↔ Peça de Baixo, contagem de pedidos, estoque atual de ambas as peças).
3. **Monitorar a Saúde do Catálogo e Disjuntor:** Acompanhar a cobertura das 11 categorias, diagnosticar produtos zerados e acompanhar a telemetria do cron diário.
4. **Interface Moderna e Responsiva (Design System Talgui):** Elevar a estética visual com tipografia limpa, filtros rápidos, skeletons de carregamento e UX fluida no padrão de excelência da Talgui.

---

## 3. Requisitos Funcionais

### REQ-PANEL-01: Inspetor Visual de Recomendações por Produto
- Campo de busca rápida com autocomplete por nome do produto ou ID da Nuvemshop.
- Ao selecionar um produto-fonte:
  - Exibe os dados do produto (foto, nome, categoria, grupo, cor, estoque total).
  - Renderiza visualmente os produtos recomendados na mesma ordem que a loja recebe.
  - Exibe badges identificadoras do motivo da recomendação:
    - `Look Comprovado` (Peso 0 — derivado de co-compra real).
    - `Mesma Cor + Tecido + Grupo` (Peso 1).
    - `Mesma Cor + Grupo` (Peso 2).
  - Mostra o estoque de cada variante dos recomendados.

### REQ-PANEL-02: Hub de Looks Comprovados (Co-Purchase Intelligence)
- Tabela interativa com busca e paginação dos pares de co-compra (`co_purchase_pairs`).
- Colunas: Peça A (com foto e categoria), Peça B (com foto e categoria), Pedidos em Comum (`count`), Status de Elegibilidade Atual (se ambos têm estoque e estão ativos).
- Filtros por: "Apenas pares elegíveis hoje", "Filtro por Categoria", "Ordem por Volume de Pedidos".

### REQ-PANEL-03: Painel de Saúde do Catálogo & Alertas do Disjuntor
- Visão consolidada das 11 categorias da taxonomia oficial da loja:
  - Total de produtos ativos x Produtos cobertos com vitrine.
  - Taxa de cobertura percentual (%) com indicadores visuais (verde/amarelo/vermelho).
  - Diagnóstico categorizado das peças sem recomendação (ex: "Sem estoque", "Sem par da mesma cor", "Sem tag de categoria-folha").
- Monitoramento do Disjuntor de Segurança:
  - Último churn calculado (%) e margem em relação ao teto de 30%.
  - Taxa de apagão (%) e margem em relação ao teto de 10%.

### REQ-PANEL-04: Design System & UX (Diretriz /frontend-design)
- **Aesthetic Direction:** *Luxury Minimal / Clean Utilitarian* — interface sóbria, elegante e de alta precisão (DFII = 12/15), alinhada ao posicionamento de moda feminina da Talgui.
- **Identidade Visual Autêntica:**
  - Evitar layouts genéricos de dashboards "IA/SaaS" (nada de gradientes roxos, sombras excessivas ou cards inflados sem densidade informativa).
  - Tipografia refinada e estruturada, com contraste intencional de escalas tipográficas.
  - Paleta sóbria em tons neutros profundos (#0A0C10, #131720, #1B212D, com bordas finas em #283040), acentos funcionais discretos (status verde/esmeralda sutil, alertas em âmbar suave, indicador de Look em preto refinado com borda prateada).
  - **Zero emojis genéricos:** Toda a sinalização visual utiliza ícones vetoriais SVG inline sutis e elegantes (estilo Lucide/Heroicons minimalistas).
- Abas de navegação estruturadas:
  - `Visão Geral`: Métricas de catálogo, KPIs de estoque, status do disjuntor e saúde do cron.
  - `Inspetor de Vitrines`: Busca com autocomplete e simulação ao vivo da vitrine de qualquer produto.
  - `Looks Comprovados`: Hub analítico dos 1.373 pares de co-compra reais com filtros e paginação.
  - `Vínculo Manual (Curadoria)`: Espaço preparado e estruturado para curadoria manual (ver REQ-PANEL-05).
  - `Tecidos & Auditoria`: Auditoria taxonômica de tecidos com tabela e exportador Excel.
- Estados de carregamento limpos com skeletons SVG e transições CSS de alta performance (sem dependências pesadas de animação).

### REQ-PANEL-05: Estrutura / Scaffolding Visual para Vínculo Manual de Recomendados
- Interface estruturada e funcional do ponto de vista de UI para o futuro recurso de override manual:
  - Seleção de Produto-Base (busca integrada por nome ou ID).
  - Vitrine Atual gerada pelo motor (automática) em contraste com o painel de "Vínculos Manuais / Curadoria Humana".
  - Slot visual para busca e adição de produtos manualmente recomendados (com drag-and-drop ou ordenação visual de prioridade).
  - Badges informativas de status (ex: "Override Manual", "Slot Disponível").
  - Estrutura de botões ("Salvar Curadoria", "Restaurar Automático"), mantendo estados reativos limpos (com persistência em memória/draft visual, pronto para conexão ao backend que será implementado pelo Claude Code posteriormente).

---

## 4. Requisitos Técnicos e Arquitetura (Diretriz /backend-architect)

- **Princípio de Separação:** Módulos de domínio puros e determinísticos em `src/api/` (sem I/O direto, altamente testáveis) + adaptadores HTTP serverless em `web/api/*.js`.
- **Endpoints RESTful:**
  - `GET /api/dashboard`: KPIs consolidados (contagem de relacionados, estoque zerado, cobertura de tecido, último cron).
  - `GET /api/products/search?q=...`: Busca rápida de produtos no catálogo ativo por nome, ID, cor ou categoria (limite configurável, resposta em <50ms).
  - `GET /api/recommendations/inspect?productId=...`: Execução do motor determinístico `recommendForProduct` em tempo real, retornando a vitrine completa, motivo de match (`matchReason`), peso (0, 1, 2) e métricas de desempate.
  - `GET /api/co-purchase-pairs?page=1&limit=25&category=...&onlyInStock=true&sortBy=count`: Tabela paginada e filtrada dos 1.373 pares de co-compra reais, cruzando dados de estoque e publicação de ambas as peças.
  - `GET /api/catalog-health`: Métricas detalhadas de cobertura por categoria e cálculo dos limiares do disjuntor de segurança (churn e apagão).
  - `GET /api/fabric-tags`: Dados agregados por tag canônica e linhas para export.
  - `GET /api/cron-log`: Histórico cronológico das execuções do cron e recomputes.
- **Empacotamento Vercel:** Otimizar `web/scripts/prepare-admin-api.mjs` para sincronizar os novos módulos e garantir execução estritamente segura e autocontida no ambiente Vercel Serverless.
- **Segurança:** Autenticação via Basic Auth no Edge Middleware (`web/middleware.js`), headers de segurança (HSTS, Content-Type, CORS restrito ao mesmo host).
- **Testes:** Suíte Vitest cobrindo todos os módulos de domínio em `src/api/` e endpoints de API.

---

## 5. Critérios de Sucesso (Empirical Proof Requirements)

1. **Build & Lint:** `npm run build` e `oxlint` em `web/` passando com zero erros.
2. **Suíte de Testes:** Testes unitários para todos os novos endpoints criados.
3. **Verificação Visual:** Screenshots em alta resolução capturados no browser comprovando:
   - A navegação entre as abas.
   - O inspetor de recomendações funcionando em um produto real (ex: Vestido Elaine ou Saia Eloá).
   - A visualização dos pares de co-compra.
4. **Deploy Vercel Staging/Prod:** Painel publicado e acessível em `https://recom-admin-talgui.vercel.app`.

---

## 6. Portão de Aprovação

> **Planning Lock:** Nenhuma linha de código de implementação será escrita até que esta especificação seja revisada, ajustada conforme o feedback do Danilo, e seu status alterado para `FINALIZED`.
