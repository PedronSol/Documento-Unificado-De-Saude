# Organização Incremental do Frontend

## Status

SPEC APPROVED

## Dependências

- Steps 3 e 4 e specs `003-unified-identity-roles-frontend.md` e
  `004-resource-contracts-authorization.md`, implementados.
- Features atendidas até aqui: Steps 7 a 11 e 15 (specs `010`, `020`, `030`,
  `031`, `032`, `033`, `034`, `035`, `036`, `040`, `007`, `008`), implementados.
- Step 13 do roadmap. O OCR (Step 12) foi postergado e trará sua própria
  interface de revisão já dentro da organização definida aqui.

## Contexto e problema

Toda a experiência autenticada vive em uma única rota, `/home`. O componente
`AuthenticatedHome` carrega `/me`, calcula contextos, mantém o contexto ativo em
estado local e renderiza o dashboard de paciente, de dependente, médico ou
administrativo. Consequências atuais:

- não existe URL por área nem por prontuário; recarregar a página ou usar o
  botão voltar sempre retorna ao contexto padrão, e não é possível abrir
  diretamente o prontuário de um paciente vinculado;
- `patient-dashboard.jsx` (644 linhas) concentra vacinas, alertas, documentos,
  marcadores, convites e compartilhamento; `doctor-dashboard.jsx` (761 linhas)
  concentra busca, lista, prontuário, cadastro assistido e correção;
- a identidade e o paciente atuante (`X-Acting-Patient`) ficam espalhados entre
  estado local do `AuthenticatedHome`, props repassadas em cascata e uma
  variável de módulo em `lib/api.js`;
- cada recurso repete o mesmo ciclo `loading → 401 → erro → pronto`, e as
  respostas `403`, `409` e `422` são tratadas de forma diferente por componente
  (somente 401 é consistente);
- `app/globals.css` possui cerca de 4.700 linhas com estilos de todas as áreas
  misturados, o que dificulta localizar, revisar e remover regras;
- a pasta `components/health-passport/` mistura componentes ativos
  (`digital-documents`, `medical-alerts`) com código legado sem consumidor
  (`bottom-navigation`, `sidebar-navigation`, `qr-card`, `vaccination-history`,
  `header`, `theme-provider`), e `mocks/mock_data.js` não é importado por
  nenhum módulo.

O backend já aplica autenticação, role, ownership, vínculo e guarda em cada
rota. Este step reorganiza somente o frontend; ele não muda contratos de API.

## Objetivos

- Criar áreas navegáveis por URL: `patient`, `medical`, `admin` e `share`.
- Redirecionar o usuário autenticado para a área padrão do seu papel, inclusive
  quando ele acessar por URL uma área sem permissão.
- Centralizar identidade e paciente atuante em um store Zustand, carregando
  `/me` uma única vez por sessão de navegação.
- Separar componentes, estado e estilos por feature, aplicando SOLID sem criar
  camadas sem consumidor.
- Padronizar o tratamento de `401`, `403`, `404`, `409`, `422` e `503`.
- Modularizar o CSS por área e feature sem alterar o visual.
- Permitir ao responsável listar seus dependentes, abrir a saúde de cada um no
  mesmo padrão visual do paciente e reconhecer imediatamente, por um tom
  alaranjado acompanhado de texto, quando está vendo os dados de um menor.
- Remover código legado e mocks sem consumidor.
- Preservar integralmente o comportamento, o visual e a acessibilidade
  entregues pelos steps anteriores, inclusive o dock de contexto.

## Não objetivos

- Alterar endpoints, payloads, códigos de status ou regras do backend.
- Tratar o roteamento do frontend como autorização; o backend continua sendo a
  única fonte de autorização.
- Redesenhar telas, criar nova linguagem visual ou alterar valores de tokens.
- Migrar para CSS Modules, Tailwind ou CSS-in-JS; a modularização mantém os
  nomes de classe atuais.
- Persistir estado do Zustand em `localStorage`, `sessionStorage`, IndexedDB ou
  service worker.
- Usar Zustand como cache de dados clínicos de API ou adicionar React Query,
  SWR, Redux ou outra biblioteca de estado.
- Criar sub-rotas para abas internas do painel administrativo ou para seções do
  dashboard do paciente.
- Criar dashboard próprio para dependente, novo endpoint de dependentes ou
  alterar regras de guarda, maioridade e transferência da spec `036`.
- Usar o tom alaranjado como cor de ação, alerta ou erro.
- Implementar a interface do OCR (Step 12).
- Mudar o fluxo de login, cadastro, convite profissional, reivindicação de
  conta, configurações ou resumo público além do destino do redirect.

## Vocabulário

- **Área:** conjunto de rotas de um papel (`/patient`, `/medical`, `/admin`) ou
  público (`/share`).
- **Shell autenticado:** layout comum às áreas autenticadas; dispara a carga de
  `/me`, apresenta cabeçalho, menu da conta e seletor de contexto.
- **Área padrão:** a primeira disponível na ordem `patient` (com perfil de
  paciente) → `medical` → `admin`; é a mesma regra de contexto padrão atual.
  Conta sem nenhum contexto tem `/home` como área padrão, com o perfil
  institucional seguro.
- **Contexto de dependente:** área do paciente atuando por um dependente com
  guarda ativa, enviando `X-Acting-Patient` (spec `036`).

