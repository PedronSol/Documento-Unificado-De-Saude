# Sessão Persistente e Login Lembrado

## Status

IMPLEMENTED

## Dependências

- Spec `003-unified-identity-roles-frontend.md` (sessões em `sessions`),
  implementada.
- Spec `006-patient-onboarding-authentication.md` (login local e Google),
  implementada.
- Spec `033-mobile-pwa.md` (`start_url: "/"`), implementada.
- Entregue como complemento no PR #12, sem novo step do roadmap.

## Contexto e problema

O login cria uma sessão com prazo fixo de `SESSION_DURATION_HOURS` (8 h)
contado a partir do login, sem renovação por uso. Além disso, `/` sempre exibe
o formulário de login sem consultar a sessão. Como o PWA abre em `/`, quem
fecha e reabre o app volta ao login mesmo com cookie válido, e quem usa o app
continuamente perde a sessão depois de 8 h.

Quando a sessão realmente vence, o usuário precisa digitar e-mail e senha de
novo, mesmo no aparelho que usa todos os dias.

## Objetivos

- Reabrir `/` com sessão válida leva direto a `/home`, sem exibir o formulário.
- A sessão expira após 24 h sem uso e nunca dura mais de 7 dias desde o login.
- O uso renova a janela de inatividade, sem escrita no banco a cada requisição.
- Depois que a sessão vence, o aparelho lembra a conta do último login por
  senha e pede somente a senha, com opção de usar outra conta.
- O e-mail completo e qualquer token continuam fora do armazenamento acessível
  por JavaScript.

## Não objetivos

- Lembrar contas que entram somente com Google; elas continuam pelo fluxo atual.
- Lembrar várias contas no mesmo aparelho ou oferecer seletor de contas.
- Login sem senha, biometria, WebAuthn ou "manter conectado" opcional.
- Rotação do token de sessão a cada renovação.
- Limite de tentativas de senha; fica para o Step 14, como no login atual.
- Listar ou revogar sessões de outros aparelhos.

## Regras de negócio e técnicas

1. `SESSION_IDLE_HOURS` (padrão `24`) define a inatividade máxima e
   `SESSION_MAX_HOURS` (padrão `168`, 7 dias) o teto absoluto desde o login.
   Ambos são inteiros positivos e `SESSION_IDLE_HOURS <= SESSION_MAX_HOURS`;
   valores inválidos falham na inicialização. `SESSION_DURATION_HOURS` deixa de
   existir.
2. Ao criar uma sessão, o backend grava `absolute_expires_at = agora +
   SESSION_MAX_HOURS` e `expires_at = min(agora + SESSION_IDLE_HOURS,
   absolute_expires_at)`.
3. Uma sessão é válida enquanto `expires_at > agora` e
   `absolute_expires_at > agora`, com o usuário ativo.
4. A cada requisição autenticada válida, o backend renova `expires_at` para
   `min(agora + SESSION_IDLE_HOURS, absolute_expires_at)` somente quando a
   última renovação tiver mais de 1 h, isto é, quando `expires_at < agora +
   SESSION_IDLE_HOURS - 1 h`. A renovação é um único `UPDATE` condicional e
   nunca prolonga além de `absolute_expires_at`.
5. O cookie `dus_session` recebe `max_age = SESSION_MAX_HOURS` no login e não é
   reemitido na renovação; a inatividade é aplicada pelo servidor. Os atributos
   `HttpOnly`, `SameSite=Lax`, `Secure` conforme `COOKIE_SECURE` e `path=/`
   permanecem.
6. A página `/` consulta `GET /me` antes de exibir o formulário. `200` faz
   `window.location.replace("/home")`; `401` exibe o login; erro de rede ou `5xx`
   também exibe o login, sem mensagem de sessão. Durante a consulta, a página
   exibe um estado de carregamento acessível no lugar do formulário.
