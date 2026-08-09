# Fase 7: Rollout do motor no catálogo completo — validação de cobertura e re-gravação recorrente - Research

**Researched:** 2026-07-21
**Domain:** Backend Node.js (better-sqlite3) — motor determinístico + escrita em Metafield via API pública Nuvemshop/Tiendanube + orquestração em GitHub Actions cron
**Confidence:** HIGH (código-fonte lido diretamente; campo externo `published` confirmado na doc oficial)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Escopo do rollout**
- **D-53:** O rollout cobre **exatamente as 11 categorias da taxonomia** (D-26): Look Inteiro (Vestidos, Macacões, Macaquinhos), Partes de Cima (Blusas, Croppeds, Corsets, Camisas e Coletes, Blazers e Jaquetas) e Partes de Baixo (Calças, Shorts, Saias). É o comportamento que `run-daily-job.js` sem args já executa. Categorias vivas fora dessa lista **não** entram nesta fase.
- **D-54 (escopo de fonte):** O motor calcula e grava recomendações **apenas para produtos-fonte com estoque disponível** (grade ≥ limiar D-04). Produto-fonte esgotado não recebe vitrine.

**Motor — modelo de 2 pesos (muda `recommendation-engine.js`, RULE-01)**
- **D-55:** Elegibilidade passa a operar em **dois pesos**, dentro de cada bloco de grupo:
  - **1º peso (prioritário):** Estoque + Cor + **Tecido** (E+C+T) — preenche os slots primeiro.
  - **2º peso (backfill):** Estoque + Cor (E+C, tecido ignorado) — só entra para completar os slots restantes, **sempre ranqueado abaixo** do 1º peso.
  - Vale **inclusive para produtos que têm tecido**: se não houver E+C+T suficientes, completa com E+C.
  - **Piso de elegibilidade = E + C.**
  - **Substitui e generaliza** o override de 2026-07-17.
  - **RULE-02 preservada:** motor **puro, zero-import, zero-I/O**; lógica de Grupo/cota 4+4/backfill simétrico da Fase 03.1 preservada; testes existentes do comportamento antigo devem ser atualizados sem regressão nos demais.
- **D-56 (ranking):** **D-13 mantido sem alteração**. A **partição por peso fica ACIMA de D-13**; D-13 ordena **dentro** de cada peso.
- **D-57 (regras duras):** **Cor sempre obrigatória** — não existe 3º peso que largue a cor. **Look Inteiro permanece auto-contido** (D-27). Um produto só fica **zerado** quando não há nenhum par mesma-cor-com-estoque no grupo dele. **Trade-off aceito:** o 2º peso pode trazer candidato de **tecido diferente** (populado > tecido perfeito).

**Exclusão de produtos ocultos**
- **D-58:** **Visibilidade vira critério de elegibilidade.** Produto precisa estar **visível/publicado** para ser elegível, tanto como **candidato** quanto como **fonte**. Lida **na ingestão** (campo `published` da API Nuvemshop) e **persistida** no snapshot; o motor consome o flag já pronto (permanece puro). Ao desmarcar "Oculto", a próxima ingestão o torna elegível de novo automaticamente se atender Cor + Estoque.

**Validação de cobertura**
- **D-59:** **Sem % fixo de meta.** Coberto = recebeu ≥1 recomendação via 1º **ou** 2º peso. Manchete opcional: ≥90%.
- **D-60 (entregável):** **Relatório diagnóstico** do catálogo inteiro (total de fontes com estoque, quantas receberam ≥1 rec, motivo das zeradas) **+ caminho de reprocesso** (sinalizar produtos sem tecido canônico para taguear e rerodar). Formato/localização a critério do planejador.

**Escrita — Opção B: automática, sem portão prévio**
- **D-61:** **O motor grava automaticamente, sem aprovação prévia.** Reverte a constraint permanente do PROJECT.md, **aposenta o portão prévio do APRV-03** e **muda o D-47** (job diário passa a calcular **e gravar**). Painel vira **verificação/auditoria pós-escrita** (`GET /audit`).
- **D-62 (kill switch manual):** Flag lido **antes de gravar**, reaproveitando o **dry-run existente (APRV-04)**: flag "off" → ingere e calcula (loga o que gravaria) mas **não escreve**. Toggle via *repository variable* / `env` no GitHub Actions (+ botão nativo "disable workflow" como parada dura) — sem depender da máquina do usuário.
- **D-63 (disjuntor automático):** Antes de efetivar as escritas de um run diário, aborta e notifica (via `notify-failure.js`) se iria: mudar recomendações de **>30% dos produtos** (churn), **ou** **zerar >10% dos produtos que antes tinham** recomendação (apagão). **Exceção:** o 1º rollout é supervisionado e isento.
- **D-64 (1º rollout supervisionado):** Primeiro rollout completo operado manualmente: **dry-run primeiro**, confere pelo relatório de cobertura + `/audit`, só então habilita a escrita real do run inicial. Regime automático vale a partir daí.
- **D-65 (rollback em lote + CR-01):** Precisa de **rollback em lote** e a correção do bug **CR-01** (null-pointer em rollback duplo sobre metafield já deletado) antes de qualquer uso em massa.

**Defesas contra dados de entrada inconsistentes**
- **D-66 (Defesa 1 — integridade do snapshot antes de gravar):** Antes de qualquer escrita, confirmar catálogo **plausível e completo** — nenhuma das 11 categorias com 0 produtos, e total dentro de uma banda esperada vs. último run bem-sucedido. Leitura truncada → **aborta o run inteiro e notifica**.
- **D-67 (Defesa 2 — validação referencial na escrita):** Cada conjunto recomendado é reconferido contra o snapshot atual — todo ID precisa **existir, estar visível, com estoque e mesma cor**. Falha → **descartado**; conjunto vazio por isso → **lacuna de cobertura registrada**, nunca lixo gravado.

**Re-gravação recorrente**
- **D-68:** Ciclo permanente = job diário (03h) → ingere → calcula → **grava automaticamente** (guardado por D-62 + D-63 + D-66/D-67) → só produtos com **diff real** vs. baseline mudam (`diff.js` isola).
- **D-69 (resumo diário):** Resumo diário do que mudou (alterados, zerados, novos) pelo mesmo webhook.

**Princípio-guia**
- **D-70:** Refinar o **backend** (dados + motor + escrita) para reaproveitamento **total** na futura migração NubeSDK. Nada nesta fase deve acoplar lógica de negócio à apresentação atual.

### Claude's Discretion
- Limiar exato do disjuntor (D-63) — default >30% churn / >10% apagão, usuário ajusta.
- Mecanismo exato do toggle no GitHub (repository variable vs. secret vs. workflow input) para o kill switch (D-62).
- Formato e localização exatos do relatório de cobertura (D-60) — painel, CSV, arquivo, ou log.
- Design exato do rollback em lote (D-65) — CLI novo, flag no `rollback.js` existente, etc.
- Nome/semântica exatos do campo de visibilidade na API Nuvemshop (D-58) — **resolvido nesta pesquisa: `published` (boolean), ver abaixo.**