## Regras de negócio e técnicas

### Rotas e redirecionamento

1. As rotas autenticadas passam a ser:

   | Rota | Conteúdo | Contexto exigido no `/me` |
   |---|---|---|
   | `/home` | resolve a área padrão e redireciona | sessão válida |
   | `/patient` | dashboard do próprio paciente | role `patient` com `patient_profile` |
   | `/patient/dependents` | lista dos dependentes do responsável | role `patient` com ao menos um item em `dependents` |
   | `/patient/dependents/[patientId]` | dashboard do dependente | `patientId` presente em `dependents` |
   | `/medical` | lista e busca de pacientes do médico | role `doctor` |
   | `/medical/patients/[patientId]` | prontuário do paciente | role `doctor` |
   | `/admin` | painel administrativo atual, com suas abas | role `admin` |
   | `/settings` | configurações (inalterada) | sessão válida |

   `/`, `/register`, `/patient-claim`, `/professional-invitation` e `/share`
   permanecem públicas e com o mesmo comportamento.
2. Login, cadastro, reivindicação e aceite de convite continuam navegando para
   `/home`. `/home` aguarda a identidade e faz `replace` para a área padrão, de
   modo que o botão voltar não retorne a `/home`.
3. O seletor de contexto e qualquer navegação exibem somente as áreas e os
   dependentes liberados na identidade. Rotas sem permissão nunca aparecem como
   link.
4. Acessar por URL uma área cujo papel a identidade não possui faz `replace`
   para a área padrão. Enquanto a identidade não estiver pronta, a área mostra
   somente o estado de carregamento do shell; nenhum conteúdo nem requisição
   da área sem permissão é feito antes do redirect.
5. `/patient/dependents/[patientId]` com ID ausente de `dependents` também faz
   `replace` para a área padrão, sem enviar nenhuma requisição com esse
   `X-Acting-Patient`. Essa checagem é somente de experiência; a guarda
   continua validada pelo backend em cada requisição.
6. `/medical/patients/[patientId]` aceita somente inteiro positivo seguro; outro
   valor mostra `Paciente não encontrado.` sem chamar a API, pois o médico possui
   a área e o problema é o recurso. O prontuário usa a rota existente
   `/medical/patients/{patient_id}`; `403` e `404` do backend exibem
   respectivamente o estado de acesso negado e o de paciente não encontrado,
   sem manter dados do paciente anterior em tela.
7. O ID na URL é o ID interno já usado pela API, nunca CPF, nome ou e-mail. A
   URL não carrega query string com dado pessoal ou clínico.
8. Voltar do prontuário para a lista usa navegação real (`/medical`), e o botão
   voltar do navegador produz o mesmo resultado.

### Dependentes

9a. `/patient/dependents` lista os dependentes com guarda ativa a partir de
    `identity.dependents` do store, sem novo endpoint. Cada item mostra avatar,
    nome preferido, nome completo, idade, o selo `Menor de idade` quando
    `is_adult` é falso, se possui acesso próprio e o link
    `Ver saúde de {preferred_name}` para `/patient/dependents/[patientId]`.
    A ordem é a mesma do backend (nome preferido, depois ID).
9b. O link `Meus dependentes` aparece na área do paciente somente quando há
    ao menos um dependente. O painel `Responsabilidade legal` substitui o texto
    `Use o seletor de contexto…` pelo mesmo link `Ver saúde de …` em cada item
    e mantém suas ações atuais (transferência e renúncia). Pedidos de guarda
    pendentes continuam no painel e não entram na lista.
9c. Acessar `/patient/dependents` sem nenhum dependente faz `replace` para a
    área padrão, conforme a decisão 1. Ao renunciar ou transferir uma guarda,
    `refreshIdentity()` atualiza a lista, o seletor e os redirects.
9d. `/patient/dependents/[patientId]` reutiliza o mesmo dashboard e os mesmos
    componentes do paciente, sem duplicar feature por contexto. Acima do
    conteúdo, uma faixa de contexto identifica `Você está vendo a saúde de
    {preferred_name}`, a idade e o link `Voltar aos meus dependentes`.
9e. Quando o dependente é menor (`is_adult` falso), a área recebe o tema de
    menor: faixa de contexto, selo `Menor de idade`, borda superior do
    cabeçalho do dashboard e indicador do item ativo no seletor de contexto
    usam os tokens `--ds-color-minor*`. Dependente adulto usa a mesma faixa com
    os tokens neutros/azuis existentes, sem tom alaranjado.
9f. O tom alaranjado nunca é o único indicador: o selo e a faixa trazem texto
    explícito (WCAG 1.4.1). Botões de ação, foco, links e estados de sucesso,
    alerta e erro continuam com os tokens semânticos existentes; o tema de menor
    não muda cor de CTA nem de feedback.
9g. Novos tokens, definidos em `styles/design-tokens.css` e documentados em
    `docs/design-system.md` na mesma entrega:

    | Token | Claro | Escuro | Uso |
    |---|---|---|---|
    | `--ds-color-minor` | `#ad4a12` | `#f2a36b` | Texto, ícone e borda do contexto de menor |
    | `--ds-color-minor-soft` | `#fdf0e6` | `#3d2717` | Fundo da faixa e do selo |
    | `--ds-color-minor-border` | `#f0c4a3` | `#6b4325` | Borda decorativa |

    Contraste medido: `minor` sobre `surface` 5,58:1 e sobre `minor-soft`
    4,99:1 no tema claro; 7,67:1 e 6,81:1 no escuro. Um teste de design system
    garante pelo menos 4,5:1 para texto nos dois temas.
