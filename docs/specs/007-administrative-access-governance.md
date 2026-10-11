# Governança Administrativa e Vínculos de Cuidado

## Status

IMPLEMENTED

## Dependências

- Step 5: auditoria clínica transacional implementada.
- Step 7: grupos de atendimento e autorização médica por vínculo implementados.
- Step 9: cadastro local de pacientes e Google OIDC opcional implementados.
- Step 10 do roadmap.

## Contexto e problema

Os grupos atuais são preenchidos apenas por seed. Não existe API para cadastrar
médico, verificar CRM, criar grupo, convidar paciente ou revogar acesso. A role
`admin` autentica, mas a interface mostra apenas um placeholder institucional.

Estado verificado no código em `develop` (`65990d3`):

- `users.cpf` é obrigatório e único; `users.password_hash` aceita nulo somente
  para contas com identidade externa (`0007`).
- `doctors.verification_status` aceita `pending`, `verified` e `rejected`; não
  existe estado de suspensão ou desativação profissional.
- `_load_authorized_roles` remove `doctor` quando o perfil não está `verified`,
  mas não trata a combinação `admin` + role clínica.
- A autorização médica (`medical/router.py`) exige grupo, membro médico e
  vínculo do paciente `active` e vigentes; não há aceite do paciente.
- O seed mantém `admin@email.com` somente com `admin`; Helena possui `patient` e
  `doctor`, combinação que continua legítima.

Cada administrador será responsável somente pelos médicos, grupos e vínculos
que criou ou administra. Ele poderá localizar usuários ativos por dados
cadastrais mínimos para formar o vínculo, mas nunca consultar informação
clínica. O paciente precisa aceitar o convite antes de qualquer médico do grupo
receber acesso.

## Objetivos

- Criar a primeira conta administrativa por bootstrap operacional, sem rota
  pública.
- Provisionar médicos exclusivamente por convite emitido por admin autenticado.
- Permitir que o médico conclua o convite comprovando sua identidade, sem senha
  conhecida pelo administrador.
- Aplicar ownership administrativo a médicos, convites, grupos e vínculos.
- Oferecer diretório cadastral mínimo e paginado de usuários ativos.
- Exigir aceite do paciente para ativar o vínculo de cuidado.
- Revogar acesso de forma imediata e auditável, pelo paciente ou pelo admin.
- Separar auditoria administrativa da auditoria clínica.
- Garantir que `admin` nunca seja uma role de acesso ao prontuário.

## Não objetivos

- Cadastro público de médico ou administrador.
- Delegação ou criação de novos admins pela aplicação.
- Envio de e-mail; o link do convite é entregue pelo admin fora da aplicação.
- Médico criar seu cadastro, grupo ou vínculo, ou alterar o próprio CRM.
- Admin ler perfil clínico, vacina, marcador, alerta, documento, OCR,
  compartilhamento, auditoria clínica ou snapshot clínico.
- Admin alterar dados cadastrais de paciente.
- Validação automática de CRM em serviço externo.
- Transferência de médicos ou grupos entre admins.
- Acesso emergencial ou quebra de sigilo.
- Remoção física de médicos, grupos, convites ou vínculos.

## Regras de negócio

### Contas administrativas

1. Contas administrativas não possuem cadastro público. Elas nascem pelo comando
   operacional `python database_tasks.py create-admin`, que lê e-mail, CPF e nome
   por argumentos e a senha por prompt sem eco (`getpass`), nunca por argumento
   ou variável de ambiente. O comando cria `users`, `user_roles(admin)` e a
   senha com o mesmo hash do login local, numa única transação.
2. O comando recusa e-mail ou CPF já existentes; ele não promove conta existente
   a admin.
3. `admin` é exclusiva: a conta não possui `patient` nem `doctor`. Uma pessoa
   que também seja paciente ou médica usa outra conta, sem privilégio
   administrativo.
4. Como a regra cruza linhas de `user_roles`, ela é garantida pelos casos de uso
   e, defensivamente, por `_load_authorized_roles`: se a identidade contém
   `admin`, as roles efetivas passam a ser somente `["admin"]`. Assim, dado
   inconsistente criado fora da aplicação não concede acesso clínico.

### Convite e perfil profissional

5. O admin emite convite profissional com CPF, nome, e-mail, número e UF do CRM.
   O convite registra `created_by_admin_user_id`, expira em 7 dias e é de uso
   único. O token bruto, com 256 bits aleatórios, é devolvido somente na
   resposta de criação; o banco guarda apenas seu SHA-256.
