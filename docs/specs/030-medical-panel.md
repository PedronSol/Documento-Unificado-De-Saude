# Área Médica e Grupos de Atendimento

## Status

IMPLEMENTED

## Dependências

- Steps 3, 4, 5 e 6 concluídos.
- `docs/specs/003-unified-identity-roles-frontend.md` para identidade e troca de
  contexto.
- `docs/specs/004-resource-contracts-authorization.md` para erros e autorização
  por recurso.
- `docs/specs/005-clinical-audit.md` para auditoria transacional.
- `docs/specs/010-health-markers.md` para contratos, validação e histórico de
  marcadores.

## Contexto e problema

O backend reconhece médicos verificados, mas ainda não existe uma relação que
limite quais pacientes cada profissional pode atender. Também não há rotas sob
`/medical` nem uma interface profissional. Conceder acesso somente pela role
`doctor` daria a qualquer médico acesso global a dados clínicos.

Esta entrega cria grupos de atendimento e usa o compartilhamento de um grupo
ativo como fronteira obrigatória de autorização. O médico poderá localizar
somente pacientes autorizados, abrir um prontuário longitudinal mínimo e usar
as mesmas regras de marcadores já disponíveis ao paciente.

## Objetivos

- Criar grupos e vínculos persistentes de médicos e pacientes.
- Autorizar acesso somente quando médico e paciente compartilham ao menos um
  grupo e todos os elementos do vínculo estão vigentes e ativos.
- Buscar pacientes autorizados por nome ou CPF sem expor CPF na resposta.
- Exibir um prontuário médico somente leitura para perfil, vacinas e histórico
  de marcadores.
- Permitir criação, edição e remoção lógica de marcadores pelas rotas médicas,
  reutilizando validação, atomicidade e auditoria do módulo existente.
- Preservar a autoria da alteração pelo usuário médico e permitir resolvê-la
  para nome e CRM.
- Entregar a área profissional com estados de carregamento, vazio, erro e
  acesso negado cobertos por testes.

## Não objetivos

- Interface ou API pública para administrar grupos e vínculos; nesta versão,
  eles são provisionados por migration, seed ou operação interna confiável.
- Cadastro público de médicos ou validação de CRM em serviço externo.
- Acesso emergencial, delegação, consentimento granular ou vínculo por convite.
- Agenda, consulta, vídeo, faturamento, prescrição ou assinatura digital.
- Alterar perfil, vacinas ou outros recursos pelo prontuário médico.
- Exibir binários de documentos, OCR, exames estruturados ou gráficos ainda não
  definidos; esses comportamentos pertencem aos Steps 9 e 10.
- Reorganizar superfícies do frontend que não pertençam ao contexto médico.

## Regras de negócio

1. Toda rota `/medical` exige sessão válida e role `doctor` autorizada pelo
   backend. Na identidade atual, isso também exige usuário ativo, perfil médico
   existente e `verification_status = 'verified'`.
2. Um paciente é autorizado somente quando existe ao menos um grupo em comum em
   que o grupo, o vínculo do médico e o vínculo do paciente têm status `active`,
   `starts_at <= UTC_TIMESTAMP()` e `ends_at` ausente ou no futuro.
3. Grupo ou vínculo inativo, ainda não iniciado ou expirado não concede acesso.
   Mais de um vínculo válido não duplica o paciente na listagem.
4. Um paciente pode participar de vários grupos. Um médico também pode atuar em
   vários grupos.
5. A busca vazia lista, em ordem alfabética, todos os pacientes autorizados. Um
   texto com dois ou mais caracteres busca por nome completo ou nome preferido,
   sem diferenciar caixa. Um CPF, com ou sem pontuação, só é pesquisado quando
   contém exatamente 11 dígitos.
6. A resposta da busca nunca contém CPF, e-mail, IDs de usuário, nome de grupo
   ou informação de pacientes sem vínculo válido.
7. Toda rota com `patient_id` repete a verificação de vínculo no SQL. O frontend
   esconder links ou ter listado o paciente antes não participa da autorização.
