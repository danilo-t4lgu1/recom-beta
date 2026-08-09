# Phase 1: Spike de Viabilidade End-to-End - Research

**Researched:** 2026-07-09
**Domain:** Nuvemshop/Tiendanube App Partners + NubeSDK + Metafields API
**Confidence:** MEDIUM

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Bloco nativo vs. customizado**
- **D-01:** Suprimir o bloco nativo "Produtos Relacionados" via edição de CSS/layout no admin (não via Script/tema) — testa diretamente o requisito PLAT-04 como parte do próprio spike.
- **D-02:** Se o CSS/layout resolver a supressão, PLAT-04 é considerado fechado — não é necessário também investigar supressão via Script como plano B.
- **D-03:** O bloco customizado deve renderizar no mesmo lugar onde o bloco nativo aparecia (não em qualquer posição arbitrária da página).
- **D-04:** Um ocultamento parcial/quebrado do bloco nativo (ex: espaço vazio remanescente, título órfão) conta como falha do Critério de Sucesso 4 do roadmap — precisa ficar visualmente limpo antes de considerar o spike aprovado. Não é um detalhe cosmético para "ajustar depois".

**Persistência pós-spike**
- **D-05:** Depois que o spike for aprovado, o Metafield e o Script de teste **permanecem ativos** no produto real usado — não são revertidos. Esse produto vira a base real que a Fase 2 vai reutilizar/escalar, não é descartado.
- **D-06:** O conteúdo gravado no Metafield de teste deve ser um produto real e plausível como recomendação (mesma cor/tecido do produto de teste) — escolhido manualmente. Não gravar um valor hardcoded sem sentido.
- **D-07:** É aceitável, como exceção pontual e apenas para este 1 produto de teste, deixar essa recomendação visível na loja real sem ter passado por um painel de aprovação humana formal (que só chega na Fase 4). O próprio usuário, ao definir o conteúdo do teste, já atua como aprovador implícito. Esta exceção NÃO é o padrão do sistema e não deve ser generalizada.

**Acesso ao App Partners**
- **D-08:** O usuário já possui conta/acesso de desenvolvedor Nuvemshop Partners, reaproveitada de um projeto paralelo (ordenação automática de vitrines) que já roda em produção na mesma loja Talgui.
- **D-09:** Para este projeto, registrar um **App Partners novo e separado**, exclusivo para recomendações — não reaproveitar o app existente de ordenação de vitrines.
- **D-10:** As credenciais desse novo App Partners (client id/secret, tokens) **ainda não existem**. Gerar/registrar o app faz parte do próprio trabalho de execução da Fase 1.

### Claude's Discretion
Nenhuma área foi explicitamente deixada a critério do agente nesta discussão — todas as áreas selecionadas tiveram decisão explícita do usuário. A única área genuinamente aberta: **qual produto de teste usar** — deve ser um produto real de baixo risco visual da loja Talgui; a escolha final do produto recomendado par (D-06) fica com o usuário.

### Deferred Ideas (OUT OF SCOPE)
Nenhuma ideia de escopo novo surgiu durante a discussão — todas as perguntas ficaram dentro dos limites da Fase 1 definidos no ROADMAP.md.

### Canonical References (must read before implementing)
- `.planning/PROJECT.md` — evidência técnica de 2026-07-08 confirmando que "Produtos Relacionados" nativo só é gravável via endpoint interno do admin (`cirrus.tiendanube.com`), inacessível a apps.
- `.planning/REQUIREMENTS.md` — PLAT-01, PLAT-03, PLAT-04, PLAT-05, WRTE-01, FRNT-01 mapeados a esta fase.
- `.planning/ROADMAP.md` §Phase 1 — 5 critérios de sucesso.
- `app sob medida.txt` (raiz) — credenciais do App Sob Medida existente; **não é o App Partners necessário para esta fase**, mas pode ser reaproveitado depois para leitura de catálogo (Fase 2).

### Calendário de deprecação NubeSDK (já confirmado em CONTEXT.md, não re-pesquisar)
- 05/jun/2026 (passado) — NubeSDK obrigatório para homologação de apps públicos.
- **30/ago/2026** — apps sem NubeSDK deixam de poder receber novas instalações.
- **30/out/2026** — início da remoção progressiva de apps legados já instalados.
- Confirmado que a exigência se aplica também a apps privados/não-homologados (bloqueio sistêmico no front-end, não isenção por ser "exclusivo para lojistas selecionados").
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PLAT-01 | Sistema autentica com a loja Talgui via App Partners privado (não homologado) com escopo `write_scripts` + NubeSDK | Ver `## Standard Stack` e `## Architecture Patterns > Pattern 1` — fluxo de auth simplificado para apps privados (token permanente gerado no admin) vs. OAuth completo; ambos os caminhos documentados com incerteza sinalizada |
| PLAT-03 | Spike valida se o tema ativo da Talgui suporta NubeSDK antes de comprometer o resto da arquitetura | Ver `## Common Pitfalls > Pitfall 1` e `## Open Questions #1` — achado crítico: NubeSDK storefront é documentado como restrito ao tema Patagonia, com rollout em andamento para todos os temas via opt-in manual |
| PLAT-04 | Spike investiga se é possível esconder o bloco nativo "Produtos Relacionados" via CSS/layout no admin | Ver `## Architecture Patterns > Pattern 3` — abordagem CSS/layout editor do admin, sem tocar Script/tema (conforme D-01) |
| PLAT-05 | Backend expõe endpoint próprio, público, somente leitura, para o Script consultar — token OAuth nunca embutido no Script client-side | Ver `## Don't Hand-Roll` e `## Security Domain` — padrão BFF/token-handler confirmado como prática correta pela própria documentação oficial da Nuvemshop |
| WRTE-01 | Sistema grava recomendações em Metafields via API pública (não depende do endpoint interno) | Ver `## Standard Stack > Core` e `## Code Examples` — endpoints REST completos de Metafields, com constraints de campo documentadas |
| FRNT-01 | Script NubeSDK, injetado via App Partners, consulta o endpoint próprio e renderiza o bloco "Recomendados" | Ver `## Architecture Patterns > Pattern 2` e `## Code Examples` — modelo de renderização via UI Slots (`nube.render`), sem manipulação direta de DOM |
</phase_requirements>