6. Emitir convite falha com `409` quando já existe convite `pending` não expirado
   para o mesmo e-mail, CPF ou CRM, ou quando o CRM já pertence a um perfil.
7. O admin entrega o link `/professional-invitation#token=<token>`. O token fica
   no fragmento para não chegar a logs de servidor, proxy ou `Referer`.
8. O médico conclui o convite autenticando-se com Google. O backend exige token
   de convite `pending`, não expirado e não revogado, e e-mail Google verificado
   igual ao e-mail esperado do convite. Apresentar Google sem convite válido
   nunca cria `doctor` e retorna `403`.
9. Ao concluir:
   - Se a identidade Google já pertence a uma conta, essa conta deve estar ativa,
     não ser admin, não possuir `doctor` e ter CPF igual ao do convite; ela
     recebe a role `doctor` e o perfil profissional.
   - Se a identidade é nova e não existe conta com o CPF ou e-mail do convite,
     cria-se `users` sem senha, identidade externa, role `doctor` e perfil.
   - Se já existe conta local com o CPF ou e-mail do convite, mas sem essa
     identidade Google, retorna `409`: a pessoa entra com sua conta, vincula o
     Google em configurações e então conclui o convite. Contas nunca são unidas
     por e-mail.
10. A conclusão é atômica: perfil, role, identidade externa quando nova, convite
    `accepted`, sessão local e evento administrativo são gravados juntos ou
    nada é gravado. Duas conclusões concorrentes do mesmo convite resultam em
    uma única aceitação; a outra recebe `403`.
11. O perfil nasce com `verification_status = 'pending'`,
    `professional_status = 'active'` e `created_by_admin_user_id` do convite.
    Ele não acessa `/medical` até a verificação manual do CRM.

### Gestão de médicos

12. O admin somente lista, consulta, corrige, verifica, rejeita, suspende,
    reativa e desativa médicos com `created_by_admin_user_id` igual ao seu
    `user_id`. Médico de outro admin ou ID desconhecido retornam o mesmo `404`.
13. Correção altera somente `crm_number` e `crm_state`. Corrigir CRM de perfil
    `verified` ou `rejected` o retorna a `pending`. Nome, e-mail e CPF pertencem
    à conta e não são alterados pelo admin.
14. Transições permitidas:

    | Ação | De | Para |
    |---|---|---|
    | `verify` | `verification_status = pending` | `verified`, grava `verified_at` |
    | `reject` | `verification_status = pending` | `rejected` |
    | `suspend` | `professional_status = active` | `suspended` |
    | `reactivate` | `professional_status = suspended` | `active` |
    | `deactivate` | `active` ou `suspended` | `deactivated` (terminal) |

    Transição fora da tabela retorna `409` sem alterar dados.
15. Somente perfil `verified` e `active` concede a role `doctor` efetiva.
    Suspensão torna o acesso ineficaz na requisição seguinte e preserva as
    associações a grupos para reativação. Desativação encerra também as
    associações ativas do médico em `doctor_care_groups` (`inactive`,
    `ends_at` atual). A conta do usuário e suas outras roles não são alteradas.

### Grupos e vínculos

16. Grupo criado pela API registra `managed_by_admin_user_id`. Somente o admin
    gestor consulta, renomeia, ativa, inativa ou altera membros do grupo.
    Grupos legados sem gestor não aparecem para nenhum admin.
17. Somente médicos criados pelo admin gestor e não `deactivated` podem ser
    adicionados ao grupo. O médico só acessa pacientes do grupo quando também
    estiver `verified` e `active`.
18. O admin pode convidar para um grupo ativo sob sua gestão qualquer usuário
    ativo com role `patient`. Ele não altera a conta nem o perfil do paciente.
19. Há no máximo um convite `pending` por grupo e paciente, e não se convida
    paciente com vínculo já ativo no grupo (`409` em ambos os casos).
20. Convite de cuidado nasce `pending`, expira em 7 dias e é visível somente ao
    paciente convidado e ao admin gestor. Não possui token: aparece na conta
    autenticada do paciente. Nenhum médico encontra ou abre o paciente nesse
    estado.