8. Paciente inexistente e paciente sem vínculo válido são indistinguíveis para
   o médico e retornam `403` sem qualquer dado clínico.
9. Abrir o prontuário retorna somente perfil clínico mínimo, vacinas e
   marcadores ativos/removidos. O prontuário não permite editar perfil nem
   vacinas.
10. A leitura bem-sucedida do prontuário grava
    `medical_record.viewed` antes de devolver os dados. Falha de auditoria
    retorna `503` e nenhum dado clínico é entregue.
11. Criação, edição e remoção lógica de marcadores mantêm os contratos do Step
    6: normalização, campos condicionais, unicidade ativa, maioridade do
    paciente, snapshots por allowlist e eventos `health_marker.*`.
12. A maioridade é calculada com a data de nascimento do paciente alvo, e não
    com a idade do médico. Médico não altera o prontuário de menor nesta versão.
13. Em mutações, `patient_id`, `actor_user_id`, nome do profissional e CRM são
    derivados no servidor. O payload aceita apenas os campos clínicos do
    marcador.
14. `created_by_user_id`, `updated_by_user_id` e
    `clinical_audit_events.actor_user_id` registram o usuário médico. A FK única
    `doctors.user_id` permite resolver o mesmo autor para `display_name`,
    `crm_number` e `crm_state`, sem duplicar CRM em snapshots clínicos.
15. Remover uma medicação é apresentado como "suspender" na interface, mas usa
    a remoção lógica existente (`status = 'removed'`); outros tipos usam o texto
    "remover". Nenhum histórico é apagado.
16. A alteração do marcador e seu evento de auditoria permanecem na mesma
    transação. Falha em qualquer parte desfaz toda a mutação.

## Cenários de aceitação

### Cenário: listar somente pacientes de grupos compartilhados

Dado que Helena é médica verificada de um grupo ativo com Carlos
E Mariana não compartilha nenhum grupo ativo com Helena
Quando Helena acessa `GET /medical/patients`
Então a resposta contém Carlos uma única vez
E não contém Mariana nem seus dados pessoais.

### Cenário: buscar paciente autorizado por nome ou CPF

Dado que Carlos pertence a um grupo ativo da médica Helena
Quando Helena pesquisa por parte do nome de Carlos
Ou pelo CPF completo de Carlos com pontuação
Então Carlos é retornado sem que o CPF apareça na resposta.

### Cenário: vínculo inválido não autoriza

Dado que Helena e Mariana possuem somente um grupo em comum inativo, futuro ou
expirado
Quando Helena lista pacientes ou tenta abrir o prontuário de Mariana
Então Mariana não aparece na listagem
E o acesso direto retorna `403` sem dados clínicos.

### Cenário: abrir prontuário longitudinal autorizado

Dado que Carlos compartilha um grupo válido com Helena
Quando Helena abre o prontuário de Carlos
Então vê o perfil clínico mínimo, vacinas e marcadores ativos e removidos
E um evento `medical_record.viewed` identifica Helena como autora da leitura.

### Cenário: adicionar marcador com autoria médica

Dado que Helena possui vínculo válido com Carlos e Carlos é adulto
Quando adiciona o diagnóstico "Insuficiência renal leve"
Então o marcador é criado pelas mesmas regras do módulo de marcadores
E a alteração e o evento de auditoria registram o `user_id` de Helena
E esse usuário resolve para o nome de Helena e seu CRM.

### Cenário: suspender medicação sem apagar histórico

Dado que Carlos possui "Captopril 25 mg" ativo
Quando Helena confirma a suspensão
Então o marcador sai da lista ativa
E permanece no histórico como removido, com data e autoria médica.

### Cenário: bloquear troca de patient_id

Dado que Helena pode atender Carlos, mas não Mariana
Quando troca o `patient_id` na URL de consulta ou mutação para o de Mariana
Então o backend retorna `403`
E não consulta, cria ou altera recurso clínico de Mariana.

### Cenário: papel ou perfil médico inválido

Dado um paciente, um médico pendente ou um médico rejeitado autenticado
Quando acessa qualquer rota `/medical`
Então recebe `403` e nenhum dado de pacientes é retornado.

