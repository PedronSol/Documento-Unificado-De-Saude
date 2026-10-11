# Cadastro Assistido de Pacientes e Responsáveis Legais

## Status

SPEC APPROVED

## Dependências

- Step 7: área médica e autorização por vínculo (`030-medical-panel.md`).
- Step 8: compartilhamento temporário (`040-health-summary-sharing.md`).
- Step 9: cadastro local e Google do paciente (`006-patient-onboarding-authentication.md`).
- Step 10: governança administrativa e convites de cuidado
  (`007-administrative-access-governance.md`).
- Step 15 do roadmap.

## Contexto e problema

Hoje o médico só alcança pacientes que aceitaram convite de um grupo gerido por
admin, não cadastra pacientes e não altera prontuário de menor (regra 12 da
spec 030). Menores também não decidem nem compartilham nada, e a spec 040
deixou a representação legal para uma spec própria.

Na prática clínica, o médico precisa:

1. adicionar à sua lista um paciente que já tem conta;
2. atender quem ainda não tem conta, registrando informações desde a primeira
   consulta e entregando o prontuário ao paciente depois; e
3. atender menores, cujas decisões cabem a um responsável legal.

Esta spec mantém os grupos do admin intocados e cria três conceitos:
**vínculo direto médico–paciente**, **paciente provisório** e **guarda
(responsável legal)**.

## Decisões aprovadas (2026-10-11)

1. Paciente com conta só é acessado após aceite da solicitação do médico.
2. O vínculo é direto entre médico e paciente, separado dos grupos do admin.
3. Paciente provisório é assumido por link/QR de uso único com CPF e data de
   nascimento, criando acesso com e-mail/senha ou Google.
4. Após assumir a conta, o vínculo com o médico autor continua ativo e o
   paciente pode revogá-lo.
5. Menores entram nesta entrega, sempre associados a um responsável legal, com
   fluxo completo.
6. Link de reivindicação vale 7 dias e é revogado após 5 tentativas inválidas.
7. O médico autor corrige nome e data de nascimento do provisório antes da
   reivindicação.
8. A maioridade não encerra a guarda automaticamente: o vínculo com o
   responsável termina só quando o dependente pede o desvínculo ou o
   responsável renuncia.
9. Não há limite de responsáveis por dependente.

## Objetivos

- Médico verificado e ativo solicita vínculo direto com paciente cadastrado.
- Médico cria paciente provisório, adulto ou menor, com CPF único e acesso
  imediato por ser o autor do cadastro.
- Médico registra informações clínicas de adultos e menores pelos endpoints
  médicos existentes.
- Menor sempre tem responsável legal adulto, que decide e age por ele.
- Paciente ou responsável assume a conta por link/QR de reivindicação.
- Responsável administra o prontuário do dependente no próprio login.
- Dependente adulto pode receber a própria conta e pedir o desvínculo do
  responsável quando achar necessário.
- Toda ação é auditada na auditoria clínica do paciente afetado.

## Não objetivos

- Alterar grupos geridos por admin ou dar ao médico qualquer poder sobre eles.
- Acesso imediato do médico a prontuário de paciente que já possui conta.
- Envio de e-mail ou SMS; links são entregues pelo médico ou responsável.
- Assumir conta apenas informando CPF no cadastro público.
- Validar documento de guarda ou certidão; a guarda é declarada e auditada.
- Emancipação, curatela de adultos ou decisões judiciais.
- Novos tipos de dado clínico: documentos chegam no Step 11.
- Unir contas automaticamente por e-mail ou CPF.

## Regras de negócio

### Vínculo direto

1. Somente médico `verified` e `active` cria, consulta ou encerra vínculos
   diretos. Admin nunca participa e recebe `403`.
2. Vínculo direto é único por médico e paciente enquanto `pending` ou `active`.
3. A autorização médica passa a aceitar grupo ativo compartilhado **ou**
   vínculo direto `active` do próprio médico. Suspensão ou desativação do médico
   continuam bloqueando tudo.
4. Vínculo direto não concede acesso a outros médicos.