7. Todo login bem-sucedido por `POST /login` ou `POST /login/remembered` cria
   ou substitui o lembrete do aparelho: um token aleatório de 32 bytes no cookie
   `dus_remembered`, guardado no banco somente como SHA-256, associado ao
   `user_id`, com validade de 30 dias renovada a cada login por senha. Login
   Google, cadastro e reivindicação não criam lembrete.
8. O cookie `dus_remembered` usa `HttpOnly`, `SameSite=Lax`, `Secure` conforme
   `COOKIE_SECURE`, `path=/` e `max_age` de 30 dias. Ao substituir um lembrete,
   o registro anterior do mesmo cookie é removido.
9. `GET /auth/remembered` lê o cookie e responde `200` com o primeiro nome de
   exibição e o e-mail mascarado quando o lembrete existe, não venceu, o usuário
   está ativo, a conta foi reivindicada e possui senha. Em qualquer outro caso
   responde `204`, remove o cookie e apaga o registro inválido, se houver.
10. O e-mail mascarado mantém o primeiro caractere do usuário e o domínio
    completo (`v•••@gmail.com`). Usuário de um caractere vira `•••@domínio`.
11. `POST /login/remembered` recebe somente `password`. O backend resolve o
    usuário pelo cookie, aplica as mesmas verificações do `POST /login` e, se a
    senha confere, cria a sessão e renova o lembrete. Lembrete ausente, vencido
    ou senha incorreta retornam `401` com a mesma mensagem genérica do login.
12. `DELETE /auth/remembered` ("Usar outra conta") apaga o registro e o cookie,
    responde `204` e é idempotente; não exige sessão.
13. `POST /logout` encerra somente a sessão e mantém o lembrete, para que o
    próximo acesso peça apenas a senha. "Usar outra conta" é a forma de
    esquecer o aparelho.
14. Desativar o usuário invalida o lembrete na próxima consulta, como já
    acontece com a sessão. Exclusão do usuário remove lembretes por
    `ON DELETE CASCADE`.
15. O frontend não grava e-mail, nome, token ou estado de autenticação em
    `localStorage`, `sessionStorage`, IndexedDB ou Cache API, e o service
    worker continua sem cachear `/me` ou `/auth/*`.

## Cenários de aceitação

### Cenário: reabrir o app com sessão válida

Dado um usuário com sessão válida
Quando fecha e reabre o app em `/`
Então é levado a `/home` sem ver o formulário de login.

### Cenário: uso contínuo renova a inatividade

Dado uma sessão criada há 30 h com uso a cada poucas horas
Quando faz uma requisição autenticada
Então a requisição é aceita
E `expires_at` passa a ser 24 h depois de agora, limitado ao teto absoluto.

### Cenário: renovação limitada a uma por hora

Dado uma sessão renovada há 10 minutos
Quando faz outra requisição autenticada
Então nenhuma escrita em `sessions` é feita.

### Cenário: inatividade de 24 h encerra a sessão

Dado uma sessão sem uso há mais de 24 h
Quando reabre o app
Então `/me` responde `401` e a tela de login é exibida.

### Cenário: teto de 7 dias encerra a sessão mesmo com uso

Dado uma sessão criada há mais de 7 dias e usada diariamente
Quando faz uma requisição autenticada
Então recebe `401`.

### Cenário: sessão vencida pede somente a senha

Dado um aparelho em que o último login foi por e-mail e senha
E a sessão venceu
Quando abre `/`
Então vê o primeiro nome e o e-mail mascarado da conta
E somente o campo de senha, com a ação "Usar outra conta"
E ao informar a senha correta entra em `/home`.

### Cenário: senha incorreta no login lembrado

Dado o login lembrado exibido
Quando informa a senha errada
Então recebe a mensagem genérica de credenciais incorretas
E o lembrete continua disponível.

### Cenário: usar outra conta

Dado o login lembrado exibido
Quando escolhe "Usar outra conta"
Então o lembrete é apagado no servidor e no cookie
E o formulário completo de e-mail e senha é exibido.