### Cenário: paciente menor não pode ter marcador alterado

Dado que a médica possui vínculo válido com um paciente menor de idade
Quando tenta criar, editar ou remover um marcador desse paciente
Então recebe `403` e não há mutação nem evento de auditoria parcial.

## Contratos afetados

### API

#### `GET /medical/patients?query=`

- `query` é opcional, recebe no máximo 100 caracteres e tem espaços externos
  removidos.
- Vazio retorna todos os pacientes autorizados; texto não vazio que não seja um
  CPF válido precisa de pelo menos dois caracteres.
- CPF aceita `00011122222` ou `000.111.222-22` e faz correspondência exata após
  remover pontuação.
- Nome usa correspondência parcial sobre nome completo e nome preferido.
- Resposta `200`:

```json
[
  {
    "patient_id": 1,
    "preferred_name": "Carlos Silva",
    "full_name": "Carlos Eduardo Silva",
    "avatar_url": null,
    "health_status": "updated",
    "age": 41
  }
]
```

#### `GET /medical/patients/{patient_id}`

- Repete a autorização pelo vínculo e registra a leitura na mesma unidade de
  trabalho usada para montar a resposta.
- Resposta `200`:

```json
{
  "patient": {
    "patient_id": 1,
    "preferred_name": "Carlos Silva",
    "full_name": "Carlos Eduardo Silva",
    "avatar_url": null,
    "health_status": "updated",
    "blood_type": "A+",
    "age": 41
  },
  "vaccines": [
    {
      "vaccine_id": 1,
      "name": "COVID-19 (Pfizer)",
      "dose": "3ª Dose - Reforço",
      "administered_on": "2024-02-10",
      "status": "applied"
    }
  ],
  "markers": {
    "active": [],
    "removed": []
  }
}
```

- A ordenação é determinística: vacinas por data decrescente e depois nome;
  marcadores ativos por tipo/nome e removidos por `removed_at` decrescente.
- Autoria interna e CPF não são expostos nesse contrato.

#### Mutações de marcadores

```text
POST   /medical/patients/{patient_id}/markers
PUT    /medical/patients/{patient_id}/markers/{marker_id}
DELETE /medical/patients/{patient_id}/markers/{marker_id}
```

- `POST` e `PUT` recebem `MarkerCreateUpdate` e retornam `MarkerResponse`; `POST`
  usa `201`.
- `DELETE` mantém a mensagem do contrato atual e executa remoção lógica.
- Todas verificam o paciente autorizado antes de carregar o marcador.
- Depois da autorização do paciente, marcador alheio, removido ou inexistente
  retorna o mesmo `404` do módulo atual.

#### Erros

| Status | Condição |
|---|---|
| `401` | cookie ausente, sessão inválida ou expirada |
| `403` | role médica indisponível, vínculo inválido, paciente inexistente ou menor em mutação |
| `404` | marcador ativo não encontrado dentro do paciente já autorizado |
| `409` | perfil profissional inconsistente ou marcador ativo duplicado |
| `422` | busca ou payload inválido |
| `503` | banco ou auditoria indisponível |

### Dados

A migration forward-only `0005` cria:

```text
care_groups
- care_group_id BIGINT PK
- name VARCHAR(100) NOT NULL
- status ENUM('active', 'inactive') NOT NULL
- created_at DATETIME(6) NOT NULL
- updated_at DATETIME(6) NOT NULL

doctor_care_groups
- care_group_id BIGINT FK care_groups RESTRICT
- doctor_id BIGINT FK doctors RESTRICT
- status ENUM('active', 'inactive') NOT NULL
- starts_at DATETIME(6) NOT NULL
- ends_at DATETIME(6) NULL
- created_at DATETIME(6) NOT NULL
- updated_at DATETIME(6) NOT NULL
- PK (care_group_id, doctor_id)

patient_care_groups
- care_group_id BIGINT FK care_groups RESTRICT
- patient_id BIGINT FK patients RESTRICT
- status ENUM('active', 'inactive') NOT NULL
- starts_at DATETIME(6) NOT NULL
- ends_at DATETIME(6) NULL
- created_at DATETIME(6) NOT NULL
- updated_at DATETIME(6) NOT NULL
- PK (care_group_id, patient_id)
```

