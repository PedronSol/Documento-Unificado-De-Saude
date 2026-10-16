# Design System — Documento Unificado de Saúde

## Propósito

Este documento é a fonte de verdade visual do produto. Ele traduz a identidade
do Documento Unificado de Saúde em decisões repetíveis para web: tokens,
componentes, estados, conteúdo, acessibilidade e responsividade.

Os valores executáveis vivem em `frontend/styles/design-tokens.css`. Este guia
explica quando e por que usá-los. A implementação é incremental: código novo ou
tocado segue o sistema; superfícies legadas migram quando entram no escopo de
uma entrega.

## Direção de design

A linguagem é **institucional clínica**: calma, clara, confiável e humana.
Informação de saúde deve parecer organizada e segura, sem se tornar fria ou
burocrática.

Quatro princípios orientam decisões:

1. **Clareza antes de decoração.** Hierarquia, rótulos e estado têm prioridade
   sobre ornamentos.
2. **Confiança pela consistência.** A mesma ação tem a mesma cor, forma e
   comportamento em todos os contextos.
3. **Densidade respirável.** Cards agrupam informação relacionada e preservam
   espaço suficiente para leitura clínica.
4. **Acessibilidade desde 320 px.** A menor tela, teclado, zoom e reduced motion
   são entradas de projeto, não correções finais.

### Assinatura visual

- Canvas cinza-azulado claro.
- Cards brancos, borda fria de 1 px e sombra curta de baixa opacidade.
- Azul institucional para ações, links, seleção e foco.
- Verde exclusivamente para sucesso ou condição clínica positiva.
- Títulos de interface em Instrument Sans, peso 650 e tracking levemente
  fechado.
- Cantos regulares e amplos; assimetria ornamental não pertence aos fluxos.
- Ícones Lucide lineares, normalmente entre 16 e 24 px.

## Tokens

Use sempre o token semântico — por exemplo, `--ds-color-primary` — e não o valor
bruto. Isso permite alterar tema e contraste sem editar cada componente.

### Cores

| Papel | Tema claro | Tema escuro | Uso |
|---|---:|---:|---|
| `canvas` | `#f1f3f6` | `#0e1829` | Fundo da aplicação |
| `surface` | `#ffffff` | `#172338` | Cards e painéis |
| `surface-muted` | `#f7f8fa` | `#1d2a40` | Campos e agrupamentos internos |
| `surface-raised` | `#ffffff` | `#223049` | Popover, menu e diálogo |
| `text` | `#122543` | `#f1f5fb` | Títulos e texto principal |
| `text-muted` | `#53647d` | `#b6c2d5` | Corpo secundário |
| `text-subtle` | `#71809a` | `#91a0b8` | Metadados e ajuda |
| `border` | `#e1e6ed` | `#2c3b55` | Separadores e cards |
| `primary` | `#174fc2` | `#7fa8ff` | Ação e seleção |
| `primary-soft` | `#eff4ff` | `#20365f` | Ação secundária e destaque leve |
| `success` | `#1d795e` | `#75cbae` | Sucesso e situação atualizada |
| `warning` | `#9a6818` | `#e1b665` | Atenção e pendência |
| `minor` | `#ad4a12` | `#f2a36b` | Identifica o contexto de paciente menor de idade |
| `minor-soft` | `#fdf0e6` | `#3d2717` | Fundo da faixa e do selo de menor |
| `minor-border` | `#f0c4a3` | `#6b4325` | Borda decorativa do contexto de menor |
| `danger` | `#9b433d` | `#ef9b95` | Erro e ação destrutiva |
| `focus` | `#4b80e8` | `#8bb0ff` | Anel de foco |

Não use verde como CTA primário nem vermelho apenas para chamar atenção. Todo
estado semântico combina cor com texto e, quando útil, ícone.

O tom alaranjado `minor` é exclusivo do contexto de dependente menor de idade
(spec `037`). Ele aparece somente na faixa de contexto, no selo
`Menor de idade`, na borda superior do cabeçalho do dashboard, no card da lista
de dependentes e no item ativo do seletor, sempre acompanhado do texto
`Menor de idade`. É aplicado pelo atributo `data-patient-tone="minor"` no
contêiner da área; componentes de feature não conhecem o contexto. Nunca use
`minor` para ação, foco, alerta, erro ou sucesso: botões e links continuam azuis.
Contraste do texto `minor`: 5,58:1 sobre `surface` e 4,99:1 sobre `minor-soft`
no tema claro; 7,67:1 e 6,81:1 no escuro.