9h. O tema é aplicado por atributo de dados no contêiner da área
    (`data-patient-tone="minor"`), e não por classes ou cores espalhadas nos
    componentes de feature, que permanecem sem conhecimento do contexto.
9i. A rota e a lista usam somente dados já autorizados em `/me`; o acesso aos
    dados clínicos do dependente continua validado pelo backend a cada
    requisição com `X-Acting-Patient`.

### Estado com Zustand

9. `zustand` é adicionado como dependência do frontend, com versão fixada no
   `package-lock.json`. Ele atende ao estado compartilhado entre rotas que hoje
   é repassado por props e por variável de módulo.
10. `stores/session-store.js` é o único store desta entrega e contém:

    | Campo/ação | Responsabilidade |
    |---|---|
    | `status` | `idle`, `loading`, `ready`, `error` ou `unauthenticated` |
    | `identity` | resposta de `/me` (`user`, `patient_profile`, `dependents`) |
    | `error` | mensagem segura do último erro de identidade |
    | `actingPatientId` | dependente atuante ou `null` |
    | `loadIdentity()` | chama `/me` uma vez; ignora chamadas enquanto `loading`/`ready` |
    | `refreshIdentity()` | recarrega `/me` explicitamente (ex.: mudança de guarda) |
    | `setActingPatient(id)` | define ou limpa o dependente atuante |
    | `reset()` | volta ao estado inicial; usado em logout e `401` |

11. Regras derivadas (contextos, área padrão, permissão de rota, dependente
    válido) são funções puras em `lib/areas.js`, testadas sem React e sem store.
    Componentes leem o store por seletores específicos para evitar renderizações
    desnecessárias.
12. `apiFetch` lê `actingPatientId` por `useSessionStore.getState()` e envia
    `X-Acting-Patient` somente quando o valor não é `null`. A variável de módulo
    e a função `setActingPatient` de `lib/api.js` deixam de existir.
13. A rota de dependente define `actingPatientId` antes de renderizar qualquer
    componente que faça requisição e o limpa ao desmontar; toda rota que não seja
    de dependente garante `null`. `reset()` sempre limpa o valor.
14. O store não usa middleware `persist`; recarregar a página busca `/me` de
    novo. Nenhum dado clínico de recurso (vacinas, documentos, marcadores,
    prontuário) entra no store; esses dados continuam locais à feature que os
    exibe e são descartados ao sair da rota.
15. Estado de UI efêmero (diálogo aberto, campos de formulário, filtro local)
    permanece em `useState` dentro do componente.
16. Novos stores só podem ser criados por uma spec que demonstre estado
    compartilhado entre rotas ou componentes distantes.

### Shell autenticado

17. Um layout de grupo de rotas autenticado envolve `/home`, `/patient/*`,
    `/medical/*` e `/admin` e chama `loadIdentity()` ao montar. Navegar entre
    áreas não recarrega `/me`.
18. Estados de carregamento, erro com `Tentar novamente` e `401` do `/me`
    mantêm os textos e o comportamento atuais de `AuthenticatedHome`.
19. O cabeçalho, o menu da conta, o avatar e o logout migram para o shell sem
    alteração visual. O avatar mostra o perfil do paciente somente em
    `/patient`, como hoje.
20. O seletor de contexto passa a ser navegação por links (`<a>` com
    `aria-current="page"` no contexto ativo) para as rotas das áreas e dos
    dependentes. Ele preserva todas as regras das specs `032` e `033`: dock
    inferior flutuante abaixo de 1200 px ou em dispositivo touch, cabeçalho
    somente em desktop com ponteiro fino a partir de 1200 px, safe area, espaço
    rolável reservado, ausência em contas de um único contexto e posicionamento
    fora de ancestrais sticky/transformados.

### Organização por feature e SOLID

21. Estrutura alvo de `frontend/`:

    ```text
    app/
      (authenticated)/layout.jsx        shell autenticado
      (authenticated)/home/page.jsx     resolve área padrão
      (authenticated)/patient/...       páginas finas de composição
      (authenticated)/medical/...
      (authenticated)/admin/page.jsx
      share/, settings/, register/, ... (inalteradas)
      globals.css                       somente imports e base global
    components/
      ui/          primitivas do design system (inalteradas)
      shell/       cabeçalho, menu da conta, seletor de contexto, guard de área
      auth/        login, cadastro, convite, reivindicação (inalterados)
      identity/    perfil institucional, avatar, configurações
      patient/     dashboard do paciente e painéis de guarda/convites
      vaccines/    lista e diálogo de vacinas
      alerts/      alertas médicos
      documents/   documentos digitais
      markers/     marcadores de saúde
      sharing/     compartilhamento e resumo público
      medical/     lista de pacientes, prontuário, vínculo e cadastro assistido
      admin/       painel administrativo (inalterado internamente)
      pwa/
    hooks/         hooks com mais de um consumidor (useApiResource)
    lib/
      api.js       cliente HTTP central e leitura de erros
      areas.js     regras puras de área, contexto e rota
    stores/
      session-store.js
    styles/
      design-tokens.css                 inalterado
      base.css, shell.css, auth.css, patient.css, vaccines.css, ...
    ```