- Índices iniciados pelo sujeito suportam autorização e listagem:
  `doctor_care_groups(doctor_id, status, starts_at, ends_at, care_group_id)` e
  `patient_care_groups(patient_id, status, starts_at, ends_at, care_group_id)`.
- Um índice adicional iniciado por grupo em `patient_care_groups` suporta a
  listagem dos pacientes dos grupos autorizados.
- `ends_at`, quando informado, precisa ser posterior a `starts_at`.
- As linhas inativas e expiradas permanecem armazenadas. Como não há API de
  administração nesta entrega, cada par grupo/profissional ou grupo/paciente
  possui no máximo um vínculo provisionado; histórico de múltiplos períodos não
  é antecipado.
- Nenhuma tabela existente é removida ou alterada. Autoria e CRM são resolvidos
  pelas FKs atuais de `health_markers`, `clinical_audit_events`, `users` e
  `doctors`.

### Seed de desenvolvimento

- Grupo ativo "Unidade Centro": Helena e Carlos.
- Grupo ativo "Unidade Norte": Marcos e Mariana.
- Grupo inativo: Helena e Mariana, para demonstrar negação sem misturar os
  grupos válidos.
- Seeds permanecem idempotentes e exclusivos de desenvolvimento.

### Frontend

- O contexto `doctor` carrega sob demanda um `DoctorDashboard` no lugar do
  placeholder institucional.
- A tela inicial possui busca explícita, lista de pacientes e estados de
  loading, vazio e erro com tentativa novamente.
- A listagem nunca renderiza CPF. Busca por CPF mantém o valor somente no estado
  transitório do formulário e não o escreve em URL do navegador ou storage.
- Ao abrir um paciente, a interface mostra cabeçalho clínico, vacinas,
  marcadores ativos e histórico. Cada recurso deixa claro quando está vazio.
- Perfil e vacinas são somente leitura. Marcadores usam os mesmos campos,
  validações, conflito e diálogos acessíveis do fluxo do paciente.
- Acesso `403` exibe estado negado sem manter dados de uma resposta anterior e
  oferece retorno à lista.
- Em viewport móvel não há overflow horizontal. Diálogos preservam foco,
  teclado, `Escape`, retorno ao acionador e reduced motion.
- A revisão visual fica limitada à área profissional e a componentes
  compartilhados diretamente necessários.

## Segurança e autorização

- O filtro de vínculo faz parte de cada consulta por paciente e usa
  `EXISTS`/joins parametrizados; não existe carregamento global seguido de
  filtragem em Python.
- Busca por nome e CPF aplica o filtro de vínculo no mesmo SQL e usa parâmetros,
  sem interpolar entrada.
- O frontend não envia `doctor_id`, `user_id`, CRM, autoria ou group ID.
- `patient_id` é um identificador interno, mas nunca é considerado segredo ou
  prova de autorização.
- `403` uniforme impede confirmar se um `patient_id` fora do vínculo existe.
- O CPF é usado apenas como predicado e não entra em resposta, evento de
  auditoria ou log da aplicação.
- Eventos de auditoria não recebem snapshots de perfil, CPF ou grupo na leitura
  do prontuário.
- Mutações verificam vínculo novamente dentro da unidade de trabalho; perder a
  autorização antes da operação impede a escrita.
- A interface é defesa de experiência, não fronteira de segurança.

## Casos de erro e limites

- Espaços em uma busca vazia equivalem à listagem sem filtro.
- Texto de um caractere e sequência numérica diferente de 11 dígitos retornam
  `422`; não são tratados como busca aproximada de CPF.
- Zero resultados retorna `200` com lista vazia.
- Grupos compartilhados duplicados não duplicam pacientes por causa de
  `DISTINCT`/`EXISTS` e do contrato testado.