21. Somente o paciente convidado aceita ou recusa o próprio convite. O aceite
    cria ou reativa `patient_care_groups` com `status = 'active'`,
    `starts_at` atual e `ends_at` nulo. A recusa preserva o registro sem
    vínculo. Convite expirado, recusado, cancelado ou de outro paciente retorna
    `404` uniforme.
22. O admin gestor pode cancelar convite `pending` do seu grupo.
23. O paciente e o admin gestor podem revogar um vínculo ativo. A revogação
    grava `status = 'inactive'` e `ends_at` atual, e a autorização médica deixa
    de valer na requisição seguinte. Revogar não apaga histórico clínico nem
    eventos de auditoria; um novo convite pode ser emitido depois.
24. Inativar grupo não altera os vínculos, mas a autorização médica já exige
    grupo `active`.

### Diretório e isolamento clínico

25. O diretório retorna somente usuários ativos sem role `admin`, com a
    allowlist: `user_id`, `display_name`, `profiles` (`patient` e/ou `doctor`) e
    `masked_cpf` no formato `***.456.789-**`. Não faz join com tabelas clínicas
    nem com `patients`/`doctors` além da presença de role.
26. A busca exige `query` com nome de ao menos 3 caracteres (prefixo de
    `display_name`) ou CPF exato de 11 dígitos. CPF integral nunca é devolvido.
    Página máxima de 20 itens, sem exportação.
27. Rotas `/admin` usam schemas próprios, não reutilizam schemas clínicos e não
    carregam prontuário, ainda que recebam um identificador de paciente.
28. Admin recebe `403` em todas as rotas `/me` clínicas, `/medical` e
    `/patients`, sem leitura de dados e sem evento de auditoria clínica.

### Auditoria administrativa

29. Ações administrativas usam a tabela `administrative_audit_events`, com ator,
    admin responsável pelo recurso, ação, tipo e ID do alvo, data e detalhes por
    allowlist. Não armazena CPF integral, e-mail completo, senha, token ou dado
    clínico. `clinical_audit_events` nunca é exposta ao admin.
30. São auditados: emissão, conclusão e revogação de convite profissional;
    correção e transições de médico; criação e alteração de grupo; adição e
    remoção de médico em grupo; convite, cancelamento, aceite, recusa e
    revogação de vínculo. Eventos praticados pelo paciente registram como
    responsável o admin gestor do grupo.
31. O admin consulta somente eventos cujo `managing_admin_user_id` é o seu.
32. Toda mutação desta spec é atômica com seu evento administrativo.

## Cenários de aceitação

### Cenário: criar primeiro admin por bootstrap

Dado um banco migrado sem contas administrativas
Quando o operador executa `create-admin` com e-mail, CPF e nome e digita a senha
Então existe uma conta somente com a role `admin`
E nenhum endpoint HTTP permite criar outra conta administrativa.

### Cenário: emitir convite profissional

Dado um admin autenticado
Quando emite convite com CPF, nome, e-mail e CRM válidos
Então recebe `201` com o token uma única vez e o convite fica `pending`
E o banco guarda somente o hash do token
E um evento administrativo registra a emissão.

### Cenário: médico conclui convite com Google

Dado um convite pendente e válido para `medico@example.com`
Quando a pessoa autentica com Google verificado para esse e-mail e envia o token
Então recebe `201`, sessão local e conta com perfil profissional `pending`
E o convite passa a `accepted` e não pode ser reutilizado
E o médico ainda recebe `403` em `/medical/patients`.

### Cenário: impedir autocadastro profissional com Google

Dado um usuário autenticado pelo Google sem convite válido, com convite expirado
ou com e-mail diferente do convite
Quando tenta concluir cadastro de médico
Então recebe `403`
E nenhuma conta, role, perfil ou identidade é criada.

### Cenário: gerenciar somente os próprios médicos

Dado o admin A que criou o médico M e o admin B
Quando B tenta consultar, corrigir, verificar ou suspender M
Então recebe `404` idêntico ao de ID inexistente
E M continua inalterado.

### Cenário: verificar e suspender médico

Dado um médico pendente criado pelo admin A, num grupo com vínculo ativo
Quando A verifica o CRM
Então o médico acessa os pacientes do grupo
Quando A suspende o médico
Então a requisição seguinte do médico a `/medical` retorna `403`
E a associação ao grupo permanece para reativação.

### Cenário: consultar diretório sem prontuário

Dado um admin autenticado
Quando busca um paciente ativo por nome ou CPF exato
Então recebe apenas `user_id`, `display_name`, `profiles` e `masked_cpf`
E a query não referencia tabelas clínicas.