### Tipografia

- Interface: `--ds-font-interface` — Instrument Sans com fallback Arial e
  sans-serif.
- Editorial: `--ds-font-editorial` — Newsreader, restrita a momentos de marca
  já existentes; não usar em módulos clínicos ou operacionais.
- Monoespaçada: `--ds-font-mono` — identificadores técnicos, nunca grandes
  blocos de leitura.

Escala:

| Token | Tamanho | Uso comum |
|---|---:|---|
| `2xs` | 10 px | Microtexto excepcional |
| `xs` | 12 px | Label, eyebrow, metadado |
| `sm` | 14 px | Corpo compacto e controles |
| `md` | 16 px | Corpo padrão |
| `lg` | 20 px | Subtítulo de card |
| `xl` | 24.8 px | Título de seção |
| `2xl` | 32 px | Título de página móvel |
| `3xl` | 40 px | Título de página amplo |

Pesos públicos são 400, 550, 650 e 700. Use line-height `tight` para títulos,
`body` para texto e `relaxed` para instruções longas. Texto corrido deve manter
entre 45 e 75 caracteres por linha quando houver espaço.

### Espaçamento

A base é 4 px. Tokens disponíveis: 0, 4, 8, 12, 16, 20, 24, 32, 40, 48 e
64 px (`--ds-space-0` a `--ds-space-16`). Prefira:

- 8 px entre ícone e rótulo;
- 12–16 px dentro de controles e itens compactos;
- 16 px de padding em cards móveis;
- 24–32 px de padding em cards amplos;
- 16–24 px entre seções relacionadas;
- 32–64 px para separar grupos de página.

### Forma, borda e elevação

| Token | Valor | Uso |
|---|---:|---|
| `radius-sm` | 8 px | Chips e elementos internos |
| `radius-control` | 10 px | Inputs e botões |
| `radius-card` | 18 px | Cards e seções |
| `radius-dialog` | 20 px | Diálogos |
| `radius-pill` | 999 px | Tabs segmentadas e badges |
| `shadow-card` | curta, 5% | Card no canvas |
| `shadow-raised` | média, 8% | Conteúdo elevado |
| `shadow-focus` | anel azul | `focus-within` composto |

Sombras não substituem bordas. Cards no canvas usam ambos; elementos dentro de
um card normalmente usam só borda ou mudança de superfície.

### Movimento

- `fast` 160 ms: hover, cor, borda e foco.
- `normal` 240 ms: expansão pequena e troca de estado.
- `slow` 420 ms: entrada discreta de lista.
- Curva padrão: `cubic-bezier(0.2, 0, 0, 1)`.

Anime apenas opacity e transform quando possível. Nenhuma informação depende
de animação. `prefers-reduced-motion: reduce` reduz todas as transições e
animações a uma mudança praticamente instantânea.

### Layout e camadas

- Gutter fluido: `--ds-layout-gutter`, de 10 a 32 px.
- Conteúdo clínico: máximo de `78rem`.
- Superfície ampla: máximo de `120rem`.
- Controle interativo: mínimo de `44px`.
- Camadas: sticky 10, overlay 40, dialog 50 e toast 60.

Não crie `z-index` arbitrário. Se um novo tipo de camada for necessário,
documente a relação com as camadas existentes.

## Componentes

### Arquitetura

Os primitives React ficam em `frontend/components/ui/`, incluindo
`ResourceError`/`ResourceNotice` (`resource-state.jsx`) para erro e aviso de
recurso. O shell autenticado fica em `components/shell/`. Componentes de domínio
ficam por feature: `auth`, `identity`, `patient`, `vaccines`, `alerts`,
`documents`, `markers`, `sharing`, `medical` e `admin` (spec `037`). Um
componente de domínio pode compor primitives, mas não deve redefinir visual de
botão, card ou badge sem uma variante concreta.

Os estilos ficam em `frontend/styles/`, um arquivo por responsabilidade.
`frontend/app/globals.css` é apenas o índice ordenado de `@import`; a ordem dos
imports é a ordem da cascata e não deve ser alterada sem revisar sobreposições.
Estilo novo entra no arquivo da feature correspondente.

