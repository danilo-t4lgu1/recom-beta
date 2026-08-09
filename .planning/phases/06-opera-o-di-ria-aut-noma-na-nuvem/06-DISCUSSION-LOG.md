# Phase 6: Operação Diária Autônoma na Nuvem - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-17
**Phase:** 6-Operação Diária Autônoma na Nuvem
**Modo:** `--auto` (autônomo — Claude selecionou a opção recomendada em cada área, sem perguntar ao usuário)
**Areas discussed:** Persistência do banco na nuvem, Escopo do job diário, Localização do painel de revisão, Mecanismo de cache do Script, Horário do agendamento

---

## Persistência do banco SQLite entre execuções na nuvem

| Opção | Descrição | Selecionada |
|-------|-----------|-------------|
| Commit-back via git ao final de cada execução | `git add -f data/catalog.db` (força apesar do gitignore de dev) + commit + push | ✓ |
| GitHub Actions cache/artifact | `actions/cache` ou `upload-artifact` entre execuções | |
| Banco hospedado externo (Turso/Postgres/etc.) | Introduz serviço novo, custo e complexidade adicionais | |

**Escolha (auto):** Commit-back via git — mantém 100% da stack SQLite/git já estabelecida desde a Fase 2, zero serviço novo, histórico auditável.
**Notas:** `data/*.db` é gitignored hoje apenas para desenvolvimento local; o workflow de CI precisa forçar o add especificamente. Cache/artifact do GitHub Actions foi descartado por não ser um mecanismo de persistência durável (eviction policy, limite de 90 dias).

---

## Escopo do job diário (nunca escreve sozinho)

| Opção | Descrição | Selecionada |
|-------|-----------|-------------|
| Job só recalcula e popula fila de aprovação | Nunca chama write-executor/POST /write sozinho | ✓ |
| Job também escreve automaticamente para aprovações já pendentes | Violaria o Out of Scope travado no PROJECT.md | |

**Escolha (auto):** Job termina em popular `approval_queue` — reforça a trava "Escrita automática sem aprovação humana" já registrada no PROJECT.md desde o início do projeto.
**Notas:** Reaproveita o mesmo formato de fila de aprovação (D-25) e o mesmo `run_id` incremental já estabelecidos na Fase 4.

---

## Onde o painel de revisão roda

| Opção | Descrição | Selecionada |
|-------|-----------|-------------|
| Painel continua local | Operador sincroniza via git pull e roda review-server.js localmente | ✓ |
| Painel migra para hospedagem na nuvem com autenticação | Escopo maior, não pedido pelos success criteria desta fase | |

**Escolha (auto):** Painel continua local — os success criteria da Fase 6 falam do MOTOR/agendamento rodando na nuvem, não do painel de revisão.
**Notas:** Migração do painel para a nuvem foi mencionada como possibilidade na Fase 4, mas fica deferida (ver Deferred Ideas).

---

## Mecanismo de cache do Script (FRNT-02)

| Opção | Descrição | Selecionada |
|-------|-----------|-------------|
| sessionStorage nativo do navegador + TTL | Funciona com a Script API tradicional já em uso (D-11) | ✓ |
| asyncSessionStorage do NubeSDK | Requisito cita como exemplo, mas NubeSDK não está ativo ainda | |

**Escolha (auto):** `sessionStorage` nativo com timestamp + TTL de 24h, no call site existente (`storefront-script/main.js:99`).
**Notas:** Requisito FRNT-02 cita `asyncSessionStorage` do NubeSDK apenas como exemplo ("ex:"); o projeto ainda roda a Script API tradicional (D-11, Fase 1), então esse mecanismo específico não está disponível. Migração para `asyncSessionStorage` fica para quando o NubeSDK for aprovado (mesmo débito já registrado no PROJECT.md).

---

## Horário do agendamento

| Opção | Descrição | Selecionada |
|-------|-----------|-------------|
| Horário fixo de baixo tráfego (ex: 3h BRT) | Sem necessidade de configuração pelo usuário | ✓ |
| Horário configurável pelo usuário | Complexidade adicional não requisitada | |

**Escolha (auto):** Horário fixo de baixo tráfego, uma vez ao dia.
**Notas:** FEED-01 só exige execução "diária", sem horário específico requisitado — planejador confirma a sintaxe cron exata.

---

## Claude's Discretion

- Nome/localização exata do workflow YAML do GitHub Actions.
- Mecanismo exato de detecção de mudança real de estoque/cor/tecido (SC#3) — se a recomputação diária do zero já basta ou se é necessário diff/notificação adicional.
- Formato exato do log/output do job para debugging futuro.

## Deferred Ideas

- Migração do painel de revisão (`review-server.js`) para hospedagem na nuvem com autenticação — fora de escopo desta fase, fica para uma fase futura.
- Reconstrução do Script de storefront em NubeSDK (débito de longo prazo, D-11) — aguarda aprovação do formulário de ativação do tema Morelia.