### Paciente já cadastrado

5. O médico informa o CPF. Se existe paciente com conta assumida, cria-se
   vínculo `pending` (origem `request`), expirando em 7 dias, sem acesso.
6. A solicitação aparece em "Equipes de cuidado" com nome e CRM/UF do médico.
   Paciente adulto decide por si; paciente menor tem a solicitação decidida por
   responsável ativo. Aceite torna o vínculo `active`; recusa ou expiração não
   concedem acesso.
7. Solicitação a menor sem responsável ativo exige que o médico informe os
   dados do responsável; aplica-se o fluxo de guarda das regras 17–23.
8. Nova solicitação só após recusa, expiração, revogação ou cancelamento.

### Paciente provisório

9. Se o CPF não existe, o médico cria paciente provisório com CPF válido, nome
   completo, nome preferido e data de nascimento.
10. Conta provisória não tem e-mail, senha nem identidade externa, não entra por
    nenhum caminho e não aparece no diretório administrativo.
11. A criação é atômica: conta provisória, role `patient`, perfil, vínculo
    direto `active` (origem `provisional`), auditoria e link de reivindicação.
12. Se o CPF pertence a provisório de outro médico, cria-se solicitação
    `pending`, decidida quando o titular ou responsável assumir a conta.
13. CPF de conta inativa ou de admin retorna `409` sem detalhes.
14. Enquanto a conta não for assumida, o médico autor corrige nome completo,
    nome preferido e data de nascimento. A correção não pode mudar a faixa
    etária (adulto ↔ menor): isso retorna `409`. Toda correção é auditada.

### Prontuário de menor

15. O médico com acesso autorizado registra e altera marcadores de menor. Esta
    regra substitui a regra 12 da spec 030 e o cenário "paciente menor não pode
    ter marcador alterado".
16. O menor titular de conta continua sem decidir, compartilhar ou alterar o
    próprio prontuário; quem age por ele é o responsável ativo.

### Guarda (responsável legal)

17. Todo paciente provisório menor nasce com ao menos um responsável: o médico
    informa CPF, nome completo, data de nascimento (adulto) e parentesco
    (`parent` ou `legal_guardian`).
18. Se o responsável já tem conta de paciente assumida, a guarda fica `pending`
    e ele aceita ou recusa no próprio login, confirmando a data de nascimento do
    dependente.
19. Se o responsável não tem conta, nasce também como provisório (adulto, sem
    dados clínicos) e o link de reivindicação é emitido para ele: confirma o
    próprio CPF e data de nascimento e a data de nascimento do dependente, cria
    acesso e a guarda se torna `active` na mesma transação.
20. Para menor que já tem conta própria (regra 7), a guarda só fica `active`
    depois de aceita pelo responsável **e** confirmada pelo menor no próprio
    login.
21. Um dependente pode ter quantos responsáveis ativos forem necessários;
    qualquer um deles decide. Um responsável pode renunciar à guarda; o último
    responsável ativo de um dependente **menor** não renuncia enquanto houver
    vínculos médicos ativos.
22. Somente adultos com conta de paciente assumida exercem guarda. Admin e
    médico só exercem guarda pela própria conta de paciente, nunca pelo
    contexto profissional.
23. A guarda não expira por idade. Ela vale até o dependente adulto pedir o
    desvínculo (regra 33) ou o responsável renunciar.

### Contexto do dependente

24. O responsável ativo escolhe o dependente no seletor de contexto
    (`Saúde de <nome preferido>`). As rotas clínicas do paciente aceitam o
    cabeçalho `X-Acting-Patient` com o `patient_id` do dependente.
25. O backend só honra o cabeçalho quando o usuário é responsável `active` do
    dependente, em qualquer idade; caso contrário retorna `403`. IDs desconhecidos e de
    terceiros recebem a mesma resposta.
26. Rotas aceitas no contexto do dependente: vacinas, alertas, documentos,
    marcadores, compartilhamento, convites e grupos de cuidado, solicitações e
    médicos diretos. Rotas de conta (`/me`, `/me/profile`, identidades externas,
    sessão) ignoram o cabeçalho e operam sempre sobre o próprio usuário.