### Primitives existentes

| Componente | Contrato visual e de uso |
|---|---|
| `Button` | CTA e ação; variantes default, secondary, outline, ghost, link e destructive |
| `Card` | Superfície com `CardHeader`, `CardTitle`, `CardDescription`, `CardAction`, `CardContent` e `CardFooter` |
| `Badge` | Estado curto; nunca substituir texto explicativo crítico |
| `Avatar` / `UserAvatar` | Foto ou iniciais; nome acessível continua no conteúdo |
| `Tooltip` | Explicação suplementar; nunca a única fonte de um rótulo |
| `Progress` | Progresso determinado; precisa de valor textual acessível |
| `Separator` | Separação visual, não estrutura de conteúdo |
| `ClinicalSelect` | Dropdown de seleção única com check, teclado e superfície clara |
| `ConfirmDialog` | Confirmação Radix AlertDialog com foco inicial em cancelar, erro inline e retorno de foco ao acionador |

### Padrões compostos

**Page shell**

- canvas da aplicação;
- gutter fluido;
- conteúdo centralizado com largura máxima apropriada;
- base em uma coluna, expandida somente quando há espaço real.

**Section card**

- surface, border, `radius-card` e `shadow-card`;
- padding de 16 px no móvel e até 24–32 px em viewport ampla;
- um título claro e, no máximo, uma ação principal no cabeçalho.

**Section heading**

- eyebrow azul opcional, em caixa alta e tamanho `xs`;
- título sans, peso 650;
- introdução curta em `text-muted`;
- ação compacta em `primary-soft` quando secundária.

**Search field**

- label persistente fora do campo;
- ícone à esquerda, input flexível e CTA explícito;
- no móvel, botão ocupa toda a largura abaixo do input;
- ajuda explica privacidade ou formato sem depender de placeholder.

**Campo de cadastro/acesso**

- use `RegistrationField`, `CpfField` e `PasswordField` de
  `components/auth/registration-fields.jsx`;
- obrigatório marcado com `*` decorativo (`aria-hidden`) após o rótulo, mais
  a nota "Campos marcados com * são obrigatórios." no início do formulário;
- senha com botão de visualização de 44 px, rótulo fixo e `aria-pressed`;
- erro de campo abaixo do controle, ligado por `aria-describedby`.

**Explicação (i)**

- botão de 44 px com rótulo "Sobre …" que abre o `Tooltip` por hover, foco,
  clique ou toque;
- o tooltip só explica; ações ficam fora dele, ao lado do valor.

**Select dropdown**

- use `ClinicalSelect` em vez de `<select>` nativo;
- gatilho usa surface muted, borda fria e chevron;
- menu usa surface elevada, `radius-control` e `shadow-raised`;
- item selecionado mostra check e fundo `primary-soft`;
- hover/foco usam azul sem alterar a paleta clara do produto;
- o menu respeita largura do gatilho, colisão com viewport e navegação por
  setas, Enter e Escape fornecida pelo Radix Select.

**Nome de marcador com sugestões**

- `MarkerNameField`, em `components/markers/`, é um combobox editável de domínio;
  reutiliza o diálogo clínico nos contextos paciente, dependente e médico.
- Ícone de busca, chevron e orientação permitem escolher ou escrever nome livre.
- Dropdown ancorado imediatamente abaixo da busca, com a mesma largura e
  sobreposição aos campos seguintes; abrir/fechar não desloca o formulário.
- Menu com altura limitada, rolagem interna, sombra e camada de dropdown; grupos
  com ícone decorativo e texto em cores institucionais.
- Opções com pelo menos 44 px, quebra de nomes longos e destaque de foco por azul.
- Foco permanece no campo, setas navegam e Enter escolhe; primeiro Escape fecha
  a lista, segundo segue o fechamento do diálogo. Tab não confirma uma sugestão.
- Nome escolhido não define tipo, valor, unidade nem interpretação clínica.

**List item**

- card de borda regular, avatar/ícone, conteúdo e ação;
- no móvel, ação vira uma linha inteira de pelo menos 44 px;
- hover pode elevar até 2 px, sem deslocar conteúdo adjacente.

**Empty, loading e error state**