## Summary

Esta fase é um spike técnico decisivo, e a pesquisa confirma que a arquitetura proposta (Metafield via API pública + Script NubeSDK via App Partners) é **tecnicamente bem documentada e implementável**, mas revela um risco não mapeado anteriormente que é exatamente o tipo de coisa que este spike existe para descobrir: a documentação oficial do NubeSDK afirma explicitamente que **apps de storefront construídos com NubeSDK são suportados apenas quando a loja usa o tema Patagonia** — e para "todos os outros temas, é necessário usar o modelo legado de app de storefront". Ao mesmo tempo, há evidência de um rollout ativo expandindo o suporte a todos os temas, mediante ativação manual via formulário de solicitação (com SLA de "1 dia útil"). Isso significa que **PLAT-03 não é uma formalidade — é uma pergunta genuinamente em aberto que só a execução real vai responder**, e o plano precisa tratar isso como o primeiro ponto de verificação do spike, antes de investir no restante do pipeline.

A API pública de Metafields é simples e bem documentada: endpoints REST padrão (`GET/POST/PUT/DELETE /metafields`), com `owner_resource=Product`, `namespace` e `key` restritos a letras/números/underscore. O fluxo de autenticação para apps privados é mais simples que o OAuth completo — a documentação da Nuvemshop menciona a possibilidade de gerar um token permanente diretamente no admin da loja para apps "Para seus clientes" (privados), mas os detalhes exatos desse atalho não estão documentados com a mesma profundidade do fluxo OAuth padrão — este é o segundo ponto que a fase precisa resolver na prática (tentar o caminho documentado e cair para OAuth completo se necessário). O modelo de renderização do NubeSDK ficou claro: scripts rodam em Web Workers isolados (sem acesso a DOM) e renderizam via `nube.render(slot, <Componente/>)` em "UI Slots" pré-definidos pela plataforma — existem slots relevantes para página de produto (`after_product_detail_name`, `after_product_detail_add_to_cart`), mas **não existe um slot dedicado a "produtos relacionados"**; o bloco customizado precisa ser posicionado usando os slots genéricos disponíveis, e sua posição exata em relação ao bloco nativo suprimido precisa ser validada visualmente (conforme D-03/D-04).

