# Auditoria de LCP e scripts de terceiros — 2026-08-07

Investigação disparada após medir a PDP `shorts-tatiana-em-veludo-azul` no PageSpeed
Insights: Score de Desempenho instável entre **39 e 13** na mesma URL, com **LCP 11,7s**,
**TBT 3.200ms**, **CLS 0,893**, **Speed Index 6,0s**, **FCP 2,4s**. Objetivo: (1) explicar
tecnicamente por que o índice está tão ruim mesmo sem delay de carregamento perceptível,
e (2) confirmar com uma amostra de 10-20 PDPs se é um padrão consistente da loja, e se o
script `storefront-script/main.js` (Recomendados) tem alguma participação real nisso.

## Parte 1 — O que é LCP de fato, e por que "a página não parece lenta"

### O que a métrica mede (e o que ela NÃO mede)

LCP (**Largest Contentful Paint**) é o timestamp, medido a partir do início da navegação
(T=0s), em que o **maior elemento de conteúdo visível** (tipicamente uma imagem, um bloco
de texto grande, ou um vídeo poster) termina de ser pintado na tela. Não é:

- **Não é** "tempo até a página carregar por completo" (isso seria `load`/`onload`).
- **Não é** "tempo até o usuário conseguir interagir" (isso é TTI/INP).
- **Não é** uma média ou percepção subjetiva — é o timestamp de UM elemento específico,
  aquele que a engine do navegador identificou como visualmente o maior naquele momento.

### Por que dá pra "sentir" a página rápida e o LCP ainda ser 11,7s

Isso não é contraditório — é o comportamento **esperado** quando os dois fatores abaixo
estão presentes, e ambos estão presentes nesta loja:

**1. Renderização progressiva mascara o atraso do MAIOR elemento especificamente.**
O navegador pinta o cabeçalho, textos, preço e botões muito antes do LCP se resolver — é
por isso que o **FCP (First Contentful Paint) está em 2,4s**, um valor razoável: *algo*
aparece rápido. O usuário já está lendo o nome do produto, o preço, rolando a página —
e psicologicamente já registrou "a página carregou" — enquanto, tecnicamente, o elemento
específico que o navegador está rastreando como "o maior" ainda não terminou de pintar.
O intervalo entre FCP (2,4s) e LCP (11,7s) — quase **9,3 segundos** — é tempo que o
usuário não percebe como espera, porque já está interagindo com outra parte da página.

**2. O elemento LCP compete por rede e CPU com ~44 scripts de terceiros, e pode até
"mudar" durante o carregamento.** Medido ao vivo nesta mesma PDP: **83 tags `<script>`
no DOM, 44 origens distintas** (Pinterest, TikTok, Google Tag Manager, CartStack,
Solomon Analytics ×2, Facebook Pixel, Google Ads/gtag ×2, HintUp, Sizebay, Selly ×4,
Wallet, Compre Junto, Kits, Brindes, Indique e Ganhe, entre outros). Cada um desses
disputa a fila de conexões HTTP/2 e o main thread do navegador — o pedido de rede da
IMAGEM que acaba virando o candidato a LCP pode ficar atrás de dezenas de outros pedidos
de script na fila de prioridade do navegador, atrasando quando ela efetivamente termina
de pintar, mesmo que o restante da página já pareça "pronta". Além disso, se um widget
assíncrono (banner, prova social, upsell) injeta um bloco maior de conteúdo mais tarde,
o navegador RECALCULA qual é "o maior elemento" e o relógio do LCP pode reiniciar contra
esse novo candidato — típico em páginas com muitos apps de terceiro inserindo DOM de
forma assíncrona, como é o caso aqui.

**3. O Lighthouse testa em condições piores que o computador/rede do dia a dia.** Por
padrão, o Lighthouse (motor por trás do PageSpeed Insights) aplica **throttling de CPU
4x mais lento** e **rede simulando 4G intermediário**, para representar o pior caso
realista (um celular de linha intermediária em rede móvel comum) — bem diferente de
testar num desktop com fibra. Isso é proposital (o Google quer capturar a experiência do
usuário mais desfavorecido), mas explica por que "a página carrega rápido pra mim"
(testando num desktop rápido) e o score de laboratório é tão baixo.

