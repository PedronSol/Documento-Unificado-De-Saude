# Identidade Unificada, Roles e Experiência de Acesso

## Status

SPEC APPROVED

## Dependências

- Step 1 concluído.
- Step 2 implementado no [PR #2](https://github.com/PedronSol/Documento-Unificado-De-Saude/pull/2).
- Decisões D002, D003, D005 e D008 de `000-foundation-decisions.md`.
- Esta entrega é empilhada sobre `refactor/backend-modularization` até o PR #2
  ser integrado.

## Contexto e problema

Hoje a identidade do sistema é o próprio registro de paciente: e-mail, senha e
sessão estão vinculados ao CPF, e todas as dependências autenticadas devolvem um
paciente. Esse modelo não permite autenticar médicos ou administradores sem
duplicar autenticação e propaga um identificador sensível pelas relações do
banco.

No frontend, a tela de login pressupõe que toda conta é paciente e a home
concentra carregamento, estado e apresentação em uma única página cliente. Há
testes ponta a ponta, mas não existe uma suíte unitária para estados de
autenticação, acessibilidade, erros ou variações por `role`.

O Step 3 unifica a identidade e entrega a fundação visual correspondente. Não
antecipa o painel profissional nem autoriza acesso clínico de `doctors`.

## Convenções de idioma e nomes

- Código, models, tabelas, colunas e novos contratos usam inglês.
- Model e classe usam singular: `User`, `Role`, `Patient`, `Doctor`, `Session`.
- Tabelas e coleções usam plural: `users`, `user_roles`, `patients`, `doctors`,
  `sessions`, `roles`.
- Texto visível da interface permanece em português do Brasil.
- Campos legados do dashboard podem permanecer durante o envelope transitório;
  o Step 4 conclui a normalização do contrato clínico.

## Objetivos

- Autenticar um `User` e carregar suas `roles` e perfis autorizados.
- Substituir CPF por IDs internos nas sessões e relações clínicas.
- Manter CPF e CRM como identificadores de negócio únicos, nunca como identidade
  de sessão ou identificador de URL.
- Centralizar a leitura da sessão em `get_current_user` e autorização por `roles`
  em dependências explícitas.
- Impedir autoatribuição da `role` `doctor` e bloquear acesso profissional até
  que o registro regional tenha sido verificado por um fluxo confiável.
- Preservar temporariamente o dashboard atual do paciente até a separação de
  contratos do Step 4.
- Tornar o login visualmente neutro a `role`, acessível e coerente com uma
  credencial digital de saúde.
- Exibir no frontend um dashboard de paciente ou um estado institucional seguro
  para `doctor`/`admin`, sem antecipar funcionalidades clínicas.
- Introduzir Vitest, jsdom e React Testing Library como suíte unitária oficial do
  frontend.
- Cobrir componentes e integrações desta entrega com testes unitários, mantendo
  Playwright para fluxos ponta a ponta.

## Não objetivos

- Cadastro público, recuperação de senha, MFA ou integração com identidade
  externa. Não existe endpoint público de criação de médico neste step.
- Criar contas duplicadas para uma pessoa que possua mais de uma `role`.
- Automatizar a consulta ao CFM/CRM. O Step 3 cria o estado de verificação e o
  bloqueio; uma integração oficial futura exigirá spec própria, contrato de
  disponibilidade e revisão dos termos de uso da fonte.
- Implementar grupos, busca de pacientes, prontuário profissional ou qualquer
  rota clínica de `doctor`; isso pertence aos Steps 4, 5, 6 e 7.
- Implementar gestão administrativa de usuários.
- Concluir as áreas de rotas `patient`, `medical` e `share`; essa reorganização
  continua no Step 11.
- Separar alertas e documentos em endpoints próprios ou remover o payload legado
  do dashboard; isso pertence ao Step 4.
- Introduzir Redux, biblioteca de query/cache ou um design system novo.
- Alterar o algoritmo de hash de senha ou o formato do token de sessão.

## Direção visual do frontend

**Conceito:** credencial clínica editorial — uma interface institucional,
acolhedora e precisa, inspirada em documentos de saúde e cadernos clínicos, não
em um dashboard SaaS genérico.

- Paleta dominante em azul-tinta e papel claro, com verde de segurança como
  acento funcional e cores semânticas restritas a estados.
- Tipografia com contraste entre títulos editoriais e texto de interface legível,
  carregada por `next/font` para evitar mudança de layout.
- Superfícies com linhas de credencial, bordas precisas e profundidade discreta;
  sem gradiente roxo, glassmorphism genérico ou excesso de cards.
- Movimento CSS curto e respeitando `prefers-reduced-motion`; nenhuma animação
  é necessária para compreender ou operar a tela.
- Login responsivo, operável por teclado, com labels associados, foco visível,
  mensagens em região viva e botão de senha com nome acessível.
- As `roles` vêm do servidor. A interface não apresenta seletor de `role` no
  login.

## Regras de negócio e técnicas

1. Cada `User` possui uma ou mais `roles` concedidas pelo servidor entre
   `patient`, `doctor` e `admin`.
2. CPF identifica uma única pessoa em `users`; um `User` pode ter simultaneamente
   os perfis `Patient` e `Doctor`.
3. E-mail é único por `User` e a consulta de login usa SQL parametrizado.
4. `roles` e status ativo são definidos no servidor; o cliente não os envia nem
   pode elevá-los durante o login.
5. Não há seletor `Sou médico`/`Sou paciente` nem campo `role` aceito em
   endpoint público.
6. Se cadastro público de paciente for introduzido no futuro, o backend atribui
   `patient` de forma fixa. Cadastro profissional usa fluxo separado, protegido
   e não faz parte deste step.
7. No Step 3, contas são criadas por seed ou provisionamento interno confiável.
   Somente esse limite pode atribuir `doctor` ou `admin`.
8. O model `Doctor` armazena número do CRM e UF separadamente, com unicidade no
   par `(crm_state, crm_number)`.
9. Todo `Doctor` possui `verification_status` igual a `pending`, `verified` ou
   `rejected`; apenas `verified` concede a `role` `doctor`.
10. A verificação significa que um operador confiável conferiu nome, CRM/UF e
   situação profissional na fonte oficial. Digitar um CRM não altera esse
   estado.
11. O Step 3 não fornece interface administrativa para aprovar `doctors`. Seeds de
    desenvolvimento podem marcar explicitamente um perfil fictício como
    `verified` para demonstrar a experiência.
12. Credencial incorreta retorna `401` com mensagem genérica.
13. Credencial correta de `User` inativo retorna `403` com `Conta inativa.` e
   não cria sessão.
14. Um `User` com `Doctor` pendente pode autenticar sua identidade ou usar a
    `role` `patient`, mas não recebe autorização `doctor`.
15. Sessão armazena `user_id`, nunca CPF, CRM ou e-mail.
16. `get_current_user` valida token, expiração e status ativo antes de devolver a
   identidade.
17. Sessão de uma conta desativada é tratada como inválida e retorna `401`.
18. Um `Doctor` que deixou de estar `verified` perde a `role` profissional nas
    autorizações seguintes, sem perder outras `roles` concedidas.
19. Dependências de `role` retornam `403` com
   `Acesso não permitido para este perfil.` quando o usuário autenticado não
   possui uma `role` aceita.
20. Rotas de vacina continuam restritas a `patients`; `doctor` e `admin` recebem
    `403`, independentemente de valores enviados pelo cliente.
21. `patients.patient_id` é a chave interna e `users.cpf` permanece único.
22. `doctors.doctor_id` é a chave interna e `user_id` é único em cada perfil.
23. `vaccines`, `alerts` e `documents` passam a referenciar `patient_id` numérico.
24. Respostas clínicas não expõem `password_hash`, token ou CPF como ID técnico
    nem dados de outro perfil.
25. O envelope transitório de login e `/me` sempre inclui `user.roles`; dados do
    dashboard existem somente no contexto `patient`.
26. Para `doctor` e `admin`, o frontend mostra identidade e escopo atual, sem
    consultar nem renderizar dados clínicos.
27. Tokens continuam apenas em cookie HTTP-only; o frontend não usa
    `localStorage` ou `sessionStorage` para autenticação.
28. `npm test` executa testes unitários com Vitest; Playwright fica disponível em
    `npm run test:e2e`.
29. Testes React consultam a interface por `role`, label e texto acessível, sem
    depender de classes CSS ou detalhes internos de componentes.
30. Componentes cliente ficam limitados às fronteiras interativas; conteúdo
    estático permanece em Server Components quando possível.

## Cenários de aceitação

### Cenário: login com contexto de paciente

Dado um `User` ativo com a `role` `patient` e um perfil `Patient`
Quando envia e-mail e senha corretos
Então recebe `200`, cookie de sessão e identidade com `roles` autorizadas
E o envelope transitório contém somente o próprio dashboard no contexto
“Minha saúde”.

### Cenário: login com contexto profissional

Dado um `User` ativo com perfil `Doctor` verificado e `role` `doctor`
Quando envia e-mail e senha corretos
Então recebe `200`, cookie de sessão e identidade com `roles` autorizadas
E pode selecionar “Área profissional” sem receber dados clínicos de paciente.

### Cenário: alternar contexto de uma conta combinada

Dado um `User` com as `roles` `patient` e `doctor`
Quando alterna entre “Minha saúde” e “Área profissional”
Então a interface muda apenas o contexto visual entre `roles` autorizadas
E o backend continua validando a `role`, ownership e vínculo em cada operação.

### Cenário: bloquear autodeclaração de `doctor`

Dado um cliente não autenticado
Quando tenta enviar `role=doctor` ou dados de CRM num formulário público
Então o campo não faz parte do contrato aceito
E nenhuma conta profissional é criada ou promovida.

### Cenário: bloquear contexto profissional ainda não verificado

Dado um `User` ativo com perfil `Doctor` e `verification_status=pending`
Quando envia e-mail e senha corretos
Então sua identidade pode ser autenticada e suas outras `roles` permanecem
disponíveis
Mas a `role` `doctor` não é concedida nem aceita para autorização.

### Cenário: login de administrador

Dado um `User` ativo com a `role` `admin`
Quando envia e-mail e senha corretos
Então recebe `200`, cookie de sessão e identidade com `roles` autorizadas
E não recebe dados clínicos.

### Cenário: bloquear conta inativa

Dado um `User` inativo com senha correta
Quando tenta entrar
Então recebe `403` com `Conta inativa.`
E nenhuma sessão é persistida.

### Cenário: bloquear `role` incorreta

Dado um `User` sem a `role` `patient`
Quando chama uma rota exclusiva do contexto `patient`
Então recebe `403` com `Acesso não permitido para este perfil.`
E nenhuma consulta ou mutação clínica é realizada.

### Cenário: migrar relações para ID interno

Dado o schema inicial com relações por CPF
Quando a migration do Step 3 é aplicada
Então `patients` recebem IDs internos
E `sessions` referenciam `users`
E `vaccines`, `alerts` e `documents` referenciam `patient_id`
E CPF deixa de ser chave estrangeira.

### Cenário: login acessível no frontend

Dado que uma pessoa acessa a página inicial
Quando navega por teclado ou leitor de tela
Então encontra título, descrição, campos rotulados, controle de visibilidade e
botão de envio com nomes acessíveis
E erros do servidor são anunciados sem remover os dados digitados.

### Cenário: frontend de paciente

Dado que `/me` retorna `roles` contendo `patient` e dashboard
Quando a home termina de carregar
Então exibe identidade, perfil e recursos do próprio paciente
E preserva as operações atuais de vacina.

### Cenário: frontend de médico ou administrador

Dado que `/me` retorna `roles` contendo `doctor` ou `admin`
Quando a home termina de carregar
Então exibe uma credencial institucional com nome e contexto atual
E informa que recursos clínicos dependem da área autorizada futura
E não renderiza vacinas, alertas, documentos ou dados de paciente.

### Cenário: sessão ausente no frontend

Dado que `/me` retorna `401`
Quando a home é carregada
Então o navegador volta ao login
E nenhum dado protegido permanece visível.

## Contratos afetados

### Identidade autenticada

```json
{
  "user_id": 42,
  "display_name": "Dra. Helena Costa",
  "email": "helena.costa@example.com",
  "roles": ["patient", "doctor"]
}
```

`active` não precisa ser exposto em respostas autenticadas, pois somente contas
ativas alcançam esses contratos.

### Envelope transitório de autenticação

```json
{
  "message": "Login efetuado com sucesso!",
  "user": {},
  "patient_data": null,
  "vaccines": [],
  "alerts": [],
  "documents": []
}
```

- Para `patient`, `patient_data` e coleções preservam o contrato atual.
- Para `doctor` e `admin`, `patient_data` é `null` e todas as coleções são
  vazias.
- O Step 4 removerá o dashboard desse envelope e separará os recursos.

### API

| Método | Rota | Mudança no Step 3 |
|---|---|---|
| `POST` | `/login` | autentica `users`, bloqueia inativo e inclui `user.roles` |
| `POST` | `/logout` | remove `Session` vinculada a `user_id` |
| `GET` | `/me` | inclui identidade; dashboard apenas no contexto `patient` |
| `POST` | `/me/vaccines` | exige `role` `patient` e usa ID interno |
| `GET` | `/me/vaccines` | exige `role` `patient` e usa ID interno |
| `PUT` | `/me/vaccines/{vaccine_id}` | exige `role` `patient` e ownership interno |
| `DELETE` | `/me/vaccines/{vaccine_id}` | exige `role` `patient` e ownership interno |

### Dados

```text
users
- user_id BIGINT AUTO_INCREMENT PRIMARY KEY
- cpf CHAR(11) NOT NULL UNIQUE
- display_name VARCHAR(100) NOT NULL
- email VARCHAR(254) NOT NULL UNIQUE
- password_hash VARCHAR(255) NOT NULL
- active BOOLEAN NOT NULL DEFAULT TRUE
- created_at TIMESTAMP NOT NULL

user_roles
- user_id BIGINT NOT NULL -> users.user_id
- role ENUM('patient', 'doctor', 'admin') NOT NULL
- PRIMARY KEY (user_id, role)

patients
- patient_id BIGINT AUTO_INCREMENT PRIMARY KEY
- user_id BIGINT NOT NULL UNIQUE -> users.user_id
- demais campos clínicos atuais, sem CPF ou credenciais

doctors
- doctor_id BIGINT AUTO_INCREMENT PRIMARY KEY
- user_id BIGINT NOT NULL UNIQUE -> users.user_id
- crm_number VARCHAR(20) NOT NULL
- crm_state CHAR(2) NOT NULL
- verification_status ENUM('pending', 'verified', 'rejected') NOT NULL
- verified_at DATETIME NULL
- UNIQUE (crm_state, crm_number)
- created_at TIMESTAMP NOT NULL

sessions
- token_hash CHAR(64) PRIMARY KEY
- user_id BIGINT NOT NULL -> users.user_id
- expires_at DATETIME NOT NULL
- created_at TIMESTAMP NOT NULL
```

`vaccines.patient_id`, `alerts.patient_id` e `documents.patient_id` passam a
ser `BIGINT` e referenciam `patients.patient_id`.

### Estratégia de migration

- Criar `users`, `user_roles` e `doctors` numa nova revisão forward-only.
- Criar um `User` e a `role` `patient` para cada paciente existente antes de
  remover e-mail, senha e CPF do perfil `Patient`.
- Adicionar e preencher `patient_id` e `user_id`.
- Adicionar colunas numéricas temporárias nas relações clínicas, preenchê-las
  pelo CPF atual, trocar constraints e somente então remover as colunas antigas.
- Migrar `sessions` existentes para `user_id`; sessões sem correspondência são
  descartáveis por D003.
- Não alterar a migration `0001`; criar revisão `0002`.
- Seeds passam a criar identidades demonstrativas separadas e documentadas:
  - paciente adulto ativo com dashboard e vacinas;
  - paciente menor ativo para autorização por idade;
  - `User` com `patient` e `doctor`, `Doctor` verificado e CRM/UF fictício, para
    alternar entre “Minha saúde” e “Área profissional”;
  - `User` apenas `doctor`, ativo e verificado, para visualizar o perfil
    institucional;
  - `Doctor` `pending` sem `role` `doctor` para provar o bloqueio profissional;
  - administrador ativo;
  - usuário inativo.
- Credenciais de demonstração de paciente e médico ficam documentadas apenas
  para ambiente de desenvolvimento e nunca são carregadas automaticamente em
  produção.

## Arquitetura do frontend

- `app/page.jsx` permanece uma página de composição e renderiza um componente
  cliente pequeno para o formulário.
- A home separa resolução de estado autenticado da apresentação de paciente e
  da credencial institucional.
- `apiFetch` continua sendo o único cliente HTTP e mantendo
  `credentials: "include"`.
- Componentes introduzidos por este step ficam organizados por responsabilidade
  de autenticação/identidade, sem antecipar a reorganização completa do Step 11.
- Imports de ícones são diretos e componentes pesados não entram no bundle do
  estado institucional.
- Estado derivado de `roles` e contexto é calculado no render, não duplicado em
  effects.

## Segurança e autorização

- `role` nunca é aceita do formulário de login.
- Um CRM informado pelo usuário não concede `role` nem permissão. A mudança para
  `verified` ocorre somente em limite interno confiável.
- Dependência de `role` no backend é a fonte de autorização; esconder controles
  no frontend serve apenas à experiência.
- Queries continuam parametrizadas e testes de SQL injection do Step 2
  permanecem verdes após a mudança de schema.
- Hash de senha e token nunca aparecem na API, DOM, storage ou logs.
- Identidade da sessão vem do hash do cookie e de `user_id`.
- CRM e CPF completos não são exibidos em estados institucionais genéricos.
- Contextos `doctor` e `admin` não recebem payload clínico vazio por falha de
  filtro: o backend não executa as consultas de dashboard para essas `roles`.

## Casos de erro e limites

- E-mail ou senha incorretos: `401`, mensagem genérica atual.
- Conta inativa com senha correta: `403`, `Conta inativa.`.
- Contexto profissional pendente ou rejeitado: `role` `doctor` ausente ou
  rejeitada com `403`, sem invalidar outras `roles`.
- `role` incorreta em recurso autenticado: `403`.
- Cookie ausente, token desconhecido, expirado ou de conta desativada: `401`.
- `User` com `role` `patient` sem perfil correspondente: `409` com erro de
  integridade de conta, sem criar sessão.
- `User` com `role` `doctor` sem perfil/CRM correspondente: `409` com erro
  de integridade de conta, sem criar sessão.
- Falha de rede no login: mensagem de indisponibilidade na região de erro; o
  formulário volta ao estado editável.
- Falha de `/me`: `401` redireciona; outros erros exibem estado recuperável sem
  apresentar dados antigos.

## Estratégia de testes

### Backend e banco

- Migration `0002` em banco vazio e em schema `0001` com dados demonstrativos.
- Backfill de `User`/`Patient`, `user_roles` e troca de todas as chaves
  estrangeiras.
- Login válido por combinação de `roles`, senha incorreta, conta inativa e
  perfil inconsistente.
- Bloqueio de autodeclaração de `role` e de `Doctor` `pending`/`rejected`.
- `Session` por `user_id`, conta desativada e token expirado.
- `get_current_user`, dependências de `role` e bloqueio antes de SQL clínico.
- Ownership de vacinas pelo ID interno.
- Regressão de SQL injection e contratos do Step 2.

### Frontend unitário

- Adicionar `vitest`, `jsdom`, `@testing-library/react`,
  `@testing-library/jest-dom` e `@testing-library/user-event`.
- Configurar aliases `@/`, setup de matchers DOM e limpeza entre testes.
- Login: campos acessíveis, toggle de senha, loading, erro `401`, conta inativa,
  falha de rede e sucesso.
- Home: loading, `401`, paciente, médico e administrador.
- Garantir que estado institucional não renderiza componentes nem dados
  clínicos.
- Mockar `apiFetch` no limite do módulo, sem testar implementação do `fetch`.

### Frontend ponta a ponta

- Preservar cenários Playwright de login e paciente.
- Adicionar login com o paciente seedado e login com o médico verificado
  seedado, comprovando os dois perfis visuais.
- Adicionar ao menos um fluxo de papel institucional sem dados clínicos e o
  bloqueio do médico pendente.
- Manter Playwright separado da suíte unitária.

### Ciclos TDD iniciais

1. **Migration RED:** testes esperam `users`, `user_roles`, IDs internos e FKs
   numéricas;
   a revisão `0002` ainda não existe.
2. **Auth RED:** testes esperam login por `roles`, conta inativa e
   `get_current_user`; o backend ainda consulta `patients`.
3. **Frontend RED:** teste RTL espera formulário acessível e estado de conta
   inativa; infraestrutura e componentes ainda não existem.
4. **Role UI RED:** teste espera estado institucional sem conteúdo clínico; a
   home ainda pressupõe paciente.

## Evidência TDD

| Ciclo | Teste RED | Implementação GREEN | Refactor | Referência |
|---|---|---|---|---|
| migration 0002 | — | — | — | — |
| identidade e roles | — | — | — | — |
| login frontend | — | — | — | — |
| home por role | — | — | — | — |

## Critérios de conclusão

- [x] Spec revisada e aprovada.
- [ ] Migration `0002` validada em MySQL real e sem alterar `0001`.
- [ ] `Patient`, `Doctor` e `admin` compartilham autenticação e sessão.
- [ ] `Sessions` e relações clínicas não dependem de CPF.
- [ ] `Role` incorreta retorna `403` antes de acesso clínico.
- [ ] Conta inativa não cria nem reutiliza sessão.
- [ ] `Role` profissional não pode ser autodeclarada e `Doctor` não verificado
  não acessa o contexto profissional.
- [ ] Seeds demonstram login e interface distintos de `Patient` e `Doctor`
  verificado, além do bloqueio profissional de `Doctor` pendente.
- [ ] Login e home melhorados conforme a direção visual e requisitos de
  acessibilidade.
- [ ] Componentes desta entrega cobertos por React Testing Library.
- [ ] `npm test`, `npm run test:e2e`, `npm run build` e suíte backend passam.
- [ ] Contratos, seeds, documentação e roadmap sincronizados.

## Decisões aprovadas

1. O envelope transitório com `user` e dashboard opcional permanece até o
   Step 4, evitando antecipar a separação de recursos.
2. Para `doctor` e `admin`, a home mostra uma credencial institucional segura;
   o painel profissional completo permanece no Step 7.
3. Vitest + jsdom são o runner do `npm test`; Playwright fica em
   `npm run test:e2e`.
4. A primeira entrega restringe a criação de `doctors` a seed ou
   provisionamento interno. Cadastro e consulta automatizada ao conselho exigem
   uma spec futura.

## Decisões e observações

- Documento iniciado em 2026-10-02 na branch
  `feat/identity-roles-and-frontend`.
- A ampliação do Step 3 para incluir melhoria visual e testes unitários React
  foi solicitada pelo usuário em 2026-10-02.
- A direção visual foi influenciada pela skill `frontend-design`; a separação
  de fronteiras cliente/servidor e cuidados de bundle seguem
  `vercel-react-best-practices`.
- A pesquisa oficial do CFM oferece consulta pública por médicos e identifica o
  registro profissional por CRM; por isso o sistema não tratará um valor
  digitado como prova de habilitação. Referência:
  <https://crmvirtual.cfm.org.br/BR/servico/pesquisa-por-medicos>.
