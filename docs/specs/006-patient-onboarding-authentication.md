# Cadastro de Pacientes e Autenticação

## Status

IMPLEMENTED

## Dependências

- Steps 3 e 4 implementados.
- Decisões D005, D008 e D009 de `000-foundation-decisions.md`.
- Step 9 do roadmap.

## Contexto e problema

Hoje `POST /login` autentica apenas contas previamente criadas no banco. Não
existe cadastro público nem modo seguro de um novo paciente iniciar o uso da
plataforma sem seed ou intervenção operacional.

Somente pacientes poderão se cadastrar. O paciente poderá escolher uma conta
local com e-mail e senha, sem vínculo com Google, ou usar Google OpenID Connect.
Médicos serão provisionados por um administrador no Step 10, e contas
administrativas continuarão fora de qualquer fluxo público. O método de
autenticação comprova a conta; roles e autorizações permanecem exclusivamente
sob controle do backend.

## Objetivos

- Permitir cadastro local de paciente com e-mail e senha.
- Permitir cadastro e login alternativo de paciente com Google OpenID Connect.
- Identificar a conta externa pelo par estável `(issuer, subject)`.
- Criar `User`, role `patient` e `Patient` atomicamente em ambos os caminhos.
- Coletar CPF, nome completo, nome preferido e data de nascimento quando não
  vierem de uma fonte confiável do fluxo escolhido.
- Manter uma sessão local HTTP-only após cadastro ou autenticação.
- Preservar o login local atual e permitir vinculação explícita posterior com
  Google.
- Impedir autocadastro ou elevação para `doctor` e `admin`.

## Não objetivos

- Cadastro público, autodeclaração ou verificação de médico.
- Cadastro público ou delegação de administrador.
- Vincular paciente e médico; isso pertence ao Step 10.
- Adicionar outros provedores sociais, recuperação de senha, verificação de
  e-mail ou MFA nesta primeira entrega.
- Usar o token Google como sessão da aplicação.
- Exigir Google para usar a plataforma.

## Regras de negócio

1. Os únicos cadastros públicos são os dois caminhos de paciente: local e
   Google. Campo `role`, CRM ou qualquer indicação de perfil profissional é
   rejeitado.
2. No cadastro local, o backend recebe e normaliza o e-mail com remoção de
   espaços nas extremidades e conversão para minúsculas. A mesma normalização
   passa a ser aplicada ao login local e às comparações de unicidade.
3. A senha local deve ter de 8 a 128 caracteres Unicode (mínimo reduzido de
   12 para 8 pela spec `042`, regra 8a, em 2026-10-12), não pode ser composta
   somente por espaços e não é alterada silenciosamente pelo backend. Ela é
   transformada pelo `hash_password` existente antes de qualquer persistência e
   nunca aparece em resposta, log ou auditoria.
4. O cadastro local exige CPF válido e normalizado para 11 dígitos, nome
   completo de 1 a 100 caracteres, nome preferido de 1 a 20 caracteres e data
   de nascimento válida não futura.
5. A criação local de `users`, `user_roles` e `patients` ocorre na mesma
   transação. Falha em qualquer escrita não deixa conta parcial.
   O perfil nasce com `status_saude=pending` e tipo sanguíneo desconhecido
   (`null`); contratos próprios, médicos e públicos representam esse estado como
   “não informado”, sem inventar dado clínico.
6. No caminho federado, o backend valida assinatura, `iss`, `aud`, expiração e
   `email_verified` do token Google. O verificador é injetado no composition
   root e substituído por fake nos testes.
7. A identidade externa usa `(issuer, subject)` com unicidade. E-mail não é
   usado como chave federada e uma mudança de e-mail no provedor não cria outra
   pessoa.
8. Token Google novo sem identidade associada não cria conta parcial. O cliente
   recebe estado `onboarding_required`, mantém a credencial somente em memória e
   envia novamente junto aos campos restantes do cadastro.
9. No cadastro Google, nome completo e e-mail verificado vêm das claims
   permitidas; CPF, nome preferido e data de nascimento são fornecidos pelo
   paciente e seguem as mesmas validações do cadastro local.