**4. TBT (3.200ms) é especificamente sobre o CUSTO de JavaScript no main thread, não
sobre carregamento visual.** Total Blocking Time soma todo o tempo em que o main thread
ficou ocupado processando tarefas de mais de 50ms sem responder a um possível toque/clique
do usuário. Não afeta o que aparece na tela — afeta a RESPONSIVIDADE. Um usuário que só
rola a página sem tentar clicar em nada não sente isso diretamente; um usuário que tenta
tocar num botão durante essa janela sente um atraso real na resposta. Com ~10-15
scripts de terceiro cada um consumindo 200-600ms de execução JS (medido nesta PDP, ver
tabela abaixo), a soma passa fácil de 3 segundos.

**5. CLS (0,893) mede deslocamento de layout, não velocidade.** Um valor tão alto
(perto do máximo teórico) normalmente vem de conteúdo sendo inserido/redimensionado
DEPOIS da renderização inicial sem espaço reservado — banners de cookie, widgets de
prova social, pop-ups de urgência, apps de marketing carregando de forma assíncrona.
O usuário sente isso como "eu ia clicar em algo e um banner empurrou tudo", não como
lentidão.

### Resumindo em uma frase

**A página "parece" rápida porque o conteúdo pequeno aparece cedo (FCP 2,4s) e o usuário
já começa a interagir — mas o elemento tecnicamente "maior" da tela demora muito mais
pra terminar de pintar (LCP 11,7s) porque está competindo por rede e CPU com ~44 scripts
de terceiro, e o navegador está medindo sob condições de CPU/rede propositalmente
pessimistas.** Isso é consistente com um problema estrutural de excesso de scripts de
marketing/analytics instalados na loja — não com o carrossel de Recomendados, que sequer
carrega nessa medição (ver Parte 2).

## Parte 2 — Por que o script `main.js` (Recomendados) está tecnicamente excluído desta medição

Confirmado ao vivo (não é suposição): o script de Recomendados carrega via evento
`onfirstinteraction` (scroll/clique/toque) — o Lighthouse, por padrão, **não simula
nenhuma interação** durante o teste de navegação. Medi diretamente: **3 segundos depois
da página terminar de carregar (`readyState: complete`), sem nenhuma interação simulada,
o script de Recomendados ainda não existe no DOM.** Ele fisicamente não pode ser o
elemento LCP, não pode contribuir pro TBT, e não pode causar o CLS medido nesse cenário
específico.

O único ponto de atenção real do NOSSO script, se ele algum dia virar candidato a LCP
(quando um usuário real rola a página cedo o suficiente): a primeira imagem do carrossel
já foi corrigida para `loading="eager" fetchpriority="high"` (commit `447c67d`,
2026-08-06) — validado ao vivo, carregando em ~10ms a partir da inserção no DOM, sem
atraso artificial de lazy-load.

## Parte 3 — Amostra de 10-20 PDPs (metodologia)

Para confirmar se o padrão observado em `shorts-tatiana-em-veludo-azul` se repete de
forma consistente em outras páginas de produto (e não é uma anomalia pontual), a amostra
abaixo foi selecionada aleatoriamente do catálogo real ativo, cobrindo os 3 grupos de
produto (Look Inteiro / Partes de Cima / Partes de Baixo):

**Como rodar:** para cada URL, abrir https://pagespeed.web.dev/, colar a URL, rodar na
aba **Mobile** (é o que a loja mais recebe de tráfego e é o cenário mais pessimista),
copiar os 5 indicadores (Score de Desempenho, FCP, LCP, TBT, CLS, Speed Index).