- Datas usam UTC no banco. `ends_at` é exclusivo: o vínculo deixa de valer em
  `ends_at`.
- Falha de banco na listagem, prontuário, vínculo, mutação ou auditoria retorna
  `503` sem detalhes internos.
- A listagem desta primeira versão retorna no máximo 50 pacientes. O resultado
  é ordenado antes do limite; paginação fica fora do escopo até existir demanda
  concreta.
- Nenhum dado clínico parcial é mantido no estado visual ao trocar paciente ou
  receber erro.

## Estratégia de testes

### Primeiro ciclo RED

Adicionar o teste estrutural da revisão `0005`, esperando as três tabelas,
constraints, FKs e índices de vínculo. O teste deve falhar inicialmente porque
a revisão ainda não existe.

### Ciclos seguintes

1. Migration cria grupos e vínculos no MySQL 8 real, é forward-only e preserva
   tabelas existentes.
2. Dependência médica resolve somente usuário ativo com doctor verificado.
3. Verificador central aceita vínculo vigente e rejeita grupo/vínculo inativo,
   futuro, expirado, ausente ou paciente inexistente com `403` uniforme.
4. Listagem retorna somente autorizados, elimina duplicidade e limita a 50.
5. Busca cobre nome completo, nome preferido, CPF puro/formatado, vazio e
   entradas `422`, sem CPF no schema de resposta.
6. Prontuário retorna somente a allowlist especificada, com ordenação estável,
   e audita `medical_record.viewed` antes de responder.
7. Falha da auditoria de leitura retorna `503` e não expõe o prontuário.
8. Criação médica entra em RED antes da extração da lógica compartilhada de
   marcadores; GREEN comprova comportamento idêntico e autoria do médico.
9. Edição e remoção cobrem vínculo revogado, troca de `patient_id`, marcador
   alheio, paciente menor, duplicidade e rollback de auditoria.
10. Teste de integração real comprova que o autor do evento resolve para nome e
    CRM sem duplicar esses dados no snapshot.
11. Teste React entra em RED antes do `DoctorDashboard` e cobre busca, seleção,
    loading, vazio, erro, `403`, prontuário e mutações acessíveis.
12. Playwright cobre login médico, busca autorizada, acesso direto negado,
    criação de marcador, suspensão de medicação, histórico e viewport móvel.

### Regressão e alinhamento

- Suíte completa de `backend/__tests__/`.
- Migration, seeds, vínculo e atomicidade no MySQL 8 real via Compose.
- `npm test`, Playwright e build do frontend.
- Depois do backend verde, revisão explícita do contrato consumido, estados do
  frontend e direção visual antes da implementação da interface.
- Conferência do OpenAPI para rotas, schemas e ausência de campos sensíveis.
- `git diff --check`, `git status` e ausência de artefatos gerados.

## Evidência TDD

| Ciclo | Teste RED observado | Implementação GREEN | Refactor |
|---|---|---|---|
| Migration | teste falhou porque `0005_care_groups.py` não existia | três tabelas, FKs, checks e índices criados | timestamps compartilhados sem camada adicional |
| Autorização e busca | coleta falhou porque o módulo `medical` não existia | filtro SQL por grupo/vínculos vigentes, busca segura e `403` uniforme | allowlist e normalização isoladas em funções pequenas |
| Prontuário | import falhou porque `get_medical_record` não existia | perfil, vacinas, marcadores e auditoria atômica entregues | carregadores com ordenação determinística |
| Marcadores médicos | import falhou porque as três mutações médicas não existiam | criação, edição e remoção lógica com autoria médica | lógica comum extraída para `markers/service.py`, mantendo `/me` verde |
| Composição | rotas `/medical` ausentes no `create_app` | router médico registrado no composition root | registro explícito preservado |
| Frontend | Vitest falhou sem `DoctorDashboard`; integração ainda exibia o placeholder | busca, prontuário, mutações, estados e `403` implementados | painel carregado por `next/dynamic` e marcador parametrizado sem duplicação |
| E2E | RED do frontend comprovou a superfície profissional ausente | Playwright cobriu busca, prontuário, suspensão, histórico e mobile | sem requisições em cascata; detalhe chega em um único contrato |