27. `require_adult` passa a avaliar quem age: o responsável adulto pode alterar,
    compartilhar e decidir pelo dependente. Auditoria clínica registra o
    responsável como ator e o dependente como paciente.

### Reivindicação da conta

28. O link `<origem>/patient-claim#token=<token>` tem token de 256 bits, uso
    único e 7 dias; só o hash é persistido. Emitir outro link para a mesma conta
    revoga o anterior.
29. Emitem link: o médico autor para provisório adulto ou para o responsável
    provisório de um menor; o responsável ativo, a pedido do dependente, para o
    dependente que já tem 18 anos e ainda não tem acesso próprio
    (transferência).
30. O titular abre o link, confirma CPF e data de nascimento e cria acesso com
    e-mail/senha (política do Step 9) ou Google. Em reivindicação de guarda,
    confirma também a data de nascimento do dependente.
31. Dados divergentes, token inválido, expirado ou usado retornam `403`
    uniforme. Na quinta tentativa inválida o token é revogado.
32. A conclusão é atômica: credencial ou identidade externa, e-mail normalizado
    e único, `claimed_at`, consumo do token, guarda ativada quando aplicável,
    sessão local e auditoria. E-mail ou identidade Google já usados → `409`.
33. Dependente adulto com conta assumida pede o desvínculo de qualquer
    responsável no próprio login; o fim vale na requisição seguinte. Dependente
    menor não remove responsável. Não há transferência nem desvínculo
    automático ao completar 18 anos.
34. Depois de assumida, a conta é comum: o titular vê todo o prontuário e pode
    revogar vínculos diretos. Vínculos ativos criados durante a menoridade
    continuam válidos e revogáveis. Enquanto a guarda continuar ativa, titular
    adulto e responsável podem decidir.

### Encerramento

35. O paciente (ou responsável ativo) revoga vínculo `active`; o médico cancela
    solicitação `pending` própria ou encerra vínculo `active` próprio.
36. Revogação, renúncia e fim da guarda valem na requisição seguinte e preservam
    histórico clínico e auditoria.

## Cenários de aceitação

### Cenário: solicitar acesso a adulto cadastrado

Dado um médico verificado e um paciente adulto com conta
Quando o médico solicita vínculo pelo CPF
Então o vínculo fica `pending` e o médico recebe `403` no prontuário
Quando o paciente aceita
Então somente esse médico passa a acessar.

### Cenário: cadastrar adulto provisório

Dado um CPF sem conta
Quando o médico cadastra um adulto provisório
Então registra marcadores imediatamente
E recebe link/QR de reivindicação exibido uma única vez.

### Cenário: adulto assume a conta

Dado um link válido
Quando o paciente confirma CPF e data de nascimento e cria acesso
Então vê os marcadores registrados e o vínculo com o médico, revogável.

### Cenário: impedir reivindicação indevida

Dado um link válido
Quando alguém informa dados divergentes
Então recebe `403` sem distinguir o campo errado
E na quinta tentativa o link é revogado.

### Cenário: cadastrar menor com responsável sem conta

Dado CPFs sem conta para uma criança e sua mãe
Quando o médico cadastra a criança informando a mãe como responsável
Então nascem dois provisórios e a guarda pendente de reivindicação
E o médico registra marcadores da criança
E o link de reivindicação é da mãe.

### Cenário: responsável assume e administra o dependente

Dado o link da mãe
Quando ela confirma os próprios dados e a data de nascimento da criança
Então cria acesso, a guarda fica ativa
E ela alterna para "Saúde de <criança>" e vê o prontuário
E aceita ou revoga equipes de cuidado da criança.

### Cenário: responsável com conta aceita a guarda

Dado um responsável com conta e um menor provisório
Quando o responsável aceita a guarda confirmando a data de nascimento
Então a guarda fica ativa sem link de reivindicação.

### Cenário: menor com conta própria