22. Princípios SOLID aplicados de forma concreta, sem interfaces vazias:
    - **Responsabilidade única:** páginas de `app/` só compõem; componentes de
      feature só apresentam e orquestram a própria feature; `lib/areas.js` só
      decide área e permissão de navegação; `lib/api.js` só faz HTTP e leitura
      de erro; o store só guarda sessão e paciente atuante.
    - **Aberto/fechado:** áreas, rótulos e ícones de contexto ficam em uma tabela
      de configuração em `lib/areas.js`; incluir uma área nova não exige alterar
      o shell nem o seletor.
    - **Substituição de Liskov:** `DigitalDocuments` e `HealthMarkers` mantêm um
      único contrato de props para paciente e médico; o modo somente leitura não
      quebra o comportamento esperado pelo consumidor.
    - **Segregação de interfaces:** componentes recebem apenas as props de que
      precisam e leem do store por seletores específicos, em vez de receber a
      identidade inteira.
    - **Inversão de dependência:** features dependem de `apiFetch`,
      `useApiResource` e do store por import de módulo; testes substituem
      `fetch` e o estado do store sem mockar o componente.
23. Páginas em `app/` não contêm `fetch`, regras de papel além do guard de
    experiência nem markup extenso.
24. `patient-dashboard.jsx` passa a compor seções de feature; a lista e o
    diálogo de vacinas saem para `components/vaccines/`. `doctor-dashboard.jsx`
    é dividido em lista/busca (`/medical`) e prontuário
    (`/medical/patients/[patientId]`). Nenhum arquivo de componente de feature
    deve passar de cerca de 400 linhas como resultado desta divisão.
25. Componentes compartilhados entre paciente e médico (`DigitalDocuments`,
    `HealthMarkers`) mudam de pasta, mas mantêm uma única implementação; não são
    duplicados por área.
26. Mover arquivos não altera markup, classes CSS, textos ou atributos de
    acessibilidade. Testes existentes continuam válidos com ajuste apenas de
    imports, estado inicial do store e navegação por URL.
27. Removem-se os arquivos sem consumidor: `health-passport/bottom-navigation`,
    `sidebar-navigation`, `qr-card`, `vaccination-history`, `header`,
    `theme-provider` e `mocks/mock_data.js`, junto com a pasta `mocks/`. As
    primitivas de `components/ui/` permanecem como catálogo do design system,
    mesmo as ainda sem consumidor (`Tooltip`, `Progress`).

### CSS modularizado

28. `app/globals.css` é dividido em arquivos por responsabilidade em `styles/`:
    `base.css` (reset, tipografia, utilitários globais, safe area), `shell.css`
    (cabeçalho, menu da conta, dock e seletor), `auth.css`, `patient.css`,
    `vaccines.css`, `alerts.css`, `documents.css`, `markers.css`,
    `sharing.css`, `medical.css`, `admin.css` e `settings.css`. Arquivos
    pequenos demais podem ser unidos à área consumidora em vez de criados.
29. `app/globals.css` passa a conter somente os `@import` em ordem fixa:
    `design-tokens.css`, `base.css`, `shell.css` e depois as features. A ordem
    preserva a cascata atual; nenhuma regra muda de seletor, valor ou ordem
    relativa dentro de uma mesma especificidade.
30. Os nomes de classe atuais são preservados; não há migração para CSS Modules
    nesta entrega, evitando alteração de markup e de seletores de teste.
31. Cada regra pertence a exatamente um arquivo. Regras duplicadas encontradas
    durante a divisão são unificadas apenas quando o resultado computado for
    idêntico; o restante é registrado sem alteração.
32. Seletores sem nenhum consumidor no código são removidos somente após busca
    confirmar a ausência de uso, inclusive em classes montadas dinamicamente.
33. Os guardrails de `tests/design-system.test.js` passam a ler todos os
    arquivos de `styles/` em vez de somente `app/globals.css`, e um teste novo
    garante que `app/globals.css` contém apenas `@import`.
34. Novos estilos continuam consumindo tokens `--ds-*`, mobile-first com
    `min-width`, conforme `docs/design-system.md`.

### Cliente HTTP e erros

35. `apiFetch` continua sendo o único cliente HTTP autenticado, com
    `credentials: "include"`, e `publicApiFetch` o único cliente público.
36. `lib/api.js` ganha `readApiError(response, fallback)`, que devolve
    `{ status, message }` sem lançar, segundo a tabela:

    | Status | Mensagem exibida |
    |---|---|
    | `401` | não exibe; o chamador aciona o fluxo de sessão expirada |
    | `403` | `Você não tem permissão para esta ação.` |
    | `404` | `detail` do backend quando for string; senão o `fallback` |
    | `409` | `detail` do backend quando for string; senão o `fallback` |
    | `422` | `detail` quando for string; quando for a lista padrão do FastAPI, `Revise os campos destacados e tente novamente.` |
    | `503` e demais | `fallback` do recurso (por exemplo, `Não foi possível carregar suas vacinas.`) |

    Corpo vazio ou não-JSON nunca quebra a interface e cai no `fallback`.
    Mensagens nunca exibem stack, SQL, URL interna nem JSON bruto.
    Um terceiro parâmetro opcional, `overrides` (`{ status: mensagem }`),
    permite a uma feature dar significado de domínio a um status específico
    (por exemplo, `403` de data de nascimento divergente na guarda, `413` de
    arquivo grande, ou conflitos do vínculo médico que não podem confirmar a
    existência de um CPF). `overrides` nunca se aplica a `401`. Falhas de rede
    usam sempre o `fallback`.