### Cenário: convite não concede acesso imediato

Dado um admin gestor e um paciente ativo
Quando o admin convida o paciente para seu grupo
Então o convite fica pendente
E os médicos do grupo ainda não encontram nem abrem o paciente.

### Cenário: paciente aceita o cuidado

Dado um convite pendente e válido
Quando o paciente convidado aceita
Então o vínculo passa a ativo
E somente médicos verificados e ativos do grupo passam a acessar o prontuário.

### Cenário: outro paciente não decide o convite

Dado um convite pendente para o paciente P
Quando o paciente Q tenta aceitar ou recusar
Então recebe `404`
E o convite permanece pendente.

### Cenário: negar prontuário ao admin

Dado um admin que criou o médico, grupo e convite
Quando chama qualquer endpoint clínico do paciente
Então recebe `403`
E nenhum metadado ou conteúdo clínico é retornado ou auditado como leitura.

### Cenário: negar clínica a admin inconsistente

Dado uma conta com `admin` e `patient` criada diretamente no banco
Quando acessa `/me/vaccines` ou `/medical/patients`
Então recebe `403`.

### Cenário: revogar acesso

Dado um vínculo ativo
Quando o paciente ou o admin gestor o revoga
Então o médico perde acesso na requisição seguinte
E a revogação identifica ator, vínculo e data na auditoria administrativa.

## Contratos afetados

### API

Todas as rotas `/admin` exigem sessão com role efetiva `admin`. Todos os schemas
de entrada usam `extra="forbid"`. Listas usam `page` (≥ 1) e `page_size`
(1–20, padrão 20) e devolvem `{"items": [...], "page": n, "has_next": bool}`.

```text
GET    /admin/users?query=&page=&page_size=

POST   /admin/doctor-invitations
GET    /admin/doctor-invitations?status=&page=
DELETE /admin/doctor-invitations/{invitation_id}

GET    /admin/doctors?page=
GET    /admin/doctors/{doctor_id}
PATCH  /admin/doctors/{doctor_id}
POST   /admin/doctors/{doctor_id}/status

POST   /admin/care-groups
GET    /admin/care-groups?page=
GET    /admin/care-groups/{group_id}
PATCH  /admin/care-groups/{group_id}
PUT    /admin/care-groups/{group_id}/doctors/{doctor_id}
DELETE /admin/care-groups/{group_id}/doctors/{doctor_id}
POST   /admin/care-groups/{group_id}/patient-invitations
DELETE /admin/care-groups/{group_id}/patient-invitations/{invitation_id}
DELETE /admin/care-groups/{group_id}/patients/{user_id}

GET    /admin/audit-events?page=

POST   /auth/google/doctor-invitation

GET    /me/care-invitations
POST   /me/care-invitations/{invitation_id}/accept
POST   /me/care-invitations/{invitation_id}/reject
GET    /me/care-groups
DELETE /me/care-groups/{group_id}
```

Payloads principais:

```json
// POST /admin/doctor-invitations  →  201
{"cpf": "00011122233", "display_name": "Dra. Ana Lima",
 "email": "ana.lima@example.com", "crm_number": "123456", "crm_state": "SP"}
{"invitation_id": 7, "status": "pending", "expires_at": "...",
 "token": "<exibido uma única vez>"}

// POST /admin/doctors/{doctor_id}/status  →  200 AdminDoctor
{"action": "verify"}   // verify | reject | suspend | reactivate | deactivate

// PATCH /admin/doctors/{doctor_id}  →  200 AdminDoctor
{"crm_number": "654321", "crm_state": "RJ"}

// AdminDoctor
{"doctor_id": 3, "display_name": "Dra. Ana Lima", "masked_cpf": "***.111.222-**",
 "crm_number": "123456", "crm_state": "SP", "verification_status": "pending",
 "professional_status": "active", "verified_at": null}

// POST /admin/care-groups  →  201 ; PATCH aceita name e/ou status
{"name": "Cardiologia — Unidade Centro"}

// GET /admin/care-groups/{group_id}
{"care_group_id": 1, "name": "...", "status": "active",
 "doctors": [AdminDoctor],
 "patients": [{"user_id": 9, "display_name": "...", "masked_cpf": "...",
               "link_status": "active", "starts_at": "..."}],
 "pending_invitations": [{"invitation_id": 4, "user_id": 9,
                          "display_name": "...", "expires_at": "..."}]}

// POST /admin/care-groups/{group_id}/patient-invitations  →  201
{"user_id": 9}

// GET /admin/users  →  200
{"items": [{"user_id": 9, "display_name": "Carlos da Silva",
            "profiles": ["patient"], "masked_cpf": "***.222.333-**"}],
 "page": 1, "has_next": false}

// POST /auth/google/doctor-invitation  →  201 AuthenticationResponse + cookie
{"credential": "<id token Google>", "invitation_token": "<token>"}

// GET /me/care-invitations  →  200
[{"invitation_id": 4, "care_group_name": "...", "expires_at": "...",
  "doctors": [{"display_name": "Dra. Ana Lima", "crm_number": "123456",
               "crm_state": "SP"}]}]

// GET /me/care-groups  →  200
[{"care_group_id": 1, "name": "...", "starts_at": "...",
  "doctors": [{"display_name": "...", "crm_number": "...", "crm_state": "SP"}]}]
```

