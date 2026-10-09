# Spec 034 — Menu da conta compacto no mobile

## Contexto e problema

No cabeçalho autenticado, o desktop mostra a identidade da conta em linha e uma
ação de saída separada. Em telas estreitas, o avatar precisa oferecer um ponto
único e previsível para acessar dados da conta e ações, sem reproduzir controles
de presets que não fazem parte da aplicação.

## História

Como pessoa autenticada usando celular ou tablet, quero abrir meu avatar para
ver minha identidade, acessar configurações e sair da conta.

## Regras

- O avatar no cabeçalho é um botão acessível que abre/fecha um menu compacto.
- O menu mostra o nome e o e-mail já disponíveis em `/me` (`user.display_name`
  e `user.email`), sem buscar dados adicionais.
- O menu oferece uma ação “Configurações” que navega para `/settings`.
- `/settings` contém o formulário de dados cadastrais descrito em
  `docs/specs/035-self-service-profile.md`.
- O menu oferece “Sair” com o mesmo fluxo de logout atual (`POST /logout` e
  redirecionamento de sessão não autenticada).
- O menu segue a paleta clara/escura e os tokens existentes; sem presets de tema,
  controles de aparência ou novos dados de usuário.
- A apresentação deve funcionar em viewport mobile/tablet, sem sair da tela,
  permitir teclado (Escape fecha e devolve foco ao avatar) e fechar ao escolher
  uma ação.
- Em desktop, preservar a leitura atual da identidade e acesso à saída, podendo
  usar o mesmo menu se isso mantiver consistência e não esconder informação já
  visível.

## Cenários de aceite

### Abrir menu da conta

Given uma sessão autenticada e viewport estreito
When a pessoa ativa o botão do avatar
Then vê nome, e-mail, “Configurações” e “Sair” em um menu ancorado ao avatar
And não vê presets nem controles de tema.

### Configurações

Given o menu da conta aberto
When a pessoa seleciona “Configurações”
Then navega para a rota de configurações existente registrada nesta spec.

### Encerrar sessão

Given o menu da conta aberto
When a pessoa seleciona “Sair”
Then a aplicação envia `POST /logout` e chama o fluxo atual de não autenticado.

### Teclado e viewport

Given o menu da conta aberto
When a pessoa pressiona Escape
Then o menu fecha e o foco retorna ao botão do avatar.
And em larguras de 320 px até tablet o menu permanece integralmente dentro do
viewport.

## Contratos, segurança e erros

- Sem alteração de API ou persistência; usar apenas campos já retornados por
  `/me`.
- E-mail e nome são dados da sessão já apresentados ao próprio usuário; não
  devem ser adicionados a logs nem persistência local.
- Logout conserva o comportamento atual inclusive em caso de resposta de erro;
  quaisquer mudanças nesse contrato precisam de revisão desta spec.
- A rota `/settings` ainda não existe e será criada nesta entrega vertical.
- Alterações aos dados de perfil obedecem à spec 035, revisada em conjunto com
  esta spec.

## Não objetivos

- Presets, seleção de tema, preferências ou alteração do sistema visual.
- Alterar a identidade visual desktop, o dock contextual ou autenticação.
- Criar rota, endpoint, persistência ou dependência nova.

## Estratégia de testes

- Teste unitário RED para abrir/fechar, identidade, configurações, logout e
  fechamento por Escape/foco.
- Playwright em viewport estreito para verificar contenção geométrica do menu e
  fluxo de logout sem overflow.
- Executar testes de frontend afetados e build de produção.

## Dependências e critérios de conclusão

- Dependência: spec 035 para escopo, contrato e autorização das alterações de
  dados próprios.
- Spec aprovada antes do TDD; evidência RED documentada antes do código de
  produção.
- Implementação, testes e referência do commit/PR registrados no roadmap.

## Revisão

- Estado: SPEC APPROVED em 2026-10-08.
- Solicitada pelo usuário em 2026-10-08 com referência visual do menu de conta.
- Decisão do usuário em 2026-10-08: criar a rota de configurações e também
  definir a edição de informações cadastrais próprias.
- TDD: RED no teste de interação porque o avatar era apenas `role=img`; GREEN
  após torná-lo trigger Radix acessível. Playwright verifica menu → `/settings`
  e contenção horizontal a 320 px.
- Implementação concluída na branch `feat/medical-panel`, PR #7; unitários,
  E2E e build aprovados.