10. A criação federada de `users`, `external_identities`, `user_roles` e
    `patients` ocorre na mesma transação.
11. A role criada é sempre `patient`. Nenhuma claim, domínio de e-mail ou campo
    do cliente concede `doctor` ou `admin`.
12. Uma identidade externa já associada a conta `admin` nunca pode iniciar
    cadastro de paciente; admin usa conta institucional exclusiva.
13. CPF ou e-mail já pertencente a outra conta retorna conflito sem revelar
    nome, roles ou demais dados da conta existente.
14. E-mail local já existente sem aquela identidade Google não é vinculado
    automaticamente. A vinculação exige sessão local autenticada e confirmação
    explícita em fluxo separado da configuração da conta.
15. Login federado de identidade conhecida cria a sessão local existente e não
    persiste access token, refresh token ou ID token do Google.
16. Cadastro local bem-sucedido também cria sessão, sem exigir vínculo Google.
17. A sessão permanece em cookie HTTP-only, `Secure` no ambiente configurado e
    `SameSite=Lax`. O frontend não grava senha, credencial Google ou sessão em
    storage.
18. Usuário inativo não consegue entrar por nenhum método de autenticação.
19. Erros públicos não revelam se um e-mail, CPF ou subject está cadastrado,
    exceto o conflito genérico necessário durante o próprio onboarding.
20. Cadastros e vinculação de identidade são auditados sem senha, token, CPF,
    e-mail ou claims integrais. Login bem-sucedido continua fora da auditoria
    clínica.

## Cenários de aceitação

### Cenário: cadastrar paciente sem Google

Dado e-mail, senha e dados cadastrais locais válidos e únicos
Quando o paciente conclui o cadastro local
Então `User`, role `patient` e perfil `Patient` são criados na mesma transação
E somente o hash da senha é persistido
E uma sessão HTTP-only local é criada
E nenhuma identidade externa é criada.

### Cenário: entrar com conta local recém-criada

Dado um paciente ativo cadastrado localmente
Quando informa o mesmo e-mail, sem distinção de maiúsculas, e a senha correta
Então recebe sua identidade local e cookie de sessão
E não precisa vincular uma conta Google.

### Cenário: rejeitar senha local inválida

Dado um cadastro local com senha curta, longa demais ou composta somente por
espaços
Quando o paciente tenta concluir o cadastro
Então recebe `422`
E nenhuma conta, perfil, role ou sessão é criada.

### Cenário: iniciar cadastro com Google

Dado um token Google válido, verificado e ainda não associado
Quando o usuário tenta entrar
Então recebe `onboarding_required`
E nenhuma conta ou role é persistida antes do formulário completo.

### Cenário: concluir cadastro Google atomicamente

Dado um token Google válido e dados cadastrais válidos e únicos
Quando o paciente conclui o cadastro
Então `User`, identidade externa, role `patient` e perfil `Patient` são criados
na mesma transação
E uma sessão HTTP-only local é criada
E a resposta nunca contém token do provedor.

### Cenário: impedir elevação de papel

Dado um cadastro local ou token Google válido
Quando o cliente inclui `role=doctor`, `role=admin` ou CRM
Então recebe `422`
E nenhuma conta, perfil ou role é criada.

### Cenário: entrar com identidade conhecida

Dado um paciente ativo associado ao mesmo issuer e subject
Quando apresenta novo token Google válido
Então recebe a identidade local e cookie de sessão
E nenhum token Google é persistido.

### Cenário: bloquear token inválido

Dado token expirado, adulterado, com issuer/audience incorreto ou e-mail não
verificado
Quando tenta entrar ou cadastrar
Então recebe `401` genérico
E nenhuma consulta clínica, conta ou sessão é criada.

### Cenário: não unir contas por e-mail

Dado um usuário local com o mesmo e-mail e sem identidade Google vinculada
Quando um token Google novo é apresentado
Então o backend não associa automaticamente as contas
E orienta autenticação local para vinculação explícita.

## Contratos afetados

### API

```text
POST /auth/patient-registration
POST /auth/google
POST /auth/google/patient-registration
POST /me/external-identities/google
POST /login (normalização de e-mail preservando o contrato atual)
```