Respostas sem corpo: `DELETE` de convites e vínculos, `PUT`/`DELETE` de médico
em grupo e `accept`/`reject` retornam `204`. `PATCH /admin/doctors/{id}` exige
`crm_number` e `crm_state` juntos. `GET /admin/doctor-invitations` devolve
`invitation_id`, `display_name`, `email`, `crm_number`, `crm_state`, `status`
(`pending`, `accepted`, `revoked` ou `expired`, calculado pela data) e
`expires_at`, nunca token ou hash. `GET /admin/audit-events` devolve `event_id`,
`actor_user_id`, `action`, `target_type`, `target_id`, `details` e
`occurred_at`.

O paciente vê nome e CRM dos médicos verificados e ativos do grupo para decidir
com informação; não vê o admin gestor nem outros pacientes.

### Erros

| Situação | Resposta |
|---|---|
| Sessão ausente ou expirada | `401` |
| Role efetiva sem permissão (inclui admin em rota clínica) | `403` |
| Convite profissional inválido, expirado, usado, revogado ou e-mail divergente | `403` |
| Google desabilitado | `404` em `/auth/google/doctor-invitation` |
| Recurso de outro admin, inexistente ou convite de outro paciente | `404` uniforme |
| Duplicidade de convite, CRM, e-mail/CPF existente na conclusão, vínculo já ativo, transição inválida | `409` |
| Payload inválido ou campo extra | `422` |
| Banco indisponível | `503` sem detalhes internos |

### Dados

Migration forward-only `0008`:

```text
doctors
+ created_by_admin_user_id BIGINT NULL FK users RESTRICT
+ professional_status ENUM('active','suspended','deactivated') NOT NULL DEFAULT 'active'
+ INDEX (created_by_admin_user_id)

care_groups
+ managed_by_admin_user_id BIGINT NULL FK users RESTRICT
+ UNIQUE (managed_by_admin_user_id, name)

doctor_invitations
- doctor_invitation_id BIGINT PK
- token_hash CHAR(64) UNIQUE NOT NULL
- created_by_admin_user_id BIGINT NOT NULL FK users RESTRICT
- cpf CHAR(11), display_name VARCHAR(100), email VARCHAR(254)
- crm_number VARCHAR(20), crm_state CHAR(2)
- status ENUM('pending','accepted','revoked') NOT NULL
- expires_at DATETIME(6) NOT NULL
- accepted_user_id BIGINT NULL FK users RESTRICT
- created_at, updated_at DATETIME(6)

care_group_patient_invitations
- care_invitation_id BIGINT PK
- care_group_id BIGINT NOT NULL FK care_groups RESTRICT
- patient_id BIGINT NOT NULL FK patients RESTRICT
- invited_by_admin_user_id BIGINT NOT NULL FK users RESTRICT
- status ENUM('pending','accepted','rejected','cancelled','expired') NOT NULL
- pending_key TINYINT GENERATED (IF(status='pending',1,NULL)) STORED
- UNIQUE (care_group_id, patient_id, pending_key)
- expires_at, decided_at, created_at, updated_at DATETIME(6)

administrative_audit_events
- administrative_audit_event_id BIGINT PK
- actor_user_id BIGINT NOT NULL
- managing_admin_user_id BIGINT NULL (nulo somente em grupo legado sem gestor)
- action VARCHAR(64) NOT NULL
- target_type VARCHAR(32) NOT NULL
- target_id BIGINT NOT NULL
- details JSON NULL (allowlist)
- occurred_at DATETIME(6) NOT NULL
- INDEX (managing_admin_user_id, occurred_at)
```