**Recomendação primária:** Antes de escrever qualquer código de motor de recomendação, execute o spike na ordem: (1) registrar o App Partners privado e confirmar que a loja Talgui consegue autenticar e emitir token; (2) verificar imediatamente o tema ativo da loja e, se não for Patagonia, solicitar ativação do NubeSDK via formulário oficial ANTES de investir tempo em desenvolvimento do Script — esse é o maior risco de bloqueio total da fase; (3) só depois, prosseguir com Metafield round-trip, Script mínimo, e supressão CSS do bloco nativo.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Autenticação App Partners (OAuth ou token privado) | API/Backend (App próprio) | — | Credenciais (client_secret, access_token) nunca podem viver no navegador; backend do app troca código por token |
| Leitura de produto (catálogo) | API/Backend (App próprio) | — | Chamada à API pública da Nuvemshop feita server-side, autenticada com Bearer token |
| Escrita de Metafield | API/Backend (App próprio) | — | Escrita via API pública requer token de app; nunca exposta ao cliente |
| Endpoint próprio de leitura (PLAT-05) | API/Backend (App próprio) | — | Camada BFF: expõe só o necessário (recomendações já resolvidas) ao Script, sem nunca repassar o token OAuth da Nuvemshop |
| Script NubeSDK (consulta + renderização) | Browser/Client (Web Worker isolado) | CDN/Static (hospedagem do bundle `dist/main.min.js`) | NubeSDK roda em Web Worker no navegador do visitante; não manipula DOM diretamente, usa UI Slots do tema |
| Supressão do bloco nativo "Produtos Relacionados" | CDN/Static (CSS/layout do tema, via admin) | — | Decisão D-01 trata isso como edição de layout/CSS no admin, não como lógica de app — é puramente uma camada de apresentação do tema |
| Persistência do Metafield | Database/Storage (Nuvemshop, gerenciado pela plataforma) | — | Nuvemshop é o único datastore desta fase; não há banco de dados próprio ainda (chega só na Fase 5 com snapshot/rollback) |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@tiendanube/nube-sdk-types` | 0.83.0 [VERIFIED: npm registry — mas nome do pacote descoberto via WebSearch, ver Assumptions Log A1] | Tipos TypeScript para `NubeSDK`, `NubeSDKState` | Pacote oficial do monorepo `TiendaNube/nube-sdk`; necessário para tipar `App(nube: NubeSDK)` |
| `@tiendanube/nube-sdk-ui` | 0.19.0 [VERIFIED: npm registry — nome descoberto via WebSearch, ver A1] | Funções para construir componentes de UI declarativos (`Box`, `Text`, `Button`, etc.) | Único caminho documentado para renderizar UI dentro do modelo de Web Worker do NubeSDK (sem JSX) |
| `@tiendanube/nube-sdk-jsx` | 0.18.0 [VERIFIED: npm registry — nome descoberto via WebSearch, ver A1] | JSX runtime para escrever componentes em `.tsx` | Opcional; alternativa mais ergonômica a `nube-sdk-ui` puro |
| `tsup` | 8.5.1 [VERIFIED: npm registry] | Bundler (esbuild wrapper) para gerar `dist/main.min.js` | Recomendado explicitamente na documentação oficial de setup manual do NubeSDK |
| `create-nube-app` | 0.26.0 [VERIFIED: npm registry — nome descoberto via WebSearch, ver A1] | CLI scaffolding (`npm create nube-app@latest`) | Caminho oficial mais rápido para iniciar um projeto NubeSDK do zero |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node.js runtime para o backend do app (linguagem a definir — projeto ainda não tem stack de backend fixada) | ≥18 LTS [ASSUMED] | Servidor que troca OAuth code por token, chama a API da Nuvemshop, e expõe o endpoint PLAT-05 | Necessário desde o primeiro teste de autenticação — não há stack de backend ainda escolhida no projeto; este spike é o primeiro código real |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| NubeSDK (App Partners) | Script API legado (JS puro, `write_scripts` sem NubeSDK) | **Descartado explicitamente pelo usuário em CONTEXT.md** — bloqueio de novas instalações a partir de 30/ago/2026 torna essa opção inviável para um app novo registrado agora |
| `create-nube-app` (scaffolding automático) | Setup manual (tsup + tsconfig + main.ts) | Setup manual dá mais controle e é o caminho documentado com mais detalhe nas fontes oficiais consultadas; `create-nube-app` é mais rápido mas tem menos downloads/histórico (ver Package Legitimacy Audit) |

**Installation:**
```bash
npm create nube-app@latest
# ou setup manual:
npm install -D typescript @tiendanube/nube-sdk-types tsup
npm install @tiendanube/nube-sdk-ui
npm install @tiendanube/nube-sdk-jsx   # se for usar JSX/TSX
```

**Version verification:** Todas as versões acima foram confirmadas via `npm view <pkg> version` em 2026-07-09. Os pacotes `@tiendanube/*` foram publicados muito recentemente (`nube-sdk-types` em 08/jul/2026, `nube-sdk-ui`/`nube-sdk-jsx` em 05/jun/2026, `create-nube-app` em 02/jul/2026) — consistente com o status "beta" declarado na documentação oficial, não um sinal de pacote suspeito/hallucinado (ver Package Legitimacy Audit abaixo).

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `@tiendanube/nube-sdk-types` | npm | 1 dia (08/jul/2026) | 2004/wk | github.com/TiendaNube/nube-sdk | [SUS] (too-new) | Mantido — repo oficial confirmado, downloads consistentes com uso real por devs testando o SDK beta |
| `@tiendanube/nube-sdk-ui` | npm | ~5 semanas (05/jun/2026) | 852/wk | github.com/TiendaNube/nube-sdk | [SUS] (low-downloads) | Mantido — mesmo repo oficial, downloads baixos esperados para SDK em beta fechado |
| `@tiendanube/nube-sdk-jsx` | npm | ~5 semanas (05/jun/2026) | 826/wk | github.com/TiendaNube/nube-sdk | [SUS] (low-downloads) | Mantido — mesmo motivo acima |
| `create-nube-app` | npm | 1 semana (02/jul/2026) | 201/wk | nenhum repo declarado no manifest npm | [SUS] (too-new, low-downloads, no-repository) | **Flagged — checkpoint:human-verify obrigatório antes de rodar `npm create nube-app@latest`** (ausência de campo `repository` no manifest é um sinal a mais que os outros pacotes não têm; recomenda-se preferir o setup manual documentado acima, que usa apenas os pacotes com repo confirmado) |
| `tsup` | npm | 8 meses (12/nov/2025) | 6.46M/wk | github.com/egoist/tsup | [OK] | Aprovado |

**Packages removed due to [SLOP] verdict:** nenhum.
**Packages flagged as suspicious [SUS]:** `@tiendanube/nube-sdk-types`, `@tiendanube/nube-sdk-ui`, `@tiendanube/nube-sdk-jsx` (baixo risco — repo oficial confirmado, idade consistente com beta declarado publicamente pela própria Nuvemshop), `create-nube-app` (risco um pouco maior — sem repo declarado; **o planner deve inserir um `checkpoint:human-verify` antes de qualquer task que rode `npm create nube-app@latest`**, e preferir a rota de setup manual como caminho primário).

*Todos os nomes de pacote `@tiendanube/*` e `create-nube-app` foram descobertos via WebSearch/WebFetch de páginas de documentação oficial (dev.tiendanube.com, github.com/TiendaNube), não via treinamento — mas por regra de proveniência, são tratados como `[ASSUMED]` até confirmação cruzada adicional pelo usuário/planner, mesmo passando no `npm view`. Ver Assumptions Log A1.*

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────┐
│  Loja Talgui (Nuvemshop) │
│  Admin: editor de layout │
│  (supressão CSS bloco    │
│   nativo — D-01)         │
└───────────┬──────────────┘
            │
            │ 1. OAuth / token privado
            ▼
┌──────────────────────────────────┐        2. GET produto (API pública)
│   Backend do App Partners novo   │───────────────────────────────►  Nuvemshop API pública
│   (a construir nesta fase)       │◄───────────────────────────────  (api.tiendanube.com/v1/{store_id})
│                                   │        3. POST/PUT Metafield
│   - Troca code por access_token  │            (via API pública)
│   - Lê produto de teste           │
│   - Grava Metafield recomendação │
│   - Expõe endpoint próprio        │
│     GET /recommendations/:id      │◄─── 5. Script consulta este
│     (somente leitura, público,    │       endpoint (NUNCA o token
│     SEM token Nuvemshop exposto) │       Nuvemshop) — PLAT-05
└──────────────────────────────────┘
            ▲
            │ 4. Script publicado via
            │    Partners Portal
            │    ("Uses Nube SDK" flag)
            │
┌──────────────────────────────────┐
│  Script NubeSDK (Web Worker       │
│  isolado no navegador do          │
│  visitante da loja real)          │
│                                    │
│  App(nube) {                      │
│    fetch(endpoint próprio) ──────┼──► 5. chamada ao backend próprio
│    nube.render(slot, <Bloco/>)   │       (não à API da Nuvemshop
│  }                                 │       diretamente)
└───────────────┬────────────────────┘
                │ 6. Renderiza em UI Slot
                │    (ex: after_product_detail_name)
                ▼
    Página real do produto na loja Talgui
    (bloco "Recomendados" visível,
     no lugar onde o nativo aparecia — D-03)
```

O fluxo primário a rastrear: **autenticação (1) → leitura de produto (2) → escrita de Metafield (3) → publicação do Script (4) → Script busca dados do backend próprio, nunca da Nuvemshop diretamente (5) → renderização visual no slot correto (6)**.

### Recommended Project Structure
```
app-partners-recomendados/           # backend do App Partners (novo, isolado do App Sob Medida existente)
├── src/
│   ├── auth/            # troca de OAuth code por token / geração de token privado
│   ├── nuvemshop-client/ # wrapper de chamadas à API pública (produtos, metafields)
│   └── api/              # endpoint próprio somente-leitura (PLAT-05)
├── .env                  # client_id/client_secret — NUNCA commitados
nube-sdk-script/                     # projeto separado, o Script NubeSDK
├── src/
│   └── main.tsx          # export async function App(nube: NubeSDK)
├── tsconfig.json
├── tsup.config.js
└── dist/
    └── main.min.js        # bundle publicado no Script API (flag "Uses Nube SDK")
```

### Pattern 1: Autenticação de App Partners privado
**What:** Para apps privados ("Para seus clientes"), a documentação da Nuvemshop menciona a possibilidade de gerar um access token permanente diretamente no admin da loja, sem implementar o fluxo OAuth completo com redirect URI. Para apps públicos/em homologação, o fluxo é OAuth 2.0 padrão: `GET https://www.tiendanube.com/apps/{app_id}/authorize` → código de autorização (expira em 5 min) → `POST https://www.tiendanube.com/apps/authorize/token` com `client_id`, `client_secret`, `grant_type=authorization_code`, `code` → retorna `access_token` (sem expiração, até revogação/desinstalação) + `user_id`/`store_id`.
**When to use:** Como este é um app privado novo (D-09/D-10), tentar primeiro o caminho de token gerado no admin (mais simples); se a opção não estiver disponível na tela de registro do app, cair para o fluxo OAuth completo documentado.
**Example:**
```
# Fluxo OAuth completo (fallback documentado com mais detalhe)
POST https://www.tiendanube.com/apps/authorize/token
Content-Type: application/json
Body: {
  "client_id": "...",
  "client_secret": "...",
  "grant_type": "authorization_code",
  "code": "..."
}
# Resposta: { "access_token": "...", "token_type": "bearer", "user_id": 123, "scope": "write_scripts,..." }
```
Fonte: [CITED: tiendanube.github.io/api-documentation/authentication]

### Pattern 2: Renderização via UI Slots (NubeSDK)
**What:** O Script não manipula o DOM diretamente. Ele registra componentes declarativos em "slots" pré-definidos pelo tema via `nube.render(slotName, <Componente/>)`. Slots relevantes para página de produto incluem `after_product_detail_name`, `before_product_detail_add_to_cart`, `after_product_detail_add_to_cart` — **não existe um slot nomeado "related_products" ou equivalente**; o bloco customizado precisa escolher um desses slots genéricos e a posição visual final (em relação ao espaço deixado pelo bloco nativo suprimido) precisa ser validada ao vivo, não assumida.
**When to use:** Para o bloco "Recomendados" desta fase — escolher o slot mais próximo de onde o bloco nativo "Produtos Relacionados" aparecia na página real (conforme D-03).
**Example:**
```typescript
// Source: dev.nuvemshop.com.br/en/docs/applications/nube-sdk/script-structure (WebFetch, 2026-07-09)
export async function App(nube: NubeSDK) {
  nube.render("after_product_detail_add_to_cart", (state) => (
    <Text>Você também pode gostar de: {/* dados vindos do endpoint próprio */}</Text>
  ));
}
```
Fonte: [CITED: dev.nuvemshop.com.br/en/docs/applications/nube-sdk/script-structure]

### Pattern 3: Supressão do bloco nativo via CSS/layout no admin
**What:** Conforme D-01/D-02, a supressão do bloco nativo "Produtos Relacionados" deve ser feita via editor de layout/CSS do admin da Nuvemshop (customização de tema), não via Script ou API. Isso é uma edição de apresentação pura, sem relação com App Partners ou NubeSDK.
**When to use:** Como parte do critério de sucesso 4 do roadmap — precisa resultar em remoção visualmente limpa (D-04: sem espaço vazio remanescente, sem título órfão), validada com captura de tela ao vivo.
**Nota de pesquisa:** A pesquisa desta fase não encontrou documentação oficial específica sobre customização de CSS por produto/seção no editor da Nuvemshop (fora do escopo do NubeSDK) — este é um gap que a execução da fase precisa preencher diretamente no admin real da loja Talgui (inspeção visual/DevTools), não algo pesquisável em documentação de API. Ver `## Open Questions #2`.

