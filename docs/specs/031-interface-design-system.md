# Sistema Visual e Alinhamento da Área Médica

## Status

IMPLEMENTED

## Dependências

- Step 7 concluído em `docs/specs/030-medical-panel.md`.
- Componentes e superfícies clínicas existentes no dashboard do paciente.

## Contexto e problema

A primeira versão da área médica criou uma linguagem editorial própria, com
hero verde escuro, títulos serifados, cantos assimétricos e fundo quadriculado.
Essa composição destoa do restante da plataforma, que usa canvas cinza-azulado,
superfícies brancas, azul institucional, tipografia sans-serif e cartões com
cantos amplos e regulares.

Além da correção local, cores, tipografia, espaçamento, forma, elevação e
movimento ainda não possuem uma fonte de verdade explícita. Isso facilita novas
divergências e mantém valores visuais duplicados no CSS.

## Objetivos

- Alinhar listagem e prontuário médicos à linguagem visual clínica existente.
- Alinhar os diálogos clínicos compartilhados, removendo serifada e CTA verde.
- Substituir selects nativos por um dropdown compartilhado e acessível.
- Criar tokens semânticos reutilizáveis para tema claro e escuro.
- Documentar estilo, fundações, componentes, estados e regras responsivas.
- Implementar superfícies novas e tocadas com abordagem mobile-first.
- Registrar no `AGENTS.md` a governança obrigatória do design system.
- Preservar comportamento, conteúdo, acessibilidade e contratos do Step 7.

## Não objetivos

- Redesenhar login, navegação ou dashboard do paciente nesta entrega.
- Migrar todo valor legado do CSS de uma só vez.
- Criar uma biblioteca externa, Storybook ou nova dependência.
- Alterar APIs, autorização, busca, mutações ou modelo de dados.
- Ativar seleção de tema escuro na interface; os tokens apenas deixam o tema
  preparado para consumidores compatíveis.

## Regras visuais

1. A direção é institucional clínica: calma, clara, precisa e acolhedora, sem
   estética editorial ou ornamental em fluxos de trabalho.
2. O canvas usa cinza-azulado claro; conteúdo usa superfícies brancas, bordas
   frias e sombra baixa.
3. Azul é a cor de ação e foco. Verde fica reservado a sucesso ou estado
   clínico positivo; não deve dominar páginas ou botões primários.
4. Instrument Sans é a tipografia de interface e de todos os títulos clínicos.
   A fonte editorial fica restrita a momentos institucionais já existentes.
5. Espaçamento segue base de 4 px, com composições preferenciais em múltiplos
   de 8 px. Cards usam raio regular de 18 px; controles usam 10 px ou pill.
6. Valores de cor, raio, sombra, espaço, tipografia, movimento e layout devem
   vir dos tokens `--ds-*`; aliases legados podem apontar para esses tokens
   durante a migração incremental.
7. Novos componentes reutilizam primeiro os primitives de
   `frontend/components/ui/` e padrões documentados. Uma nova variante visual
   exige consumidor concreto.
8. Estados loading, vazio, erro, sucesso, hover, focus-visible e disabled
   mantêm contraste, texto explícito e não dependem somente de cor.
9. Controles interativos têm alvo mínimo de 44 px quando a composição permitir;
   foco visível usa o token de foco, sem remover outline sem substituição.
10. CSS de layout é mobile-first: o estilo-base atende 320 px e melhorias para
    telas maiores usam preferencialmente media queries com `min-width`.
11. Em viewport móvel, grids permanecem em coluna, ações ocupam largura útil,
    textos podem quebrar sem truncar informação clínica e não há overflow
    horizontal.

## Cenários de aceitação

### Cenário: área médica usa a mesma linguagem clínica

Dado que uma médica abre sua carteira assistencial
Quando a listagem é renderizada
Então o canvas, superfícies, tipografia, bordas, raios e ações usam os mesmos
tokens semânticos das superfícies do paciente
E não há hero verde escuro, título serifado, grid decorativo ou canto
assimétrico.