37. `useApiResource(path, { fallback })` encapsula o ciclo
    `loading → ready | error` com `reload()`, cancelamento ao desmontar e fluxo
    de sessão expirada em `401`. Ele é adotado nos recursos de leitura que hoje
    repetem esse ciclo (vacinas, alertas, documentos, marcadores,
    compartilhamentos, convites, guardas, lista e prontuário médicos). Mutações
    continuam explícitas em cada feature e usam `readApiError` para a mensagem.
    Exceções registradas: marcadores mantêm estado local porque o prontuário
    médico entrega a timeline já carregada, e convites de cuidado carregam
    quatro listas em paralelo com um único estado; ambos usam `readApiError` e
    mensagens constantes em falhas de rede.
38. O fluxo de sessão expirada chama `reset()` do store e navega para `/` com
    `replace`, como hoje.
39. Falha de um recurso continua isolada: não apaga nem bloqueia os demais
    recursos já carregados (comportamento atual das specs `005`, `010` e `020`).

## Matriz de experiência por rota

A matriz descreve somente a experiência; cada endpoint mantém a autorização
própria do backend (spec `004`). "→ padrão" significa `replace` para a área
padrão sem requisições da rota acessada.

| Rota | Paciente | Paciente menor | Responsável | Médico | Admin | Sem sessão |
|---|---|---|---|---|---|---|
| `/home` | → `/patient` | → `/patient` | → `/patient` | → `/medical`* | → `/admin` | → `/` |
| `/patient` | conteúdo | leitura | conteúdo | → padrão* | → padrão | → `/` |
| `/patient/dependents` | → padrão | → padrão | lista | → padrão | → padrão | → `/` |
| `/patient/dependents/[id]` | → padrão | → padrão | conteúdo se dependente; senão → padrão | → padrão | → padrão | → `/` |
| `/medical`, `/medical/patients/[id]` | → padrão | → padrão | → padrão | conteúdo; backend decide o prontuário | → padrão | → `/` |
| `/admin` | → padrão | → padrão | → padrão | → padrão | conteúdo | → `/` |

\* Conta combinada `patient`+`doctor` tem `/patient` como padrão e acessa
`/medical` normalmente pelo seletor.

## Cenários de aceitação

### Cenário: redirecionar após login conforme papel

Dado um médico verificado sem perfil de paciente
Quando ele faz login
Então o navegador termina em `/medical`
E o botão voltar não retorna a `/home`.

### Cenário: conta combinada alterna por URL

Dado uma conta com `patient` e `doctor`
Quando ela seleciona `Área profissional` no seletor de contexto
Então a URL muda para `/medical`
E o item ativo possui `aria-current="page"`
E `/me` não é requisitado novamente.

### Cenário: abrir prontuário por link direto

Dado um médico com vínculo ativo ao paciente 42
Quando ele abre `/medical/patients/42` em uma nova aba
Então o prontuário do paciente 42 é exibido
E voltar leva a `/medical`.

### Cenário: prontuário sem vínculo

Dado um médico sem vínculo com o paciente 77
Quando ele abre `/medical/patients/77`
Então o backend responde `403` ou `404`
E a tela mostra o estado correspondente sem dados de outro paciente.

### Cenário: área sem permissão acessada por URL

Dado um paciente sem role `doctor`
Quando ele abre `/medical` digitando a URL
Então é redirecionado com `replace` para `/patient`
E nenhuma requisição a `/medical/*` é feita
E o seletor de contexto não exibe `Área profissional`.

### Cenário: dependente por URL

Dado um responsável com guarda ativa do dependente 15
Quando ele abre `/patient/dependents/15`
Então todas as requisições clínicas enviam `X-Acting-Patient: 15`
E ao navegar para `/patient` as requisições deixam de enviar o header.

### Cenário: listar dependentes

Dado um responsável com um dependente de 8 anos e outro de 19 anos
Quando ele abre `Meus dependentes`
Então vê os dois itens com nome, idade e link `Ver saúde de …`
E somente o de 8 anos exibe o selo `Menor de idade` no tom alaranjado.

### Cenário: ver saúde de um menor

Dado um responsável com guarda ativa do dependente menor 15
Quando ele abre `Ver saúde de Ana`
Então vê o mesmo dashboard do paciente com os dados de Ana
E a faixa `Você está vendo a saúde de Ana` com o selo `Menor de idade`
E a faixa, o selo e o item ativo do seletor usam os tokens `--ds-color-minor*`
E os botões de ação continuam azuis.

### Cenário: dependente adulto sem tom de menor

Dado um dependente adulto ainda sob guarda
Quando o responsável abre a saúde dele
Então a faixa de contexto aparece sem o selo `Menor de idade`
E nenhum token `--ds-color-minor*` é aplicado.