### Deferred Ideas (OUT OF SCOPE)
- Reconstrução do Script de storefront em **NubeSDK** (D-11) — fora de escopo; esta fase só prepara o backend (D-70).
- Migração do painel (`review-server.js`) para a nuvem com autenticação (deferida desde a Fase 6, D-49).
- Expansão do rollout para categorias **fora** das 11 da taxonomia (D-53).
- Mudança de **layout/CSS** do bloco no storefront — a fase não toca `storefront-script/main-partners.js` nem a CSS injetada.
</user_constraints>

<phase_requirements>
## Phase Requirements

Nenhum REQ-ID foi mapeado no ROADMAP para esta fase. A cobertura é derivada das decisões D-53..D-70 do CONTEXT.md, cruzando com os requisitos de projeto que esta fase **altera** ou **opera em escala**.

| Cobertura derivada | Origem | Suporte da pesquisa |
|--------------------|--------|---------------------|
| Rollout das 11 categorias, só produtos com estoque | D-53/D-54 | `run-daily-job.js` sem args já ingere `ALL_TAXONOMY_CATEGORY_NAMES`; `hasAvailableGrade` filtra estoque; falta gravar as categorias além de Vestidos |
| Modelo de 2 pesos (emenda RULE-01) | D-55/D-56/D-57 | Mapa exato do override em `recommendation-engine.js` + testes a atualizar (§ Architecture Patterns / Pitfalls) |
| Exclusão de produtos ocultos (RULE-01, elegibilidade) | D-58 | Campo `published` confirmado na doc oficial; padrão de flag persistido idêntico a `hasAvailableGrade` |
| Validação de cobertura + reprocesso | D-59/D-60 | Protótipo `_scope.js` já calcula cobertura por grupo; falta motivo item-a-item e caminho de reprocesso |
| Escrita automática sem portão (reverte APRV-03, muda D-47/FEED-01) | D-61 | `executeApprovedWrite` exige `decision.status==='approved'`; precisa de caminho `scheduled` (§ Integration Points) |
| Kill switch (reusa APRV-04 dry-run) | D-62 | Padrão `vars.*` → `env` já usado para `MIN_SIZES_IN_STOCK` no workflow |
| Disjuntor / circuit breaker | D-63 | Baseline vem de `write_log` (último `written_value` por produto) |
| Rollback em lote + CR-01 | D-65 | Root cause de CR-01 localizada (§ Common Pitfalls / Code Examples) |
| Defesa 1 (integridade do snapshot) | D-66 | Gap: contagem por-categoria não é persistida hoje (§ Open Questions) |
| Defesa 2 (validação referencial na escrita) | D-67 | Snapshot já materializado por `getLatestSnapshotProducts`; falta re-checar `published` |
| Re-gravação recorrente + resumo diário | D-68/D-69 | `diff.js`/`buildReviewQueue` já isolam mudança real; `notify-failure.js` reusável |
| Operação diária na nuvem (RULE-03/FEED-01) | herdado Fase 6 | Guard de idempotência D-48 preservado |
</phase_requirements>

## Summary

Esta é uma fase de **rollout brownfield + refino de backend**, não de construção greenfield. O pipeline (ingestão → motor puro → escrita em `write_log` + Metafield → endpoint → script) já existe e foi validado ponta-a-ponta contra produção nas Fases 1–6. Três coisas mudam: (1) o **motor** ganha o modelo de 2 pesos (D-55), substituindo o override de 2026-07-17; (2) a **ingestão** passa a persistir o flag `published` e o motor a consumi-lo (D-58); (3) o **job diário** passa de "só enfileira" para "calcula e grava automaticamente" (D-61), cercado por kill switch, disjuntor e duas defesas de integridade. Quase toda a peça de infraestrutura necessária já existe e é reaproveitada — o trabalho é **conectar, guardar e escalar**, não reescrever.

O único desconhecido externo de risco (D-58) foi **resolvido**: a API pública da Nuvemshop/Tiendanube expõe `published` (boolean) no recurso Product, retornado tanto no `GET /products` (lista) quanto no `GET /products/{id}`, e aceito como filtro de query `?published=true`. Hoje o código **não lê** esse campo em lugar nenhum (confirmado por leitura de `ingest-catalog.js`, `client.js` e `stock-availability.js`) — daí produtos ocultos aparecerem no bloco e darem 404.

**Primary recommendation:** Reaproveitar ao máximo a infra existente (`write-executor.js`, `write_log`, `diff.js`, `buildReviewQueue`, `notify-failure.js`, `vars.*` no workflow). Fazer o motor consumir `published` como um segundo flag persistido no mesmo padrão de `hasAvailableGrade`. Implementar o modelo de 2 pesos como uma ordenação por (peso, cascata-D-13) dentro de cada lado da cota 4+4, sem tocar a composição de grupo. Corrigir CR-01 com uma guarda `existing == null` antes de dereferenciar. Colocar kill switch + disjuntor + defesas como passos explícitos e testáveis dentro de `run-daily-job.js`, antes de qualquer escrita real.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Leitura de visibilidade (`published`) | Ingestão (`ingest-catalog.js`) | Persistência (snapshot) | RULE-02: motor puro nunca faz I/O; visibilidade resolvida na leitura e persistida, igual `hasAvailableGrade` (D-58) |
| Modelo de 2 pesos + ranking | Motor puro (`recommendation-engine.js`) | — | RULE-01/RULE-02: lógica de elegibilidade/ranking é do motor, determinística e sem I/O (D-55/D-56) |
| Kill switch (dry-run toggle) | Orquestrador (`run-daily-job.js`) + Workflow YAML | `write-executor.js` (parâmetro `dryRun`) | Toggle é operacional/ambiente, nunca regra de negócio; lido de `vars.*` (D-62) |
| Disjuntor (churn/apagão) | Orquestrador (`run-daily-job.js`) | `write_log` (baseline), `notify-failure.js` | Decisão de abortar é sobre o batch inteiro, exige estado (baseline) — não pertence ao motor puro (D-63) |
| Defesa 1 (integridade do snapshot) | Ingestão + Orquestrador | `ingestion_runs` (histórico) | Completude da entrada é responsabilidade de quem lê a API (D-66) |
| Defesa 2 (validação referencial) | Orquestrador (na escrita) | Snapshot materializado | Portão final contra corridas/oculto — precisa do snapshot atual (D-67) |
| Escrita automática | `write-executor.js` (caminho `scheduled`) | `write_log`, `catalog-store.js` | Ponto único de escrita já existe; ganha modo automático (D-61) |
| Rollback em lote | Novo caminho sobre `performRollback` | `write_log` | Reusa a lógica por-produto (D-38); só orquestra em lote + corrige CR-01 (D-65) |
| Relatório de cobertura | Novo módulo/script de leitura | Snapshot + motor | Puro-leitura sobre o snapshot; formato à discrição (D-60) |
| Resumo diário | `notify-failure.js` (webhook) | `diff.js`/queue | Reusa o webhook existente (D-69) |

## Standard Stack