### Cenário: prontuário preserva hierarquia e legibilidade

Dado que a médica abre um prontuário autorizado
Quando perfil, vacinas e marcadores são exibidos
Então cada módulo usa card branco, título sans-serif, ação azul e estados
semânticos
E os dados, ações e ordem existentes permanecem inalterados.

### Cenário: diálogo clínico segue o sistema institucional

Dado que uma pessoa adiciona ou edita um marcador
Quando o diálogo acessível é aberto
Então título, kicker, campos, foco, superfícies e ações usam os tokens do
design system
E a ação primária é azul, enquanto verde permanece reservado a sucesso
E em tela pequena o diálogo parte de uma bottom sheet sem overflow.

### Cenário: seleção usa dropdown consistente

Dado um campo de seleção de tipo ou status
Quando a pessoa abre o controle com ponteiro ou teclado
Então vê um menu flutuante claro, arredondado e alinhado ao gatilho
E o item atual possui check e destaque azul-claro
E setas, Enter, Escape e retorno de foco seguem o padrão de listbox acessível.

### Cenário: evolução visual segue uma fonte de verdade

Dado que um agente altera ou cria uma superfície de frontend
Quando escolhe cor, tipografia, espaço, raio, sombra ou movimento
Então consulta `docs/design-system.md`
E reutiliza `frontend/styles/design-tokens.css` e os componentes catalogados
antes de criar um valor ou padrão novo.

### Cenário: experiência mobile-first e acessível é preservada

Dado um viewport de 320 px ou navegação por teclado
Quando a pessoa pesquisa, abre um prontuário ou opera marcadores
Então não existe overflow horizontal

### Cenário: conteúdo do paciente compartilha o container desktop

Dado que uma pessoa abre “Minha saúde” em um viewport desktop amplo
Quando o dashboard é renderizado
Então sua largura máxima e centralização seguem `--ds-layout-content`, como a
área profissional
E em viewport móvel o conteúdo continua fluido e sem overflow horizontal.
E busca, cards, metadados e ações permanecem legíveis e operáveis
E foco, rótulos, diálogos e reduced motion continuam funcionais.

### Cenário: navegação e estado vazio de marcadores não usam verde semântico

Dado que a pessoa consulta os marcadores de saúde no dashboard pessoal
Quando alterna entre ativos e histórico ou visualiza uma lista vazia
Então seleção, foco, contador, borda, superfície e ícone usam azul institucional
ou neutros do design system
E verde fica reservado a sucesso e estados clínicos positivos.

## Contratos afetados

### Tokens

- Fonte de verdade executável: `frontend/styles/design-tokens.css`.
- Prefixo público: `--ds-*`.
- Grupos obrigatórios: cor, tipografia, espaço, raio, sombra, movimento, layout
  e camadas.
- Tema escuro redefine os mesmos tokens semânticos sob `.dark`; componentes não
  devem selecionar cores diferentes por conta própria.

### Componentes

- Primitives compartilhados: `Button`, `Card`, `Badge`, `Avatar` e `Tooltip`.
- Padrões compostos documentados: page shell, section card, section heading,
  compact action, search field, select dropdown, list item, status/empty state e
  dialog.
- Todo campo de seleção da aplicação usa o primitive `ClinicalSelect`; novos
  `<select>` nativos não são permitidos sem justificativa de acessibilidade na
  spec.
- Componentes específicos de domínio podem manter sua marcação semântica, mas
  sua apresentação deve consumir tokens e os padrões do sistema.

### Compatibilidade

- Os aliases existentes (`--app-canvas`, `--ui-surface`, `--ui-border`,
  `--ui-blue`, `--ui-heading`, `--ink`, `--ink-soft`, `--sans`) permanecem
  disponíveis e passam a apontar para tokens `--ds-*`.
- Nenhuma propriedade de API, rota, texto funcional ou regra de autorização é
  alterada.