Convite de cuidado `pending` vencido é marcado `expired` quando o admin emite
um novo convite para o mesmo grupo e paciente, liberando a unicidade de
pendência. Evento praticado pelo paciente em grupo legado sem gestor é gravado
com `managing_admin_user_id` nulo e não é visível a nenhum admin.

Os campos de gestão ficam nulos para dados legados e são obrigatórios nos casos
de uso que criam médico ou grupo. Linhas legadas sem gestor não são
gerenciáveis por nenhum admin. A migration não remove roles: a negação
defensiva da regra 4 cobre combinações inconsistentes sem apagar dados.

Seed de desenvolvimento: `admin@email.com` passa a ser gestor dos grupos
demonstrativos e criador dos médicos demonstrativos; adiciona-se um convite de
cuidado pendente para um paciente sem vínculo, permitindo exercitar a caixa de
convites.

### Frontend

- `/home` no contexto `admin` substitui o placeholder por `AdminDashboard`,
  com seletor segmentado (`aria-pressed`) entre Médicos, Grupos, Diretório e
  Auditoria. Nenhuma rota clínica é chamada nesse contexto.
- **Médicos:** formulário de convite (CPF, nome, e-mail, CRM e UF por
  `ClinicalSelect`); após `201`, o link
  `<origem>/professional-invitation#token=<token>` aparece uma única vez com
  ação de copiar e some ao emitir outro convite ou trocar de aba; o token nunca
  vai para storage. Lista de convites com revogação confirmada e lista de
  médicos com ações conforme a tabela de transições (suspender, desativar e
  rejeitar exigem confirmação) e correção de CRM em diálogo.
- **Grupos:** criação por nome, lista e detalhe com ativar/inativar, médicos
  (adicionar entre os próprios médicos não desativados; remover com
  confirmação), pacientes ativos (revogar com confirmação) e convites
  pendentes (cancelar com confirmação).
- **Diretório:** busca por nome (≥ 3 caracteres) ou CPF completo, resultados
  somente com nome, perfis e CPF mascarado, e convite do paciente para um grupo
  ativo escolhido em `ClinicalSelect`.
- **Auditoria:** eventos administrativos com rótulo legível, alvo e data,
  paginados por "Carregar mais".
- `/professional-invitation` lê o token do fragmento, remove-o da barra de
  endereço com `history.replaceState` mantendo-o só em memória, oferece somente
  "Continuar com Google" e trata link ausente, Google indisponível, `403`, `409`
  e falha de rede com mensagens sem detalhes internos. Sucesso redireciona para
  `/home`.
- O contexto `patient` ganha a seção "Equipes de cuidado": convites pendentes
  com nome do grupo, médicos (nome e CRM/UF) e validade, ações aceitar/recusar,
  e grupos ativos com revogação confirmada. Paciente menor vê convites e grupos,
  mas não recebe ações e lê que a decisão exige maioridade.
- Diálogos de confirmação usam um componente compartilhado de AlertDialog em
  `components/ui/`; a ação destrutiva nunca recebe o foco inicial.
- Todos os fluxos são mobile-first a partir de 320 px, com alvo de 44 px,
  foco visível e estados de carregamento, vazio, erro e sucesso.

## Segurança e autorização

- Ownership administrativo é repetido no `WHERE` SQL de cada leitura e mutação
  (`created_by_admin_user_id` ou `managed_by_admin_user_id = %s`); o frontend
  não participa da autorização.
- Mutações carregam o recurso com `SELECT ... FOR UPDATE` dentro da transação.
- Diretório e endpoints de gestão não reutilizam schemas clínicos nem joins do
  prontuário.
- Admin não herda `patient` ou `doctor` e não recebe bypass de vínculo;
  `_load_authorized_roles` reduz a `["admin"]` qualquer identidade com `admin`.
- IDs desconhecidos e recursos de outro admin retornam a mesma resposta.
- Token de convite profissional: 256 bits, somente hash persistido, uso único,
  comparação pelo hash, nunca logado nem auditado.
- Google autentica o convidado, mas somente o convite emitido pelo admin permite
  criar a role e o perfil profissional; e-mail federado é conferido, nunca usado
  para unir contas.
