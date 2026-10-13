# Ajustes de Usabilidade: Cadastro, Marcadores e Tipo Sanguíneo

## Status

IMPLEMENTED

## Dependências

- Spec `006-patient-onboarding-authentication.md`: cadastro local e onboarding
  Google; regras de CPF, senha e campos obrigatórios, implementada.
- Spec `036-doctor-assisted-patient-registration.md`: ativação de conta
  pré-cadastrada (`patient-claim`), que reutiliza `RegistrationField`.
- Spec `010-health-markers.md`: seção de marcadores do paciente, implementada.
- Spec `030-medical-panel.md`: prontuário médico e autorização por vínculo
  ativo (`get_authorized_medical_patient`), implementada.
- Spec `035-self-service-profile.md`: hoje declara tipo sanguíneo como somente
  leitura; esta spec revisa essa regra (ver "Decisões e observações").
- Spec `005-clinical-audit.md`: padrão de auditoria clínica transacional.
- Spec `036-doctor-assisted-patient-registration.md`, regras 24–27: contexto
  do dependente por `X-Acting-Patient` e `require_adult` avaliando quem age.

## Contexto e problema

Uma rodada de avaliação de usabilidade apontou quatro problemas:

1. **Cadastro sem campos obrigatórios sinalizados.** Todos os campos de
   `PatientRegistration` são `required`, mas nada na tela indica isso. A pessoa
   só descobre ao enviar, pelo balão nativo do navegador ("Preencha este
   campo."), um campo por vez.
2. **Senha sem visualização nem confirmação.** O campo "Crie uma senha" não
   permite conferir o que foi digitado, e não existe campo de repetição. Um erro
   de digitação cria uma conta com senha desconhecida pelo próprio dono.
3. **CPF sem máscara e sem limite.** No cadastro local e no onboarding Google o
   CPF aceita qualquer quantidade de caracteres e não é formatado durante a
   digitação, apesar do placeholder `000.000.000-00`. A ativação de conta
   (`patient-claim`) já limita a 14 caracteres, mas também não formata.
4. **Texto de introdução dos marcadores pouco claro.** "Uma leitura objetiva do
   que está ativo no seu cuidado hoje." não explica o que o paciente deve
   registrar. O diálogo de criação já usa um texto melhor: "Registre apenas
   informações que ajudam a representar seu estado de saúde atual."
5. **Tipo sanguíneo "Não informado" sem saída.** O resumo mostra o dado, mas
   nenhum fluxo do sistema grava `patients.tipo_sanguineo`: nem o paciente nem
   o médico conseguem informá-lo. O paciente não sabe onde, nem se deve,
   preenchê-lo.

## Objetivos

- Deixar visíveis, antes do envio, quais campos são obrigatórios.
- Permitir ao paciente ver a senha digitada e exigir a confirmação dela antes
  de criar a conta.
- Formatar o CPF como `000.000.000-00` durante a digitação e limitar a entrada
  a 14 caracteres em todos os formulários de cadastro/acesso do paciente.
- Reescrever a introdução da seção de marcadores com linguagem acessível.
- Permitir que o tipo sanguíneo seja informado pelo próprio paciente adulto,
  pelo responsável legal ativo no contexto do dependente ou registrado pelo
  médico com vínculo ativo, deixando claro na interface quem informou e
  explicando o dado por um ícone (i).

## Não objetivos

- Alterar regras de validação do backend para CPF ou nome (o backend já
  normaliza CPF com máscara; a confirmação de senha é verificação de
  digitação, não regra de segurança). A única mudança de validação de senha é
  o mínimo da regra 8a.
- Alterar o mínimo de 12 caracteres da senha de administrador institucional
  (`AdminAccountCreate`, criada pela CLI).
- Medidor de força de senha, política de complexidade ou checagem de senhas
  vazadas.
- Aplicar visualização/confirmação de senha ao convite profissional
  (`professional-invitation`) e ao login; podem reutilizar o componente depois,
  em spec própria.
- Exigir anexo ou exame comprobatório do tipo sanguíneo.
- Remover ou "zerar" o tipo sanguíneo depois de informado.
- Alterar o resumo público compartilhado (`040`) além de continuar exibindo o
  valor; a origem não é exposta publicamente.

## Regras de negócio

### Cadastro e acesso

1. Nos formulários `PatientRegistration` (local e onboarding Google) e
   `PatientClaim`, todo campo obrigatório exibe um asterisco (`*`) após o
   rótulo. O asterisco é decorativo (`aria-hidden="true"`); a obrigatoriedade
   continua exposta a tecnologias assistivas pelo atributo `required`.
2. Cada um desses formulários exibe, antes do primeiro campo, a nota
   "Campos marcados com * são obrigatórios.".
3. A sinalização é feita uma única vez em `RegistrationField`, por uma prop
   `required` (padrão `true`, preservando o comportamento atual); não se cria
   outro componente de campo.
4. O campo de senha possui um botão de alternância com ícone de olho (olho
   cortado quando visível), alvo mínimo de 44 px, rótulo acessível fixo que
   nomeia o campo ("Mostrar senha"; "Mostrar confirmação de senha") e estado
   em `aria-pressed`. Alternar não apaga o valor nem move o foco para fora do
   botão. O estado de visualização é local ao campo e volta a oculto quando o
   formulário é desmontado (troca de forma de cadastro ou saída da página após
   o envio bem-sucedido).
5. O cadastro local e a ativação de conta exibem um segundo campo obrigatório,
   "Confirme a senha", com `autoComplete="new-password"`, os mesmos limites de
   tamanho e o mesmo controle de visualização.
6. Se senha e confirmação diferirem, o envio é bloqueado no cliente, nenhuma
   requisição é feita e a mensagem "As senhas não coincidem." aparece associada
   ao campo de confirmação (`aria-describedby`, `aria-invalid="true"`), com
   foco movido para ele. A confirmação nunca é enviada à API.
7. A máscara de CPF mantém apenas dígitos (até 11) e formata progressivamente
   como `000.000.000-00`; o campo tem `maxLength={14}` e `inputMode="numeric"`.
   Colar um CPF com ou sem pontuação resulta no mesmo valor formatado. A API
   continua recebendo o valor mascarado, que o backend já normaliza.
8. A formatação é uma função pura única (`formatCpf`) em `frontend/lib/`,
   reutilizada por cadastro local, onboarding Google e ativação de conta.
8a. A senha local de paciente, no cadastro (`PatientRegistration`) e na
   ativação de conta (`PatientClaimLocal`), passa a ter de 8 a 128 caracteres
   (antes 12). O backend valida o limite; o frontend usa `minLength={8}`, o
   placeholder "Mínimo de 8 caracteres" e a mensagem de 422 da ativação "A
   senha precisa ter ao menos 8 caracteres.". As demais regras da spec `006`
   (não alterar, hash, ausência em logs) permanecem.

### Marcadores de saúde

9. Na visão do paciente, a introdução da seção passa a ser "Informações que
   ajudam a representar seu estado de saúde atual.". A visão médica permanece
   inalterada.

### Tipo sanguíneo

10. Valores aceitos: `A+`, `A-`, `B+`, `B-`, `AB+`, `AB-`, `O+`, `O-` (o enum
    existente da coluna). `null` continua significando "não informado".
11. O tipo sanguíneo passa a ter origem registrada: `patient` (autodeclarado
    pelo titular), `guardian` (declarado pelo responsável legal) ou `doctor`
    (registrado por profissional). Valor `null` não tem origem.
12. O paciente adulto pode informar seu próprio tipo sanguíneo quando ele está
    `null` e alterá-lo enquanto a origem não for `doctor`.
13. O responsável legal ativo, agindo no contexto do dependente
    (`X-Acting-Patient`, regras 24–27 da spec `036`), pode informar ou alterar
    o tipo sanguíneo do dependente nas mesmas condições, com origem `guardian`.
    Isso vale para dependente de qualquer idade, como as demais rotas clínicas
    do contexto do dependente.
14. Depois que um médico registra o tipo sanguíneo (origem `doctor`), nem o
    paciente nem o responsável podem alterá-lo; a tentativa retorna `409`.
    Correções passam a ser feitas pelo médico.
15. Por natureza, o tipo sanguíneo quase nunca muda; a edição existe para
    corrigir erro de registro. A interface trata "Alterar" como ação
    secundária e o diálogo pede confirmação do novo valor.
16. O médico verificado com vínculo ativo com o paciente pode registrar ou
    corrigir o tipo sanguíneo a qualquer momento, inclusive substituindo um
    valor autodeclarado; a origem passa a `doctor`.
17. Cada alteração efetiva grava auditoria clínica na mesma transação, ação
    `patient.blood_type_updated`, recurso `patient`, com snapshots anterior e
    posterior contendo somente `blood_type` e `blood_type_source`. Repetir o
    mesmo valor e origem não gera alteração nem auditoria.
18. Interface do paciente: ao lado do rótulo "Tipo sanguíneo" há um botão (i)
    que abre um `Tooltip` explicativo; o conteúdo depende do estado:
    - `null`: "Ainda não informado. Você pode informar o seu tipo sanguíneo ou
      o médico responsável pode registrá-lo a partir de um exame." e uma ação
      "Informar tipo sanguíneo";
    - origem `patient`: "Informado por você. O médico responsável pode
      confirmá-lo ou corrigi-lo." e uma ação "Alterar";
    - origem `guardian`: "Informado pelo responsável legal. O médico
      responsável pode confirmá-lo ou corrigi-lo." e a ação "Alterar" quando
      quem vê é o responsável no contexto do dependente ou o titular adulto;
    - origem `doctor`: "Registrado pelo médico responsável. Para corrigir,
      fale com ele." e nenhuma ação de edição.
19. O paciente menor no próprio login não vê a ação de informar/alterar (mesma
    regra de `require_adult` dos marcadores); o (i) explica que o dado é
    informado pelo responsável legal ou registrado pelo médico. No contexto do
    dependente, o responsável vê a ação e o texto em terceira pessoa
    ("Você pode informar o tipo sanguíneo de <nome preferido>...").
20. A ação abre um diálogo com `ClinicalSelect` dos oito valores e um aviso de
    que o dado autodeclarado deve vir de exame ou documento confiável.
21. Interface médica: o prontuário mostra o valor com a marcação de origem
    ("autodeclarado", "informado pelo responsável" ou "registrado por
    profissional") e uma ação
    "Registrar"/"Corrigir" que abre o mesmo diálogo, sem duplicar componente.

## Cenários de aceitação

### Cenário: campos obrigatórios visíveis antes do envio

Dado que o visitante abre "Crie seu acesso" com "E-mail e senha"
Quando o formulário é exibido
Então cada rótulo obrigatório termina com "*"
E a nota "Campos marcados com * são obrigatórios." aparece antes do primeiro campo
E cada input continua com o atributo `required`

### Cenário: visualizar a senha

Dado que o visitante digitou uma senha
Quando ativa "Mostrar senha"
Então o campo passa a `type="text"` com o mesmo valor
E o botão "Mostrar senha" fica com `aria-pressed="true"`

### Cenário: senhas diferentes

Dado que senha e confirmação foram preenchidas com valores diferentes
Quando o visitante envia o cadastro
Então nenhuma requisição é feita a `/auth/patient-registration`
E "As senhas não coincidem." é exibida associada à confirmação
E o foco vai para o campo de confirmação

### Cenário: senhas iguais

Dado que todos os campos são válidos e senha e confirmação coincidem
Quando o visitante envia o cadastro
Então o corpo da requisição contém `password` e não contém a confirmação

### Cenário: senha com 8 caracteres

Dado um cadastro local ou uma ativação de conta com dados válidos
Quando a senha tem 8 caracteres
Então a conta é criada
E com 7 caracteres a resposta é 422 sem criar conta

### Cenário: máscara de CPF

Dado o campo CPF vazio
Quando o visitante digita "52998224725"
Então o campo exibe "529.982.247-25"
E dígitos adicionais são ignorados
E letras e símbolos são descartados

### Cenário: colar CPF formatado

Dado o campo CPF vazio
Quando o visitante cola "529.982.247-25"
Então o campo exibe "529.982.247-25"

### Cenário: CPF no onboarding Google e na ativação

Dado o formulário de onboarding Google ou de ativação de conta
Quando o visitante digita um CPF
Então a mesma máscara e o limite de 14 caracteres são aplicados

### Cenário: nova introdução dos marcadores

Dado um paciente autenticado na própria área
Quando a seção "Marcadores de saúde" é exibida
Então a introdução é "Informações que ajudam a representar seu estado de saúde atual."

### Cenário: paciente informa tipo sanguíneo

Dado um paciente adulto com tipo sanguíneo `null`
Quando envia `PUT /me/blood-type` com `{"blood_type": "O+"}`
Então a resposta é 200 com `blood_type="O+"` e `blood_type_source="patient"`
E um evento `patient.blood_type_updated` é auditado com o paciente como ator

### Cenário: paciente altera valor autodeclarado

Dado um paciente adulto com tipo sanguíneo `O+` de origem `patient`
Quando envia `PUT /me/blood-type` com `{"blood_type": "O-"}`
Então a resposta é 200 com o novo valor e origem `patient`

### Cenário: paciente não sobrescreve registro médico

Dado um paciente adulto com tipo sanguíneo `A+` de origem `doctor`
Quando envia `PUT /me/blood-type` com `{"blood_type": "B+"}`
Então a resposta é 409
E o valor e a origem permanecem inalterados e nada é auditado

### Cenário: menor não informa tipo sanguíneo no próprio login

Dado um paciente menor de idade autenticado, sem `X-Acting-Patient`
Quando envia `PUT /me/blood-type`
Então a resposta é 403

### Cenário: responsável informa tipo sanguíneo do dependente

Dado um responsável `active` de um dependente menor com tipo sanguíneo `null`
Quando envia `PUT /me/blood-type` com `X-Acting-Patient` do dependente e `{"blood_type": "B+"}`
Então a resposta é 200 com `blood_type="B+"` e `blood_type_source="guardian"`
E a auditoria registra o responsável como ator e o dependente como paciente

### Cenário: responsável não sobrescreve registro médico

Dado um dependente com tipo sanguíneo de origem `doctor`
Quando o responsável envia `PUT /me/blood-type` no contexto do dependente
Então a resposta é 409 e nada é alterado

### Cenário: quem não é responsável ativo

Dado um usuário sem guarda `active` do paciente informado em `X-Acting-Patient`
Quando envia `PUT /me/blood-type`
Então a resposta é 403, igual para ID desconhecido ou de terceiro

### Cenário: médico vinculado registra tipo sanguíneo

Dado um médico verificado com vínculo ativo e paciente com valor autodeclarado `O+`
Quando envia `PUT /medical/patients/{patient_id}/blood-type` com `{"blood_type": "O-"}`
Então a resposta é 200 com `blood_type="O-"` e `blood_type_source="doctor"`
E a auditoria registra o médico como ator e os snapshots anterior e posterior

### Cenário: médico sem vínculo

Dado um médico sem vínculo ativo com o paciente
Quando envia `PUT /medical/patients/{patient_id}/blood-type`
Então a resposta é 403 "Paciente não autorizado.", como nas demais rotas médicas

### Cenário: valor inválido

Dado qualquer ator autorizado
Quando envia `{"blood_type": "C+"}` ou `null`
Então a resposta é 422 e nada é alterado

### Cenário: ícone (i) explica o estado

Dado o resumo do paciente com tipo sanguíneo `null`
Quando o paciente ativa o botão (i) por clique, toque ou teclado
Então o tooltip explica que ele pode informar ou o médico pode registrar
E a ação "Informar tipo sanguíneo" está disponível para adultos

## Contratos afetados

### API

```text
PUT /me/blood-type
Auth: paciente adulto, ou responsável ativo com X-Acting-Patient (require_adult)
Body: {"blood_type": "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-"}
200: {"blood_type": "O+", "blood_type_source": "patient" | "guardian"}
401 sem sessão · 403 menor agindo por si, sem perfil de paciente ou sem guarda ativa
409 valor registrado por médico · 422 valor inválido · 503 banco indisponível
```

```text
PUT /medical/patients/{patient_id}/blood-type
Auth: médico verificado com vínculo ativo (get_authorized_medical_patient)
Body: igual ao anterior
200: {"blood_type": "O-", "blood_type_source": "doctor"}
401 · 403 sem papel médico verificado, sem vínculo ativo ou paciente inexistente
422 valor inválido · 503 banco indisponível
```

- Os contratos de perfil próprio (`/me`) e do prontuário médico ganham o campo
  `blood_type_source: "patient" | "guardian" | "doctor" | null`, ao lado de `blood_type`.
- O resumo público compartilhado (`040`) e a listagem de pacientes vinculados
  não ganham `blood_type_source`.
- `POST /auth/patient-registration`, `POST /auth/google/patient-registration`
  e a ativação de conta não mudam de contrato.

### Dados

- Nova migration forward-only adiciona
  `patients.tipo_sanguineo_origem ENUM('patient','guardian','doctor') NULL`.
- Constraint de consistência: origem é `NULL` se e somente se
  `tipo_sanguineo` for `NULL`.
- Backfill: linhas com `tipo_sanguineo` não nulo (somente seeds/dados de
  demonstração) recebem origem `doctor`.
- Seeds de desenvolvimento passam a definir a origem explicitamente.

### Frontend

- `components/auth/registration-fields.jsx` reúne os campos compartilhados de
  cadastro/acesso: `RegistrationField` (prop `required` e marcador `*`),
  `RequiredFieldsNote`, `CpfField`, `PasswordField` e o hook
  `usePasswordConfirmation`, usados por cadastro local, onboarding Google e
  ativação de conta.
- `frontend/lib/cpf.js` com `formatCpf`.
- `health-markers.jsx`: novo texto de introdução do paciente.
- `components/patient/blood-type-fact.jsx` (resumo próprio e do dependente) e
  `components/medical/medical-blood-type.jsx` (prontuário): (i) com o
  `Tooltip` existente, origem e diálogo compartilhado
  `components/patient/blood-type-dialog.jsx` com `ClinicalSelect`. A ação de
  informar/alterar fica ao lado do valor, não dentro do tooltip, para não pôr
  controle interativo em conteúdo suplementar.

## Segurança e autorização

- O paciente só altera o próprio registro; a rota não recebe `patient_id` no
  caminho. O responsável só age sobre dependente com guarda `active`, pelo
  mecanismo existente de `X-Acting-Patient`.
- O médico só altera paciente com vínculo ativo; sem vínculo, 403 sem
  diferenciar inexistência, reutilizando `get_authorized_medical_patient`.
- `admin` não tem acesso a nenhuma das rotas.
- Regra de precedência do registro médico (regra 14) é aplicada no backend, na
  mesma transação, com `SELECT ... FOR UPDATE` da linha do paciente; ocultar a
  ação na interface não é autorização.
- A senha e sua confirmação não são registradas em log, estado global ou
  auditoria; a confirmação nunca sai do navegador.
- Auditoria contém apenas tipo sanguíneo e origem, sem outros dados pessoais.

## Casos de erro e limites

- CPF colado com mais de 11 dígitos é truncado nos 11 primeiros; a validação de
  dígitos verificadores continua sendo do backend (422 com a mensagem atual).
- Mensagem de senhas diferentes some quando o usuário edita qualquer um dos
  dois campos de senha.
- Concorrência paciente/responsável × médico: o bloqueio da linha garante que
  um registro médico concluído não seja sobrescrito por uma requisição
  iniciada antes; essa requisição retorna 409.
- Erro de API no diálogo de tipo sanguíneo usa `readApiError`, mantém o diálogo
  aberto e preserva a seleção.

## Estratégia de testes

- **Primeiro teste RED (frontend):** `patient-registration.test.jsx` — rótulos
  obrigatórios terminam com `*` e a nota de obrigatoriedade é exibida.
- **Primeiro teste RED (backend):** paciente adulto com tipo sanguíneo `null`
  informa `O+` via `PUT /me/blood-type`.
- Unitários frontend (Vitest/RTL): `formatCpf` (digitação, colagem, truncagem,
  não dígitos); alternância de visualização da senha; bloqueio por senhas
  diferentes sem chamada à API; corpo da requisição sem confirmação; máscara no
  onboarding Google e na ativação; novo texto dos marcadores; conteúdo do (i)
  para cada estado; ação oculta para menor e para origem `doctor`.
- Backend (pytest): regras 12–17, responsável com origem `guardian`, 403
  menor agindo por si e sem guarda ativa, 409 origem `doctor` para paciente e
  responsável, 422 valor
  inválido, 403 médico sem vínculo, 403 admin, auditoria atômica e ausência de
  auditoria em valor repetido, `blood_type_source` nos contratos próprio e
  médico e ausência no público.
- Migration: aplica em banco vazio e com dados demonstrativos, backfill e
  constraint de consistência.
- Playwright: cadastro local completo com máscara, visualização e confirmação
  de senha em 320 px e viewport ampla; paciente informa tipo sanguíneo pelo
  (i); responsável informa no contexto do dependente; médico corrige no
  prontuário.
- Acessibilidade: alvo de 44 px do botão de senha e do (i), foco visível,
  tooltip acessível por teclado e toque, ausência de overflow em 320 px.

## Evidência TDD

| Ciclo | Teste RED | Implementação GREEN | Refactor | Referência |
|---|---|---|---|---|
| 1 | `patient-registration.test.jsx`: rótulos com `*` e nota de obrigatoriedade; falhou por nota ausente | `RegistrationField` com marcador e `RequiredFieldsNote` | — | `d2a1cee` |
| 2 | `patient-claim.test.jsx`: nota na ativação; falhou por nota ausente | Nota no `PatientClaim` | — | `d2a1cee` |
| 3 | `cpf.test.js`: formatação progressiva; falhou por módulo inexistente | `formatCpf` | — | `d2a1cee` |
| 4 | Máscara nos três formulários; falhou com valor sem máscara | `CpfField` | Campos movidos para `registration-fields.jsx` para evitar import circular | `d2a1cee` |
| 5 | Visualização e confirmação de senha (cadastro e ativação); falhou por campo/botão ausentes | `PasswordField` e `usePasswordConfirmation` | — | `d2a1cee` |
| 6 | `health-markers.test.jsx`: novo texto; falhou com texto antigo | Introdução do paciente atualizada | — | `d2a1cee` |
| 7 | `test_migrations.py` e integração MySQL da `0016`; falhou por migration inexistente e depois por seed sem origem (`INSERT IGNORE` descartava pacientes) | Migration `0016`, backfill e constraint; seed com origem | Teste da `0015` deixou de depender do seed head | `22e6511` |
| 8 | `test_blood_type.py`: regras de origem, 409, auditoria e rollback; falhou na coleta (modelo/rota inexistentes) | `BloodTypeUpdate`, `patients/blood_type.py`, `PUT /me/blood-type` | — | `22e6511` |
| 9 | `test_blood_type_flows.py` (MySQL real): responsável, médico, 403, 409 e resumo público; falhou por `blood_type_source` ausente | Contratos próprio, dependente e médico; `PUT /medical/patients/{id}/blood-type` | Fixtures de caracterização atualizadas | `22e6511` |
| 10 | `blood-type.test.jsx`: textos do (i), permissões, diálogo, erro e prontuário; falhou por componentes inexistentes | `BloodTypeFact`, `BloodTypeDialog`, `MedicalBloodType` | Stub de `ResizeObserver` no setup do Vitest | `8c8b7f7` |
| 12 | Cadastro e ativação aceitam senha de 8 caracteres e rejeitam 7 (`test_patient_registration.py`, `test_provisional_patients.py`, testes de frontend); falharam com o mínimo de 12 | Mínimo 8 em `PatientRegistration`, `PatientClaimLocal`, `PasswordField`, placeholder e mensagem de 422 | — | `47c0529` |
| 11 | `authenticated-areas.test.jsx`: salvar recarrega `/me`; contexto do dependente; falhou sem integração | Painel próprio, área do dependente e prontuário | — | `8c8b7f7` |

## Critérios de conclusão

- [x] Cenários implementados e testados.
- [x] Spec `035` atualizada: tipo sanguíneo deixa de ser somente leitura, com
      remissão a esta spec (revisão de 2026-10-12).
- [x] `docs/specs/README.md` e roadmap atualizados com status e referência.
- [x] Definition of Done do roadmap atendida: 329 testes backend (MySQL real),
      325 unitários, 49 E2E e build do frontend aprovados; após a regra 8a,
      332 testes backend, 325 unitários, E2E de cadastro/ativação e build.

## Decisões e observações

- Entrega: [PR #14](https://github.com/PedronSol/Documento-Unificado-De-Saude/pull/14)
  contra `develop`.
- Origem da avaliação: feedback de usabilidade das telas de cadastro, marcadores
  e resumo do paciente.
- Esclarecimento de 2026-10-12, durante a implementação: o botão de
  visualização mantém rótulo fixo e comunica o estado só por `aria-pressed`,
  pois alterar rótulo e estado ao mesmo tempo gera leitura contraditória em
  leitores de tela; com dois campos de senha, cada rótulo nomeia o seu campo.
- Revisão de 2026-10-12 pedida pelo produto: senha mínima de paciente reduzida
  de 12 para 8 caracteres (regra 8a), alinhada ao limite que pessoas leigas
  esperam; a confirmação e a visualização reduzem o risco de erro de
  digitação. A senha do admin institucional mantém 12.
- Decisão de 2026-10-12: três autores de tipo sanguíneo são contemplados — o
  paciente adulto informa (autodeclarado), o responsável legal informa pelo
  dependente e o médico vinculado registra ou corrige. O registro médico
  prevalece sobre o declarado, e a origem fica visível
  para o paciente e para o médico, para não tratar dado autodeclarado como
  confirmado.
- A confirmação de senha é proteção contra erro de digitação; não altera a
  política de senha da spec `006`.
- A máscara de CPF não muda o contrato porque `_normalize_cpf` já remove a
  pontuação no backend.