Esta fase **não introduz nenhuma dependência nova**. Toda a stack já está instalada e validada em produção. A pesquisa confirma que nenhum problema desta fase exige uma biblioteca externa.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `better-sqlite3` | ^12.11.1 (`^12.11.1` no package.json) | Persistência única (snapshot, write_log, baseline) | [VERIFIED: package.json + código] já é a única persistência do projeto (D-10/D-45) |
| `vitest` | ^4.1.10 | Test runner (RULE-02: motor testado por pureza) | [VERIFIED: package.json] framework único do projeto, 64+ testes verdes |
| `fetch` global do Node (≥20.6) | nativo | Chamadas à API pública Nuvemshop e webhook | [VERIFIED: client.js/notify-failure.js] sem dependência HTTP externa |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| GitHub Actions `vars.*` / `secrets.*` | plataforma | Kill switch (D-62) e credenciais | [VERIFIED: daily-recompute.yml] `vars.MIN_SIZES_IN_STOCK` já usa o padrão |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Repository variable (`vars.*`) p/ kill switch | Secret, `workflow_dispatch` input, botão "disable workflow" | Ver § Common Pitfalls / § Code Examples — cada um resolve um cenário diferente (toggle persistente vs. run manual vs. parada dura); recomendação combinada abaixo |
| Rollback em lote como CLI novo | Flag `--all` / `--run <id>` no `rollback.js` existente | Reusar `performRollback` por-produto é mandatório; a única questão é o invólucro (à discrição D-65) |

**Installation:** Nenhuma. `npm ci` já instala tudo (ver workflow).

## Package Legitimacy Audit

**Não aplicável a esta fase** — nenhuma dependência externa nova é instalada. Todos os pacotes (`better-sqlite3`, `vitest`) já constam do `package.json` e foram validados nas Fases 2–6 em produção.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                     GitHub Actions cron (03h BRT / 06h UTC)  ── D-52
                                  │
                     vars.WRITE_ENABLED / vars.MIN_SIZES_IN_STOCK ──► env
                                  │
                                  ▼
                 ┌────────────────────────────────────────┐
                 │           run-daily-job.js               │
                 │  (orquestrador — onde vivem os guardas)  │
                 └────────────────────────────────────────┘
                                  │
        1) guard idempotência diária (D-48) ── já existe hoje
                                  │
        2) runIngestion(11 categorias) ──► API pública Nuvemshop
             │   lê products[] incl. `published` (D-58, NOVO)
             │   calcula hasAvailableGrade (D-04)
             ▼
        ┌──────────────┐   persist    ┌──────────────────────┐
        │ catalog_snap │◄─────────────│ published (NOVO flag) │
        │ + write_log  │              └──────────────────────┘
        └──────────────┘
                                  │
        3) DEFESA 1 (D-66): 11 categorias > 0? total na banda vs. run anterior?
             └─ truncado ──► ABORTA run + notifica (notify-failure.js)
                                  │
        4) motor puro: recommendForProduct(id, snapshot)  ── D-55 2 pesos
             │   consome published + hasAvailableGrade + grupo já resolvidos
             ▼
        5) diff vs. baseline (write_log último written_value) ── só mudanças (D-68)
                                  │
        6) DISJUNTOR (D-63): churn > 30%? apagão > 10%?
             └─ sim (e não é 1º rollout) ──► ABORTA escrita + notifica
                                  │
        7) KILL SWITCH (D-62): WRITE_ENABLED off? ──► dry-run (loga, não grava)
                                  │  on
        8) por produto mudado:
             DEFESA 2 (D-67): cada id recomendado existe/visível/estoque/cor?
                └─ falha ──► descarta id; conjunto vazio ──► lacuna registrada
             executeApprovedWrite(triggeredBy:'scheduled')  ──► Metafield + write_log
                                  │
        9) RESUMO DIÁRIO (D-69): alterados/zerados/novos ──► webhook
                                  │
                                  ▼
        commit-back data/catalog.db (D-45) ── já existe hoje

   Rollback em lote (D-65, fora do cron): performRollback por produto
       sobre write_log — CR-01 corrigido antes de uso em massa.

   Relatório de cobertura (D-60): leitura pura sobre snapshot + motor,
       total/cobertos/zerados-com-motivo + flag de reprocesso (sem tecido).
```

### Recommended Project Structure

Nenhuma pasta nova é obrigatória. Os alvos de mudança já existem:

```
app-partners-recomendados/
├── src/
│   ├── ingestion/
│   │   ├── ingest-catalog.js        # + leitura/persistência de `published` (D-58); + captura por-categoria p/ Defesa 1 (D-66)
│   │   └── stock-availability.js    # padrão de flag persistido (referência)
│   ├── recommendation/
│   │   └── recommendation-engine.js # modelo de 2 pesos (D-55/56/57); + flag published no CatalogProductEntry
│   ├── review/
│   │   ├── write-executor.js        # + caminho `scheduled` sem gate (D-61); + Defesa 2 (D-67)
│   │   ├── diff.js / review-queue.js# baseline de mudança (D-68) — reuso
│   │   └── notify-failure.js        # disjuntor + resumo diário (D-63/D-69) — reuso
│   ├── db/
│   │   ├── schema.sql               # + coluna published em catalog_snapshots (migração idempotente)
│   │   └── catalog-store.js         # + getLatestSnapshotProducts expõe published; + baseline p/ disjuntor; + migração ALTER TABLE
│   └── report/                      # (opcional, à discrição D-60) relatório de cobertura
├── scripts/
│   ├── run-daily-job.js             # orquestra kill switch + disjuntor + defesas + escrita (D-61..D-68)
│   ├── rollback.js                  # corrige CR-01; base do rollback em lote (D-65)
│   ├── _batch-write.js  _scope.js   # TEMP — folder/remover (protótipos do rollout manual)
│   └── (rollback-batch, opcional)   # invólucro de lote (à discrição D-65)
└── .github/workflows/daily-recompute.yml  # + vars.WRITE_ENABLED (D-62)
```

### Pattern 1: Flag persistido consumido pelo motor puro (D-58)

**What:** A visibilidade é lida da API na ingestão, persistida em `catalog_snapshots`, e exposta em `getLatestSnapshotProducts()` como um boolean no `CatalogProductEntry`. O motor apenas lê o flag — nunca faz I/O. É **exatamente** o padrão já usado por `hasAvailableGrade`.

**When to use:** Sempre que uma nova dimensão de elegibilidade precisar entrar no motor sem quebrar RULE-02.

**Example:**
```javascript
// Source: código real — ingest-catalog.js (padrão a estender p/ published)
// Na ingestão, product.published vem direto da API (D-58, NOVO):
snapshots.push({
  productId,
  hasAvailableGrade: availableGrade ? 1 : 0,
  published: product.published === true ? 1 : 0,   // NOVO — coerção defensiva
  // ...demais campos
});

