# Phase 1: Spike de Viabilidade End-to-End - Context

**Gathered:** 2026-07-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Provar empiricamente, em um único produto real da loja Talgui, que a arquitetura completa funciona de ponta a ponta: autenticar via um App Partners privado (não homologado, `write_scripts` + NubeSDK) → ler o produto real via API pública → gravar uma recomendação (mesmo que hardcoded/trivial) em um Metafield via API pública → um Script NubeSDK lê esse Metafield no navegador → renderiza visivelmente um bloco "Recomendados" customizado na página real do produto — e resolver com evidência (não suposição) se o tema ativo da Talgui suporta NubeSDK e se o bloco nativo "Produtos Relacionados" pode ser suprimido sem conflito visual.

Este é um spike decisivo, não uma fase de fundação genérica. Se revelar que a arquitetura não funciona como esperado, o roadmap completo (Fases 2-6) precisa ser revisado antes de qualquer investimento adicional.

</domain>

<decisions>
## Implementation Decisions

### Bloco nativo vs. customizado
- **D-01:** Suprimir o bloco nativo "Produtos Relacionados" via edição de CSS/layout no admin (não via Script/tema) — testa diretamente o requisito PLAT-04 como parte do próprio spike.
- **D-02:** Se o CSS/layout resolver a supressão, PLAT-04 é considerado fechado — não é necessário também investigar supressão via Script como plano B.
- **D-03:** O bloco customizado deve renderizar no mesmo lugar onde o bloco nativo aparecia (não em qualquer posição arbitrária da página).
- **D-04:** Um ocultamento parcial/quebrado do bloco nativo (ex: espaço vazio remanescente, título órfão) conta como falha do Critério de Sucesso 4 do roadmap — precisa ficar visualmente limpo antes de considerar o spike aprovado. Não é um detalhe cosmético para "ajustar depois".

### Persistência pós-spike
- **D-05:** Depois que o spike for aprovado, o Metafield e o Script de teste **permanecem ativos** no produto real usado — não são revertidos. Esse produto vira a base real que a Fase 2 vai reutilizar/escalar, não é descartado.
- **D-06:** O conteúdo gravado no Metafield de teste deve ser um produto real e plausível como recomendação (mesma cor/tecido do produto de teste) — escolhido manualmente. Não gravar um valor hardcoded sem sentido (ex: "primeiro produto do catálogo") só porque tecnicamente prova o pipeline.
- **D-07:** É aceitável, como exceção pontual e apenas para este 1 produto de teste, deixar essa recomendação visível na loja real sem ter passado por um painel de aprovação humana formal (que só chega na Fase 4). O próprio usuário, ao definir o conteúdo do teste, já atua como aprovador implícito. Esta exceção NÃO é o padrão do sistema e não deve ser generalizada para outros produtos nem repetida em fases futuras.

### Acesso ao App Partners
- **D-08 [informational]:** O usuário já possui conta/acesso de desenvolvedor Nuvemshop Partners, reaproveitada de um projeto paralelo (ordenação automática de vitrines) que já roda em produção na mesma loja Talgui. Contexto de background que fundamenta D-09/D-10 (não é uma ação que algum plano precise executar — não requer task ou acceptance criterion dedicado).
- **D-09:** Para este projeto, registrar um **App Partners novo e separado**, exclusivo para recomendações — não reaproveitar o app existente de ordenação de vitrines. Mantém os dois projetos isolados (falha em um não afeta o outro).
- **D-10:** As credenciais desse novo App Partners (client id/secret, tokens) **ainda não existem**. Gerar/registrar o app (e obter as credenciais) faz parte do próprio trabalho de execução da Fase 1 — não é um pré-requisito já resolvido que bloqueia o início.

### Claude's Discretion
Nenhuma área foi explicitamente deixada a critério do agente nesta discussão — todas as áreas selecionadas tiveram decisão explícita do usuário.

### Reversão explícita: Script API tradicional como v.Alpha (2026-07-10)
- **D-11 [override de decisão anterior]:** Em 2026-07-10, durante a execução da Fase 1 (bloqueio do Wave 3 por ativação NubeSDK ainda não aprovada para o tema Morelia), o usuário decidiu explicitamente **reverter** a recomendação anterior desta seção ("não usar Script API tradicional nem como atalho temporário") e prosseguir com o Script API tradicional (`write_scripts` sem NubeSDK) como uma **v.Alpha** de validação/teste, mesmo estando ciente do risco documentado abaixo.
- **Risco aceito explicitamente pelo usuário:** apps sem NubeSDK deixam de poder receber novas instalações a partir de 30/ago/2026 e enfrentam remoção progressiva a partir de 30/out/2026 (sem isenção para apps privados) — ou seja, o Script legado construído agora tem vida útil garantida de poucas semanas e **precisará ser reconstruído do zero em NubeSDK** quando a ativação for aprovada. O usuário aceitou esse custo de retrabalho explicitamente: *"Não importa se for necessário construir um script do zero... considere que o que estamos fazendo seja uma v.Alpha."*
- **Escopo desta reversão:** aplica-se apenas ao desenvolvimento imediato do Script (planos 01-03/01-05) para permitir validação/teste end-to-end enquanto a ativação NubeSDK está pendente de aprovação externa. Não cancela a necessidade de migrar para NubeSDK antes de produção real — apenas sequencia o trabalho de forma diferente (validar primeiro com script tradicional, migrar depois).
- **Impacto no roadmap:** planos futuros (Fase 2+) que dependem do modelo de execução NubeSDK (Web Workers, UI Slots, `nube.render()`) devem tratar o Script desta fase como protótipo descartável, não como base de código a ser incrementada diretamente.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Contexto e requisitos do projeto
- `.planning/PROJECT.md` — histórico da retomada do projeto, correção crítica de escopo (Etapa 1 rebaixada de "Concluída" para "Pendente de revalidação"), evidência técnica da investigação de 2026-07-08 que confirmou que o campo nativo "Produtos Relacionados" só é gravável via endpoint interno do admin (não por API pública de app)
- `.planning/REQUIREMENTS.md` — requisitos PLAT-01, PLAT-03, PLAT-04, PLAT-05, WRTE-01, FRNT-01 mapeados a esta fase, com nota de que estes requisitos são "comprovados tecnicamente já na Fase 1" e reutilizados/escalados pelas Fases 2, 5 e 6
- `.planning/ROADMAP.md` §Phase 1 — goal completo e os 5 critérios de sucesso desta fase