### Anti-Patterns to Avoid
- **Expor o access_token da Nuvemshop no Script client-side:** o Script roda no navegador do visitante — qualquer token embutido nele é público. PLAT-05 exige que o backend próprio absorva o token e exponha só o dado final (recomendações), nunca o token OAuth em si.
- **Usar Script API legado (`write_scripts` sem NubeSDK) como atalho "temporário":** explicitamente descartado em CONTEXT.md — risco real de bloqueio de instalação (30/ago/2026) ou remoção (30/out/2026) para um app novo registrado agora.
- **Assumir que o tema Patagonia está ativo na Talgui sem verificar:** a documentação afirma suporte NubeSDK restrito a esse tema; presumir compatibilidade sem checagem é exatamente o erro que este spike existe para prevenir.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Renderização de UI no Script | Manipulação manual de DOM via `document.querySelector`/innerHTML | `nube.render()` com componentes de `@tiendanube/nube-sdk-ui`/`-jsx` | NubeSDK roda em Web Worker isolado — não tem acesso a `document`. Tentar manipular DOM diretamente simplesmente não funciona nesse modelo de execução. |
| Cache local no Script (relevante para FRNT-02, fase futura, mas útil ter em mente já no spike) | `localStorage`/`sessionStorage` do navegador diretamente | `nube.getBrowserAPIs().asyncLocalStorage` / `asyncSessionStorage` (com parâmetro `ttl` em segundos) | Web Worker não tem acesso síncrono a `window.localStorage`; a SDK expõe uma API assíncrona própria com suporte nativo a TTL |
| Autenticação/token exchange | Implementação manual de parsing de redirect e state CSRF | Seguir exatamente o fluxo documentado (`POST .../apps/authorize/token` com body, não query string) | Documentação oficial já resolve o cheat sheet OWASP de OAuth (client credentials no body, não em URL, para não vazar em logs) |

