# Painel Médico e Gestão de Pacientes

## Status

SPEC REVIEW

## Dependências

- Steps 3, 4, 5, 6 e 7 do roadmap.
- Papéis, vínculos, marcadores e auditoria aprovados.

## Contexto e problema

Médicos precisam consultar e atualizar dados de pacientes atribuídos, sem obter
acesso global a todos os pacientes da plataforma.

## Objetivos

- Listar somente pacientes vinculados aos grupos do médico.
- Pesquisar pacientes autorizados por nome ou CPF.
- Consultar prontuário longitudinal.
- Adicionar, editar e suspender marcadores com autoria médica.
- Bloquear acesso direto a pacientes fora dos vínculos ativos.

## Não objetivos

- Cadastro público de médico.
- Validação automática do CRM em serviço externo.
- Agenda, consulta por vídeo, faturamento ou prescrição eletrônica.
- Acesso emergencial fora dos vínculos.

## Regras de negócio

1. Usuário deve possuir papel `doctor` e perfil médico ativo.
2. Médico e paciente precisam compartilhar ao menos um grupo ativo.
3. Busca retorna somente pacientes já autorizados.
4. CPF pode ser critério de busca, mas não identificador na URL.
5. Acesso ao prontuário é auditado.
6. Alterações clínicas registram usuário, médico, CRM, data e valores anteriores.
7. Suspender medicação altera status; não remove histórico.
8. O backend valida vínculo em toda rota com `patient_id`.

## Cenários de aceitação

### Cenário: listar pacientes do grupo

Dado que sou médico autenticado com grupo ativo
Quando acesso o painel
Então vejo somente pacientes vinculados aos meus grupos
E posso pesquisar esses pacientes por nome ou CPF.

### Cenário: visualizar prontuário autorizado

Dado que João pertence a um dos meus grupos
Quando acesso seu perfil
Então vejo marcadores, exames, gráficos e documentos permitidos.

### Cenário: adicionar marcador clínico

Dado que estou no prontuário autorizado de João
Quando adiciono "Insuficiência Renal Leve" com observação
Então o marcador é salvo
E minha identidade e CRM ficam registrados no histórico.

### Cenário: suspender medicação

Dado que João possui "Captopril 25mg" ativo
Quando altero o status para suspenso e confirmo
Então o marcador sai da lista ativa
E permanece no histórico com data e autoria.

### Cenário: bloquear paciente de outro grupo

Dado que Maria não pertence aos meus grupos
Quando tento acessar diretamente sua URL por ID
Então o backend retorna `403`
E nenhum dado clínico de Maria é retornado.

## Contratos propostos

```text
GET  /medical/patients?query=
GET  /medical/patients/{patient_id}
GET  /medical/patients/{patient_id}/markers
POST /medical/patients/{patient_id}/markers
PUT  /medical/patients/{patient_id}/markers/{marker_id}
```

- Papel incorreto retorna `403`.
- Paciente fora do vínculo retorna `403`.
- Busca vazia retorna lista paginada dos pacientes autorizados.

## Dados propostos

```text
grupos_atendimento
medicos_grupos
pacientes_grupos
```

Os vínculos possuem status e período de vigência para preservar histórico.

## Segurança e autorização

- Não existe endpoint médico que consulte paciente sem verificar vínculo.
- Resultados de busca já são filtrados no SQL.
- CPF completo não é exibido em listagens por padrão.
- Toda leitura de prontuário e toda escrita clínica são auditadas.

## Estratégia de testes

- Primeiro RED: médico lista somente pacientes do grupo compartilhado.
- Papel de paciente bloqueado.
- Vínculo ausente, expirado e inativo.
- Manipulação de `patient_id`.
- Autoria médica na alteração.
- Playwright para lista, busca, prontuário e bloqueio.

## Critérios de conclusão

- [ ] Spec aprovada.
- [ ] Matriz de autorização coberta.
- [ ] Acesso direto fora do grupo não vaza dados.
- [ ] Alterações clínicas possuem autoria médica.
- [ ] Definition of Done atendida.

## Questões para revisão

1. Quem cria e administra grupos na primeira versão? Recomendação: dados
   administrativos por seed ou operação interna, sem UI administrativa inicial.
2. Um paciente pode pertencer a vários grupos simultaneamente? Recomendação: sim.
3. O médico pode visualizar o documento original ou apenas dados confirmados?