### Cenário: lista sem dependentes

Dado um paciente sem dependentes
Quando ele abre `/patient/dependents` pela URL
Então é redirecionado para `/patient`
E o link `Meus dependentes` não aparece na área do paciente.

### Cenário: dependente não pertencente à conta

Dado um responsável sem guarda do paciente 99
Quando ele abre `/patient/dependents/99`
Então é redirecionado para a área padrão
E nenhuma requisição com `X-Acting-Patient: 99` é feita.

### Cenário: identidade carregada uma vez

Dado um usuário autenticado em `/patient`
Quando ele navega para `/medical` e volta para `/patient`
Então `/me` foi requisitado uma única vez
E recarregar a página requisita `/me` novamente, sem estado persistido.

### Cenário: sessão expirada durante a navegação

Dado um usuário em `/patient/dependents/15`
Quando um recurso responde `401`
Então o store é resetado, inclusive `actingPatientId`
E o frontend navega para `/` com `replace`.

### Cenário: erros padronizados

Dado um formulário de marcador
Quando o backend responde `409` com `detail` em texto
Então a mensagem do backend é exibida no feedback do formulário
E quando responde `422` com a lista padrão do FastAPI
Então é exibido `Revise os campos destacados e tente novamente.`
E quando responde `403`
Então é exibido `Você não tem permissão para esta ação.`

### Cenário: falha isolada de recurso

Dado o dashboard do paciente com vacinas carregadas
Quando a listagem de documentos responde `503`
Então a seção de documentos mostra erro com `Tentar novamente`
E as vacinas continuam visíveis.

### Cenário: CSS modularizado sem regressão visual

Dado o CSS dividido em arquivos de `styles/`
Quando as telas de login, paciente, médico, admin, configurações e resumo
público são abertas em 320 px e 1280 px
Então estilos computados verificados pelos testes existentes permanecem iguais
E não há overflow horizontal.

### Cenário: dock preservado nas novas rotas

Dado uma conta com mais de um contexto em viewport de 320 px
Quando ela navega entre `/patient`, `/medical` e um dependente
Então o dock permanece fixo junto ao limite inferior do viewport, com safe area
E o conteúdo não fica encoberto
E a 1280 px com ponteiro fino o seletor volta ao cabeçalho.

## Contratos afetados

### API

Nenhum endpoint, payload ou status muda. O frontend continua consumindo os
contratos das specs `004`, `005`, `007`, `008`, `010`, `020`, `030`, `035`,
`036` e `040`.

### Frontend

- Novas rotas: `/patient`, `/patient/dependents`,
  `/patient/dependents/[patientId]`, `/medical`,
  `/medical/patients/[patientId]`, `/admin`.
- `/home` deixa de renderizar dashboards e passa a resolver a área padrão.
- Novos módulos: `stores/session-store.js`, `lib/areas.js`, `readApiError`,
  `hooks/use-api-resource.js`, componentes de `components/shell/` e arquivos
  de `styles/`.
- `setActingPatient` sai de `lib/api.js` e passa a ser ação do store.
- Novos tokens `--ds-color-minor`, `--ds-color-minor-soft` e
  `--ds-color-minor-border`, documentados em `docs/design-system.md`.
- `GuardianshipPanel` passa a linkar a saúde de cada dependente.
- `AuthenticatedHome` é decomposto entre shell, resolvedor de `/home` e páginas
  de área; o arquivo deixa de existir ao final.

### Dependências

- `zustand`: estado de sessão compartilhado entre rotas. Única dependência
  nova desta entrega.

### Dados

Nenhuma migration ou alteração de banco.

## Segurança e autorização

- O guard de rota é apenas experiência: evita requisições desnecessárias e
  redireciona, mas não substitui nenhuma verificação do backend. Testes de
  backend existentes continuam sendo a prova de autorização.
- `X-Acting-Patient` só é enviado na rota de dependente e nunca vaza para
  outras áreas, inclusive após voltar pelo navegador.
- O store fica somente em memória; identidade e paciente atuante não são
  persistidos no navegador, e `reset()` os descarta em logout e `401`.
- Dados clínicos não entram em store global.
- URLs contêm somente IDs internos; nada de CPF, nome, e-mail ou dado clínico
  em path, query, `document.title` ou histórico.
- O prontuário anterior é descartado ao mudar `patientId`, ao receber `403`/
  `404` e ao sair da rota.
- O service worker continua armazenando somente a página offline genérica;
  nenhuma rota nova entra em cache.

## Casos de erro e limites

- `/me` falha com `503`: estado de erro do shell com `Tentar novamente`, sem
  renderizar nenhuma área.
- `patientId` não numérico, zero, negativo ou acima de `Number.MAX_SAFE_INTEGER`:
  na rota médica, estado de não encontrado sem requisição; na rota de
  dependente, redirect para a área padrão.
- Dependente removido da guarda enquanto a rota está aberta: o backend responde
  `403`/`404` e a tela mostra o estado correspondente; `refreshIdentity()`
  remove o item do seletor e a rota passa a redirecionar.
- Corpo de erro não-JSON ou vazio: mensagem `fallback`.
- Rota inexistente dentro das áreas: página 404 padrão do Next.js.
- Conta sem nenhum contexto: permanece em `/home` com o perfil institucional; as
  áreas redirecionam para `/home` sem laço de redirect.