**Key insight:** Este domínio (Nuvemshop Partners + NubeSDK) tem SDKs e fluxos oficiais bem definidos para cada uma das pontas do pipeline (auth, dados, renderização). O risco real não é "hand-rolling" de lógica que já existe — é assumir compatibilidade de tema/API sem testar, porque a plataforma está em transição ativa (NubeSDK em beta, rollout de temas em andamento).

## Common Pitfalls

### Pitfall 1: Assumir que qualquer tema Nuvemshop suporta NubeSDK no storefront
**What goes wrong:** O Script é publicado corretamente, a flag "Uses Nube SDK" está ativada, mas nada aparece na página real — ou o app falha silenciosamente.
**Why it happens:** A documentação oficial (`ui-slots`) afirma textualmente: *"Storefront apps built with NubeSDK are supported only when the store is using the Patagonia theme. For all other themes, you must use the legacy storefront app model."* Ao mesmo tempo, há evidência de rollout progressivo para todos os temas mediante solicitação manual via formulário. Não há forma documentada de verificar programaticamente se o NubeSDK está habilitado para um tema/loja específica antes de tentar.
**How to avoid:** Antes de escrever qualquer Script, (1) identificar qual tema está ativo na loja Talgui (admin → Temas), (2) se não for Patagonia, submeter o formulário de solicitação de teste oficial e aguardar confirmação de ativação (SLA declarado: 1 dia útil) antes de prosseguir com desenvolvimento do Script, (3) tratar essa verificação como o primeiro checkpoint do plano de execução, não como um detalhe a resolver depois de já ter construído o Script.
**Warning signs:** Script publicado e com flag correta, mas nenhum elemento aparece na página, sem erro visível no console (pode falhar silenciosamente por incompatibilidade de tema).

### Pitfall 2: Tentar renderizar em um slot que não existe para o tema/template atual
**What goes wrong:** Chamada a `nube.render(slot, ...)` não produz erro, mas o componente nunca aparece.
**Why it happens:** Slots são "predefinidos por template" — a lista de slots disponíveis para storefront inclui posições genéricas (`after_product_detail_name`, `before_product_detail_add_to_cart`, `after_product_detail_add_to_cart`, cantos fixos), mas não há garantia documentada de que todos os slots existem em todos os temas/templates.
**How to avoid:** Testar com um slot simples e visível (ex: `after_product_detail_name`) primeiro, confirmar visualmente que aparece, só depois ajustar para a posição final desejada (D-03).
**Warning signs:** Nenhum erro no console, mas o bloco simplesmente não aparece na página.

### Pitfall 3: Ocultamento parcial do bloco nativo (viola D-04)
**What goes wrong:** CSS oculta o texto/produtos do bloco nativo mas deixa um contêiner vazio, título órfão, ou espaço em branco na página.
**Why it happens:** Editores de layout costumam permitir ocultar seções inteiras, mas a estrutura de mercado pode ter o "Produtos Relacionados" aninhado dentro de um contêiner maior compartilhado com outros elementos — ocultar apenas o conteúdo interno sem remover o wrapper deixa artefato visual.
**How to avoid:** Inspecionar a árvore DOM real da página do produto (DevTools) antes de aplicar CSS, identificar o elemento contêiner completo do bloco nativo (não apenas o texto/grid interno), e validar visualmente após a mudança — captura de tela antes/depois, conforme D-04.
**Warning signs:** Espaço em branco remanescente, título "Produtos Relacionados" visível sem produtos abaixo, ou diferença de padding/margin perceptível na página.

### Pitfall 4: Confundir App Sob Medida (custom app) existente com o novo App Partners
**What goes wrong:** Tentar reaproveitar credenciais do `app sob medida.txt` para esta fase.
**Why it happens:** O projeto já tem um app funcional na mesma loja (App Sob Medida, usado para leitura de catálogo em outro contexto) — pode ser tentador reaproveitar credenciais por conveniência.
**How to avoid:** PROJECT.md já confirma que o App Sob Medida não tem escopo de Script/NubeSDK. D-09 explicitamente determina registrar um App Partners novo e separado. As credenciais do arquivo `app sob medida.txt` **não devem ser usadas** para autenticação desta fase — apenas mencionadas como referência de que a loja/API já foi validada tecnicamente antes.
**Warning signs:** Tentativa de registrar Script usando token do App Sob Medida resultará em erro de escopo insuficiente (falta `write_scripts`).

## Code Examples

### Endpoint de criação de Metafield (WRTE-01)
```
// Source: tiendanube.github.io/api-documentation/resources/metafields (WebFetch, 2026-07-09)
POST https://api.tiendanube.com/v1/{store_id}/metafields
Authorization: Bearer {access_token}
Content-Type: application/json
User-Agent: {app_name} ({contact_email})

Body:
{
  "namespace": "recomendados",
  "key": "produto_sugerido",
  "value": "12345",
  "owner_resource": "product",
  "owner_id": {product_id},
  "description": "ID do produto recomendado - spike de viabilidade Fase 1"
}

// Resposta esperada: 201 Created
// { "id": ..., "namespace": "recomendados", "key": "produto_sugerido", "value": "12345",
//   "owner_resource": "product", "owner_id": ..., "created_at": "...", "updated_at": "..." }
```

