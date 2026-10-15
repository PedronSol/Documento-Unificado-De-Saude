# Acesso com Google na tela de login

## Status

IMPLEMENTED — aprovada pelo usuário em 2026-10-15; implementação no commit
`59fd372`, branch `fix/qr-code-resumo-dinamico`. Envio autorizado pelo usuário
e concluído na [PR #16](https://github.com/PedronSol/Documento-Unificado-De-Saude/pull/16),
com destino `develop`.

## Dependências e tarefa selecionada

- Complemento do Step 9, desbloqueado: expor no login a autenticação Google já
  implementada pela spec `006-patient-onboarding-authentication.md`.
- Spec `008-persistent-session.md`: sessão existente e conta lembrada.
- Specs `031-interface-design-system.md` e `037-frontend-organization.md`.

## Contexto e problema

A rota `/register` oferece cadastro e autenticação com Google usando
`GoogleSignInButton` e `POST /auth/google`. O backend já cria sessão local para
uma identidade externa conhecida. Entretanto, `app/page.jsx` monta apenas
`LoginForm`, sem client ID ou controle Google, obrigando quem usa esse método a
passar pela tela de cadastro para entrar.

O login atual também verifica a sessão existente e oferece uma conta lembrada.
A nova alternativa precisa integrar-se a esses estados e preservar o caminho
por e-mail e senha.

## Objetivos

- Oferecer `Continuar com Google` diretamente na tela de login configurada.
- Reutilizar o botão Google e o endpoint existentes.
- Entrar em `/home` após o backend confirmar a autenticação.
- Explicar como continuar quando a identidade ainda não está vinculada.

## Não objetivos

- Criar outro fluxo OAuth, endpoint, migration, dependência ou store global.
- Vincular identidades automaticamente por e-mail ou criar contas pelo login.
- Transferir credencial Google para outra rota, URL ou storage.
- Alterar cadastro, vínculo nas configurações, permissões, sessão ou lembrete.
- Configurar credenciais de produção ou publicar a aplicação nesta entrega.

## Regras de negócio

1. A rota de login lê `NEXT_PUBLIC_GOOGLE_CLIENT_ID` e injeta o valor no
   componente de autenticação, como já ocorre em `/register`. Credenciais e
   opções de ambiente continuam fora do código.
2. Quando houver client ID, o login exibe o `GoogleSignInButton` existente,
   com o controle oficial do Google Identity Services em português e o texto
   `Continuar com Google`, sem substituir o formulário por senha.
3. O controle fica fora do submit do formulário por senha e não depende do
   preenchimento de e-mail ou senha para autenticar com Google.
4. Após receber uma credencial, o frontend chama `POST /auth/google` com JSON
   `{ "credential": "..." }` usando `apiFetch`. Somente uma autenticação pode
   estar pendente: controles de Google, senha e troca de conta ficam desabilitados
   durante a solicitação. Callbacks repetidos não disparam chamadas concorrentes.
5. Resposta de autenticação confirmada (`AuthenticationResponse`, com `user`)
   aciona o mesmo destino `/home` do login local. Os contextos autorizados são
   resolvidos pelo fluxo existente; o cliente não escolhe nem concede roles.
6. `onboarding_required` não autentica, não redireciona para `/home` e não cria
   conta. Exibe orientação para concluir o cadastro pelo link existente ou,
   caso já possua cadastro local, entrar com senha e vincular o Google nas
   configurações. Não mantém a credencial depois da solicitação; para cadastrar,
   a pessoa confirma novamente o Google no fluxo existente de `/register`.
7. A alternativa Google também aparece no modo de conta lembrada. Ela pode
   autenticar uma identidade diferente da conta lembrada; o backend identifica
   a conta pelo token Google, sem reutilizar o e-mail do lembrete. Login Google
   não cria nem modifica o lembrete do dispositivo.
8. Durante a verificação inicial de sessão, mantém-se o estado de carregamento
   existente, sem disparar autenticação Google. Uma sessão válida continua
   redirecionando para `/home` pelo caminho atual.
9. Sem client ID, não se carrega o SDK nem se mostra um botão inoperante.
   Exibe-se a mensagem: `O acesso com Google não está disponível neste ambiente.
   Use e-mail e senha.` O login local e o link de cadastro continuam disponíveis.
10. Erros são anunciados e permitem tentar novamente, sem apagar os campos
    locais. A leitura das mensagens usa `readApiError` com mensagens de domínio
    controladas; nunca exibe detalhes técnicos, token ou claims.

## Cenários Given/When/Then

### Entrar com identidade Google vinculada

Dado um ambiente com Google configurado e uma identidade vinculada ativa
Quando a pessoa escolhe `Continuar com Google` e confirma sua identidade
Então a credencial é enviada apenas ao endpoint existente
E, após a confirmação e o cookie de sessão do backend, ela segue para `/home`
E nenhum preenchimento de senha local é exigido.

### Entrar com Google diante de uma conta lembrada

Dado que o login mostra uma conta local lembrada
Quando a pessoa autentica outra identidade Google vinculada
Então entra na conta resolvida pelo backend para essa identidade
E nenhum lembrete é criado ou alterado pelo login Google.

### Identidade ainda não vinculada

Dado que a API retorna `onboarding_required`
Quando o login processa a resposta
Então orienta a usar o cadastro ou o vínculo autenticado nas configurações
E mantém o link de cadastro e o login por senha disponíveis
E não redireciona para `/home` nem persiste a credencial.

### Ambiente sem configuração frontend

Dado que `NEXT_PUBLIC_GOOGLE_CLIENT_ID` está ausente
Quando a tela de login é exibida
Então informa que Google não está disponível no ambiente
E continua permitindo login local, sem carregar o SDK.

### Falha de autenticação ou indisponibilidade

Dado que o Google está configurado no frontend
Quando a consulta falha por credencial recusada, conta inacessível, backend
desabilitado, indisponibilidade, rede ou resposta ilegível
Então a tela anuncia uma mensagem controlada e libera os controles
E não redireciona nem apaga e-mail/senha digitados.

### Concorrência e sessão existente

Dado que já há uma solicitação de autenticação pendente
Quando ocorre outro acionamento ou callback
Então nenhuma solicitação paralela é enviada.

Dado que `/me` confirma uma sessão existente na entrada da tela
Quando termina a verificação inicial
Então o redirecionamento atual continua funcionando sem solicitar Google.

## Contratos, erros e configuração

- `POST /auth/google`, corpo `GoogleCredential`; sucesso com
  `AuthenticationResponse` ou `{ "status": "onboarding_required" }`.
- `401`: `Não foi possível autenticar com Google. Tente novamente.`
- `403`: `Não foi possível acessar esta conta.`
- `404` (Google desabilitado no backend): mesma mensagem de indisponibilidade
  de ambiente da regra 9, mantendo o caminho por senha.
- Rede, `5xx`, resposta ilegível ou sucesso sem o contrato esperado:
  `Não foi possível entrar com Google agora. Tente novamente.`
- Variáveis existentes: `NEXT_PUBLIC_GOOGLE_CLIENT_ID` no frontend e
  `GOOGLE_AUTH_ENABLED`/`GOOGLE_CLIENT_ID` no backend. Configurar apenas o
  frontend não habilita autenticação no backend. O client ID público do
  frontend precisa estar disponível durante o build.
- Sem alteração em schemas, dados, cookies ou código de autorização backend.

## Segurança e autorização

- Assinatura, issuer, audience, expiração e e-mail verificado continuam sendo
  validados no backend pelo verificador existente.
- A identificação permanece por `(issuer, subject)`, sem vínculo automático
  por e-mail e sem campos de roles provenientes do cliente.
- Credencial somente no callback e no JSON da solicitação; nunca em URL,
  cookies próprios do frontend, Web Storage, logs, analytics ou store global.
- Sessão apenas no cookie HTTP-only emitido pelo backend. Conta inativa ou
  erro não concede acesso. Não presumir sucesso apenas por receber o token.
- Nenhum cache de autenticação ou dado pessoal no service worker.

## Interface e acessibilidade

- `app/page.jsx` apenas compõe e injeta a configuração. Componentes em
  `components/auth/`, estilos na feature de autenticação, usando tokens `--ds-*`.
- Reutilizar `GoogleSignInButton`; não construir uma imitação do botão oficial.
- Separar visualmente os métodos com texto simples, preservando a hierarquia
  atual, o link de cadastro e a navegação por teclado.
- Loading com anúncio de status, erro com `role="alert"`, foco visível,
  alvos de 44 px e ausência de overflow a 320 px e em viewport ampla.
- Se o componente Google compartilhado precisar ser tocado, incluir regressão
  nos consumidores cadastro, vínculo, convite profissional e reivindicação.

## Estratégia de testes e evidência TDD

1. RED: atualizar o teste de login para injetar um client ID e esperar o botão
   Google. Confirmar falha pela ausência do controle antes de alterar produção.
2. GREEN: composição mínima com o componente existente; ciclos RED/GREEN para
   sucesso, onboarding, erros, concorrência e conta lembrada.
3. Mockar o SDK no teste, exercitando o callback e o contrato HTTP, sem realizar
   login em uma conta Google real ou depender de serviços externos.
4. Regressão de senha, conta lembrada, sessão existente, cadastro e botão Google
   quando compartilhados; não refatorar esses fluxos sem necessidade concreta.
5. Playwright cobre a entrada pelo Google, os estados relevantes e a preservação
   do login local em 320 px e 1440 px, com configuração pública de teste.
6. Executar testes frontend afetados e `npm run build`; manter os contratos
   backend cobertos pelos testes existentes, sem exigir alterações de produção.
7. REFACTOR somente da duplicação concreta introduzida, mantendo testes verdes.
8. Registrar RED/GREEN/REFACTOR, verificações indisponíveis, `git diff --check`,
   `git status` e referência de commit/PR no roadmap ao concluir.

| Ciclo | RED | GREEN | REFACTOR | Referência |
|---|---|---|---|---|
| Composição e login Google | Antes de produção, `vitest run tests/login-google.test.jsx tests/login-page.test.jsx --maxWorkers=1 --reporter=dot`: 14 falhas e 2 sucessos; botão ausente e client ID não injetado | Reutilização de `GoogleSignInButton` e `/auth/google`, validação do sucesso, orientação de onboarding, mensagens e bloqueio entre métodos | JSX organizado e mensagens nomeadas; sem extrair serviços ou modificar o componente Google compartilhado | `59fd372` |
| Mensagens controladas | `vitest run tests/login-google.test.jsx --maxWorkers=1 --reporter=dot`: 2 falhas e 14 sucessos; `409`/`422` exibiam detail técnico | Overrides por status usam mensagens controladas também para respostas inesperadas; 38 testes direcionados passaram | Tratamento reutiliza `readApiError`, com `401` tratado pelo fluxo de autenticação | `59fd372` |

## Critérios de aceite e conclusão

- [x] Spec revisada antes de implementar.
- [x] Login mostra Google configurado e usa a autenticação existente.
- [x] Sucesso, conta lembrada, onboarding e falhas seguem as regras acima.
- [x] Sem persistência de credenciais nem alteração de autorização ou lembretes.
- [x] Layout validado desde 320 px e em viewport ampla.
- [x] Evidência TDD, testes afetados e build documentados.
- [x] Specs, índice e roadmap sincronizados com commit/PR de conclusão.


## Verificações da entrega

Validação em container temporário com Node 22 e dependências do package-lock;
backend em Python 3.11. Nenhum serviço existente ou credencial de produção foi
alterado. O componente Google compartilhado e os contratos backend permaneceram
iguais.

- `vitest run tests/login-google.test.jsx tests/login-page.test.jsx
  tests/login-form.test.jsx tests/patient-registration.test.jsx
  tests/google-account-link.test.jsx --maxWorkers=1 --reporter=dot`: 38 sucessos.
  O teste de concorrência foi ajustado para aguardar o callback async no `act`,
  evitando vazamento do escopo do teste para a verificação de sessão seguinte.
- Após REFACTOR, login Google, composição da página e login existente somaram
  29 sucessos, sem alteração de comportamento durante a organização do JSX.
- `vitest run --maxWorkers=1 --reporter=dot`: 358 sucessos e um timeout de
  5 segundos em `admin-dashboard.test.jsx`, arquivo não alterado. A repetição
  isolada de `admin-dashboard.test.jsx` e `design-system.test.js` passou os
  21 testes. Assim, os 359 testes unitários foram aprovados após essa repetição,
  sem mudar código administrativo ou aumentar timeouts.
- `python -m pytest __tests__/test_google_auth.py
  __tests__/test_remembered_login.py -q`: 13 sucessos; contratos existentes de
  autenticação Google e conta lembrada, com verificador fake, sem rede Google.
- `PLAYWRIGHT_BASE_URL=http://localhost:3001 npx playwright test
  tests/google-login.spec.ts tests/login.spec.ts tests/registration.spec.ts
  --grep "Login com Google|Página de Login|Cadastro de paciente" --workers=1
  --reporter=list`: 17 sucessos no build de produção. Inclui entrada por Google
  sem senha em 320/1440 px, conta lembrada, onboarding, retry, login local,
  sessão existente e cadastro local.
- SDK Google e respostas de autenticação são simulados nos E2E. O helper é
  reutilizado pelo login existente e pelos cenários Google. O webServer local
  do Playwright recebe um client ID sintético de teste; a aplicação de produção
  continua dependendo da configuração real por ambiente.
- Capturas de 320 e 1440 px inspecionadas: separação dos métodos, cadastro
  acessível, navegação por teclado e ausência de overflow. O SDK é simulado
  nessas capturas; a aplicação reutiliza o controle oficial existente.
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID=dus-playwright.apps.googleusercontent.com
  npm run build`: compilação, TypeScript e geração de rotas aprovados no
  container. A ausência de configuração é coberta pelos testes de composição
  e do login, sem renderizar ou carregar o componente SDK.
- `git diff --check` aprovado e `git status` revisado. As alterações locais
  preexistentes em `frontend/next-env.d.ts` e `backend/.dockerignore` ficam fora
  da entrega. Nenhum cache, screenshot ou build é adicionado ao versionamento.

Não foi realizado login com conta Google real nem deploy: os E2E são
independentes do provedor. A suíte completa do backend e os demais E2E não
foram repetidos; os contratos backend não mudaram e os fluxos de autenticação
foram cobertos pelos testes afetados.


## Referência e envio remoto

Implementação e testes registrados no commit `59fd372`; documentação de
fechamento inicial em `100e0e2`. Após a autorização explícita do usuário em
2026-10-15, os dois commits foram enviados à branch remota. A PR #16 permanece
aberta contra `develop`, com título e descrição atualizados para refletir a
correção do resumo por QR-Code e a entrada Google no login. A pendência de
autorização do envio foi resolvida; não houve merge nem deploy.