// No motor (recommendation-engine.js), consome o flag já pronto — zero I/O:
function isEligibleCandidateInGroup(source, candidate, targetGroup, { considerFabric }) {
  if (!candidate) return false;
  if (String(candidate.productId) === String(source.productId)) return false;
  if (!candidate.hasAvailableGrade) return false;
  if (candidate.published === false) return false;   // NOVO (D-58) — candidato oculto nunca recomendado
  if (candidate.colorValue == null) return false;
  // ...
}
// E o produto-fonte oculto não gera vitrine (D-58): em recommendForProduct,
// após checar source.colorValue, adicionar: if (source.published === false) return [];
```

**Nota de compatibilidade:** produtos já no banco (runs anteriores) não têm a coluna `published`. A migração idempotente (`PRAGMA table_info` + `ALTER TABLE`, mesmo padrão já usado para `product_group_canonical`) deve adicionar a coluna. Até a próxima ingestão, `published` será `NULL` para esses produtos — o motor deve tratar **apenas `false` como oculto** (`=== false` no shape materializado), nunca `null`/`undefined`, para não zerar o catálogo inteiro antes da primeira re-ingestão.

### Pattern 2: Modelo de 2 pesos ACIMA da cascata D-13, DENTRO de cada lado da cota (D-55/D-56)

**What:** A partição por peso (E+C+T = peso 1; E+C = peso 2) é uma chave de ordenação **primária**, com a cascata D-13 como chave secundária, aplicada **dentro** do pool de cada lado (mesmo-grupo e cruzado) — a composição da cota 4+4 e o backfill simétrico (D-28/D-29) não mudam.

**When to use:** Substitui o override de 2026-07-17 em `isEligibleCandidateInGroup` + `buildSortedPool`.

**Example:**
```javascript
// Source: design derivado de recommendation-engine.js (código atual lido)
// 1) Elegibilidade relaxa para o PISO E+C (D-57): tecido NUNCA exclui.
//    (Hoje o override exclui candidato de tecido diferente quando ambos têm tecido —
//     isso MUDA: tecido diferente passa a ser elegível como peso 2.)
function isEligibleCandidateInGroup(source, candidate, targetGroup) {
  if (!candidate) return false;
  if (String(candidate.productId) === String(source.productId)) return false;
  if (!candidate.hasAvailableGrade) return false;
  if (candidate.published === false) return false;         // D-58
  if (candidate.colorValue == null) return false;
  if (candidate.productGroupCanonical !== targetGroup) return false;
  return normalizeMatchValue(candidate.colorValue) === normalizeMatchValue(source.colorValue);
}

// 2) Peso do candidato (D-55). No bloco cruzado (considerFabric=false) tudo é peso 2.
function candidateWeight(source, candidate, considerFabric) {
  if (!considerFabric) return 2;
  const bothHaveFabric = source.fabricTagCanonical != null && candidate.fabricTagCanonical != null;
  const sameFabric = bothHaveFabric &&
    normalizeMatchValue(candidate.fabricTagCanonical) === normalizeMatchValue(source.fabricTagCanonical);
  return sameFabric ? 1 : 2;   // E+C+T = 1; qualquer outro elegível = 2
}