### Cenário: lembrete inválido

Dado um cookie `dus_remembered` vencido, desconhecido, de usuário inativo ou de
conta sem senha
Quando a página de login consulta o lembrete
Então recebe `204`, o cookie é removido e o formulário completo é exibido.

### Cenário: logout mantém o lembrete

Dado um usuário autenticado que entrou por senha
Quando sai da conta
Então a sessão é encerrada imediatamente
E o próximo acesso a `/` pede somente a senha.

## Contratos afetados

### API

```text
GET    /auth/remembered        200 RememberedLoginResponse | 204
POST   /login/remembered       200 AuthenticationResponse | 401 | 403 | 409
DELETE /auth/remembered        204
POST   /login                  inalterado; passa a definir dus_remembered
POST   /logout                 inalterado; não remove dus_remembered
```

`RememberedLoginResponse`:

```json
{ "first_name": "Vitor", "masked_email": "v•••@gmail.com" }
```

`POST /login/remembered` usa `application/x-www-form-urlencoded` com o campo
`password`, como o login atual; outros campos são ignorados e nunca alteram o
usuário resolvido pelo cookie.

### Erros

| Situação | Status | `detail` |
|---|---:|---|
| lembrete ausente/vencido ou senha incorreta | `401` | `E-mail ou senha incorretos.` |
| conta inativa | `403` | `Conta inativa.` |
| perfil de paciente inconsistente | `409` | contrato atual |
| banco indisponível | `503` | contrato atual |

### Dados e migration

Migration forward-only `0014`:

- `sessions.absolute_expires_at DATETIME NOT NULL`, preenchida nas sessões
  existentes com o valor de `expires_at`.
- Tabela `remembered_logins` com `token_hash CHAR(64)` como chave primária,
  `user_id` com FK `ON DELETE CASCADE`, `created_at` e `expires_at`, e índices
  em `user_id` e `expires_at`.

Lembretes vencidos são apagados oportunisticamente na criação de um novo, como
já acontece com sessões.

### Configuração

- `SESSION_IDLE_HOURS=24` e `SESSION_MAX_HOURS=168` substituem
  `SESSION_DURATION_HOURS` em `.env.example`, `docker-compose.yml` e README.
- A validade de 30 dias do lembrete é constante desta spec.

### Frontend

- `/` com três estados: verificando sessão, login lembrado e login completo.
- Login lembrado: saudação com primeiro nome, e-mail mascarado, campo de senha
  com rótulo acessível e alternância de visibilidade, botão "Entrar" e ação
  "Usar outra conta" que devolve o foco ao campo de e-mail.
- Componentes, tokens `--ds-*`, alvo de 44 px, foco visível e ausência de
  overflow em 320 px, como no formulário atual.

## Segurança e privacidade

- Tokens de sessão e de lembrete são aleatórios, ficam só em cookies
  `HttpOnly` e são guardados no banco apenas como hash.
- O lembrete não autentica sozinho: sempre exige a senha atual.
- `GET /auth/remembered` só expõe primeiro nome e e-mail mascarado a quem já
  possui o cookie daquele aparelho.
- Mensagens de erro do login lembrado são as mesmas do login completo e não
  revelam se o lembrete ou a senha falhou.
- A renovação nunca ultrapassa 7 dias desde a autenticação por senha ou Google.

## Casos de erro e limites

- Duas abas renovando ao mesmo tempo aplicam o mesmo `UPDATE` idempotente.
- Relógio do cliente não participa de nenhum prazo.
- Sessões criadas antes da migration herdam o teto igual ao prazo atual e
  vencem naturalmente.

## Estratégia de testes

- Primeiro RED: sessão criada há 9 h e usada recentemente deve ser aceita; hoje
  vence após 8 h fixas.