## Estratégia de testes

### Primeiro ciclo RED

Teste unitário de `resolveDefaultArea(identity)` em `lib/areas.js` cobrindo
paciente, médico, admin, conta combinada e conta sem contexto, falhando porque
o módulo não existe.

### Ciclos seguintes

1. `lib/areas.js`: contextos visíveis, permissão de rota e dependente válido.
2. `session-store`: carga única de `/me`, erro, `401`, `refreshIdentity`,
   `setActingPatient` e `reset`, sem persistência.
3. `apiFetch` envia `X-Acting-Patient` a partir do store e não envia com `null`.
4. `readApiError` para cada linha da tabela, corpo vazio e não-JSON.
5. `useApiResource`: loading, sucesso, erro, `401`, `reload` e cancelamento.
6. `/home` redireciona com `replace` para a área padrão.
7. Guard de área: role ausente faz `replace` sem requisições da área.
8. Rota de dependente define e limpa o paciente atuante; ID alheio redireciona
   sem enviar o header.
8a. Lista de dependentes: itens, selo de menor, link, ausência sem dependentes
    e redirect sem dependentes.
8b. Tema de menor: `data-patient-tone="minor"` somente para `is_adult` falso;
    faixa com texto; tokens com contraste mínimo nos dois temas.
9. Seletor de contexto como links com `aria-current`, somente com áreas
   liberadas.
10. Prontuário por rota: carregamento, troca de `patientId`, `403`, `404` e ID
    inválido.
11. Extração de vacinas e divisão do dashboard médico mantendo os testes
    existentes verdes.
12. CSS: `globals.css` contém somente `@import`; guardrails do design system
    leem todos os arquivos de `styles/`.
13. Remoção do código legado: build e suíte permanecem verdes.

### Regressão e ponta a ponta

- Todos os testes Vitest e Playwright existentes permanecem verdes, ajustando
  somente imports, estado do store e URLs esperadas.
- Playwright novo: login por papel termina na área correta; link direto ao
  prontuário; botão voltar; área sem permissão redireciona; dependente por URL
  com header correto; lista de dependentes e tema de menor com cor computada
  em 320 px e 1280 px; dock geométrico em 320 px e seletor no cabeçalho em
  1280 px.
- Comparação visual manual das áreas em 320 px e 1280 px antes e depois da
  divisão do CSS, registrada na seção de verificações.
- `npm run build` sem rotas quebradas.

## Evidência TDD

| Ciclo | Teste RED | Implementação GREEN | Refactor | Referência |
|---|---|---|---|---|
| 1 | `tests/areas.test.js`: `Failed to resolve import "@/lib/areas"` | `resolveDefaultArea` sobre a tabela `AREAS` | — | 13.1 |
| 2 | `listContexts`, `isAreaAllowed`, `parsePatientId`, `findDependent`, `contextKeyForPath` inexistentes (24 falhas) | regras puras em `lib/areas.js` | tabela de áreas com rótulo e ícone (aberto/fechado) | 13.1 |
| 3 | `tests/session-store.test.js`: `Failed to resolve import "@/stores/session-store"` | store Zustand em memória com carga única de `/me` | `requestIdentity` compartilhado entre `load` e `refresh` | 13.1 |
| 4 | `tests/api.test.js`: header não lido do store e `setActingPatient` ainda exportado | `apiFetch` lê `actingPatientId` do store | variável de módulo removida | 13.1 |
| 5 | `expireSession is not a function` | ação `expireSession` | features deixam de receber redirect por props do shell | 13.1 |
| 6 | `tests/authenticated-areas.test.jsx`: `Failed to resolve import "@/components/shell/home-redirect"` | shell, guard com redirect, `ActingPatientScope`, `/home` resolvedor, áreas, lista e área de dependente | `Redirect` único reutilizado por guard, `/home` e dependentes; `AuthenticatedHome` removido | 13.1 |
| 7 | `tests/design-system.test.js`: tokens `minor` ausentes, seletor ainda com `button` e sem estilos de dependentes (3 falhas) | tokens claro/escuro com contraste AA, seletor por links e bloco CSS de dependentes | guia e `AGENTS.md` documentam o tom de menor | 13.1 |
| 8 | `tests/api-errors.test.js`: `readApiError is not a function` (12 falhas) | tabela única de mensagens | constantes de mensagem compartilhadas | 13.2 |
| 9 | `tests/use-api-resource.test.jsx`: `Failed to resolve import "@/hooks/use-api-resource"` | hook com `reload`, `updateData`, modo ocioso e cancelamento | substitui o `usePatientResource` local do dashboard | 13.2 |
| 10 | dashboard do paciente: falha de rede exibia texto técnico; `403`/`422` ao salvar vacina genéricos; `401` na remoção ignorado (4 falhas) | hook nos três recursos e `readApiError` nas mutações de vacina | mocks de `@/lib/api` preservam os helpers reais | 13.2 |
| 11 | marcadores e compartilhamento exibiam `Failed to fetch`/erro de JSON e `403` genérico (6 falhas) | `readApiError` e mensagens constantes; compartilhamento usa o hook | `readError` local removido | 13.2 |
| 12 | `overrides` ignorado; convites, guarda, documentos, `adminRequest` e vínculo médico sem `403` padronizado ou com `detail` ignorado (9 falhas) | `readApiError` com `overrides` de domínio | listas de guarda usam o hook; `DEFAULT_ERRORS` do admin removido | 13.2 |
| 13 | `tests/use-api-resource.test.jsx`: `errorStatus` ausente (2 falhas) | hook expõe o status do erro | — | 13.3 |
| 14 | `tests/medical-record.test.jsx`: `Failed to resolve import "@/components/medical/medical-record"`; lista médica ainda com botão | `MedicalRecordView` por ID de rota com estados `403`/`404`/ID inválido; lista com links | dashboard médico dividido em carteira, prontuário, ações de provisório e formatação | 13.3 |
| 15 | REFACTOR coberto pela suíte existente | — | dashboard do paciente vira composição de `VaccinationHistory`, `AlertsSection`, `DocumentsSection`, `HealthMarkers`; marcadores e documentos divididos em diálogos e listas | 13.3 |

