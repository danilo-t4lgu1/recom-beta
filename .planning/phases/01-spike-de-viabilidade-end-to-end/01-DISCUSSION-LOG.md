# Phase 1: Spike de Viabilidade End-to-End - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-09
**Phase:** 01-spike-de-viabilidade-end-to-end
**Areas discussed:** Bloco nativo vs. customizado, Persistência pós-spike, Acesso ao App Partners

---

## Bloco nativo vs. customizado

| Option | Description | Selected |
|--------|-------------|----------|
| Ocultar via CSS/layout | Esconde o bloco nativo no produto de teste via edição de layout/tema no admin | ✓ |
| Deixar os dois coexistirem | Mantém o bloco nativo visível e adiciona o customizado ao lado/abaixo | |
| Você decide | Deixa a escolha técnica a critério de quem implementar | |

**User's choice:** Ocultar via CSS/layout

**Follow-up 1 — Fallback via Script:**
| Option | Selected |
|--------|----------|
| Só CSS/layout é suficiente | ✓ |
| Testar também via Script como plano B | |

**User's choice:** Só CSS/layout é suficiente — se resolver, PLAT-04 fecha sem investigar via Script.

**Follow-up 2 — Posição do bloco customizado:**
| Option | Selected |
|--------|----------|
| Mesmo lugar do bloco nativo | ✓ |
| Qualquer lugar visível, só para provar | |

**User's choice:** Mesmo lugar do bloco nativo.

**Follow-up 3 — Falha parcial no ocultamento:**
| Option | Selected |
|--------|----------|
| Detalhe cosmético, spike segue aprovado | |
| Precisa ficar visualmente limpo | ✓ |

**User's choice:** Precisa ficar visualmente limpo — ocultamento quebrado conta como falha do Critério 4.

**Notes:** Nenhuma nota adicional além das respostas.

---

## Persistência pós-spike

| Option | Description | Selected |
|--------|-------------|----------|
| Manter ativo (vira base da Fase 2) | Produto de teste segue com bloco customizado ativo e nativo oculto | ✓ |
| Reverter tudo | Após documentar evidência, desfaz Metafield e reoculta, restaura o nativo | |

**User's choice:** Manter ativo (vira base da Fase 2)

**Follow-up 1 — Conteúdo do Metafield:**
| Option | Selected |
|--------|----------|
| Um produto real e plausível | ✓ |
| Valor trivial/hardcoded qualquer | |

**User's choice:** Um produto real e plausível.

**Follow-up 2 — Exceção de aprovação humana:**
| Option | Selected |
|--------|----------|
| Sim, exceção só para o produto de teste do spike | ✓ |
| Não, reverter ao final do spike | |

**User's choice:** Sim, exceção pontual só para o produto de teste — não é o padrão do sistema.

**Notes:** Decisão implica que o produto de teste ficará com uma recomendação "manual" visível na loja real até a Fase 3 entregar o motor automático de verdade.

---

## Acesso ao App Partners

| Option | Description | Selected |
|--------|-------------|----------|
| Sim, já tenho (uso no projeto paralelo) | Reaproveita a mesma conta Partners do projeto de ordenação de vitrines | ✓ |
| Não tenho certeza / preciso verificar | | |
| Não tenho, preciso solicitar do zero | | |

**User's choice:** Sim, já tenho (uso no projeto paralelo)

**Follow-up 1 — App novo ou existente:**
| Option | Selected |
|--------|----------|
| Mesmo app existente (adiciona escopo/Script) | |
| App Partners novo e separado | ✓ |

**User's choice:** App Partners novo e separado — mantém os dois projetos isolados.

**Follow-up 2 — Credenciais:**
| Option | Selected |
|--------|----------|
| Já tenho e vou fornecer quando pedido | |
| Preciso gerar/registrar durante o spike | ✓ |

**User's choice:** Preciso gerar/registrar durante o spike — não é pré-requisito já resolvido.

**Notes:** Nenhuma nota adicional.

---

## Claude's Discretion

Nenhuma área foi deixada explicitamente a critério do Claude nesta discussão.

## Deferred Ideas

Nenhuma ideia de escopo novo surgiu durante a discussão. A área "Produto de teste" foi oferecida como opção de discussão mas não foi selecionada pelo usuário — o produto específico de teste fica em aberto para a fase de pesquisa/planejamento decidir, dentro dos critérios já capturados em CONTEXT.md (produto real, baixo risco visual).