- Backend: configuração e validação dos prazos; criação com os dois prazos;
  renovação, limite de uma escrita por hora, inatividade e teto; lembrete criado
  no login por senha e não no Google; `GET`/`POST`/`DELETE` do lembrete com
  casos válidos, vencido, desconhecido, inativo e sem senha; logout preservando
  o lembrete; ausência de hash ou e-mail completo nas respostas.
- Migration: estrutura e upgrade com sessão existente, inclusive em MySQL 8.
- Frontend: redirecionamento com `200`, login completo com `401` e erro, sem
  flash do formulário; login lembrado com senha certa, senha errada e "Usar
  outra conta"; nenhum uso de Web Storage.
- Playwright: reabrir `/` com sessão válida e login lembrado em 320 px e
  viewport ampla.

## Evidência TDD

| Ciclo | Teste RED | Implementação GREEN | Refactor | Referência |
|---|---|---|---|---|
| 1 | sessão de 9 h usada recentemente respondia `401`; coluna `absolute_expires_at` inexistente; `AppSettings` sem `session_idle_hours`/`session_max_hours`; arquivo da migration `0014` inexistente | migration `0014`, prazos configuráveis validados, criação com teto absoluto e renovação condicional em `get_current_user` | renovação isolada em `_renew_session`, executada após o carregamento das roles | `test_persistent_session.py`, `test_config.py`, `test_migrations.py` |
| 2 | `GET`/`POST`/`DELETE` do lembrete respondiam `404`; cookie `dus_remembered` ausente; módulo `auth.remembered` inexistente | `auth/remembered.py`, rotas do login lembrado e lembrete criado em todo login por senha | fim do login por senha extraído para `_complete_password_login`, compartilhado por `/login` e `/login/remembered` | `test_persistent_session.py`, `test_remembered_login.py`, `test_app_composition.py`, `test_google_auth.py` |
| 3 | `LoginForm` não verificava sessão nem conta lembrada (5 cenários falhando) | verificação de `/me` e `/auth/remembered`, modo lembrado com senha e "Usar outra conta" com foco no e-mail | testes legados passam a aguardar a verificação assíncrona | `login-form.test.jsx`, `login.spec.ts` |

Os cenários Playwright foram escritos depois do GREEN unitário do ciclo 3 e
servem como regressão em 320 px e 1280 px.

## Critérios de conclusão

- [x] Spec aprovada antes do primeiro teste.
- [x] Reabrir `/` com sessão válida leva a `/home`.
- [x] Sessão expira após 24 h sem uso e nunca passa de 7 dias.
- [x] Renovação grava no máximo uma vez por hora.
- [x] Sessão vencida pede somente a senha da conta lembrada.
- [x] "Usar outra conta" apaga o lembrete no servidor e no cookie.
- [x] Nenhum dado de identidade ou token fica em Web Storage.
- [x] Testes afetados, build, `git diff --check` e `git status` verificados.
- [x] Spec, documentação de ambiente e roadmap sincronizados.

## Verificações executadas

- Backend: `python -m pytest` (195 passed, 68 skipped) e
  `RUN_DB_INTEGRATION=1 python -m pytest` no MySQL 8 real (263 passed),
  incluindo prazos de sessão, login lembrado e upgrade até `0014`.
- Frontend: `npm test` (111 passed), `npx playwright test` (37 passed) e
  `npm run build`.
- O service worker continua armazenando somente a página offline.
- Fakes de SQL dos testes unitários passaram a reconhecer a renovação de sessão
  e o lembrete; os prazos são validados somente na integração com MySQL.
- Não executado: `npm run lint` (`eslint` não instalado no projeto).

## Decisões e observações

1. Prazos de 24 h de inatividade e 7 dias de teto definidos pelo usuário em
   2026-10-11.
2. O lembrete fica no servidor, atrás de cookie `HttpOnly`, em vez de guardar o
   e-mail no navegador, para não expor identidade a scripts.
3. Logout mantém o lembrete; esquecer o aparelho é uma ação explícita.
4. Contas somente Google não são lembradas para manter o escopo mínimo.