`POST /auth/patient-registration` recebe JSON:

```json
{
  "email": "paciente@example.com",
  "password": "uma-senha-com-12-caracteres",
  "cpf": "00011122222",
  "display_name": "Carlos da Silva",
  "preferred_name": "Carlos",
  "birth_date": "1985-04-12"
}
```

Retorna `201` com `AuthenticationResponse` e cookie local. O schema usa
`extra="forbid"`, portanto não aceita role, CRM, status ou identificadores
internos.

`POST /auth/google` recebe somente `credential`. Identidade conhecida retorna o
mesmo `AuthenticationResponse` do login atual e cria cookie. Identidade nova
retorna `200`:

```json
{"status": "onboarding_required"}
```

`POST /auth/google/patient-registration` recebe a credencial novamente, mais:

```json
{
  "credential": "token-entregue-pelo-google",
  "cpf": "00011122222",
  "preferred_name": "Carlos",
  "birth_date": "1985-04-12"
}
```

Retorna `201` com `AuthenticationResponse` e cookie local. O schema usa
`extra="forbid"`.

`POST /me/external-identities/google` exige sessão local, recebe somente a
credencial e vincula uma conta após validar que ela não pertence a outro
usuário. Retorna `204`.

### Dados

A migration forward-only `0007` cria:

```text
external_identities
- external_identity_id BIGINT PK
- user_id BIGINT FK users CASCADE
- provider ENUM('google') NOT NULL
- issuer VARCHAR(255) NOT NULL
- subject VARCHAR(255) NOT NULL
- created_at DATETIME(6) NOT NULL
- UNIQUE (issuer, subject)
- UNIQUE (user_id, provider)
```

`users.password_hash` passa a aceitar nulo somente para contas que possuem uma
identidade externa. Contas locais novas e existentes mantêm hash obrigatório no
caso de uso. Nenhuma coluna armazena token. A consistência é garantida pelo caso
de uso transacional e por teste de integração, pois a relação cruza tabelas.

### Configuração

- `GOOGLE_CLIENT_ID`, obrigatório quando o login Google estiver habilitado.
- `GOOGLE_AUTH_ENABLED`, `false` por padrão fora do ambiente configurado.
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, client ID público usado pelo Google Identity
  Services no frontend e igual ao audience configurado no backend.

Segredo de cliente não é necessário para validação do ID token nesta primeira
integração. Valores, tokens e senhas nunca aparecem em logs.

## Segurança e autorização

- O backend valida credenciais e aplica a role fixa; confiar apenas no resultado
  do frontend é proibido.
- O backend usa a biblioteca oficial `google-auth` para validar assinatura,
  audience, issuer e expiração. Claims cadastrais passam por limites locais
  antes de alcançar o banco.
- A senha é recebida apenas sobre HTTPS e passa pelo `hash_password` existente;
  texto puro não é persistido nem emitido em telemetria.
- `sub` e `issuer` não são retornados ao cliente depois da autenticação.
- E-mail verificado do Google serve como atributo de contato, não como prova de
  role nem chave de vinculação automática.
- Endpoints de cadastro não aceitam `user_id`, role, status, CRM ou ID de perfil.
- Mensagens de login local continuam genéricas para não enumerar contas.
- O frontend envia a credencial Google por JSON a partir da origem configurada,
  sujeito ao preflight CORS, e nunca a persiste em local ou session storage.
- Rate limiting distribuído, recuperação de senha, verificação de e-mail e MFA
  ficam para consolidação operacional; erros e validações não podem depender de
  estado em memória por processo.

## Casos de erro e limites

- `401`: credencial local ou externa ausente ou inválida no login.
- `403`: conta local inativa.
- `409`: CPF, e-mail ou identidade já associados de modo incompatível, sem expor
  a conta conflitante.
- `422`: dados cadastrais inválidos, senha fora da política ou campos extras.
- `503`: provedor de chaves/verificação ou banco indisponível.

## Estratégia de testes

- Primeiro RED: cadastro local válido em `POST /auth/patient-registration`
  retorna hoje `404`.
- Testes locais cobrem política e hash de senha, normalização de e-mail,
  unicidade, sessão, role fixa e rollback.