// 3) Ordena por (peso ASC, depois cascata D-13). Peso 1 SEMPRE acima de peso 2 (D-56).
function buildSortedPool(source, catalog, targetGroup, { considerFabric }) {
  return catalog
    .filter((c) => isEligibleCandidateInGroup(source, c, targetGroup))
    .map((c) => ({ rec: buildRecommendation(c), weight: candidateWeight(source, c, considerFabric) }))
    .sort((a, b) => (a.weight - b.weight) || compareRecommendations(a.rec, b.rec))
    .map((x) => x.rec);
}
```

**Invariante crítica a testar (D-56):** um candidato peso 1 com estoque baixo DEVE ranquear acima de um candidato peso 2 com estoque alto. Hoje isso não é testado (o override mistura ambos pela cascata pura).

### Pattern 3: Kill switch por variável de ambiente, reusando `dryRun` (D-62)

**What:** O workflow mapeia uma repository variable para `env`; `run-daily-job.js` a lê e passa `dryRun` para o caminho de escrita. Mesmíssimo padrão de `MIN_SIZES_IN_STOCK` já em produção.

**Recomendação combinada (à discrição D-62, mas fundamentada):**
- **`vars.WRITE_ENABLED`** (repository variable) — toggle persistente do regime diário. Editável em Settings > Actions > Variables sem tocar código; visível em log (não é segredo — apropriado). Ausente/`"false"` → dry-run; `"true"` → grava.
- **`workflow_dispatch` input `write`** — para o 1º rollout supervisionado (D-64): permite rodar manualmente em dry-run e depois com escrita, sem mexer na variável persistente.
- **Botão nativo "Disable workflow"** — parada dura (o cron nem dispara). É o "grande botão vermelho".

Por que **não** secret: segredos não são legíveis de volta para conferência e não foram feitos para flags não-sensíveis.

### Pattern 4: Disjuntor sobre baseline do `write_log` (D-63)

**What:** Antes de efetivar as escritas, comparar o conjunto que **seria gravado** por produto contra o **último `written_value` bem-sucedido** daquele produto (de `write_log`). Calcular churn e apagão sobre o batch; abortar+notificar se exceder limiar; isentar o 1º rollout.

**Nota de fonte de baseline:** `recommendation_baseline` guarda apenas o `current_recommended_product_id` **singular** (legado, lido do Metafield na ingestão) — insuficiente para churn de conjunto. A fonte correta é `write_log` (o `written_value` é o array JSON completo realmente gravado). O planejador deve adicionar uma leitura tipo `getLastWrittenValuesForAllProducts()` (última linha `status='success'` por `product_id`).

### Anti-Patterns to Avoid

- **Fazer o motor ler `published`/estoque em runtime:** viola RULE-02 (zero-I/O). Sempre persistir na ingestão e consumir o flag pronto.
- **Tratar `published == null` como oculto:** zeraria produtos ainda não re-ingeridos. Só `=== false` é oculto.
- **Reimplementar cascata D-13 / composição de cota ao adicionar pesos:** a partição por peso é só uma chave de ordenação a mais; não duplicar `composeGroupQuota`/`compareRecommendations`.
- **Reusar `executeApprovedWrite` fabricando um `decision` "approved" em produção permanente:** funciona no protótipo `_batch-write.js`, mas o gate D-25 é justamente o que D-61 aposenta para o caminho automático. Preferir um caminho `scheduled` explícito (ver Integration Points) e gravar `triggered_by:'scheduled'` no `write_log` (hoje é hardcoded `'manual'`).
- **Calcular churn contra `recommendation_baseline` singular:** dá falso resultado (compara 1 id contra um conjunto de até 8).
- **Escrever produto sem diff real:** viola o regime de baixo volume (D-68); iterar apenas sobre a fila de mudanças (`buildReviewQueue`/`diff.js`).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Detectar mudança real por produto | Comparador ad-hoc de arrays | `hasChanged`/`buildReviewQueue` (review-queue.js) | Já ignora ordem, normaliza tipos string/number (D-23) |
| Diff antes/depois | Novo cálculo | `computeDiff` (diff.js) | Já expõe added/removed/kept e engineComputedIds |
| Escrita idempotente em Metafield | POST repetido | `findMetafield`+`updateMetafield`/`createMetafield` (client.js) | Pitfall 1 Fase 5: POST repetido cria duplicatas |
| Snapshot + auditoria de escrita | Nova tabela | `write_log` append-only (D-41) | Snapshot e auditoria numa linha; base do rollback |
| Restaurar valor anterior | Escrita manual | `performRollback` (rollback.js) | Já valida divergência (D-38) antes de qualquer efeito |
| Rate limit da API | Sleep fixo | `AdaptiveRateLimiter` (lê `x-rate-limit-*`) | Nunca hardcoded; crítico no rollout de ~592 produtos |
| Notificar falha/resumo | Novo cliente HTTP | `notifyWriteFailure` (notify-failure.js) | Nunca lança, nunca vaza credencial, degrada sem webhook |
| Toggle operacional | Editar código + redeploy | `vars.*` no workflow → `env` | Padrão `MIN_SIZES_IN_STOCK` já em produção |
| Lista das 11 categorias | Digitar nomes acentuados no YAML | `ALL_TAXONOMY_CATEGORY_NAMES` (product-group.js) | Fonte única; teste guarda contra drift |
| Filtro de visibilidade na leitura | Heurística própria | Campo `published` da API + filtro `?published=true` | Contrato oficial (ver § Sources) |

**Key insight:** Nesta fase, quase tudo que parece "novo" já tem um dono no código. O erro mais provável é reconstruir uma peça existente (diff, write_log, rollback, rate limiter) em vez de orquestrá-la. O trabalho real e genuinamente novo é: (a) 2 pesos no motor, (b) flag `published`, (c) os guardas (kill switch/disjuntor/defesas) em `run-daily-job.js`, (d) caminho de escrita `scheduled`, (e) correção de CR-01, (f) relatório de cobertura.

## Runtime State Inventory

> Fase de rollout/refino sobre um sistema em produção — inventário obrigatório.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| **Stored data** | (1) `data/catalog.db` (SQLite, commitado via commit-back D-45) contém `catalog_snapshots` **sem** coluna `published` → migração idempotente `ALTER TABLE` obrigatória (mesmo padrão de `product_group_canonical` em catalog-store.js, l.38-43). (2) `write_log` já contém as 304 escritas reais de Vestidos (baseline do disjuntor) — não migrar, ler. (3) Metafields `recomendados.produto_sugerido` gravados nos 304 Vestidos na loja real de produção. | Migração de schema (code + ALTER); ler `write_log` como baseline; re-ingerir para popular `published`. |
| **Live service config** | (1) GitHub Actions repository variable `MIN_SIZES_IN_STOCK` (existe hoje, muda o limiar D-04) — vive na UI do GitHub, **não** no git. (2) Kill switch novo `vars.WRITE_ENABLED` (D-62) viverá no mesmo lugar. (3) Secrets `NUVEMSHOP_ACCESS_TOKEN`, `NUVEMSHOP_STORE_ID`, `WRITE_FAILURE_WEBHOOK_URL` na UI do GitHub. | Criar `vars.WRITE_ENABLED`; documentar que o toggle é UI/API, efetivo no próximo run. |
| **OS-registered state** | GitHub Actions cron `0 6 * * *` (D-52) registrado no workflow (está no git). Nenhum Task Scheduler/launchd/pm2 — o projeto roda 100% em CI. | Nenhuma re-registração; a mudança de comportamento (passar a gravar) é só código + `vars`. |
| **Secrets/env vars** | **PENDÊNCIA DE SEGURANÇA (STATE.md):** `NUVEMSHOP_ACCESS_TOKEN` apareceu em texto puro no chat de uma sessão anterior — **precisa ser regenerado no Partners Portal** e o secret atualizado. `WRITE_FAILURE_WEBHOOK_URL` deve estar configurado para o disjuntor/resumo funcionarem (senão degrada silenciosamente). | Regenerar token (ação do usuário); confirmar webhook configurado. |
| **Build artifacts** | `node_modules/` presente (não-versionado). Protótipos temporários `scripts/_batch-write.js` e `scripts/_scope.js` no working tree (untracked) — usados no rollout manual dos 304 Vestidos. | Folder a lógica útil para código permanente e **remover** os `_`-temporários (pendência STATE.md). |

**Nada encontrado em categoria adicional:** Não há ChromaDB/Mem0/n8n/Datadog/Tailscale/Redis neste projeto — a única persistência é o SQLite versionado (verificado por leitura de `catalog-store.js` e ausência de qualquer outro client).

## Common Pitfalls

### Pitfall 1: CR-01 — null-pointer no rollback duplo sobre metafield já deletado
**What goes wrong:** Um segundo `performRollback` consecutivo sobre um produto cujo primeiro rollback **deletou** o Metafield (porque o `previousValue` original era `null`) lança `TypeError: Cannot read properties of null (reading 'id')`.
**Why it happens (root cause, confirmada por leitura de rollback.js l.51-83):** No 2º rollback, `getLastSuccessfulWriteLog` retorna a **linha do rollback anterior** (`writtenValue: null`, `previousValue: <valor deletado>`). `findMetafield` retorna `null` (o Metafield não existe mais) → `currentValue = null`. A guarda de conflito `currentValue !== lastWrite.writtenValue` vira `null !== null` → `false`, **não** aborta. Então `restoredValue = lastWrite.previousValue` é não-nulo → cai no ramo `updateMetafield({ id: existing.id })` com `existing === null` → estoura. As mesmas dereferências (`insertWriteLog({ metafieldId: existing.id })`) também assumem `existing` não-nulo.
**How to avoid:** Após a guarda de conflito, tratar `existing == null` explicitamente: se `restoredValue == null` → nada a fazer (já ausente), registrar linha de rollback no-op (`metafieldId: null`) ou short-circuit; se `restoredValue != null` → o Metafield precisa ser **recriado** via `createMetafield` (não `updateMetafield`), pois não existe mais. Ver § Code Examples.
**Warning signs:** Rollback em lote (D-65) sobre um catálogo onde alguns produtos tiveram o Metafield deletado por um rollback anterior — cenário real assim que o lote existir. O teste `rollback.test.js` **não cobre** esse caso hoje (só cobre delete simples, Test 3) — adicionar um "Test 7: rollback duplo não lança".

### Pitfall 2: Zerar o catálogo inteiro por causa de `published`/estoque em campos ainda não populados
**What goes wrong:** Ao introduzir o filtro de `published`, produtos de runs antigos (coluna nova = `NULL`) somem do motor; ou uma re-ingestão parcial (truncada) faz "produtos sumirem" e o sistema apaga recomendações em massa.
**Why it happens:** Motor trata `null` como oculto; ou Defesa 1 ausente deixa leitura incompleta virar "apagar tudo".
**How to avoid:** Motor só considera `=== false` como oculto (nunca `null`). Defesa 1 (D-66) **antes** de qualquer escrita: nenhuma das 11 categorias com 0 produtos e total dentro de banda vs. último run — senão aborta o run inteiro. Disjuntor (D-63) como segunda rede (apagão > 10%).
**Warning signs:** Contagem total do run muito abaixo do run anterior; alguma categoria com 0 produtos.

### Pitfall 3: `executeApprovedWrite` recusa a escrita automática (gate D-25)
**What goes wrong:** Chamar `executeApprovedWrite` no job diário lança `ApprovalRequiredError` — a primeira operação é `assertApproved`, que exige `decision.status === 'approved'`.
**Why it happens:** O caminho de escrita foi desenhado na Fase 4/5 **exigindo** aprovação (APRV-03), que D-61 agora aposenta para o modo automático.
**How to avoid:** Adicionar um caminho `scheduled` que não passa pelo gate (ou tornar o gate condicional a um modo), gravando `triggered_by: 'scheduled'` em `write_log` (hoje hardcoded `'manual'` em write-executor.js l.58). Não deixar o protótipo `_batch-write.js` (que fabrica `{status:'approved'}`) virar o caminho permanente.
**Warning signs:** Todos os produtos falham na escrita com `ApprovalRequiredError`.

### Pitfall 4: Rate limit / truncação silenciosa no rollout de catálogo completo
**What goes wrong:** ~592 produtos × (paginação + leitura de baseline por produto) geram centenas de chamadas; um rate-limit abortando no meio pode truncar a leitura.
**Why it happens:** `listAllProductsInCategory` pagina até `hasNextPage === false`; um erro de rede lança (→ run `failed`), mas uma resposta curta inesperada poderia passar.
**How to avoid:** `AdaptiveRateLimiter` já lê `x-rate-limit-*` reais (nunca hardcoded) — reusar sempre. Defesa 1 (D-66) valida completude após a leitura. Note que `readRecommendationBaseline` faz 1 `getMetafields` **por produto** — ~592 chamadas extras; confirmar que o limiter cobre essas (já é passado, ver ingest-catalog.js l.287).
**Warning signs:** Duração do job crescendo; total de produtos oscilando entre runs.

### Pitfall 5: Filtro `?published=true` na API vs. filtro no motor
**What goes wrong:** Filtrar produtos ocultos **só** via query `?published=true` na ingestão remove os ocultos do snapshot — mas então o snapshot não registra que eles existem, e o produto-fonte oculto (D-58) não teria seu flag para o motor decidir "não gerar vitrine".
**Why it happens:** Dois requisitos distintos: candidato oculto (não recomendar) e fonte oculta (não calcular). Filtrar na API atende o candidato mas perde a informação da fonte.
**How to avoid:** **Ingerir todos** (sem filtro de query) e **persistir o flag `published`**, deixando o motor decidir os dois casos (candidato e fonte) — coerente com o padrão de flag persistido (D-58) e com Defesa 2 (D-67, revalidação referencial na escrita). O filtro `?published=true` só serve como otimização opcional se algum dia se decidir não persistir ocultos — **não recomendado** aqui.
**Warning signs:** Produto-fonte oculto ainda recebendo vitrine calculada.

## Code Examples

### Correção mínima de CR-01 (rollback.js, D-65)
```javascript
// Source: derivado de rollback.js real (l.57-82). Guarda para existing == null.
const existing = await findMetafield({ ownerId: productId });
const currentValue = existing ? existing.value : null;