- Auditoria administrativa não armazena CPF integral, e-mail completo, senha,
  token, prontuário ou snapshots clínicos.

## Casos de erro e limites

- `display_name` de 3 a 100 caracteres; CPF com 11 dígitos válidos; `crm_state`
  com UF brasileira; `crm_number` de 4 a 10 dígitos.
- Nome de grupo de 3 a 100 caracteres, sem duplicidade por admin (`409`).
- Paginação com `page_size` acima de 20 retorna `422`.
- Aceitar convite expirado retorna `404` e não cria vínculo.
- Conclusão concorrente do mesmo convite profissional ou de cuidado resulta em
  uma única mudança de estado.
- Falha de banco durante qualquer mutação não deixa estado parcial nem evento
  órfão.

## Estratégia de testes

### Primeiro ciclo RED

`POST /admin/doctor-invitations` com sessão admin retorna hoje `404`; o teste
espera `201` com convite `pending` e hash persistido.

### Ciclos seguintes, em ordem de entrega

1. Exclusividade defensiva: identidade `admin` + `patient` recebe `403` nas
   rotas clínicas; admin puro recebe `403` em `/me`, `/medical` e `/patients`.
2. Bootstrap `create-admin`: cria admin único, recusa duplicidade, não aceita
   senha por argumento.
3. Migration `0008` no MySQL 8 real, inclusive sobre dados do seed.
4. Convite profissional: emissão, duplicidade, listagem e revogação por dono.
5. Conclusão Google: sucesso, sem convite, expirado, usado, e-mail divergente,
   conta existente, identidade já vinculada, concorrência e rollback.
6. Gestão de médicos: matriz admin dono, outro admin, médico, paciente e sessão
   ausente; transições válidas e inválidas; efeito imediato da suspensão.
7. Grupos e membros médicos com ownership cruzado.
8. Diretório: allowlist exata, paginação, busca por CPF exato e teste que
   inspeciona o SQL e prova ausência de tabelas clínicas.
9. Convite de cuidado: pending sem acesso, aceite, recusa, expiração,
   cancelamento, revogação por paciente e por admin, concorrência.
10. Auditoria administrativa: eventos atômicos, escopo por admin, ausência de
    campos sensíveis.
11. Regressão: nenhuma rota `/admin` retorna campo clínico; autorização médica
    existente permanece verde.
12. Frontend (Vitest e Playwright): área admin, conclusão do convite
    profissional e caixa de convites do paciente em 320 px e viewport ampla,
    incluindo vazio, erro, confirmação e ownership.

## Evidência TDD

| Ciclo | Teste RED | Implementação GREEN | Refactor | Referência |
|---|---|---|---|---|
| 1 | `test_admin_issues_single_use_doctor_invitation`: `404`; `test_migration_0008_...`: arquivo inexistente | migration `0008`, rota `POST /admin/doctor-invitations`, hash do token e evento administrativo | — | `test_administrative_governance.py`, `test_migrations.py` |
| 2 | admin + role clínica e médico suspenso recebiam roles clínicas | `_load_authorized_roles` reduz a `["admin"]` e exige perfil `verified` + `active` | fakes alinhados ao novo SELECT | `test_identity_authorization.py` |
| 3 | `main()` sem `create_admin_use_case`; `AdminBootstrapError` inexistente | `create-admin` transacional com senha por `getpass` | mensagem amigável na CLI e alvo `make admin-create` | `test_migrations.py`, `test_administrative_governance.py` |
| 4 | duplicidade aceita, listagem `405`, revogação e conclusão Google `404` | duplicidade, listagem, revogação e conclusão atômica com `FOR UPDATE` | — | `test_administrative_governance.py` |
| 5 | `/admin/doctors` `404` | listagem, detalhe, correção de CRM e transições com auditoria | colunas mascaradas compartilhadas | `test_administrative_governance.py` |
| 6 | grupos e diretório `404`; `search_directory` inexistente; unicidade de nome ausente | grupos com ownership, membros médicos e diretório por allowlist | — | `test_administrative_governance.py`, `test_admin_directory.py` |
| 7 | convites de cuidado `404` | convite, aceite/recusa com `require_adult`, cancelamento e revogação | revogação compartilhada entre paciente e admin | `test_administrative_governance.py` |
| 8 | `/admin/audit-events` `404` | consulta por `managing_admin_user_id` | paginação extraída para dependência única | `test_administrative_governance.py` |
| 9 | componentes `AdminDashboard`, `CareInvitations` e `ProfessionalInvitation` inexistentes; home admin ainda no placeholder | área admin, seção de equipes, página de convite e `ConfirmDialog` | `formatDate` e requisições admin compartilhados | testes Vitest |
| 10 | contrato do design system sem estilos admin/equipes e sem `ConfirmDialog` documentado | CSS somente com tokens e `min-width`; guia atualizado | — | `design-system.test.js`, `admin-governance.spec.ts` |