- título ou mensagem em linguagem humana;
- ícone semântico opcional;
- erro oferece recuperação quando a operação puder ser repetida;
- loading anuncia `role="status"`; erro usa `role="alert"` quando imediato.

**Dialog**

- Radix Dialog/AlertDialog para foco, teclado, Escape e retorno ao acionador;
- em telas pequenas, folha inferior com ações visíveis;
- em telas amplas, painel centralizado;
- ação destrutiva é explícita e nunca recebe foco inicial automaticamente.
- confirmações simples reutilizam `ConfirmDialog`; formulários usam Radix
  Dialog com `clinical-dialog`.

**Digitalizador de documento**

- é uma alternativa dentro do diálogo de upload, nunca uma captura automática;
- solicita câmera somente após gesto explícito, sem áudio e com preferência não
  obrigatória pela câmera traseira;
- alterna entre prévia ao vivo, revisão estática e refazer, mantendo o seletor
  de arquivo sempre disponível;
- encerra todas as tracks e descarta a prévia ao capturar, trocar de origem,
  fechar ou desmontar;
- usa os mesmos campos, limite e confirmação do upload de arquivo.

**Tabs ou seletor segmentado**

- pill com superfície muted e item ativo sobre surface;
- `aria-pressed`, Tabs ou semântica equivalente;
- rótulo e contagem permanecem legíveis em zoom.
- Para contas com múltiplos contextos, no mobile o seletor vira um dock branco
  flutuante junto ao rodapé, com ícones, rótulos e área segura; em viewport de
  1200 px ou maior permanece no cabeçalho somente em desktop com ponteiro fino
  e hover. Dispositivos touch mantêm o dock mesmo em viewports CSS amplos.
- No seletor de contexto, somente o item ativo exibe o nome; os demais mostram
  apenas o ícone (alvo mínimo de 44 × 44 px), revelam o nome no hover e no
  foco visível e mantêm o nome completo como nome acessível.
- Renderize o dock fora de headers sticky/transformed e valide que seu limite
  inferior acompanha a safe area do viewport, não somente `position: fixed`.

### Estados obrigatórios

Todo componente interativo considera:

- default, hover e focus-visible;
- active/pressed/selected quando aplicável;
- disabled com semântica nativa, não só opacidade;
- loading sem permitir submissão duplicada;
- erro associado ao campo ou à região;
- empty e sucesso quando representam recursos assíncronos.

## Acesso e cadastro de paciente

- Login e cadastro compartilham a moldura institucional e a mesma hierarquia
  tipográfica; o cadastro não cria uma linguagem visual paralela.
- No cadastro, a escolha entre e-mail/senha e Google usa controle segmentado
  com estado pressionado explícito. Google é uma alternativa, nunca requisito.
- No login (spec `044`), o formulário por senha permanece visível e o botão
  Google aparece abaixo, separado por `ou`, inclusive para conta lembrada.
  O botão reutiliza o componente oficial existente e fica fora do submit por
  senha. Sem configuração, uma nota explica a indisponibilidade no ambiente.
- O formulário começa em uma coluna a 320 px. CPF e data de nascimento somente
  dividem linha a partir de 768 px, quando há largura útil para preservar labels
  e alvos de 44 px.
- A credencial Google permanece apenas no estado em memória durante o
  onboarding. Nenhuma interface deve gravá-la em storage ou exibi-la em campo.
- Configurações pode oferecer vinculação Google explícita sem desativar o login
  local existente.

## Mobile-first e responsividade

O CSS-base representa a tela de 320 px. Componentes crescem por conteúdo e por
breakpoints `min-width`. Breakpoints não são metas de dispositivo, mas pontos
em que o conteúdo exige outra composição.

| Faixa de referência | Estratégia |
|---|---|
| 0–479 px | Uma coluna, ação full-width, padding 16 px ou menor |
| 480–767 px | Mais espaço interno; ainda prioriza uma coluna |
| 768–1023 px | Cabeçalhos e cards podem dividir conteúdo e ação |
| 1024–1279 px | Grids de módulos quando melhoram leitura |
| 1280 px+ | Conteúdo para na largura máxima; não esticar linhas |

O limite padrão de conteúdo para dashboards e áreas de trabalho é
`--ds-layout-content` (78 rem). Superfícies de fundo podem continuar em largura
total; o conteúdo centralizado da área pessoal e da área profissional deve
compartilhar esse limite para preservar hierarquia e legibilidade.