if (currentValue !== lastWrite.writtenValue) {
  throw new RollbackConflictError(productId, lastWrite.writtenValue, currentValue);
}

const restoredValue = lastWrite.previousValue;

// CR-01: o Metafield pode não existir mais (rollback anterior o deletou).
let result;
if (existing == null) {
  if (restoredValue == null) {
    result = { noop: true };                    // já ausente e nada a restaurar
  } else {
    result = await createMetafield({ ownerId: productId, value: restoredValue }); // recria
  }
} else if (restoredValue == null) {
  result = await deleteMetafield({ id: existing.id });
} else {
  result = await updateMetafield({ id: existing.id, value: restoredValue });
}

insertWriteLog({
  productId,
  runId: lastWrite.runId,
  metafieldId: existing ? existing.id : (result && result.id) || null,  // nunca existing.id cru
  previousValue: currentValue,
  writtenValue: restoredValue,
  triggeredBy: 'rollback',
  status: 'success',
  errorMessage: null,
  writtenAt: new Date().toISOString(),
});
```

### Kill switch no workflow (daily-recompute.yml, D-62)
```yaml
# Source: padrão já usado por vars.MIN_SIZES_IN_STOCK em daily-recompute.yml
on:
  schedule:
    - cron: '0 6 * * *'
  workflow_dispatch:
    inputs:
      write:
        description: 'Gravar de verdade? (false = dry-run, para o 1º rollout supervisionado D-64)'
        type: boolean
        default: false
# ...
        env:
          # Toggle persistente do regime diário (D-62). Ausente/false => dry-run.
          # Editável em Settings > Actions > Variables sem redeploy.
          WRITE_ENABLED: ${{ vars.WRITE_ENABLED }}
          # Override manual do run: input do workflow_dispatch tem prioridade.
          WRITE_OVERRIDE: ${{ github.event.inputs.write }}
```

### Leitura do toggle em run-daily-job.js (D-62)
```javascript
// Source: espelha resolveMinSizesInStock (ingest-catalog.js l.30-33)
function resolveWriteEnabled() {
  const override = process.env.WRITE_OVERRIDE;         // input do dispatch, se houver
  if (override === 'true') return true;
  if (override === 'false') return false;
  return process.env.WRITE_ENABLED === 'true';         // ausente => false (seguro)
}
const dryRun = !resolveWriteEnabled();  // passado a cada escrita (reusa APRV-04)
```

### Disjuntor sobre baseline do write_log (D-63)
```javascript
// Source: design derivado. baseline = último written_value por produto (write_log success).
function tripBreaker({ toWrite, baseline, isFirstRollout, churnMax = 0.30, blackoutMax = 0.10 }) {
  if (isFirstRollout) return { trip: false, reason: '1º rollout isento (D-63)' };
  const total = toWrite.length;
  let changed = 0, blackedOut = 0, hadBefore = 0;
  for (const { productId, newIds } of toWrite) {
    const before = baseline.get(String(productId)) || [];   // array de ids
    if (!setsEqual(before, newIds)) changed++;
    if (before.length > 0) {
      hadBefore++;
      if (newIds.length === 0) blackedOut++;
    }
  }
  const churn = total ? changed / total : 0;
  const blackout = hadBefore ? blackedOut / hadBefore : 0;
  if (churn > churnMax)   return { trip: true, reason: `churn ${(churn*100).toFixed(1)}% > ${churnMax*100}%` };
  if (blackout > blackoutMax) return { trip: true, reason: `apagão ${(blackout*100).toFixed(1)}% > ${blackoutMax*100}%` };
  return { trip: false };
}
// Ao disparar: notifyWriteFailure({ productId:'daily-job', error:new Error(reason), triggeredBy:'scheduled' }); e NÃO escrever.
```

### Defesa 2 — validação referencial na escrita (D-67)
```javascript
// Source: design derivado. snapshotById = Map(productId -> CatalogProductEntry) do run atual.
function filterReferentiallyValid(sourceEntry, recommendedIds, snapshotById) {
  return recommendedIds.filter((id) => {
    const c = snapshotById.get(String(id));
    if (!c) return false;                          // não existe no snapshot
    if (c.published === false) return false;       // oculto (D-58/D-67)
    if (!c.hasAvailableGrade) return false;        // sem estoque
    return normalizeColor(c.colorValue) === normalizeColor(sourceEntry.colorValue); // mesma cor
  });
}
// Conjunto vazio após o filtro => lacuna de cobertura registrada, NUNCA lixo gravado (D-67).
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Motor: tecido opcional dos dois lados, tecido diferente excluído (override 2026-07-17) | Modelo de 2 pesos: E+C+T (peso 1) acima de E+C (peso 2); tecido diferente vira peso 2 elegível | Esta fase (D-55) | Mais cobertura + ranking explícito por qualidade de match |
| Ingestão sem leitura de visibilidade | Persiste `published`; motor filtra oculto (candidato e fonte) | Esta fase (D-58) | Elimina o bug de 404 no bloco |
| Job diário só enfileira (D-47) | Job diário calcula e grava automaticamente | Esta fase (D-61) | Reverte APRV-03; painel vira auditoria |
| Rollback só por produto via CLI | Rollback em lote + CR-01 corrigido | Esta fase (D-65) | Segurança em escala de catálogo |