### Credenciais existentes (não usar diretamente nesta fase, mas relevante)
- `app sob medida.txt` (raiz do projeto) — contém `Store_ID` e token do App Sob Medida existente. **Não é o App Partners necessário para esta fase** (App Sob Medida não consegue escrever no campo nativo nem tem escopo de Script) — mas pode ser reaproveitado depois para leitura de catálogo público (relevante à Fase 2, não a esta).

### Documentação oficial NubeSDK (pesquisado em 2026-07-09, em resposta a dúvida do usuário sobre necessidade real do NubeSDK)
- [dev.tiendanube.com — NubeSDK Overview](https://dev.tiendanube.com/pt/docs/applications/nube-sdk/overview) — o que é NubeSDK (Web Workers isolados, sistema de eventos estruturado, não manipula DOM diretamente)
- [tiendanube.github.io — Scripts API](https://tiendanube.github.io/api-documentation/resources/script) — Script API tradicional (`write_scripts`), mecanismo legado de injeção de `<script>` no storefront
- [github.com/TiendaNube/nube-sdk](https://github.com/TiendaNube/nube-sdk) — monorepo oficial do SDK

**Achado confirmado que reforça (não muda) as decisões D-08/D-09 acima: NubeSDK é obrigatório para este projeto, não uma camada opcional.** Calendário oficial de deprecação da Script API tradicional:
- 05/jun/2026 (já passou) — NubeSDK obrigatório para homologação de apps públicos
- **30/ago/2026** — apps sem NubeSDK deixam de poder receber **novas instalações** (relevante: a Fase 1 registra um App Partners **novo**, a ~7 semanas deste corte a partir da data desta discussão)
- **30/out/2026** — início da remoção progressiva de apps legados já instalados

Citação direta da documentação: *"Private apps that inject scripts also require the NubeSDK. In this case, the requirement does not go through homologation: enforcement is applied on the front-end (systemic block), and legacy apps follow the progressive removal starting on October 30, 2026."* — ou seja, mesmo sendo um app privado/não-homologado (que não passa por revisão manual), o bloqueio de scripts legados é aplicado sistemicamente no front-end. Não há isenção por ser "exclusivo para lojistas selecionados".

**Nota para pesquisa/planejamento:** não usar Script API tradicional (JS puro) nem como atalho temporário — o app novo desta fase corre risco real de não conseguir ser instalado (após 30/ago) ou ser removido (após 30/out) se não for construído nativamente em NubeSDK desde o início.

Não há PDF/resumo executivo original disponível neste repositório — apenas a síntese já incorporada em PROJECT.md. Nenhum outro ADR/spec externo foi referenciado durante a discussão.

</canonical_refs>

<code_context>
## Existing Code Insights

Este é um projeto novo, sem código-fonte ainda no repositório (apenas arquivos de planejamento `.planning/` e um `.txt` com credenciais do App Sob Medida existente). Não há componentes, padrões ou pontos de integração reutilizáveis a mapear — a Fase 1 começa do zero em termos de implementação.

</code_context>

<specifics>
## Specific Ideas

- O produto de teste específico a usar no spike não foi decidido nesta discussão (área "Produto de teste" foi oferecida mas não selecionada pelo usuário) — fica a critério de quem for pesquisar/planejar, respeitando apenas que deve ser um produto real da loja Talgui de baixo risco visual.
- O mecanismo Script + Nuvemshop Partners escrevendo no storefront real da Talgui já está validado em produção pelo projeto paralelo de ordenação de vitrines do usuário — reduz o risco de novidade tecnológica desse pedaço específico, mesmo com um app Partners novo e separado.
- ⚠️ Fora do escopo deste projeto, mas sinalizado ao usuário: o projeto paralelo de ordenação de vitrines (já em produção, construído em Script API tradicional/JS puro) parece exposto à mesma janela de deprecação NubeSDK (remoção progressiva a partir de 30/out/2026) — vale o usuário confirmar com o suporte Nuvemshop se precisa migrar.

</specifics>

<deferred>
## Deferred Ideas

Nenhuma ideia de escopo novo surgiu durante esta discussão — todas as perguntas ficaram dentro dos limites da Fase 1 definidos no ROADMAP.md.

[None — discussion stayed within phase scope]

</deferred>

---

*Phase: 1-Spike de Viabilidade End-to-End*
*Context gathered: 2026-07-09*