Referência da implementação: `fc2b12e`.

## Verificações executadas

- Backend completo com MySQL 8 real: `103 passed`.
- Frontend unitário: `21 passed`.
- Playwright Chromium: `13 passed`.
- Build de produção do Next.js 16.3.8: aprovado.
- Migration `0005`, seed idempotente, vínculo, negação e autoria/CRM validados no
  banco real do Compose.
- `git diff --check`: aprovado.
- `npm run lint`: não executável porque o projeto não instala o binário
  `eslint`; nenhuma dependência fora da spec foi adicionada.

## Checkpoint de alinhamento do frontend

O backend verde consolidou o prontuário em uma única resposta para evitar
waterfalls no cliente. A interface profissional substituiu o placeholder do
Step 3 e é carregada sob demanda apenas no contexto `doctor`. A direção visual
adotada foi uma mesa clínica editorial, coerente com as fontes, cores e diálogos
vigentes, mas com hierarquia própria para busca e leitura longitudinal. Estados
de loading, vazio, erro, `403`, histórico e mobile foram cobertos; CPF não é
renderizado nem persistido no navegador.

## Plano de execução

1. **Migration e seed:** testar e criar `0005`, depois provisionar os grupos de
   demonstração.
2. **Autorização:** criar dependência médica e verificador de vínculo usados por
   todas as rotas com paciente.
3. **Busca e prontuário:** implementar allowlists, busca segura e auditoria da
   leitura.
4. **Mutações médicas:** reutilizar o módulo de marcadores e comprovar autoria,
   atomicidade e negações.
5. **Interface vertical:** substituir o placeholder médico por busca,
   prontuário e diálogos acessíveis.
6. **Regressão e documentação:** executar MySQL real, backend, frontend,
   Playwright, build e registrar evidências e referência.

## Tarefas menores

| ID | Tarefa | Área | Esforço | Pré-requisitos | Definition of Done |
|---|---|---|---|---|---|
| T1 | Testar e criar migration `0005` | backend/infra | M | spec aprovada | schema, FKs, checks e índices verdes no MySQL 8 |
| T2 | Atualizar seed de desenvolvimento | infra | S | T1 | grupos válidos e inválidos idempotentes |
| T3 | Criar autorização central de vínculo | backend | M | T1 | matriz válida/inválida coberta |
| T4 | Implementar listagem e busca | backend | M | T3 | filtros, allowlist e limites verdes |
| T5 | Implementar prontuário auditado | backend | M | T3 | resposta mínima e leitura auditada |
| T6 | Reutilizar marcadores nas rotas médicas | backend | L | T3 | mutações, autoria e rollback verdes |
| T7 | Implementar área médica | frontend | L | T4–T6 | estados, prontuário e diálogos testados |
| T8 | Executar E2E, regressão e tracker | fullstack | M | T1–T7 | DoD e evidências registradas |

## Riscos e limites

- **Vazamento por enumeração:** mitigado por `403` uniforme e verificação no
  mesmo SQL que acessa o paciente.
- **Vínculo revogado durante uso:** mitigado por verificação em toda rota e
  novamente na unidade de trabalho das mutações.
- **Duplicidade por vários grupos:** mitigada por consulta com `EXISTS` ou
  `DISTINCT` e teste explícito.
- **Divergência de marcadores:** mitigada por extração somente quando existir o
  segundo consumidor médico, com regressão das rotas `/me`.
- **Exposição de CPF:** mitigada por schema de saída sem o campo e teste de
  allowlist.
- **Escopo crescente do prontuário:** limitado a perfil, vacinas e marcadores já
  existentes; documentos e OCR continuam em steps próprios.
- **Histórico de vínculo:** esta versão preserva vínculos inativos, mas não
  modela múltiplos períodos do mesmo par sem um caso de uso administrativo.

## Critérios de conclusão