**Deprecated/outdated:**
- Script v.Alpha (Script API tradicional) da storefront: bloqueio de novas instalações a partir de 30/ago/2026, remoção progressiva a partir de 30/out/2026 (D-11). **Fora de escopo desta fase**, mas é a razão de D-70 (refinar o backend para reaproveitamento no NubeSDK). Não acoplar lógica de negócio à apresentação.
- `recommendation_baseline` como fonte de churn: é singular (legado); usar `write_log` (conjunto completo).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Nome recomendado do toggle é `vars.WRITE_ENABLED`; ausente = dry-run (seguro) | Pattern 3 / Code Examples | Baixo — nome/semântica à discrição D-62; a lógica "ausente = não grava" é conservadora e pode ser invertida se o usuário preferir |
| A2 | Baseline do disjuntor vem de `write_log` (último `written_value` por produto) | Pattern 4 | Médio — se o usuário quiser baseline do run anterior calculado (não do gravado), a fonte muda; confirmar na discussão |
| A3 | Contagem por-categoria para a Defesa 1 (D-66) precisa ser capturada nova (não é persistida hoje) | Open Questions | Médio — se já bastar o total agregado + banda, a Defesa 1 fica mais simples |
| A4 | O caminho de escrita automática grava `triggered_by: 'scheduled'` e ignora o gate D-25 | Pitfall 3 | Baixo — coerente com D-61; decisão de design de implementação |
| A5 | Limiar default do disjuntor: churn 30% / apagão 10% | Code Examples | Baixo — explicitamente à discrição/ajustável (D-63) |
| A6 | Migração de `published` trata `NULL` (produto pré-migração) como "não oculto" | Pattern 1 / Pitfall 2 | Alto se ignorado — tratar `null` como oculto zeraria o catálogo antes da 1ª re-ingestão |

**Confirmado (não é suposição):** o campo de visibilidade da API é `published` (boolean), retornado em lista e detalhe, filtrável por `?published=true` — ver § Sources (doc oficial).

## Open Questions

1. **Contagem por-categoria para a Defesa 1 (D-66)**
   - What we know: `runIngestion` mescla as 11 categorias sob um `run_id` e retorna só o total agregado (`productsRead`); `ingestion_runs.category_name` guarda os nomes unidos por vírgula, não as contagens.
   - What's unclear: como afirmar "nenhuma das 11 categorias voltou com 0 produtos" sem uma contagem por categoria.
   - Recommendation: capturar `{ categoria: count }` durante a ingestão (antes do merge/dedup) e retorná-lo / persisti-lo (nova coluna JSON em `ingestion_runs` ou log estruturado) para a Defesa 1 comparar. Banda de total vs. run anterior usa `ingestion_runs.products_read`.

2. **Baseline do disjuntor: gravado vs. calculado**
   - What we know: `write_log` tem o que foi **gravado**; o run atual tem o que **seria** gravado.
   - What's unclear: o usuário quer comparar "novo cálculo vs. último gravado" (recomendado) ou "novo cálculo vs. cálculo anterior".
   - Recommendation: usar o último `written_value` gravado como verdade da vitrine atual — é o que o cliente vê.

3. **Momento de zerar um produto-fonte que perdeu estoque**
   - What we know: D-54 diz que fonte esgotada não recebe vitrine; hoje a escrita não apaga o Metafield de quem perdeu estoque entre runs.
   - What's unclear: quando uma fonte perde estoque, o Metafield existente deve ser **deletado** (vitrine some) ou **mantido** (estático)?
   - Recommendation: alinhar com D-54/D-68 — provavelmente deletar/zerar, mas isso conta como "apagão" no disjuntor; confirmar interação na discussão.

4. **Escopo do `run_id` para escrita**
   - What we know: `write_log.run_id` é gravado; a escrita automática deve amarrar ao `run_id` do dia.
   - What's unclear: nenhum bloqueio, só garantir consistência de auditoria.
   - Recommendation: passar `getLatestSuccessfulRunId()` como `runId` em toda escrita agendada.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Todo o backend | ✓ (assumido no CI) | ≥20.6 (setup-node usa 20) | — |
| better-sqlite3 | Persistência | ✓ | ^12.11.1 | — |
| vitest | Testes | ✓ | ^4.1.10 | — |
| API pública Nuvemshop | Ingestão + escrita | ✓ (produção) | v1 (`api.tiendanube.com/v1`) | — |
| `NUVEMSHOP_ACCESS_TOKEN` (secret) | Toda chamada à API | ⚠ **precisa regenerar** (vazou em chat) | — | Sem fallback — bloqueia produção |
| `NUVEMSHOP_STORE_ID` (secret) | Toda chamada à API | ✓ | — | — |
| `WRITE_FAILURE_WEBHOOK_URL` (secret) | Disjuntor + resumo diário (D-63/D-69) | ? confirmar | — | Degrada silenciosamente (notifyWriteFailure loga local) |
| `vars.WRITE_ENABLED` (repository variable) | Kill switch (D-62) | ✗ criar | — | Ausente = dry-run (seguro) |

**Missing dependencies with no fallback:**
- Token da Nuvemshop **válido e regenerado** — o rollout real não roda sem ele (pendência de segurança do STATE.md).

**Missing dependencies with fallback:**
- `vars.WRITE_ENABLED` inexistente → tratado como dry-run (seguro por padrão).
- Webhook ausente → notificação degrada para log local (não derruba o job).

## Validation Architecture

> `workflow.nyquist_validation` = `true` no config.json — seção incluída.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^4.1.10 |
| Config file | nenhum arquivo dedicado (usa defaults; `npm test` = `vitest run`) |
| Quick run command | `cd app-partners-recomendados && npx vitest run src/recommendation/recommendation-engine.test.js` |
| Full suite command | `cd app-partners-recomendados && npm test` |