## Verificações executadas

- 13.1: `npm test` (176 passed), `npx playwright test` (41 passed, incluindo
  `tests/areas.spec.ts`, lista de dependentes e tom de menor em 320 px e
  1440 px) e `npm run build` com as rotas `/patient`, `/patient/dependents`,
  `/patient/dependents/[patientId]`, `/medical` e `/admin`. Conferência visual
  da lista e da área do menor em 320 px e 1280 px.
- Observação para 13.2: com corpo vazio, `HealthSharing` exibia a mensagem
  crua do `response.json()`; corrigido e coberto por teste na 13.2.
- 13.2: `npm test` (221 passed), `npx playwright test` (41 passed) e
  `npm run build`.
- 13.3: `npm test` (234 passed), `npx playwright test` (41 passed, com
  prontuário por URL, voltar, recarregar e `403` por link direto) e
  `npm run build` com `/medical/patients/[patientId]`. O wrapper de rota
  `MedicalRecordArea` recebeu teste logo após sua criação (caracterização), não
  antes; a regra de prontuário que ele compõe teve RED próprio no ciclo 14.

## Plano de execução

1. **13.1 — Sessão e rotas:** `lib/areas.js`, store Zustand, `apiFetch` lendo o
   store, layout autenticado, `/home` resolvedor, páginas `/patient`,
   `/medical`, `/admin`, rota de dependente, seletor por links e guard com
   redirect. Dashboards ainda inteiros.
   Inclui a lista de dependentes, a faixa de contexto e o tema de menor.
2. **13.2 — Erros e recursos:** `readApiError`, `useApiResource` e adoção nos
   recursos de leitura e mensagens de mutação.
3. **13.3 — Features:** extração de vacinas, alertas, documentos e marcadores
   para suas pastas; divisão do dashboard médico e rota de prontuário.
4. **13.4 — CSS:** divisão de `globals.css` em `styles/`, guardrails
   atualizados e regressão visual em 320 px e 1280 px.
5. **13.5 — Limpeza:** remoção de `health-passport` legado e `mocks/`,
   documentação e roadmap.

Cada fase é um incremento verde e pode ser um commit próprio dentro da mesma
PR do Step 13.

## Critérios de conclusão

- [ ] Spec revisada e aprovada.
- [ ] Cada área possui rota própria e o login chega à área do papel.
- [ ] Rotas sem permissão não aparecem e redirecionam para a área padrão.
- [ ] Recarregar, link direto e botão voltar preservam a área e o prontuário.
- [ ] Identidade e paciente atuante vivem somente no store Zustand em memória.
- [ ] Nenhuma página central concentra todas as features.
- [ ] Papel controla navegação, mas segurança permanece no backend.
- [ ] `401`, `403`, `404`, `409`, `422` e `503` seguem a tabela única.
- [ ] Cada feature possui loading, vazio, erro e confirmação testados.
- [ ] `X-Acting-Patient` restrito à rota de dependente.
- [ ] Responsável lista dependentes e abre a saúde de cada um; menor é
      identificado por texto e tom alaranjado tokenizado.
- [ ] CSS dividido por responsabilidade sem regressão visual.
- [ ] Código legado e mocks sem consumidor removidos.
- [ ] Dock e seletor preservam as specs `032`/`033` em 320 px e 1280 px.
- [ ] Vitest, Playwright e build aprovados; `git diff --check` e `git status`
      conferidos.
- [ ] Roadmap e índice de specs atualizados com referência da PR.

## Decisões

| # | Decisão | Status |
|---|---|---|
| 1 | Área sem permissão não aparece na navegação; acesso por URL faz `replace` para a área padrão | APROVADA |
| 2 | Prontuário médico com URL própria (`/medical/patients/[patientId]`), usando o ID interno já exposto pela API médica | APROVADA |
| 3 | Dependente como sub-rota da área do paciente, com lista `/patient/dependents`, mesmo padrão visual e tom alaranjado tokenizado para menor | APROVADA |
| 4 | Sem sub-rotas para abas do admin e seções do paciente neste step | APROVADA |
| 5 | CSS modularizado em arquivos por responsabilidade, preservando nomes de classe | APROVADA |
| 6 | SOLID aplicado de forma concreta e Zustand para estado de sessão compartilhado | APROVADA |