| # | URL | Grupo | Score | FCP | LCP | TBT | CLS | Speed Index |
|---|-----|-------|-------|-----|-----|-----|-----|-------------|
| 1 | https://talgui.com.br/produtos/vestido-angelica-com-fenda-preto/ | Look Inteiro | | | | | | |
| 2 | https://talgui.com.br/produtos/vestido-kiara-midi-verde-militar/ | Look Inteiro | | | | | | |
| 3 | https://talgui.com.br/produtos/vestido-fabricia-em-croche-preto/ | Look Inteiro | | | | | | |
| 4 | https://talgui.com.br/produtos/vestido-anahi-tule-preto/ | Look Inteiro | | | | | | |
| 5 | https://talgui.com.br/produtos/cropped-daniela-vermelho/ | Partes de Cima | | | | | | |
| 6 | https://talgui.com.br/produtos/vestido-marcela-preto/ | Look Inteiro | | | | | | |
| 7 | https://talgui.com.br/produtos/corset-joana-vinho/ | Partes de Cima | | | | | | |
| 8 | https://talgui.com.br/produtos/macaquinho-dione-em-alfaiataria-verde/ | Look Inteiro | | | | | | |
| 9 | https://talgui.com.br/produtos/vestido-vania-curto-amarelo/ | Look Inteiro | | | | | | |
| 10 | https://talgui.com.br/produtos/blusa-linara-em-crepe-amarelo/ | Partes de Cima | | | | | | |
| 11 | https://talgui.com.br/produtos/vestido-isa-em-malha-off-white/ | Look Inteiro | | | | | | |
| 12 | https://talgui.com.br/produtos/blusa-matilda-sarjada-bege/ | Partes de Cima | | | | | | |
| 13 | https://talgui.com.br/produtos/macacao-paulina-em-alfaiataria-lisa-preta/ | Look Inteiro | | | | | | |
| 14 | https://talgui.com.br/produtos/corset-marta-tomara-que-caia-vinho/ | Partes de Cima | | | | | | |
| 15 | https://talgui.com.br/produtos/vestido-sora-em-laise-vermelho/ | Look Inteiro | | | | | | |
| 16 | https://talgui.com.br/produtos/blusa-nadia-assimetrica-preta/ | Partes de Cima | | | | | | |
| 17 | https://talgui.com.br/produtos/shorts-saia-laiane-em-alfaiataria-marrom/ | Partes de Baixo | | | | | | |
| 18 | https://talgui.com.br/produtos/blusa-amara-alfaiataria-lisa-cinza/ | Partes de Cima | | | | | | |
| 19 | https://talgui.com.br/produtos/shorts-melissa-em-alfaiataria-rosa/ | Partes de Baixo | | | | | | |
| 20 | https://talgui.com.br/produtos/calca-rebeca-sarjada-verde-militar/ | Partes de Baixo | | | | | | |

*(referência já medida antes desta amostra: `shorts-tatiana-em-veludo-azul` — Score 39→13, FCP 2,4s, LCP 11,7s, TBT 3.200ms, CLS 0,893, Speed Index 6,0s)*

## Parte 4 — Evidência técnica coletada (scripts mais lentos, `shorts-tatiana-em-veludo-azul`)

| Script (terceiro) | Duração de execução |
|---|---|
| Pinterest (conversões) | 601ms |
| TikTok Pixel | 534ms |
| Google Tag Manager | 477ms |
| CartStack | 432ms |
| Solomon Analytics (evento 1) | 426ms |
| Facebook Pixel (fbevents.js) | 376ms |
| Google gtag (dataLayerTN) | 337ms |
| HintUp Promoções | 306ms |
| Solomon Analytics (evento 2) | 289ms |
| Facebook Signals (config) | 267ms |
| assets.hintup.io adapter-nuvemshop | 257ms |
| Google gtag (Ads) | 218ms |
| Google Ads / DoubleClick (view-through) | 193ms |
| Google Ads / DoubleClick (gtag.config) | 187ms |
| parent-id-huapps | 182ms |

Total de scripts carregados na página: **83 tags, 44 origens distintas.**

## Parte 5 — Conclusão (preencher após a amostra)

*Pendente — aguardando os dados da Parte 3.*

---
*Levantamento: 2026-08-07. Ferramenta: PageSpeed Insights (Lighthouse mobile) +
inspeção ao vivo via Performance API do navegador (resource timing, layout-shift
entries). Read-only — nenhuma alteração em produção.*