Dado um menor com conta e sem responsável
Quando um médico solicita vínculo informando o responsável
Então a guarda só ativa após aceite do responsável e confirmação do menor
E a solicitação do médico só é decidida pelo responsável ativo.

### Cenário: bloquear terceiro no contexto do dependente

Dado um usuário sem guarda ativa
Quando envia `X-Acting-Patient` com o ID de um menor
Então recebe `403` e nada é lido ou auditado como leitura.

### Cenário: maioridade sem efeito automático

Dado um dependente que completa 18 anos
Então a guarda continua ativa e o responsável mantém o acesso
Quando o dependente pede acesso próprio
Então o responsável emite o link de transferência
E o dependente assume a conta com os vínculos médicos preservados
Quando o dependente pede o desvínculo no próprio login
Então o responsável perde o acesso na requisição seguinte.

### Cenário: menor não remove responsável

Dado um menor titular de conta com guarda ativa
Quando tenta desvincular o responsável
Então recebe `403` e a guarda continua.

### Cenário: grupos do admin continuam protegidos

Dado um médico com vínculos diretos
Quando tenta alterar qualquer grupo
Então nenhuma rota permite.

## Contratos propostos

```text
POST   /medical/patient-links
GET    /medical/patient-links?status=pending
DELETE /medical/patient-links/{link_id}
PATCH  /medical/patients/{patient_id}/provisional-profile
POST   /medical/patients/{patient_id}/claim-link

GET    /me/care-requests
GET    /me/care-doctors
POST   /me/care-requests/{link_id}/accept
POST   /me/care-requests/{link_id}/reject
DELETE /me/care-doctors/{link_id}

GET    /me/dependents
GET    /me/guardianships?status=pending
POST   /me/guardianships/{guardianship_id}/accept      {dependent_birth_date}
POST   /me/guardianships/{guardianship_id}/reject
POST   /me/guardianships/{guardianship_id}/confirm     (menor titular)
DELETE /me/guardianships/{guardianship_id}             (renúncia do responsável)
GET    /me/guardians
DELETE /me/guardians/{guardianship_id}                 (desvínculo pelo dependente adulto)
POST   /me/dependents/{patient_id}/claim-link          (transferência a pedido)

POST   /auth/patient-claim/local
POST   /auth/google/patient-claim
```

`POST /medical/patient-links` recebe:

```json
{
  "cpf": "00011122233",
  "patient": {"full_name": "...", "preferred_name": "...", "birth_date": "2018-05-02"},
  "guardian": {"cpf": "...", "full_name": "...", "birth_date": "1988-01-20",
               "relationship": "parent"}
}
```

`patient` é exigido somente quando o CPF não existe; `guardian` é exigido para
menor sem responsável ativo. Respostas:

- `202` `{"result": "request_sent", "link_id"}`;
- `201` `{"result": "provisional_created", "patient_id", "claim": {"token",
  "expires_at", "recipient": "patient" | "guardian"} | null}` — `claim` é nulo
  quando o responsável já tem conta e aceitará a guarda no próprio login;
- `409` para vínculo já aberto, CPF indisponível ou responsável inválido;
- `422` para campos faltantes, CPF inválido ou responsável menor de idade.

Detalhes fixados na fase 15.2:

- CPF sem conta e sem o objeto `patient` retorna `404` "Paciente não
  encontrado.", e a interface passa a pedir os dados do provisório. `patient`
  de menor retorna `409` "Paciente menor exige responsável." até a fase 15.3.
- `GET /medical/patients/{patient_id}` inclui `account_status`
  (`active` | `provisional`) e `manages_provisional` (médico autor de conta
  ainda não assumida), usados para exibir correção e novo link.
- `PATCH /medical/patients/{patient_id}/provisional-profile` aceita
  `full_name`, `preferred_name` e `birth_date` (ao menos um) e retorna o
  perfil médico; conta assumida ou de outro autor retorna `404`.
- `POST /medical/patients/{patient_id}/claim-link` retorna `201`
  `{"token", "expires_at"}` e revoga links pendentes anteriores.
- Diretório e convites de grupo do admin ignoram contas não assumidas.

