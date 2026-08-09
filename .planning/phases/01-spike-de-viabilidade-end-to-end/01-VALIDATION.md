---
phase: 1
slug: spike-de-viabilidade-end-to-end
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-09
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Nenhum ainda configurado — projeto greenfield, sem código-fonte além de `.planning/` |
| **Config file** | none — ver Wave 0 |
| **Quick run command** | A definir na fase (scripts de verificação manual/curl, dado que é um teste de integração real contra a loja) |
| **Full suite command** | N/A para esta fase — natureza é de spike empírico contra ambiente real, não testes automatizados unitários |
| **Estimated runtime** | N/A — validação majoritariamente manual/empírica contra a loja real, não uma suíte automatizada |

---

## Sampling Rate

- **After every task commit:** Rodar manualmente o script de round-trip (auth → escrita no Metafield → leitura de volta) sempre que o backend do app for alterado
- **After every plan wave:** Validação visual completa (captura de tela) da página do produto real
- **Before `/gsd-verify-work`:** Todos os 5 critérios de sucesso do roadmap confirmados com evidência (não suposição)
- **Max feedback latency:** N/A — validação majoritariamente manual/empírica, latência determinada por ciclo de deploy do Script/App Partners, não por watch-mode automatizado

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | PLAT-01 | T-1-01 | App Partners autentica com sucesso contra a loja real | smoke | script Node/curl que chama `GET /store` com o token obtido | ❌ Wave 0 | ⬜ pending |
| TBD | TBD | TBD | PLAT-03 | — | Tema ativo suporta NubeSDK (ou ativação obtida) | manual-only | N/A — decisão binária documentada com evidência (inspeção admin) | ❌ Wave 0 | ⬜ pending |
| TBD | TBD | TBD | PLAT-04 | — | Bloco nativo suprimido sem artefato visual remanescente | manual-only | N/A — captura de tela antes/depois | ❌ Wave 0 | ⬜ pending |
| TBD | TBD | TBD | PLAT-05 | T-1-02 | Endpoint próprio não expõe token da Nuvemshop | smoke | script simples de request ao endpoint próprio, inspecionar resposta | ❌ Wave 0 | ⬜ pending |
| TBD | TBD | TBD | WRTE-01 | — | Metafield gravado é lido de volta corretamente (round-trip) | integration | script Node/curl de round-trip (grava e lê de volta, compara valor) | ❌ Wave 0 | ⬜ pending |
| TBD | TBD | TBD | FRNT-01 | — | Script NubeSDK renderiza bloco visível na página real do produto | manual | captura de tela/inspeção ao vivo no navegador (exige navegador real, não headless) | ❌ Wave 0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Projeto de backend do App Partners — ainda não existe, precisa ser criado do zero (linguagem/stack a definir no plano)
- [ ] Projeto do Script NubeSDK — ainda não existe, scaffolding via `create-nube-app` (com `checkpoint:human-verify` — ver Package Legitimacy Audit em RESEARCH.md) ou setup manual (tsup-based, recomendado como caminho primário)
- [ ] Script de round-trip (auth → escrita no Metafield → leitura de volta) — Wave 0, reutilizado como verificação manual após cada mudança de backend

*Nenhum framework de teste automatizado é necessário para este spike específico — a natureza dos Critérios de Sucesso é validação empírica contra ambiente real (captura de tela, round-trip real), não testes unitários. Fases futuras (2+) que lidam com o motor de recomendação determinístico é que precisarão de framework de testes real (fixtures determinísticas, ver ROADMAP.md Fase 3).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Tema ativo da Talgui suporta NubeSDK (ou ativação manual obtida) | PLAT-03 | Depende de inspeção do admin da loja real e, possivelmente, de um formulário de solicitação de ativação (SLA de 1 dia útil) — não é verificável por código/API | Verificar tema ativo no admin; se não for Patagonia, submeter formulário de solicitação de ativação NubeSDK documentado em RESEARCH.md e aguardar confirmação antes de prosseguir com o desenvolvimento do Script |
| Bloco nativo "Produtos Relacionados" suprimido sem artefato visual remanescente | PLAT-04 | Julgamento visual (espaço vazio remanescente, título órfão) não é checável por asserção automatizada | Captura de tela da página do produto antes e depois da edição de CSS/layout no admin; inspeção visual manual confirmando ausência de espaço vazio ou título órfão |
| Script NubeSDK renderiza bloco "Recomendados" visível no local correto da página real | FRNT-01 | UI Slots do NubeSDK não têm slot dedicado a "produtos relacionados" — posicionamento exato exige validação visual ao vivo, não apenas build bem-sucedido | Publicar o Script via App Partners na loja real, abrir a página do produto de teste no navegador, confirmar visualmente que o bloco aparece no mesmo local onde o bloco nativo aparecia |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency N/A — justificado pela natureza empírica/manual desta fase (ver Test Infrastructure acima)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