- Verificador fake cobre claims válidas e cada falha criptográfica/semântica sem
  rede na suíte.
- Testes transacionais cobrem os dois caminhos, conflitos concorrentes e
  rollback.
- Testes negativos provam que payload não concede `doctor` ou `admin`.
- Migration passa em banco vazio e preserva usuários locais no MySQL 8.
- Frontend cobre escolha do método, cadastro local, login, onboarding Google,
  conflitos, indisponibilidade e retorno de foco em 320 px e viewport ampla.

## Evidência TDD

| Ciclo | Teste RED | Implementação GREEN | Refactor | Referência |
|---|---|---|---|---|
| 1 | `test_patient_can_start_local_registration`: `404` | cadastro, role, perfil, auditoria e sessão transacionais | sessão extraída para serviço compartilhado | `backend/__tests__/test_patient_registration.py` |
| 2 | migration `0007` inexistente | identidade externa e senha federada opcional | assertions por propriedades SQLAlchemy | `backend/__tests__/test_migrations.py` |
| 3 | `create_app` sem verificador Google injetável | verificador oficial/injetável e onboarding sem escrita | falhas de credencial limitadas a `ValueError` | `backend/__tests__/test_google_auth.py` |
| 4 | cadastro Google retornava `404` | criação federada atômica e sessão local | validação local de claims e auditoria sem token | `backend/__tests__/test_google_auth.py` |
| 5 | vinculação Google retornava `404` | vínculo explícito autenticado | componente reutilizável nas configurações | testes backend e frontend de vínculo |
| 6 | login local com caixa/espaços retornava `401` | normalização consistente de e-mail | preservação do SQL parametrizado | `backend/__tests__/test_identity_api.py` |
| 7 | componente de cadastro inexistente | cadastro local/Google e rota `/register` | layout compartilhado mobile-first | testes Vitest e Playwright |

## Critérios de conclusão

- [x] Spec aprovada antes do primeiro RED.
- [x] Paciente pode se cadastrar com e-mail/senha sem vincular Google.
- [x] Paciente também pode escolher cadastro e login Google.
- [x] Somente paciente pode se cadastrar publicamente.
- [x] Senha em texto puro e tokens Google nunca são persistidos.
- [x] Credenciais inválidas não criam conta nem sessão.
- [x] Ambos os cadastros são atômicos e não aceitam elevação de role.
- [x] Contas locais existentes continuam utilizáveis.
- [x] Fluxos funcionam em 320 px e viewport ampla.
- [x] Testes, build, migration real, documentação e Definition of Done passam.

## Tarefas menores

| ID | Título | Dono | Esforço | Pré-requisitos | Definition of Done |
|---|---|---|---|---|---|
| T1 | Migration de identidades externas | backend/infra | M | spec aprovada | estrutura e upgrade local passam no MySQL 8 |
| T2 | Cadastro local transacional | backend | L | spec aprovada | política, hash, role fixa, conflitos, sessão e rollback verdes |
| T3 | Verificador Google injetável | backend | M | T1 | claims positivas e negativas cobertas sem rede |
| T4 | Login e cadastro Google | backend | L | T1, T3 | contratos, conflitos, sessão e rollback verdes |
| T5 | Vinculação explícita de conta | backend | M | T3, T4 | somente sessão autenticada vincula identidade livre |
| T6 | Interface de escolha, login e onboarding | frontend | L | T2, T4 | estados acessíveis em 320 px e desktop |
| T7 | Regressão e documentação | fullstack/qa | M | T1–T6 | suítes, build, Compose e exemplos de ambiente passam |

## Decisões e observações

1. Cadastro local ou federado nunca é cadastro profissional.
2. Google é opcional: novos pacientes podem criar uma conta independente com
   e-mail e senha e continuar usando-a sem vinculação externa.
3. O fluxo federado usa identidade estável do provedor e nunca associa contas
   apenas por coincidência de e-mail.
4. Verificação de e-mail, recuperação de senha e MFA precisam de entrega própria
   antes de uma operação produtiva madura, mas não bloqueiam o primeiro cadastro
   local especificado neste step.