`POST /auth/patient-claim/local` recebe `{token, cpf, birth_date,
dependent_birth_date?, email, password}`; a versão Google troca `email` e
`password` por `credential`. Ambas retornam `201` com `AuthenticationResponse`
e cookie. `/me` passa a incluir `dependents: [{patient_id, preferred_name}]`.

CORS passa a permitir o cabeçalho `X-Acting-Patient`. Schemas de entrada usam
`extra="forbid"`.

## Dados propostos

Migrations forward-only por fase: `0009` (15.1) cria `doctor_patient_links`;
`0010` (15.2) altera `users` e cria `patient_claims`; `0011` (15.3) cria
`patient_guardianships` e estende `patient_claims`. Estrutura final:

```text
users
~ email VARCHAR(254) NULL (nulo somente em conta provisória)
+ claimed_at DATETIME(6) NULL DEFAULT UTC_TIMESTAMP(6) (backfill = created_at;
  somente a criação de provisório grava NULL, preservando os cadastros atuais)
+ provisioned_by_doctor_id BIGINT NULL FK doctors

doctor_patient_links
- link_id PK, doctor_id FK, patient_id FK
- origin ENUM('request','provisional')
- status ENUM('pending','active','rejected','expired','cancelled','revoked')
- open_key gerada (1 se pending/active) + UNIQUE (doctor_id, patient_id, open_key)
- expires_at, decided_by_user_id, decided_at, ended_at, created_at, updated_at

patient_guardianships
- guardianship_id PK
- dependent_patient_id FK patients, guardian_patient_id FK patients
- relationship ENUM('parent','legal_guardian')
- status ENUM('pending','active','rejected','renounced','released')
- requires_dependent_confirmation BOOL, dependent_confirmed_at
- created_by_doctor_id FK doctors NULL
- accepted_at, ended_at, created_at, updated_at
- UNIQUE (dependent_patient_id, guardian_patient_id, open_key gerada)

patient_claims
- patient_claim_id PK
- claim_type ENUM('self','guardian','transfer')  (transfer: dependente adulto)
- account_patient_id FK patients (conta a ser assumida)
- guardianship_id FK NULL (em claim de guarda)
- issued_by_user_id FK users
- token_hash CHAR(64) UNIQUE
- status ENUM('pending','claimed','revoked')
- failed_attempts TINYINT, expires_at, claimed_at, created_at
```

Login local e Google passam a exigir `claimed_at` não nulo.

## Segurança e autorização

- CPF e datas de nascimento nunca autenticam sozinhos: só complementam token
  de uso único entregue por médico ou responsável.
- A resposta de `POST /medical/patient-links` revela ao médico se o CPF tem
  conta; o médico é verificado e toda consulta é auditada.
- `X-Acting-Patient` é resolvido no backend por guarda `active` e idade do
  dependente em cada requisição; o frontend não participa da autorização.
- Guarda é declarada pelo médico e confirmada pelo responsável (e pelo menor
  titular de conta); a ausência de prova documental é risco aceito e auditado.
- Tokens de reivindicação só como hash, no fragmento da URL, nunca em log,
  auditoria ou storage do navegador.
- Admin não acessa nenhuma rota desta spec e não exerce guarda pela conta
  administrativa.

## Estratégia de testes

- Primeiro RED: `POST /medical/patient-links` retorna `404`.
- Migration `0009`, backfill de `claimed_at` e login bloqueado para provisório
  no MySQL real.
- Autorização médica por grupo ou vínculo direto; negação para pendente,
  recusado, revogado e médico suspenso.
- Matriz de `X-Acting-Patient`: responsável ativo (dependente menor e adulto),
  pendente, renunciado, desvinculado, terceiro, rota de conta e admin.
- Desvínculo: dependente adulto com conta remove responsável; menor recebe
  `403`; nenhum fim automático aos 18 anos.
- Reivindicação `self`, `guardian` e `transfer`, local e Google, dados
  divergentes, 5 falhas, expiração, reuso, e-mail/identidade em uso,
  concorrência e rollback.
