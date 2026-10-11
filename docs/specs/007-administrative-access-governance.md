# Governança Administrativa e Vínculos de Cuidado

## Status

SPEC WRITING

## Dependências

- Step 5 e auditoria clínica implementados.
- Step 7 e grupos de atendimento implementados.
- Step 9 e cadastro real de pacientes concluído antes da implementação.
- Step 10 do roadmap.

## Contexto e problema

Os grupos atuais são preenchidos apenas por seed. Não existe API para cadastrar
médico, verificar CRM, criar grupo, convidar paciente ou revogar acesso. A role
`admin` autentica, mas possui somente um placeholder e não pode consultar a
auditoria.

Cada administrador será responsável somente pelos médicos, grupos e vínculos
que criou ou administra. Ele poderá localizar usuários ativos por dados
cadastrais mínimos para formar o vínculo, mas nunca consultar informação
clínica. O paciente precisa aceitar o convite antes de qualquer médico do grupo
receber acesso.

## Objetivos

- Provisionar médicos exclusivamente por admin autenticado.
- Permitir que o médico reivindique com Google somente um convite profissional
  previamente emitido pelo admin, sem senha conhecida pelo administrador.
- Aplicar ownership administrativo a médicos, grupos e convites.
- Oferecer diretório cadastral mínimo de usuários ativos.
- Exigir aceite do paciente para ativar o vínculo de cuidado.
- Revogar acesso de forma imediata e auditável.
- Separar auditoria administrativa da auditoria clínica.
- Garantir que `admin` nunca seja uma role de acesso ao prontuário.

## Não objetivos

- Permitir cadastro público de médico ou administrador.
- Permitir que médico crie seu cadastro, grupo ou vínculo.
- Dar ao admin leitura de perfil clínico, vacina, marcador, alerta, documento,
  OCR, compartilhamento ou snapshot clínico.
- Permitir que admin altere dados cadastrais de paciente autocadastrado.
- Validar CRM automaticamente em serviço externo nesta primeira versão.
- Criar acesso emergencial ou quebra de sigilo.

## Regras de negócio

1. Contas administrativas não possuem autocadastro. A primeira conta nasce por
   bootstrap operacional seguro; delegação de novos admins fica fora desta
   primeira entrega.
2. `admin` é exclusiva: a mesma conta não possui `patient` nem `doctor`. Uma
   pessoa que também seja paciente usa identidade separada sem privilégio
   administrativo.
3. Admin cria um cadastro profissional pendente e convite de uso único com
   `created_by_admin_user_id` igual ao seu `user_id`. O admin nunca define nem
   conhece senha do médico.
4. O médico completa o convite autenticando sua identidade pelo Google. O
   backend exige convite válido, confere o e-mail verificado esperado e associa
   `(issuer, subject)`; apresentar Google sem convite nunca cria `doctor`.
5. O perfil nasce `pending` e sem autorização profissional até a verificação
   manual de CRM pelo mesmo admin responsável.
6. Admin somente consulta o detalhe gerencial, corrige, verifica, rejeita,
   suspende ou desativa médicos criados por ele. Recurso gerencial de outro
   admin retorna `404` uniforme, embora a identidade continue visível apenas na
   allowlist do diretório global de ativos.
7. Grupo possui `managed_by_admin_user_id`. Somente o admin gestor pode alterar
   o grupo ou seus membros, e somente médicos criados por ele podem entrar.
8. O diretório global retorna somente usuários ativos e uma allowlist cadastral:
   ID interno, nome de exibição, tipo de perfil e identificador mascarado para
   desambiguação. Não faz join com tabelas clínicas.
9. Busca por CPF usa correspondência exata no backend, mas a resposta nunca
   devolve o CPF integral. Listagem é paginada e não oferece exportação em massa.
10. Admin pode convidar qualquer paciente ativo para um grupo sob sua gestão.
   Ele não altera a conta nem o perfil do paciente.
11. Convite nasce `pending`, possui expiração e é visível somente ao paciente
   convidado e ao admin gestor. Nenhum médico acessa o prontuário nesse estado.
12. Somente o paciente autenticado aceita ou recusa o próprio convite. Aceite cria
   ou ativa `patient_care_groups`; recusa preserva o registro sem vínculo ativo.
13. Paciente e admin gestor podem revogar um vínculo ativo. A autorização médica
    deixa de valer na requisição seguinte.
14. Admin não usa rotas `/medical` nem `/me` clínicas. Rotas `/admin` não
    carregam dados de prontuário, ainda que recebam um `patient_id`.
15. Ações administrativas usam tabela própria com ator, ação, alvo cadastral,
    data e campos sanitizados. `clinical_audit_events` não é exposta ao admin.
16. Admin consulta apenas eventos administrativos praticados por ele ou sobre
    recursos sob sua gestão. Nenhum snapshot clínico é retornado.
17. Criação, correção, verificação, suspensão, convite, aceite e revogação
    são atômicos com seus respectivos eventos.

## Cenários de aceitação

### Cenário: cadastrar médico sob responsabilidade

Dado um admin autenticado
Quando cadastra um médico com e-mail e CRM válidos
Então um cadastro pendente e convite de uso único ficam sob sua responsabilidade
E o médico pode comprovar sua identidade sem receber senha do admin
E outro admin vê no máximo a identidade cadastral mínima no diretório global,
sem consultar ou alterar o cadastro profissional.

### Cenário: impedir autocadastro profissional com Google

