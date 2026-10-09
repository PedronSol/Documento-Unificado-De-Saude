# Navegação de Contexto no Rodapé Mobile

## Status

IMPLEMENTED — commit a registrar após validação.

## Contexto

Contas com mais de um papel usam o seletor segmentado “Minha saúde / Área
profissional” no cabeçalho. Em telas móveis, o cabeçalho é estreito e esse
controle fica distante do alcance do polegar. A referência do usuário pede uma
barra de navegação suspensa junto ao rodapé, semelhante a um dock de aplicativo.

## Objetivos

- Reposicionar a troca de contexto para um dock fixo e flutuante em telas abaixo
  de 800 px.
- Preservar as roles e a semântica de seleção existentes.
- Manter os rótulos e uma forma visual clara para o contexto ativo.
- Liberar o espaço ocupado pelo dock no fluxo para que o último conteúdo possa
  ser rolado sem ficar encoberto.
- Manter o seletor no cabeçalho em viewport ampla.
- Respeitar safe area, teclado, foco e viewport mínima de 320 px.

## Não objetivos

- Alterar quais contextos a API autoriza ou qual é o contexto padrão.
- Adicionar destinos de navegação, ações de criação ou abas para recursos.
- Mudar o cabeçalho em contas de uma única role.
- Adicionar dependências ou preferência persistente do contexto.

## Direção visual

- Dock em superfície branca, formato pill, borda fria e sombra elevada suave.
- Itens com ícone Lucide e rótulo curto; estado ativo com azul institucional e
  superfície azul-clara.
- Fundo e cores permanecem os tokens claros existentes.
- Barra posicionada no centro inferior, acima da safe area, sem cobrir o
  conteúdo rolável.
- A partir de 800 px, volta ao seletor segmentado no cabeçalho.

## Cenários de aceitação

### Cenário: trocar contexto com o polegar no celular

Dado que uma pessoa autenticada tem os contextos paciente e profissional
Quando abre a aplicação em um viewport de 320 px
Então o seletor aparece como um dock fixo centralizado junto ao rodapé
E os rótulos “Minha saúde” e “Área profissional” permanecem visíveis e
acessíveis
E o conteúdo ativo pode ser rolado sem ficar escondido atrás do dock.

### Cenário: seleção continua limitada às roles autenticadas

Dado que a pessoa possui mais de um contexto autorizado
Quando toca ou aciona por teclado um item do dock
Então somente o contexto escolhido é renderizado
E `aria-pressed` identifica o item selecionado.

### Cenário: navegação permanece no cabeçalho em telas amplas

Dado que a aplicação é vista em viewport de 800 px ou maior
Quando o seletor de contexto é renderizado
Então ele fica estático no cabeçalho e mantém o formato segmentado existente.

### Cenário: não há dock para uma única role

Dado que a pessoa possui apenas um contexto autenticado
Quando abre a aplicação em viewport móvel
Então o seletor não é renderizado nem há espaço vazio reservado para ele.

## Acessibilidade e responsividade

- Manter o elemento `nav` com nome “Contexto de acesso”.
- Manter botões nativos, `aria-pressed`, rótulos completos e foco visível.
- Alvos de toque com pelo menos 44 px de altura.
- Reservar padding inferior com safe area somente quando o dock existir.
- Não criar overflow horizontal em 320 px.
- Respeitar `prefers-reduced-motion`.

## Segurança e compatibilidade

- O estado escolhido continua limitado a `roles` vindas da identidade autenticada.
- O dock não adiciona dados a URL, storage, telemetria ou logs.
- A mudança é apenas de apresentação e não altera autorização nem contratos API.

## Estratégia TDD e validação

1. RED: Playwright em 320 px verifica `position: fixed`, alcance inferior,
   padding de segurança, ausência de overflow e troca entre contextos; falha com
   o seletor atual no cabeçalho. O mesmo teste verifica posição fixa até
   768 px e posição estática a partir de 800 px.
2. GREEN: adicionar ícones/contextualização visual, CSS mobile-first e espaço
   inferior condicionado à presença do seletor.
3. REFACTOR: consolidar tokens e estados responsivos, preservando fluxo de uma
   role e teste de troca já existente.
4. Executar testes unitários, Playwright, build e `git diff --check`.

## Critérios de aceite

- [x] O seletor multirole é um dock flutuante no rodapé em 320 px.
- [x] Conteúdo não fica atrás do dock e não há scroll horizontal.
- [x] Troca por toque e teclado mantém contexto e `aria-pressed` corretos.
- [x] Em 800 px ou mais, o controle permanece no cabeçalho.
- [x] Conta com uma role não reserva espaço nem exibe dock.
- [x] Testes, build e roadmap ficam sincronizados.

## Evidência TDD

- RED: antes do CSS, o cenário Playwright de 320 px falhou porque o seletor
  calculava `position: static` em vez de `fixed`.
- Revisão: a captura do usuário mostrou o estilo de cabeçalho em uma janela
  móvel mais larga; o limite foi ampliado de 600 px para 800 px e o teste foi
  estendido a 768 px.
- RED adicional: em 768 px, antes de ajustar o breakpoint, o seletor ainda
  calculava `position: static`.
- GREEN: após o breakpoint de 800 px, Playwright passa em 320 px e 768 px,
  confirma espaçamento inferior, ausência de overflow, troca por toque/teclado
  e retorno ao cabeçalho a partir de 800 px.
- REFACTOR: ícones são resolvidos uma vez por papel durante a renderização; o
  seletor continua restrito às roles autenticadas.

## Revisão

- Direção aprovada pelo usuário em 2026-10-08 com a referência visual anexada.