- [x] Spec aprovada antes do primeiro teste RED.
- [x] Migration `0005` e seed validados no MySQL 8 real.
- [x] Médico vê apenas pacientes de grupos ativos compartilhados e vigentes.
- [x] Busca por nome/CPF não expõe CPF nem pacientes não autorizados.
- [x] Acesso direto ausente ou sem vínculo retorna `403` sem vazamento.
- [x] Prontuário mínimo é somente leitura e sua abertura é auditada.
- [x] Mutações de marcadores reutilizam regras existentes e são atômicas.
- [x] Alterações médicas permitem resolver autoria para usuário, nome e CRM.
- [x] Papel inválido, vínculo inativo/expirado e paciente menor possuem testes.
- [x] Revisão de impacto no frontend registrada depois do backend verde.
- [x] Interface possui estados completos e diálogos acessíveis e responsivos.
- [x] Backend, MySQL real, frontend, Playwright e build passam.
- [x] Evidências RED, GREEN e REFACTOR registradas.
- [x] Roadmap e referência de commit ou PR atualizados.

## Decisões propostas para revisão

1. Grupos e vínculos são administrados somente por seed/operação interna nesta
   versão; não será criada UI administrativa.
2. Pacientes e médicos podem pertencer a vários grupos simultaneamente.
3. Documento original e OCR não aparecem no prontuário até os Steps 9 e 10; o
   Step 7 entrega perfil, vacinas e marcadores.
4. Paciente inexistente e paciente fora do vínculo retornam o mesmo `403` para
   reduzir enumeração.
5. Busca por CPF exige os 11 dígitos e nunca devolve o CPF.
6. A listagem é limitada a 50 itens sem paginação nesta primeira versão.
7. CRM é resolvido pela relação do usuário autor com `doctors`, sem duplicá-lo
   nos snapshots; o teste de integração comprova essa cadeia.
8. Remoção lógica de medicação é rotulada como suspensão, sem criar um terceiro
   status incompatível com o Step 6.
9. Vínculos usam um registro por par nesta versão e preservam o estado inativo;
   múltiplos períodos serão modelados somente se a administração futura exigir.

## Decisões e observações

- Revisão aprofundada iniciada em 2026-10-08 na branch
  `feat/medical-panel`.
- Spec e decisões propostas aprovadas pelo usuário em 2026-10-08.
- A dependência circular anterior do próprio Step 7 foi removida.
- O modelo de dados proposto foi alinhado à convenção em inglês vigente nas
  migrations e no backend.
- O gate de revisão foi respeitado: o primeiro RED ocorreu somente depois da
  aprovação explícita da spec.
- Implementação concluída no commit `fc2b12e`.

## Incremento: busca reativa de pacientes

### Status

IMPLEMENTED — spec aprovada pelo usuário em 2026-10-08.

### Contexto e objetivo

A busca da carteira médica atualmente depende do botão “Buscar”. O campo deve
atualizar os resultados enquanto a pessoa digita, sem disparar uma solicitação
por tecla nem permitir que respostas atrasadas substituam resultados mais
recentes. Este incremento é somente de interação no frontend; os contratos e a
autorização da API existente permanecem inalterados.

### Regras

1. A busca é reativa e aguarda 300 ms sem alterações antes de consultar a API.
2. Digitação rápida reinicia o temporizador; apenas o valor final após a pausa
   gera uma solicitação.
3. Busca por nome só é enviada com pelo menos dois caracteres não vazios.
   Prefixos de um caractere não consultam a API e mostram orientação para
   informar ao menos dois caracteres.
4. Uma entrada composta apenas de dígitos, espaços, pontos ou hífens só é
   enviada quando contém exatamente 11 dígitos, aceitando CPF formatado ou não.
   Prefixos incompletos não consultam a API nem produzem respostas 422.
5. Limpar o campo restaura a listagem autorizada sem parâmetro `query`, após a
   mesma pausa de 300 ms.
6. O botão “Buscar” permanece como submissão imediata para a entrada válida;
   submeter cancela o temporizador, não repete um valor já consultado e ainda
   permite repetir a consulta quando o estado atual é erro.