### Leitura de volta do Metafield (round-trip do Critério de Sucesso 2)
```
// Source: tiendanube.github.io/api-documentation/resources/metafields (WebFetch, 2026-07-09)
GET https://api.tiendanube.com/v1/{store_id}/metafields/products?owner_id={product_id}&namespace=recomendados
Authorization: Bearer {access_token}
```

### Script NubeSDK mínimo (FRNT-01)
```typescript
// Source: dev.nuvemshop.com.br/en/docs/applications/nube-sdk/script-structure +
//         manual-setup (WebFetch, 2026-07-09)
import type { NubeSDK } from "@tiendanube/nube-sdk-types";

export async function App(nube: NubeSDK) {
  // 1. Consultar o endpoint próprio (PLAT-05) — NUNCA a API da Nuvemshop
  //    diretamente com token embutido no Script
  const browserAPIs = nube.getBrowserAPIs();
  const cached = await browserAPIs.asyncSessionStorage.getItem("recomendados");

  nube.render("after_product_detail_add_to_cart", (state) => {
    // renderização declarativa — sem acesso a document/DOM
    return /* <Componente com dados da recomendação/> */;
  });
}
```

### tsup.config.js (build do Script)
```javascript
// Source: dev.nuvemshop.com.br/en/docs/applications/nube-sdk/manual-setup (WebFetch, 2026-07-09)
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/main.tsx"],
  format: ["esm"],
  target: "esnext",
  clean: true,
  minify: true,
  bundle: true,
  esbuildOptions(options) {
    options.alias = {
      "@tiendanube/nube-sdk-jsx/dist/jsx-runtime":
        "@tiendanube/nube-sdk-jsx/jsx-runtime",
    };
  },
  outExtension: ({ options }) => ({
    js: options.minify ? ".min.js" : ".js",
  }),
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Script API legado (JS puro, `write_scripts` sem NubeSDK) | NubeSDK (Web Worker isolado, UI Slots declarativos) | Obrigatório para homologação desde 05/jun/2026; bloqueio de novas instalações a partir de 30/ago/2026 | Qualquer app novo registrado a partir de agora (incluindo o desta fase) deve ser NubeSDK nativo — sem período de transição viável |
| NubeSDK restrito ao tema Patagonia | Rollout em andamento para "todos os temas" mediante ativação manual | Não documentado com data exata — evidência apenas de formulário de solicitação ativo em 2026-07-09 | Compatibilidade de tema não pode ser assumida; precisa ser verificada/solicitada por loja individual |

**Deprecated/outdated:**
- Script API tradicional (`write_scripts` sem flag NubeSDK): em processo de descontinuação sistêmica, não apenas recomendação — reforçado por citação direta já capturada em CONTEXT.md.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Nomes exatos dos pacotes npm (`@tiendanube/nube-sdk-types`, `@tiendanube/nube-sdk-ui`, `@tiendanube/nube-sdk-jsx`, `create-nube-app`) | Standard Stack, Package Legitimacy Audit | Baixo-médio — todos passaram em `npm view` e apontam para o repo oficial `github.com/TiendaNube/nube-sdk` (exceto `create-nube-app`, sem repo declarado), mas por regra de proveniência (descoberta via WebSearch/WebFetch, não Context7/treinamento verificado), permanecem `[ASSUMED]` até o planner/execução confirmar rodando `npm view` no momento da implementação real |
| A2 | O fluxo de autenticação de app privado permite gerar um "token permanente diretamente no admin da loja" sem OAuth completo | Architecture Patterns > Pattern 1 | Médio — se essa opção não existir de fato na tela de registro do app Partners, a fase precisa implementar o fluxo OAuth completo (documentado com mais detalhe e confiança); isso muda o escopo de trabalho de PLAT-01 (precisa de redirect URI, servidor callback) |
| A3 | NubeSDK está atualmente restrito ao tema Patagonia, com expansão em andamento para todos os temas | Summary, Common Pitfalls #1, Open Questions #1 | Alto — esta é a suposição de maior impacto da pesquisa. Se o tema ativo da Talgui não for Patagonia e a ativação via formulário não for concedida a tempo, **toda a arquitetura FRNT-01 pode estar bloqueada**, exigindo replanejamento do roadmap conforme já previsto no próprio Critério de Sucesso 5 da fase |
| A4 | Não existe um slot de UI Slots dedicado a "produtos relacionados"/"recomendados" | Architecture Patterns > Pattern 2 | Baixo-médio — se um slot mais específico existir e não foi encontrado nesta pesquisa, a posição do bloco customizado (D-03) pode precisar de ajuste; não bloqueia a fase, apenas a estética final |
| A5 | Rate limit padrão é 40 req burst / 2 req/s, multiplicado por 10 em lojas Next/Evolution | Standard Stack (contexto), citado de PROJECT.md/CONTEXT.md | Baixo — este spike usa um único produto (baixíssimo volume de chamadas), então mesmo se o valor exato estiver desatualizado, não é bloqueante para PLAT-01/WRTE-01 nesta fase específica; relevante principalmente para Fase 2 |

## Open Questions

1. **O tema ativo da loja Talgui é Patagonia, e se não for, o NubeSDK já está habilitado para essa loja (rollout em andamento)?**
   - What we know: a documentação oficial afirma restrição a Patagonia; há um rollout ativo de expansão para todos os temas via formulário de solicitação (`docs.google.com/forms/.../[NubeSDK] Solicitação de teste`), com SLA de ativação declarado de 1 dia útil.
   - What's unclear: se a Talgui já está no grupo habilitado, se precisa solicitar manualmente, e quanto tempo leva de fato (o formulário é de 2026, mas o rollout pode já ter avançado além do texto capturado nesta pesquisa).
   - Recommendation: primeira ação de execução da fase — verificar o tema ativo no admin da Talgui, e se não for Patagonia, submeter o formulário imediatamente (dado o SLA de 1 dia útil, isso não deve ser deixado para o fim do plano). Tratar como bloqueador sequencial antes de investir no restante do Script.

2. **Como exatamente se edita CSS/layout no admin da Nuvemshop para ocultar uma seção nativa específica (Produtos Relacionados) de forma limpa?**
   - What we know: a plataforma tem um editor de temas/layout no admin; D-01 já decide usar esse caminho em vez de Script.
   - What's unclear: a pesquisa de documentação de API não cobre o editor visual de temas (é uma ferramenta de admin, não uma API) — não há documentação pública indexada sobre a estrutura DOM/CSS específica do tema ativo da Talgui.
   - Recommendation: esta parte não é pesquisável via documentação — precisa de inspeção direta (DevTools) na loja real durante a execução da fase, exatamente como o próprio spike já prevê (D-04 exige validação visual).

3. **O caminho de "token permanente gerado no admin" para apps privados está disponível na tela de registro atual do Partners Portal, ou o fluxo OAuth completo é obrigatório mesmo para apps privados?**
   - What we know: a documentação de autenticação menciona essa opção para apps "Para seus clientes" mas sem o mesmo nível de detalhe do fluxo OAuth padrão.
   - What's unclear: passos exatos, se há alguma limitação de escopo nesse caminho simplificado.
   - Recommendation: tentar primeiro na tela real de registro do app (a UI é a fonte de verdade mais confiável aqui); se a opção não existir claramente, implementar OAuth completo (já documentado com confiança MEDIUM nesta pesquisa).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Backend do app, build do Script (tsup) | ✓ | v24.17.0 | — |
| npm | Instalação de dependências | ✓ | 11.13.0 | — |
| Conta Nuvemshop Partners | Registro do novo App Partners (PLAT-01) | ✓ (reaproveitada de projeto paralelo, D-08) | — | — |
| Credenciais do novo App Partners (client_id/secret) | Autenticação | ✗ (ainda não existem, D-10) | — | Nenhum — registrar é parte do trabalho de execução desta fase, não um bloqueador de pesquisa |
| Acesso admin à loja Talgui (para editor de layout/CSS) | PLAT-04 | Presumido ✓ (usuário já opera a loja) | — | — |

**Missing dependencies with no fallback:**
- Nenhuma — a ausência de credenciais do App Partners (D-10) é esperada e faz parte do escopo de execução da própria fase, não bloqueia o planejamento.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Nenhum ainda configurado — projeto greenfield, sem código-fonte além de `.planning/` |
| Config file | none — ver Wave 0 |
| Quick run command | A definir na fase (provavelmente scripts de verificação manual/curl para este spike, dado que é um teste de integração real contra a loja) |
| Full suite command | N/A para esta fase — natureza é de spike empírico contra ambiente real, não testes automatizados unitários |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PLAT-01 | App Partners autentica com sucesso contra a loja real | manual/smoke (chamada real à API com token obtido) | script de verificação (ex: `curl` ou script Node que chama `GET /store` com o token) | ❌ Wave 0 |
| PLAT-03 | Tema ativo suporta NubeSDK (ou ativação obtida) | manual-only — inspeção do admin + confirmação de ativação | N/A (decisão binária documentada com evidência) | ❌ Wave 0 |
| PLAT-04 | Bloco nativo suprimido sem artefato visual | manual-only — captura de tela antes/depois | N/A | ❌ Wave 0 |
| PLAT-05 | Endpoint próprio não expõe token da Nuvemshop | smoke — inspecionar resposta do endpoint próprio, confirmar ausência de campo de token | script simples de request ao endpoint próprio | ❌ Wave 0 |
| WRTE-01 | Metafield gravado é lido de volta corretamente (round-trip) | integration — script que grava e imediatamente lê de volta, compara valor | script Node/curl de round-trip | ❌ Wave 0 |
| FRNT-01 | Script renderiza bloco visível na página real | manual — captura de tela/inspeção ao vivo no navegador | N/A (exige navegador real, não headless neste spike) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** execução manual do script de round-trip (auth → escrita → leitura) sempre que o backend do app for alterado.
- **Per wave merge:** validação visual completa (captura de tela) da página do produto real.
- **Phase gate:** todos os 5 critérios de sucesso do roadmap confirmados com evidência (não suposição) antes de `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] Projeto de backend do App Partners ainda não existe — precisa ser criado do zero (linguagem/stack a definir no plano, não decidido nesta pesquisa nem em CONTEXT.md)
- [ ] Projeto do Script NubeSDK ainda não existe — scaffolding via `create-nube-app` (com checkpoint:human-verify, ver Package Legitimacy Audit) ou setup manual
- [ ] Nenhum framework de teste automatizado é necessário para este spike específico — a natureza do Critério de Sucesso é validação empírica contra ambiente real (captura de tela, round-trip real), não testes unitários. Fases futuras (2+) que lidam com o motor de recomendação determinístico é que precisarão de framework de testes real (ex: fixtures determinísticas mencionadas no ROADMAP.md Fase 3).

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | sim | OAuth 2.0 authorization code flow (ou token privado do admin) — nunca hardcode client_secret no client-side; usar variáveis de ambiente/`.env` não commitado |
| V3 Session Management | não | Não há sessão de usuário final nesta fase (backend do app é machine-to-machine com a Nuvemshop) |
| V4 Access Control | sim | Endpoint próprio (PLAT-05) deve ser público e somente-leitura — sem exigir controle de acesso de usuário final, mas deve rejeitar métodos de escrita (garantir que é GET-only) |
| V5 Input Validation | sim | Validar `owner_id`/`product_id` antes de gravar Metafield; `namespace`/`key` devem respeitar o padrão documentado (letras/números/underscore, começar com letra) para evitar erro de API |
| V6 Cryptography | não diretamente | Access token da Nuvemshop deve ser armazenado com o mesmo cuidado de um secret (variável de ambiente, nunca em código versionado) — não é um requisito de criptografia customizada, é gestão de segredo padrão |