Os testes de isolamento clínico do admin passaram já no primeiro run, pois a
exclusividade do ciclo 2 cobre o comportamento; ficam como regressão. A
asserção do status `expired` na migration foi adicionada junto com o ajuste
de schema, sem RED isolado.

## Critérios de conclusão

- [x] Spec aprovada antes do primeiro RED.
- [x] Primeira conta admin nasce somente por bootstrap operacional.
- [x] Conta administrativa não acumula role clínica efetiva.
- [x] Médico nasce somente de convite emitido por admin e concluído com Google.
- [x] Admin gerencia somente médicos, grupos e vínculos sob sua
      responsabilidade.
- [x] Paciente aceita antes de o médico receber acesso; revogação é imediata.
- [x] Admin não acessa nenhuma informação clínica.
- [x] Auditoria administrativa é consultável sem expor auditoria clínica.
- [x] Fluxos funcionam em 320 px e viewport ampla.
- [x] Definition of Done atendida.

## Verificações executadas

- Backend: `python -m pytest` (154 passed, 30 skipped) e
  `RUN_DB_INTEGRATION=1 python -m pytest` no MySQL 8 real (184 passed),
  incluindo migration `0008`, seed e concorrência de convites.
- Frontend: `npm test` (64 passed), `npx playwright test` (24 passed, com os
  novos cenários em 320 px e 1440 px) e `npm run build`.
- `git diff --check` sem pendências.
- Não executado: `npm run lint`, porque `eslint` não está instalado no
  projeto (situação anterior a esta entrega); conclusão real com Google, pois os
  testes usam verificador injetado; stack Docker local não foi reconstruída
  nem migrada para `0008`.

## Tarefas menores

| ID | Título | Dono | Esforço | Pré-requisitos | Definition of Done |
|---|---|---|---|---|---|
| T1 | Exclusividade defensiva de `admin` | backend | S | spec aprovada | identidades com `admin` sem acesso clínico |
| T2 | Bootstrap `create-admin` | backend/infra | S | spec aprovada | comando transacional e testado |
| T3 | Migration `0008` e seed | backend/infra | M | spec aprovada | upgrade e seed passam no MySQL 8 |
| T4 | Auditoria administrativa | backend | S | T3 | registro atômico e consulta por escopo |
| T5 | Convite profissional e conclusão Google | backend | L | T3, T4 | matriz de convite e rollback verdes |
| T6 | Gestão de médicos | backend | M | T5 | ownership e transições verdes |
| T7 | Grupos e diretório | backend | M | T4, T6 | ownership e allowlist verdes |
| T8 | Convites e vínculos de cuidado | backend | L | T7 | aceite, recusa, revogação e concorrência verdes |
| T9 | Área admin, convite profissional e caixa do paciente | frontend | L | T5–T8 | estados acessíveis em 320 px e desktop |
| T10 | Regressão e documentação | fullstack/qa | M | T1–T9 | suítes, build, Compose e roadmap sincronizados |

## Decisões e observações

1. Médico é criado na conclusão do convite, não na emissão: o convite guarda os
   dados pendentes, evitando contas sem credencial e sem titular comprovado.
2. Suspensão preserva associações a grupos (ineficaz enquanto durar);
   desativação é terminal e encerra as associações do médico.
3. Convites profissional e de cuidado expiram em 7 dias.
4. Diretório desambigua por `display_name` e `masked_cpf` (6 dígitos centrais).
5. Campos de gestão são nulos para dados legados em vez de backfill na
   migration, que não deve depender de seed.

6. Revisão aprovada em 2026-10-10: a conclusão do convite profissional exige
   Google; não há definição de senha local pelo médico nesta entrega.
7. Revisão aprovada em 2026-10-10: aceitar, recusar e revogar vínculo de
   cuidado seguem `require_adult`; paciente menor recebe `403`. Visualizar
   convites e grupos (`GET`) permanece permitido.