7. Uma nova consulta cancela a anterior quando possível. Mesmo se uma resposta
   antiga ainda chegar, ela não pode substituir os resultados da consulta mais
   recente. Cancelamento não é apresentado como erro.
8. O estado de carregamento, resultados, vazio e erro continua acessível pelos
   estados visíveis e `role="status"`/`role="alert"` existentes.

### Cenários de aceitação

#### Cenário: busca acompanha a digitação sem excesso de chamadas

Dado que a carteira autorizada está carregada
Quando a pessoa digita ou altera um nome válido
E permanece sem digitar por 300 ms
Então a interface consulta `/medical/patients?query=` com o texto atual
E digitação rápida antes do prazo gera somente a consulta do valor final.

#### Cenário: entrada curta não envia busca inválida

Dado que o campo contém menos de dois caracteres de nome ou um CPF incompleto
Quando a pessoa digita ou tenta submeter
Então nenhuma consulta inválida é enviada
E a interface orienta a informar dois caracteres ou um CPF completo.

#### Cenário: CPF completo permanece compatível com a API

Dado que a pessoa informa um CPF com 11 dígitos, pontuado ou não
Quando a pausa de 300 ms termina ou ela submete a busca
Então uma única consulta envia o CPF completo à API
E o CPF não é exibido na lista nem gravado em storage.

#### Cenário: limpar a busca restaura a carteira

Dado que resultados filtrados estão visíveis
Quando a pessoa apaga o conteúdo e aguarda 300 ms
Então a interface consulta a listagem autorizada sem `query` e exibe seus
resultados.

#### Cenário: resposta antiga não sobrescreve a busca atual

Dado que uma consulta anterior ainda está em andamento
Quando a pessoa altera o texto e a consulta mais recente termina primeiro
Então apenas os resultados da consulta mais recente são renderizados
E o cancelamento da consulta anterior não exibe erro.

### Contratos, erros e segurança

- A API continua usando `GET /medical/patients?query=` e suas regras existentes
  de nome, CPF, limite de 50 itens e autorização por grupo ativo.
- A implementação deve reutilizar `apiFetch` e seu suporte atual às opções de
  `fetch`; nenhuma dependência, serviço, cache compartilhado ou mudança no
  backend é necessária.
- Erros HTTP/rede da consulta vigente continuam no estado de erro atual, com
  ação de tentar novamente. Erros de requisições canceladas são ignorados.
- CPF é transitório no estado do campo e na requisição já existente. Não deve
  ser adicionado a storage, logs, telemetria, resultados ou mensagens visíveis.
- Nenhuma resposta desta interação amplia o escopo de pacientes autorizado pelo
  backend.

### Não objetivos

- Alterar o algoritmo, o contrato, a autorização ou o limite de resultados da
  API.
- Adicionar paginação, cache, busca fuzzy, sugestões ou busca em background.
- Remover o botão de submissão manual ou alterar a abertura de prontuários.

### Critérios de aceite e estratégia de testes

- [x] Teste com timers controlados confirma debounce de 300 ms e ausência de
  chamadas por tecla.
- [x] Testes cobrem entrada curta, CPF completo/incompleto, limpeza e botão
  manual sem duplicação.
- [x] Teste com promises fora de ordem confirma que resposta obsoleta não
  substitui o resultado atual e não gera erro após cancelamento.
- [x] RED observado pela razão esperada antes do código de produção; testes
  afetados, E2E da área profissional, build e `git diff --check` passam.

### Evidências RED/GREEN e regressão (2026-10-08)

- RED: `npm test -- --run tests/doctor-dashboard.test.jsx` falhou em dois
  cenários novos: o componente não orientava entradas curtas/CPF incompleto e
  não emitia consulta após o período de pausa.
- GREEN: implementação com 300 ms de debounce, validação de entrada no cliente,
  `AbortController`, identificador monotônico de requisição e deduplicação da
  submissão para um valor já consultado.
- Regressão: 33 testes unitários, 17 E2E (incluindo a carteira médica em 320 px)
  e build do Next.js passaram. Build/E2E executados em cópia isolada para
  preservar o servidor local ativo; `git diff --check` passou.