## Erros, segurança e privacidade

- Estados de erro usam superfície e texto de perigo, além de ícone ou mensagem;
  nunca somente a cor.
- A mudança visual não adiciona dados ao DOM, URL, storage, telemetria ou logs.
- CPF continua apenas no estado transitório da busca e nunca nos resultados.
- Autorização continua integralmente no backend.

## Estratégia de testes

1. RED: testes de contrato visual falham sem o arquivo de tokens, aliases e uso
   semântico na área médica, além de detectar a paleta e a serifada antigas e
   verde indevido nos controles e estado vazio dos marcadores.
2. GREEN: adicionar os tokens, importar a fonte de verdade e alinhar o CSS
   médico sem alterar a marcação funcional.
3. REFACTOR: substituir aliases e valores repetidos tocados por tokens e
   consolidar a documentação sem criar nova dependência.
4. Regressão: `npm test`, Playwright da área médica em 320 px e desktop, build
   do Next.js, `git diff --check` e inspeção responsiva.

### Evidência da correção de cores dos marcadores (2026-10-08)

- RED: `npm test -- --run tests/design-system.test.js` falhou no novo contrato
  porque `.marker-view-switch` ainda não usava `--ds-color-primary`.
- GREEN: o contrato passou após a troca por tokens azuis/neutros. A suíte E2E
  também verifica cores computadas da aba selecionada, contador e estado vazio
  após a remoção dos marcadores.
- Regressão: 29 testes unitários, 17 E2E e build do Next.js passaram. O build e
  os E2E foram executados contra cópia temporária isolada para não interferir
  no servidor local ativo.

## Critérios de aceite

- [x] Tokens semânticos claros e escuros estão versionados e importados.
- [x] Guia documenta fundações, componentes, estados, responsividade e exemplos.
- [x] `AGENTS.md` torna obrigatório reutilizar tokens e componentes.
- [x] Área médica não usa a paleta editorial antiga nem títulos serifados.
- [x] Diálogos clínicos usam título sans, foco azul e CTA primário azul.
- [x] Todos os selects atuais usam menu compartilhado com check e teclado.
- [x] Listagem e prontuário usam superfícies, azul, raios e sombras da plataforma.
- [x] CSS médico parte de 320 px e cresce com breakpoints `min-width`.
- [x] Busca, cards, ações e prontuário não causam overflow em tela pequena.
- [x] Fluxos e testes funcionais do Step 7 permanecem verdes.
- [x] Build, Playwright relevante e verificações do Git passam.

## Decisões e revisão

- Direção e implementação solicitadas e aprovadas pelo usuário em 2026-10-08.
- A entrega é um complemento visual do Step 7, sem reabrir seu escopo de API.
- A migração do CSS será incremental: tokens novos governam código tocado e
  aliases preservam superfícies legadas até que tenham uma demanda própria.
- Evidência RED: o teste de contrato visual falhou pela ausência de tokens,
  aliases, documentação e uso semântico; o teste do dropdown falhou pela
  ausência do `ClinicalSelect`. Ambos passaram após implementação.
- Playwright cobriu painel, prontuário e marcador em 320 px e desktop; diálogo e
  dropdown foram inspecionados visualmente em viewport 320 px, sem overflow.
- `npm test`: 27 testes aprovados; `npm run test:e2e`: 13 testes aprovados;
  `npm run build`: aprovado. `npm run lint` não executa porque `eslint` não está
  instalado no projeto.
- Implementado na branch `feat/medical-panel`, commit `9ac89b6`.
- Correção responsiva desktop solicitada em 2026-10-08: RED mediu dashboard do
  paciente em 1856 px contra o token de 1248 px; GREEN limita e centraliza o
  container em 1248 px (viewport 1920 px), compartilhando
  `--ds-layout-content` com a área profissional. Os cards de vacina passam a
  quebrar em grade 2+1 no desktop e seguem em coluna no mobile. 28 unitários,
  17 E2E e build isolado passaram.