- Regressão da spec 030 atualizada para permitir marcador de menor ao médico.
- Frontend: fluxo do médico (busca por CPF, solicitação, criação de adulto e
  menor com responsável, QR, correção), página de reivindicação, aceite de
  guarda, contexto do dependente e "Equipes de cuidado" em 320 px e viewport
  ampla.

## Entregas incrementais

| Fase | Escopo |
|---|---|
| 15.1 | Vínculo direto, autorização médica estendida e solicitação a paciente cadastrado |
| 15.2 | Paciente provisório adulto, correção e reivindicação local/Google |
| 15.3 | Guarda, provisório menor, contexto do dependente e marcadores de menor |
| 15.4 | Transferência a pedido, desvínculo pelo dependente adulto e menor titular de conta |

Cada fase fecha seu ciclo RED/GREEN/REFACTOR, frontend incluído.

Comportamento intermediário, substituído pelas fases seguintes:

- Em 15.1, CPF sem paciente retorna `404` (15.2 passa a criar provisório) e
  paciente menor retorna `409` "Paciente menor exige responsável" (15.3 passa
  a aceitar `guardian`).
- Em 15.1 o médico vê nas solicitações pendentes somente nome do paciente,
  CPF mascarado e validade, nunca dado clínico.

## Evidência TDD

| Ciclo | Teste RED | Implementação GREEN | Refactor | Referência |
|---|---|---|---|---|
| 1 | `test_doctor_requests_link_and_gains_access_only_after_acceptance`: `404`; `test_migration_0009_...`: arquivo inexistente | migration `0009`, solicitação, aceite, recusa, cancelamento e revogação de vínculo direto | cláusula de autorização médica única para grupo ou vínculo direto | `test_direct_care_links.py`, `test_migrations.py` |
| 2 | `PatientLinkPanel` inexistente; "Equipes de cuidado" sem solicitações e médicos diretos | painel do médico e seção do paciente estendida | carregamento das equipes por lista de recursos | `patient-link-panel.test.jsx`, `care-invitations.test.jsx`, `direct-care-links.spec.ts` |
| 3 | `test_doctor_creates_provisional_adult_with_immediate_access`: `422` (`patient` não aceito); `test_migration_0010_...`: arquivo inexistente | migration `0010`, provisório, correção, novo link e reivindicação local/Google | `claimed_at` com default para não alterar cadastros existentes; contador de tentativas corrigido (revogava na 4ª pela ordem do `SET`) | `test_provisional_patients.py`, `test_migrations.py` |
| 4 | formulário de provisório, ações do prontuário provisório e `PatientClaim` inexistentes | painel com link/QR, correção e novo link no prontuário, página `/patient-claim` | leitura do token do fragmento extraída para `lib/fragment-token.js`; `RegistrationField` reutilizado | `patient-link-panel.test.jsx`, `doctor-dashboard.test.jsx`, `patient-claim.test.jsx`, `direct-care-links.spec.ts` |

## Critérios de conclusão

- [ ] Spec aprovada antes do primeiro RED.
- [ ] Médico só acessa paciente com conta após aceite do titular ou responsável.
- [ ] Médico cria provisórios adultos e menores e registra marcadores.
- [ ] Todo menor provisório tem responsável e só é administrado por guarda ativa.
- [ ] Conta provisória só é assumida com token e dados confirmados.
- [ ] Dependente adulto assume a conta a pedido e desvincula o responsável
      quando quiser; a maioridade não muda nada sozinha.
- [ ] Grupos do admin continuam fora do alcance do médico.
- [ ] Fluxos funcionam em 320 px e viewport ampla.
- [ ] Definition of Done atendida.

## Decisões e observações

- Esta spec substitui a regra 12 da spec 030 (médico não altera prontuário de
  menor) e atende a representação legal adiada pela spec 040.
- A regra do Step 10 que impede o médico de criar vínculos continua válida para
  grupos geridos por admin.
- Revisão de 2026-10-11: sem janela de transferência nem desvínculo automático
  na maioridade, e sem limite de responsáveis por dependente.