Regras:

- teste obrigatório em 320 px e em uma viewport ampla;
- `min-width: 0` em filhos flex/grid que recebem texto variável;
- texto clínico quebra; não truncar informação necessária à decisão;
- tabelas densas devem virar cards ou usar scroll local rotulado;
- modais mantêm cabeçalho e ações alcançáveis com teclado virtual;
- alvos têm 44 × 44 px sempre que são ações independentes;
- zoom de 200% não pode ocultar conteúdo nem exigir scroll em duas direções.

## Acessibilidade

- Contraste mínimo: 4.5:1 para texto normal e 3:1 para texto grande, ícones
  essenciais e limites de controles.
- Foco usa `--ds-color-focus`, 3 px e offset de 3 px.
- Ordem visual acompanha a ordem do DOM.
- Labels persistentes identificam campos; placeholder é somente exemplo.
- Ícones decorativos usam `aria-hidden="true"`; icon buttons precisam de nome.
- Não usar cor, posição ou animação como único indicador.
- Respeitar `prefers-reduced-motion` e evitar auto-play.
- Mensagens de status devem ser anunciadas sem roubar foco indevidamente.

## Conteúdo e iconografia

- Use português direto: “Buscar”, “Tentar novamente”, “Voltar para pacientes”.
- Títulos usam sentence case; labels curtos podem usar caixa alta visual via CSS.
- Erros explicam o que ocorreu e a próxima ação possível, sem detalhes internos.
- Privacidade é contextual: explique por que CPF ou dado sensível é solicitado.
- Use Lucide com stroke padrão; 16 px em controles, 20–24 px em cabeçalhos e
  até 32 px em estados vazios.
- Não misture bibliotecas de ícone na mesma superfície.

## Uso

CSS de um card:

```css
.example-card {
  padding: var(--ds-space-4);
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-card);
  background: var(--ds-color-surface);
  box-shadow: var(--ds-shadow-card);
  color: var(--ds-color-text);
}

@media (min-width: 48rem) {
  .example-card {
    padding: var(--ds-space-6);
  }
}
```

Composição React:

```jsx
<Card className="patient-module">
  <CardHeader>
    <CardTitle>Histórico de vacinação</CardTitle>
    <CardAction>
      <Button variant="secondary">Adicionar vacina</Button>
    </CardAction>
  </CardHeader>
  <CardContent>{content}</CardContent>
</Card>
```

## Faça e não faça

Faça:

- reutilize tokens semânticos e componentes existentes;
- comece em 320 px e expanda a composição;
- reserve azul para interação e verde para sucesso;
- combine estado visual com texto;
- mantenha cards regulares e hierarquia sans-serif em fluxos clínicos.

Não faça:

- copie hex, radius ou shadow para uma nova área;
- crie um hero ornamental para diferenciar uma role;
- use título serifado em busca, prontuário ou formulário;
- reduza uma grade desktop por exceções sucessivas de `max-width`;
- esconda dado necessário, ação ou erro para caber no móvel;
- crie primitive novo enquanto uma variante do existente resolve o caso.

## Governança

Toda mudança visual deve:

1. identificar o token e o componente existentes;
2. justificar qualquer novo valor por um consumidor atual;
3. atualizar este guia e `design-tokens.css` no mesmo commit quando o contrato
   público mudar;
4. cobrir 320 px e uma viewport ampla;
5. verificar teclado, foco, contraste, reduced motion e overflow;
6. manter aliases legados somente como ponte de migração.

Uma quebra de token ou primitive exige registro na spec da entrega. Remoções
devem ser anunciadas antes e feitas somente após migrar todos os consumidores.

## Checklist de revisão visual

- [ ] Usa tokens `--ds-*`, sem novo valor isolado.
- [ ] Reutiliza primitive ou padrão composto catalogado.
- [ ] Funciona e não transborda em 320 px.
- [ ] A composição ampla respeita a largura máxima.
- [ ] Texto continua legível com zoom e conteúdo longo.
- [ ] Hover, focus-visible, disabled, loading, empty e error estão cobertos.
- [ ] Cor não é o único indicador.
- [ ] Movimento respeita reduced motion.
- [ ] Mudança compartilhada tem regressão nos consumidores.
