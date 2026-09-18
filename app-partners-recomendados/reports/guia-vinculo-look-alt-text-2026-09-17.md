# Guia — Como Marcar que Duas Peças Formam um Look

**Status:** proposta de processo, aguardando aprovação para entrar em operação.
**Para quem é este guia:** quem organiza/sobe as fotos dos produtos após o shooting.
**Nenhum conhecimento técnico é necessário para seguir este guia.**

---

## Por que isso existe

Quando um cliente vê uma peça no site, o sistema já sugere outras peças parecidas
(mesma cor, mesmo tecido, etc.). Mas existe um tipo de informação que **só uma pessoa
consegue confirmar olhando a foto**: quando duas peças foram pensadas para formar um
conjunto — por exemplo, uma blusa estampada com a saia estampada da mesma cor,
fotografadas juntas no shooting porque formam um "look".

Hoje não existe nenhuma forma de avisar o sistema sobre isso. Este guia explica como
fazer essa marcação, de forma simples, direto na tela do produto — **sem precisar
renomear arquivo de foto, sem reorganizar pasta, sem mexer em nada fora da tela normal
de cadastro.**

---

## Onde mexer

Dentro de cada produto, em **cada foto** (não é um campo do produto em geral — é um
campo de cada imagem individual), existe um campo chamado:

> **"Texto alternativo"** (pode aparecer também como "Alt text" ou "Descrição da imagem")

Esse campo já existe na Nuvemshop e hoje está vazio em todos os produtos — ele não é
usado para nada no momento.

---

## Passo a passo

**Exemplo:** você percebe que a **Blusa Tiná Poá Preta** e a **Saia Eloá Midi Poá
Preta** foram fotografadas juntas e formam um conjunto.

1. Escolha um código para esse conjunto. Pode ser sequencial e simples, sempre no
   mesmo formato. Exemplo: `LOOK-001`
2. Abra o produto **Blusa Tiná Poá Preta** no admin da Nuvemshop.
3. Abra a foto principal dele e cole o código no campo **"Texto alternativo"**:
   `LOOK-001`
4. Abra o produto **Saia Eloá Midi Poá Preta**.
5. Abra a foto principal dele e cole **o mesmo código exato**: `LOOK-001`
6. Pronto — não precisa fazer mais nada.

A partir daí, o sistema de recomendação passa a reconhecer sozinho, automaticamente
(todo dia), que essas duas peças formam um conjunto, e passa a sugerir uma na página
da outra com prioridade máxima.

---

## Regras importantes (para não dar erro)

| Regra | Por quê |
|---|---|
| O código precisa ser **idêntico** nos dois produtos (maiúscula, espaço, tudo igual) | Se escrever diferente, o sistema não reconhece o par |
| Prefira **copiar e colar** o código, em vez de digitar de novo | Evita erro de digitação |
| **Cada conjunto usa um código próprio, nunca repetido** | Reaproveitar um código junta produtos que não deveriam estar juntos |
| Só precisa preencher em **uma foto** de cada produto (a principal já basta) | Não precisa repetir em todas as fotos do mesmo produto |
| **Só preencha nos produtos que realmente formam um conjunto** | Produtos sem esse campo continuam funcionando normalmente, sem nenhuma mudança |
| Para desfazer um vínculo, é só **apagar o texto** do campo | Reversível a qualquer momento |

---

## Perguntas frequentes

**Preciso preencher isso em todo produto do catálogo?**
Não. Só nos que formam um conjunto de verdade. Todos os outros continuam exatamente
como estão hoje.

**E se eu errar o código?**
Sem problema — é só corrigir o texto na próxima vez que abrir o produto. Não quebra
nada, só faz o vínculo não funcionar até ser corrigido.

**Isso substitui alguma etapa do cadastro atual?**
Não. É um passo adicional, feito só por quem organiza as fotos, sem interferir no
fluxo de cadastro que já existe hoje.

**Quando isso passa a valer no site?**
Automaticamente, na próxima atualização diária do sistema — ninguém precisa avisar
nada nem rodar nada manualmente.

---

*Documento preparado em 17/09/2026 como parte da estruturação do sinal de "Look
Completo" no motor de recomendação de produtos da Talgui. Este processo ainda depende
de aprovação formal entre as equipes de Cadastro e Conteúdo/Fotografia antes de entrar
em operação — este guia existe para que, assim que aprovado, a execução possa começar
imediatamente, sem depender de um novo ciclo de definição.*