### Known Threat Patterns for este stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Vazamento do access_token da Nuvemshop no Script client-side | Information Disclosure | PLAT-05 já exige explicitamente essa mitigação: backend próprio absorve o token, Script só consulta o endpoint próprio sem token da Nuvemshop embutido |
| Client_secret commitado no repositório (git) | Information Disclosure | `.env` no `.gitignore` (já existe `.gitignore` no repo); nunca commitar credenciais do novo App Partners no código, ao contrário do padrão já visto no arquivo `app sob medida.txt` na raiz do projeto (esse arquivo já é um precedente de risco a não repetir para o novo app) |
| CSRF/token leak durante troca OAuth (code/state) | Tampering | Seguir fluxo documentado — enviar credenciais no corpo do POST, nunca em query string/URL (evita vazamento em logs de acesso) |

## Sources

### Primary (HIGH confidence)
- Nenhuma fonte desta pesquisa atingiu confiança HIGH — Context7 MCP não estava disponível neste ambiente (ver nota de metodologia abaixo); todas as fontes foram WebFetch/WebSearch de documentação oficial, classificadas como MEDIUM.

### Secondary (MEDIUM confidence)
- [Metafields | Nuvemshop API](https://tiendanube.github.io/api-documentation/resources/metafields) — endpoints, campos, constraints — WebFetch direto
- [Scripts | Nuvemshop API](https://tiendanube.github.io/api-documentation/resources/script) — endpoints legados, headers, nota de deprecação — WebFetch direto
- [Authentication | Nuvemshop API](https://tiendanube.github.io/api-documentation/authentication) — fluxo OAuth completo — WebFetch direto
- [Script Structure | DevHub Nuvemshop](https://dev.nuvemshop.com.br/en/docs/applications/nube-sdk/script-structure) — `App(nube)`, eventos, `render()` — WebFetch direto
- [UI Slots | DevHub Nuvemshop](https://dev.tiendanube.com/docs/applications/nube-sdk/ui-slots) — lista de slots, restrição ao tema Patagonia — WebFetch direto (achado crítico)
- [Components | DevHub Nuvemshop](https://dev.nuvemshop.com.br/en/docs/applications/nube-sdk/components) — catálogo de componentes de UI — WebFetch direto
- [First Steps | DevHub Nuvemshop](https://dev.nuvemshop.com.br/en/docs/applications/nube-sdk/first-steps) — comandos de build, flag "Uses Nube SDK" — WebFetch direto
- [Manual Project Setup | DevHub Nuvemshop](https://dev.nuvemshop.com.br/en/docs/applications/nube-sdk/manual-setup) — tsup.config.js, tsconfig.json — WebFetch direto
- [Getting Started with Nuvemshop API | Nuvemshop API](https://tiendanube.github.io/api-documentation/intro) — rate limits, headers — WebFetch direto
- [GitHub - TiendaNube/nube-sdk](https://github.com/TiendaNube/nube-sdk) — pacotes do monorepo, status beta, CLI `create-nube-app` — WebFetch direto
- npm registry (`npm view <pkg> version`) — versões verificadas diretamente em 2026-07-09

### Tertiary (LOW confidence)
- [NubeSDK] Solicitação de teste (Google Form) — rollout de expansão de temas além de Patagonia — apenas WebSearch, não WebFetch confirmado com texto completo do formulário
- Resultados de WebSearch sobre apps privados/homologação (`edinaldoxavier.com.br` — blog de terceiro, não documentação oficial) — usado apenas como triangulação, não como fonte primária das afirmações no corpo do documento

## Metadata

**Confidence breakdown:**
- Standard Stack: MEDIUM — nomes de pacote e versões confirmados via `npm view`, mas descobertos originalmente via WebSearch (não Context7), então tratados como `[ASSUMED]` na proveniência apesar de tecnicamente verificados no registro
- Architecture: MEDIUM — padrões de renderização (UI Slots, Web Worker) e autenticação vêm de WebFetch direto de páginas oficiais, mas a documentação do NubeSDK está incompleta em vários pontos (ex: getting-started sem código de exemplo capturável, ausência de detalhe do token privado)
- Pitfalls: MEDIUM-ALTA para o Pitfall 1 (restrição de tema Patagonia) — esse é o achado mais bem verificado e mais crítico da pesquisa, citado textualmente da fonte oficial

**Research date:** 2026-07-09
**Valid until:** 7 dias — a plataforma está em transição ativa (NubeSDK beta, rollout de temas, calendário de deprecação em curso); qualquer replanejamento após esse prazo deve revalidar especialmente a questão de compatibilidade de tema (Open Question #1)

---

**Nota de metodologia:** Nesta sessão de pesquisa, os MCPs de busca configurados no projeto (`brave_search`, `firecrawl`, `exa_search`, `tavily_search`) estavam todos desabilitados em `.planning/config.json`, e o MCP Context7 não estava disponível no ambiente de execução. A pesquisa foi conduzida integralmente via `WebSearch` (built-in) e `WebFetch` (built-in) direto das páginas de documentação oficial da Nuvemshop/Tiendanube (`dev.tiendanube.com`, `dev.nuvemshop.com.br`, `tiendanube.github.io`, `github.com/TiendaNube`). Isso resulta em um teto de confiança MEDIUM (nunca HIGH) para todas as afirmações desta pesquisa, mesmo quando a fonte é inequivocamente oficial — reflete a limitação de proveniência da ferramenta usada, não necessariamente da qualidade da fonte.