### Phase Requirements → Test Map
| Req (derivado) | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| D-55/D-56 | Peso 1 (E+C+T) sempre acima de peso 2 (E+C), mesmo com estoque menor | unit | `npx vitest run src/recommendation/recommendation-engine.test.js` | ✅ (atualizar) |
| D-57 | Tecido diferente (ambos têm) agora é elegível como peso 2 | unit | idem | ✅ (mudar Test l.170) |
| D-57 | Cor sempre obrigatória; fonte sem cor → [] | unit | idem | ✅ |
| D-58 | Candidato `published:false` nunca recomendado; fonte `published:false` → [] | unit | idem | ❌ Wave 0 (novos testes) |
| D-58 | `published:null` (pré-migração) NÃO é tratado como oculto | unit | idem | ❌ Wave 0 |
| D-65/CR-01 | Rollback duplo sobre metafield deletado não lança | unit | `npx vitest run scripts/rollback.test.js` | ❌ Wave 0 (Test 7 novo) |
| D-65 | Rollback em lote agrega falhas/conflitos sem abortar o lote | unit | `npx vitest run scripts/<rollback-batch>.test.js` | ❌ Wave 0 |
| D-62 | Kill switch off → dry-run (nenhuma escrita real) | unit | `npx vitest run scripts/run-daily-job.test.js` | ❌ Wave 0 |
| D-63 | Disjuntor dispara em churn>30% / apagão>10%; isenta 1º rollout | unit | idem | ❌ Wave 0 |
| D-66 | Categoria com 0 produtos / total fora da banda → aborta + notifica | unit | idem | ❌ Wave 0 |
| D-67 | Id não visível/sem estoque/cor diferente é descartado na escrita | unit | `npx vitest run src/review/write-executor.test.js` | ✅ (estender) |
| D-61 | Caminho `scheduled` grava sem gate; `triggered_by:'scheduled'` | unit | idem | ✅ (estender) |
| D-60 | Relatório conta cobertos/zerados-com-motivo | unit | `npx vitest run src/report/*.test.js` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** o comando quick do módulo tocado (ex.: engine test).
- **Per wave merge:** `npm test` (suíte completa — hoje 64+ verdes).
- **Phase gate:** suíte completa verde antes de `/gsd-verify-work`; **e** um dry-run real do job (D-64) conferido pelo relatório de cobertura + `/audit` antes de habilitar escrita.

### Wave 0 Gaps
- [ ] Novos testes de `published` em `recommendation-engine.test.js` (candidato oculto, fonte oculta, `null` não-oculto) — D-58.
- [ ] `scripts/rollback.test.js` Test 7 (rollback duplo) — CR-01.
- [ ] Testes do rollback em lote (arquivo novo) — D-65.
- [ ] Testes de kill switch/disjuntor/Defesa 1 em `run-daily-job.test.js` — D-62/D-63/D-66.
- [ ] Estender `write-executor.test.js` para caminho `scheduled` + Defesa 2 — D-61/D-67.
- [ ] Testes do relatório de cobertura (arquivo novo) — D-60.
- [ ] Atualizar os testes do override (l.76, 89, 170, 400, 429) para o modelo de 2 pesos, sem regressão nos demais.

## Security Domain

> `security_enforcement` = `true`, ASVS L1. Seção incluída.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | sim | OAuth token da Nuvemshop em `secrets.*`; nunca em client-side (PLAT-05). **Regenerar token vazado.** |
| V3 Session Management | não | Sem sessão de usuário; job de máquina |
| V4 Access Control | parcial | Painel `review-server.js` bind `127.0.0.1` (local); rollback só via CLI (D-37) |
| V5 Input Validation | sim | Dados de produto vêm de API externa (não confiáveis): prepared statements com params nomeados em todo `catalog-store.js` (nunca concatenação SQL); Defesa 2 revalida referencialmente antes de gravar (D-67) |
| V6 Cryptography | não | Sem cripto própria; TLS da plataforma |
| V7 Errors & Logging | sim | `notifyWriteFailure` nunca vaza credencial no payload (só productId/erro/timestamp); `write_log` é auditoria append-only (D-41) |

### Known Threat Patterns for {Node backend + API externa + CI}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Escrita em massa incorreta (dados truncados → apagar recomendações) | Tampering / DoS de negócio | Defesa 1 (D-66) integridade do snapshot + Disjuntor (D-63) magnitude |
| Recomendar produto oculto/inexistente (404) | Information Disclosure / Integrity | Filtro `published` no motor (D-58) + Defesa 2 referencial na escrita (D-67) |
| Token OAuth vazado | Spoofing/Elevation | Regenerar no Partners Portal (pendência STATE.md); nunca logar; nunca client-side |
| SQL injection via nome/tag de produto | Tampering | Prepared statements com params nomeados (já aplicado, T-02-04) |
| Rollback silencioso sobre edição manual | Tampering | `RollbackConflictError` (D-38) — aborta se valor ao vivo diverge |
| Perda de escrita em WAL no CI efêmero | (integridade) | `checkpointAndCloseDb` antes do commit-back (D-45) |

## Sources

### Primary (HIGH confidence)
- Código-fonte real lido diretamente nesta sessão: `recommendation-engine.js`, `recommendation-engine.test.js`, `ingest-catalog.js`, `run-daily-job.js`, `write-executor.js`, `diff.js`, `review-queue.js`, `rollback.js`, `rollback.test.js`, `notify-failure.js`, `product-group.js`, `stock-availability.js`, `catalog-store.js`, `schema.sql`, `client.js`, `recommendations.js`, `approval-gate.js`, `daily-recompute.yml`, `_batch-write.js`, `_scope.js`, `package.json`, `config.json`. [VERIFIED: leitura direta]
- Documentação oficial da API Nuvemshop/Tiendanube — recurso Product: campo `published` (boolean, "true if the Product is published in the store. false otherwise"), retornado em lista e detalhe, filtrável por `?published=true`. [CITED: https://tiendanube.github.io/api-documentation/resources/product]
- CONTEXT.md (D-53..D-70), REQUIREMENTS.md, PROJECT.md, STATE.md desta sessão. [VERIFIED: leitura direta]

### Secondary (MEDIUM confidence)
- Nenhuma — nenhum ponto crítico dependeu de fonte não-oficial.

### Tertiary (LOW confidence)
- Nenhuma.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — sem pacotes novos; tudo verificado no package.json e no código.
- Architecture (2 pesos, guardas, defesas): HIGH — desenhado a partir do código real; pontos de decisão de implementação marcados como suposições (A1..A6).
- Campo `published` (D-58): HIGH — confirmado na doc oficial da API.
- CR-01 root cause: HIGH — traçado linha a linha em `rollback.js`.
- Pitfalls: HIGH — derivados do código e da doc.

**Research date:** 2026-07-21
**Valid until:** 2026-08-20 (30 dias — projeto estável; exceção: o prazo do Script v.Alpha, 30/ago–30/out/2026, é fora de escopo desta fase mas contextualmente relevante para D-70).