Dado um usuário autenticado pelo Google sem convite profissional válido
Quando tenta concluir cadastro de médico
Então recebe `403`
E nenhuma role ou perfil profissional é criado.

### Cenário: consultar diretório sem prontuário

Dado um admin autenticado
Quando busca um paciente ativo para convidá-lo
Então recebe apenas a allowlist cadastral
E nenhuma query carrega vacina, marcador, alerta, documento ou dado clínico.

### Cenário: convite não concede acesso imediato

Dado um admin gestor e um paciente ativo
Quando o admin cria um convite para seu grupo
Então o convite fica pendente
E os médicos do grupo ainda não encontram nem abrem o paciente.

### Cenário: paciente aceita o cuidado

Dado um convite pendente e válido
Quando o paciente convidado aceita
Então o vínculo passa a ativo
E somente médicos verificados e ativos do grupo passam a acessar o prontuário.

### Cenário: negar prontuário ao admin

Dado um admin que criou o médico, grupo e convite
Quando tenta chamar qualquer endpoint clínico do paciente
Então recebe `403`
E nenhum metadado ou conteúdo clínico é retornado ou auditado como leitura.

### Cenário: revogar acesso

Dado um vínculo ativo
Quando o paciente ou admin gestor o revoga
Então o médico perde acesso na requisição seguinte
E a revogação identifica ator, vínculo e data na auditoria administrativa.

## Contratos propostos

```text
GET    /admin/users
POST   /admin/doctors
GET    /admin/doctors
PATCH  /admin/doctors/{doctor_id}
POST   /admin/care-groups
GET    /admin/care-groups
POST   /admin/care-groups/{group_id}/doctors
POST   /admin/care-groups/{group_id}/patient-invitations
DELETE /admin/care-groups/{group_id}/patients/{patient_id}
GET    /admin/audit-events

POST   /auth/google/doctor-invitation

GET    /me/care-invitations
POST   /me/care-invitations/{invitation_id}/accept
POST   /me/care-invitations/{invitation_id}/reject
DELETE /me/care-groups/{group_id}
```

Todos os schemas de entrada usam `extra="forbid"`. Contratos detalhados,
paginação, expiração inicial do convite e campos exatos da allowlist permanecem
para a revisão desta spec antes do Step 10 entrar em TDD.

## Dados propostos

- `doctors.created_by_admin_user_id` obrigatório para novos médicos.
- `doctor_invitations` com admin criador, dados profissionais pendentes, e-mail
  esperado, hash do token, status e expiração; token bruto é entregue uma vez.
- `care_groups.managed_by_admin_user_id` obrigatório para novos grupos.
- `care_group_patient_invitations` com paciente, grupo, status, expiração e
  timestamps; sem token quando o convite aparece na conta autenticada.
- `administrative_audit_events` sem `patient_id` clínico obrigatório e com
  snapshots cadastrais por allowlist.

A migration também remove de contas admin demonstrativas qualquer role clínica
inconsistente e a camada de concessão passa a rejeitar essa combinação. Como a
regra cruza linhas de `user_roles`, a autorização clínica ainda nega
defensivamente qualquer identidade que contenha `admin`.

A migration será `0008`, forward-only. Dados demonstrativos existentes recebem
um admin gestor de desenvolvimento de modo determinístico.

## Segurança e autorização

- Ownership administrativo é repetido no SQL de cada recurso; o frontend não
  participa da autorização.
- Diretório administrativo e endpoints de gestão não reutilizam schemas
  clínicos nem joins do prontuário.
- Um admin não herda `patient` ou `doctor` e não recebe bypass de vínculo.
- Dependências clínicas recusam defensivamente qualquer identidade que contenha
  `admin`, mesmo diante de dado inconsistente criado fora da aplicação.
- IDs desconhecidos e recursos de outro admin retornam a mesma resposta.
- Auditoria administrativa não armazena CPF integral, senha, token, prontuário
  ou snapshots clínicos.
- Google autentica o convidado, mas somente o convite emitido pelo admin permite
  criar a role e o perfil profissional.

## Estratégia de testes preliminar

- Primeiro RED: admin não possui hoje rota para cadastrar médico.
- Migration e backfill passam no MySQL 8 real.
- Matriz cobre admin proprietário, outro admin, médico, paciente e sessão
  ausente para cada mutação.
- Testes provam exclusividade de `admin` e negação defensiva diante de combinação
  inconsistente criada diretamente no banco de teste.
- Teste de query prova ausência de tabelas clínicas no diretório administrativo.
- Convite cobre pending, aceite, recusa, expiração, revogação e concorrência.
- Teste de regressão prova que nenhuma rota admin abre prontuário.
- Frontend cobre ownership, estados vazios/erro, confirmação e 320 px.

## Evidência TDD

| Ciclo | Teste RED | Implementação GREEN | Refactor | Referência |
|---|---|---|---|---|
| 1 | — | — | — | — |

## Critérios de conclusão preliminares

- [ ] Contratos e allowlists aprovados.
- [ ] Admin gerencia somente recursos sob sua responsabilidade.
- [ ] Paciente aceita antes de o médico receber acesso.
- [ ] Admin não acessa nenhuma informação clínica.
- [ ] Auditoria administrativa é consultável sem expor auditoria clínica.
- [ ] Definition of Done atendida.

## Questões para revisão

1. Convite expira inicialmente em quantos dias?
2. Quais campos cadastrais mascarados bastam para o admin desambiguar pacientes?
3. Suspender um médico deve encerrar seus vínculos ou apenas tornar todos
   imediatamente ineficazes enquanto durar a suspensão?
