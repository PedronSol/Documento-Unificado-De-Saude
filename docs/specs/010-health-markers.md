# Marcadores de Saúde do Paciente

## Status

IMPLEMENTED

## Dependências

- Step 3 concluído no [PR #3](https://github.com/PedronSol/Documento-Unificado-De-Saude/pull/3).
- Step 4 concluído no [PR #4](https://github.com/PedronSol/Documento-Unificado-De-Saude/pull/4).
- Step 5 concluído no [PR #5](https://github.com/PedronSol/Documento-Unificado-De-Saude/pull/5).
- Decisões D002, D004, D005 e D008 de `000-foundation-decisions.md`.
- Contratos e matriz de autorização de
  `004-resource-contracts-authorization.md`.
- Auditoria transacional definida em `005-clinical-audit.md`.

## Contexto e problema

O prontuário atual possui alertas legados somente leitura, mas não oferece um
recurso para o paciente manter medicações, diagnósticos, condições crônicas e
alergias. Essas informações serão consumidas futuramente pela área médica e pelo
resumo temporário, por isso precisam nascer com ownership, histórico, autoria e
auditoria transacional.

Esta entrega cria um recurso clínico próprio para marcadores. O paciente poderá
consultar os marcadores ativos e removidos, criar, editar e remover logicamente
registros próprios. Alertas legados permanecem independentes e não são migrados
nem convertidos automaticamente.

## Objetivos

- Listar marcadores ativos e o histórico removido do paciente autenticado.
- Criar e editar marcadores próprios.
- Remover logicamente marcadores sem apagar seu histórico.
- Impedir duplicidade ativa por paciente, tipo e nome normalizado, inclusive em
  requisições concorrentes.
- Registrar criador, último atualizador e timestamps em UTC.
- Auditar criação, edição e remoção na mesma transação da alteração clínica.
- Criar uma experiência responsiva e acessível para gerenciamento dos
  marcadores no dashboard do paciente.
- Manter estados de carregamento, vazio, erro e conflito isolados dos demais
  recursos do dashboard.

## Não objetivos

- Prescrição médica eletrônica, renovação de receita ou cálculo de posologia.
- Validar interação medicamentosa, diagnóstico ou nomenclatura clínica.
- Permitir operação médica; vínculos e rotas `/medical` pertencem ao Step 7.
- Reativar um marcador removido; o paciente poderá criar um novo registro com o
  mesmo tipo e nome.
- Converter ou sincronizar automaticamente os alertas legados.
- Criar timeline clínica unificada para vacinas, documentos e marcadores.
- Implementar compartilhamento por QR-Code, documentos, OCR ou biomarcadores.
- Expor IDs de paciente ou autoria no contrato HTTP do paciente.
- Redesenhar seções do dashboard sem relação com marcadores.

## Vocabulário

- **Marcador ativo:** dado clínico atual exibido no resumo do paciente.
- **Marcador removido:** versão final preservada no histórico, sem participar do
  resumo ativo ou da regra de duplicidade.
- **Nome normalizado:** nome sem espaços externos, com espaços internos
  consecutivos reduzidos a um e comparação sem diferença entre maiúsculas e
  minúsculas. A grafia com acentos continua significativa.
- **Remoção lógica:** transição irreversível nesta versão de `active` para
  `removed`, sem `DELETE` físico.

## Regras de negócio e técnicas

1. Os tipos iniciais são `medication`, `diagnosis`, `condition` e `allergy`.
2. `name` é obrigatório, possui no máximo 120 caracteres e é persistido após
   trim e redução de espaços internos consecutivos.
3. `normalized_name` aplica Unicode `casefold` ao nome já limpo e usa comparação
   que preserva diferenças de acentuação.
4. `description` é opcional e possui no máximo 500 caracteres.
5. `dosage` e `frequency` são opcionais, possuem no máximo 100 caracteres e só
   são aceitos para `medication`.
6. Strings opcionais vazias ou compostas apenas por espaços são normalizadas
   para `null`.
7. Campos de medicação enviados para outro tipo retornam `422`; trocar uma
   medicação para outro tipo exige limpar esses campos na mesma requisição.
8. Um paciente não pode possuir dois marcadores ativos com o mesmo tipo e nome
   normalizado. Dosagem, frequência e descrição não participam da identidade.
9. A unicidade ativa é protegida por constraint no banco, não apenas por uma
   consulta prévia na aplicação.
10. Marcadores removidos não bloqueiam a criação de um novo marcador com o mesmo
   tipo e nome. Múltiplas ocorrências removidas podem coexistir no histórico.
11. `GET /me/markers` usa `status=active` por padrão e aceita somente `active`
    ou `removed`.
12. A listagem ativa é ordenada por tipo e nome; o histórico removido é ordenado
    por `removed_at` decrescente.
13. Pacientes menores de idade podem consultar marcadores ativos e removidos,
    mas não podem criar, editar ou remover.
14. Criação, edição e remoção exigem paciente adulto e derivam `user_id` e
    `patient_id` exclusivamente da sessão.
15. Edição e remoção bloqueiam o marcador ativo próprio com `FOR UPDATE` antes
    da alteração.
16. Marcador inexistente, removido ou pertencente a outro paciente retorna o
    mesmo `404`, sem revelar ownership ou histórico alheio.
17. `PUT` substitui todos os campos editáveis e nunca altera diretamente
    `status`, timestamps, paciente ou autoria.
18. `DELETE` não executa exclusão física: altera `status` para `removed`, fazendo
    a chave ativa gerada tornar-se nula, registra `removed_at` e atualiza a
    autoria.
19. Um marcador removido não pode ser editado ou removido novamente nesta
    versão.
20. `created_at`, `updated_at` e `removed_at` são gerados pelo banco em UTC com
    precisão de microssegundos; nenhum timestamp é aceito do cliente.
21. Falha de mutação ou auditoria reverte toda a transação. Conflito de
    unicidade reverte a mutação e retorna `409`.
22. A migration é `0004`, forward-only e não altera revisões aplicadas.
23. Não há backfill de alertas nem seed de histórico clínico fictício.

## Auditoria

As ações seguem o catálogo do Step 5:

| Ação | Recurso | Snapshot anterior | Snapshot posterior |
|---|---|---|---|
| `health_marker.created` | `health_marker` | `null` | marcador ativo criado |
| `health_marker.updated` | `health_marker` | marcador ativo anterior | marcador ativo atualizado |
| `health_marker.removed` | `health_marker` | marcador ativo anterior | marcador com status `removed` |

O snapshot usa allowlist própria com `type`, `name`, `description`, `dosage`,
`frequency` e `status`. Não inclui `patient_id`, IDs de usuário, CPF, e-mail,
token, timestamps ou conteúdo documental.

O evento usa o mesmo cursor e a mesma transação da mutação. Operações recusadas,
payload inválido, conflito, recurso ausente ou recurso alheio não produzem evento
de sucesso.

## Matriz de autorização

| Operação | Sessão e perfil | Escopo | Resultado sem permissão |
|---|---|---|---|
| `GET /me/markers?status=active` | paciente autenticado | próprio `patient_id` | `401`, `403` ou `409` |
| `GET /me/markers?status=removed` | paciente autenticado | próprio `patient_id` | `401`, `403` ou `409` |
| `POST /me/markers` | paciente adulto | próprio `patient_id` | `401`, `403` ou `409` |
| `PUT /me/markers/{marker_id}` | paciente adulto | marcador ativo próprio | `401`, `403`, `404` ou `409` |
| `DELETE /me/markers/{marker_id}` | paciente adulto | marcador ativo próprio | `401`, `403`, `404` ou `409` |

Possuir também `doctor` não amplia o escopo de `/me/*`. `admin` não recebe
acesso clínico implícito. Nenhuma rota `/medical` é criada nesta entrega.

## Cenários de aceitação

### Cenário: listar marcadores ativos independentemente

Dado um paciente autenticado com marcadores ativos
Quando consulta `GET /me/markers` sem informar status
Então recebe somente os marcadores ativos do próprio prontuário
E uma falha nessa consulta não remove vacinas, alertas ou documentos já exibidos.

### Cenário: adicionar medicação

Dado um paciente adulto autenticado
Quando cadastra uma medicação chamada "Losartana", dosagem "50 mg" e frequência
"1 vez ao dia"
Então recebe `201` com o marcador ativo persistido
E a criação e o evento `health_marker.created` são confirmados juntos.

### Cenário: validar campos conforme o tipo

Dado um paciente adulto autenticado
Quando envia nome vazio, tipo desconhecido ou dosagem para uma alergia
Então recebe `422`
E nenhuma mutação ou auditoria é executada.

### Cenário: impedir marcador ativo duplicado

Dado que o paciente possui "Diabetes Tipo 2" ativo como `condition`
Quando tenta criar `"  diabetes   tipo 2  "` com o mesmo tipo
Então recebe `409` com `detail` igual a
`"Marcador ativo já cadastrado. Edite o registro existente."`
E o marcador existente e sua auditoria permanecem inalterados.

### Cenário: permitir o mesmo nome em tipos diferentes

Dado um marcador ativo chamado "Insulina" do tipo `medication`
Quando o paciente cria "Insulina" como `allergy`
Então a criação é permitida
E ambos permanecem ativos porque seus tipos são diferentes.

### Cenário: editar marcador próprio

Dado um paciente adulto com uma medicação ativa própria
Quando altera dosagem, frequência ou descrição
Então o marcador é bloqueado e atualizado
E `updated_by_user_id` e `updated_at` são atualizados
E `health_marker.updated` registra snapshots anterior e posterior na mesma
transação.

### Cenário: impedir duplicidade durante edição

Dado que o paciente possui dois marcadores ativos distintos
Quando edita um deles para o tipo e nome normalizado do outro
Então recebe `409`
E nenhum dos marcadores nem a auditoria é alterado.

### Cenário: remover marcador preservando histórico

Dado um paciente adulto com "Aspirina 100 mg" ativa
Quando confirma sua remoção
Então o marcador muda para `removed` sem exclusão física
E deixa de aparecer na lista ativa
E aparece no histórico com `removed_at`
E `health_marker.removed` preserva os estados anterior e posterior.

### Cenário: cancelar remoção

Dado que o paciente abriu a confirmação de remoção de "Hipertensão"
Quando cancela ou fecha o diálogo
Então nenhuma requisição é enviada
E o foco retorna ao controle que abriu a confirmação.

### Cenário: recriar marcador removido

Dado que "Hipertensão" do tipo `condition` existe somente no histórico removido
Quando o paciente cria um novo marcador ativo com o mesmo tipo e nome
Então a criação é permitida com novo `marker_id`
E o registro anterior continua inalterado no histórico.

### Cenário: bloquear alteração de outro paciente

Dado um paciente adulto autenticado
Quando usa na URL o `marker_id` de outro paciente
Então recebe a mesma resposta `404` de um ID inexistente
E nenhum dado, alteração ou evento revela o proprietário.

### Cenário: reverter quando a auditoria falha

Dado que uma alteração de marcador seria válida
E o banco rejeita o evento de auditoria
Quando a operação é executada
Então a transação é revertida
E a API retorna `503` sem detalhes do banco.

### Cenário: gerenciar marcadores no frontend

Dado um paciente adulto no dashboard
Quando abre a seção de marcadores
Então vê os registros agrupados por tipo, com estados de loading, vazio e erro
E pode alternar entre ativos e histórico removido
E criar ou editar em diálogo acessível e responsivo
E confirmar remoção em diálogo próprio, sem confirmação nativa do navegador.

## Contratos afetados

### API

```text
GET    /me/markers?status=active|removed
POST   /me/markers
PUT    /me/markers/{marker_id}
DELETE /me/markers/{marker_id}
```

`GET` sem query equivale a `status=active`.

`MarkerCreateUpdate`:

```json
{
  "type": "medication",
  "name": "Losartana",
  "description": "Uso contínuo",
  "dosage": "50 mg",
  "frequency": "1 vez ao dia"
}
```

`MarkerResponse`:

```json
{
  "marker_id": 21,
  "type": "medication",
  "name": "Losartana",
  "description": "Uso contínuo",
  "dosage": "50 mg",
  "frequency": "1 vez ao dia",
  "status": "active",
  "created_at": "2026-10-06T18:30:00.123456",
  "updated_at": "2026-10-06T18:30:00.123456",
  "removed_at": null
}
```

| Método | Sucesso |
|---|---|
| `GET` | `200`, `MarkerResponse[]` |
| `POST` | `201`, `MarkerResponse` criado |
| `PUT` | `200`, `MarkerResponse` atualizado |
| `DELETE` | `200`, `{"message": "Marcador removido com sucesso!"}` |

### Erros

| Caso | Resposta |
|---|---|
| sessão ausente ou inválida | `401`, contrato existente |
| role incorreta ou paciente menor em escrita | `403`, contrato existente |
| marcador ausente, removido ou alheio | `404`, `{"detail": "Marcador não encontrado."}` |
| perfil de paciente inconsistente | `409`, contrato existente |
| marcador ativo duplicado | `409`, `{"detail": "Marcador ativo já cadastrado. Edite o registro existente."}` |
| path, query ou payload inválido | `422`, formato padrão do FastAPI |
| falha de banco ou auditoria | `503`, `{"detail": "Banco de dados indisponível."}` |

### Dados

A migration `0004_health_markers.py` cria `health_markers`:

| Coluna | Tipo | Regra |
|---|---|---|
| `marker_id` | `BIGINT` | chave primária auto incremental |
| `patient_id` | `BIGINT` | FK obrigatória para `patients` |
| `marker_type` | `ENUM` | `medication`, `diagnosis`, `condition`, `allergy` |
| `name` | `VARCHAR(120)` | valor de apresentação normalizado |
| `normalized_name` | `VARCHAR(160)` | `casefold` com collation que preserva acentos |
| `active_name_key` | `VARCHAR(160) NULL` | coluna gerada por `CASE`; nome normalizado somente quando ativo |
| `description` | `VARCHAR(500) NULL` | observação opcional |
| `dosage` | `VARCHAR(100) NULL` | somente medicação |
| `frequency` | `VARCHAR(100) NULL` | somente medicação |
| `status` | `ENUM` | `active` ou `removed` |
| `created_by_user_id` | `BIGINT` | FK obrigatória para `users` |
| `updated_by_user_id` | `BIGINT` | FK obrigatória para `users` |
| `created_at` | `DATETIME(6)` | UTC gerado pelo banco |
| `updated_at` | `DATETIME(6)` | UTC atualizado explicitamente |
| `removed_at` | `DATETIME(6) NULL` | obrigatório somente quando removido |

Regras estruturais:

- FKs usam `ON DELETE RESTRICT` para preservar histórico clínico e autoria.
- Uma unique constraint em `(patient_id, marker_type, active_name_key)` impede
  duplicidade ativa; valores `NULL` permitem múltiplos registros removidos.
- Uma check constraint mantém `removed_at` nulo para `active` e preenchido para
  `removed`.
- Outra check constraint impede `dosage` e `frequency` fora de `medication`.
- Índices atendem `(patient_id, status, marker_type, name)` e a ordenação do
  histórico por `(patient_id, status, removed_at)`.
- A migration não cria, converte ou copia registros da tabela legada `alerts`.
- `downgrade()` falha explicitamente porque as migrations são forward-only.

## Frontend e direção visual

- A home consulta marcadores em recurso independente dos endpoints existentes.
- A seção diferencia loading, vazio, erro recuperável, conteúdo ativo e
  histórico vazio.
- Marcadores ativos são agrupados visualmente por tipo; medicação mostra dosagem
  e frequência quando presentes.
- Um seletor claro alterna entre ativos e histórico sem misturar os estados.
- O botão de criação e as ações de editar/remover aparecem apenas para paciente
  adulto, por usabilidade; o backend repete a autorização.
- Criação e edição compartilham um diálogo acessível alinhado à credencial
  clínica editorial da spec `003` e ao diálogo de vacina modernizado no Step 5.
- O formulário mostra dosagem e frequência somente para `medication`, limpa os
  valores ao trocar de tipo e apresenta erros no próprio diálogo.
- Remoção usa um `AlertDialog` acessível, com ação destrutiva explícita, foco
  inicial seguro no cancelamento e retorno de foco ao acionador.
- Não se usa `window.confirm`, modal manual sem focus trap nem componente visual
  legado na superfície criada.
- Como a integração toca `PatientDashboard`, a confirmação nativa ainda usada
  pela remoção de vacina é substituída pelo mesmo padrão acessível nesta entrega;
  o contrato HTTP e o restante do fluxo de vacina não mudam.
- Em viewport móvel, os diálogos funcionam como bottom sheet sem overflow
  horizontal; teclado, `Escape`, foco visível e reduced motion são preservados.
- Após uma mutação, apenas os recursos de marcadores afetados são atualizados;
  falha de marcadores não derruba as demais seções.

## Segurança e autorização

- Toda rota exige sessão, role `patient` e perfil consistente.
- O backend deriva ownership, paciente e autoria; o payload não aceita esses
  campos.
- Listagens não aceitam `patient_id`, CPF, e-mail nem filtros de outro paciente.
- Mutações combinam `marker_id`, `patient_id` e `status = 'active'` na leitura
  bloqueante e na alteração.
- `404` torna recurso alheio, removido e inexistente indistinguíveis.
- A constraint única protege contra corrida entre validação e persistência.
- Logs não incluem snapshots, payload clínico integral ou identificadores
  pessoais desnecessários.
- A interface não é tratada como fronteira de autorização.

## Estratégia de testes

### Primeiro ciclo RED

Adicionar o teste estrutural da revisão `0004`, esperando a migration
forward-only e a tabela `health_markers`. O teste deve falhar inicialmente
porque a revisão ainda não existe.

### Ciclos seguintes

1. Migration cria enums, constraints, FKs e índices no MySQL 8 real.
2. Schema Pydantic normaliza nome e opcionais e rejeita combinações inválidas.
3. `GET` retorna somente o paciente autenticado e filtra `active` ou `removed`.
4. Criação persiste autoria, timestamps e `health_marker.created` em uma única
   transação.
5. Constraint e tratamento do erro MySQL convertem duplicidade concorrente em
   `409` sem auditoria parcial.
6. Atualização bloqueia o marcador ativo próprio e audita antes/depois.
7. Remoção lógica preserva o registro, libera a chave ativa e audita a transição.
8. Recriação após remoção funciona e preserva ocorrências históricas anteriores.
9. Casos `401`, `403`, `404`, `409`, `422` e `503` cobrem autorização,
   ownership e atomicidade.
10. Serializador de snapshot comprova allowlist e ausência de dados sensíveis.
11. Teste React entra em RED para carregamento independente, agrupamento,
    campos condicionais, conflito e diálogos acessíveis.
12. Playwright cobre criação, edição, cancelamento da remoção, confirmação,
    histórico e viewport móvel.
13. Teste React entra em RED para remover `window.confirm` da vacina e comprova
    cancelamento, confirmação e retorno de foco com `AlertDialog`.

### Regressão e alinhamento

- Suíte completa de `backend/__tests__/`.
- Migration e atomicidade no MySQL 8 real via Compose.
- `npm test`, Playwright e build do frontend.
- Depois do backend verde, revisão explícita do contrato consumido, estados do
  frontend e direção visual antes de encerrar a entrega.
- Conferência de OpenAPI para confirmar ausência de rotas `/medical`.
- `git diff --check`, `git status` e ausência de artefatos gerados.

## Evidência TDD

| Ciclo | Teste RED observado | Implementação GREEN | Refactor |
|---|---|---|---|
| Migration | revisão `0004` ausente; depois tabela ausente no upgrade | migration forward-only, constraints, FKs e índices | nomes e assertions estruturais alinhados ao MySQL real |
| Contratos | `MarkerCreateUpdate` inexistente | schemas, normalização e campos condicionais | normalização textual compartilhada sem nova camada |
| API | módulo e rotas de marcadores inexistentes | listagens, mutações, ownership, conflito e auditoria atômica | router isolado e snapshots por allowlist |
| Composição | aplicação sem as rotas `/me/markers` | router registrado no composition root | registro explícito preservado |
| Frontend | quatro cenários falharam sem carregamento, seção, diálogo e histórico | seção independente, formulários e confirmação acessível | loaders estáveis, componente próprio e ordenação isolada |
| Vacina | teste falhou no `window.confirm` e não encontrou `alertdialog` | confirmação nativa substituída por `AlertDialog` | padrão de diálogo compartilhado por CSS sem abstração prematura |

Referência atual: branch `feat/health-markers`; o commit ou PR definitivo será
registrado no roadmap ao publicar a entrega.

## Verificações executadas

- Backend completo no MySQL 8 real via Compose: `88 passed`.
- Frontend unitário: `18 passed`.
- Playwright: `13 passed`.
- Build de produção do Next.js 16.3.8: aprovado.
- Revisão visual móvel: diálogo em bottom sheet, hierarquia da seção e ausência
  de overflow horizontal conferidas.
- `git diff --check`: aprovado.
- `npm run lint`: não executável porque o binário `eslint` não está instalado
  nas dependências atuais; nenhuma dependência fora da spec foi adicionada.

## Checkpoint de alinhamento do frontend

O backend verde exigiu uma nova superfície no dashboard: carregamento ativo e
histórico independentes, estados de loading/vazio/erro, formulário condicional,
conflito no próprio diálogo e remoção acessível. A revisão do componente tocado
também encontrou a confirmação nativa da remoção de vacina. A regra foi
incorporada à spec antes da mudança e os dois fluxos agora usam diálogos Radix,
com foco inicial seguro e retorno ao acionador. Nenhum endpoint de vacina nem
outra seção do dashboard foi redesenhado.

## Plano de execução

1. **Migration e schema:** criar revisão `0004`, contratos Pydantic e testes de
   normalização.
2. **Leitura autorizada:** adicionar router e listagens ativa/removida filtradas
   pelo paciente atual.
3. **Mutações atômicas:** implementar criação, edição e remoção lógica com
   unicidade, ownership e auditoria.
4. **Interface vertical:** integrar o recurso independente, seção agrupada,
   histórico e diálogos seguindo o padrão vigente.
5. **Regressão e documentação:** executar MySQL real, backend, frontend,
   Playwright, build e registrar evidências RED/GREEN/REFACTOR.

## Tarefas menores

| ID | Tarefa | Responsável sugerido | Esforço | Pré-requisitos | Definition of Done |
|---|---|---|---|---|---|
| T1 | Testar e criar migration `0004` | backend/infra | M | spec aprovada | schema, constraints e índices verdes no MySQL 8 |
| T2 | Definir schemas e normalização | backend | S | T1 | validações e contratos cobertos por testes |
| T3 | Implementar listagens próprias | backend | S | T2 | filtros de status e ownership cobertos |
| T4 | Criar mutações e auditoria | backend | L | T1, T2 | sucesso, conflito, rollback e snapshots verdes |
| T5 | Integrar recurso no dashboard | frontend | M | T3 | loading, vazio, erro e agrupamento testados |
| T6 | Criar diálogos de edição e remoção | frontend | M | T4, T5 | foco, teclado, conflito e responsividade testados |
| T7 | Executar regressão e atualizar tracker | qa/fullstack | M | T1–T6 | DoD e evidências registradas |

## Riscos e limites

- **Concorrência de duplicidade:** mitigada por constraint única e tratamento
  específico do erro de chave duplicada.
- **Confusão com alertas legados:** mitigada por seção e endpoint próprios, sem
  migração automática.
- **Vazamento por ID:** mitigado por leitura e mutação sempre combinadas com
  `patient_id` derivado.
- **Inconsistência entre histórico e resumo:** mitigada por remoção lógica
  transacional e filtros explícitos de status.
- **Crescimento do dashboard:** mitigado por componente próprio e recurso
  independente, sem reorganizar toda a aplicação neste step.

## Critérios de conclusão

- [x] Spec aprovada antes do primeiro teste RED.
- [x] Migration `0004` validada no MySQL 8 real.
- [x] Tipos, campos condicionais e normalização possuem testes.
- [x] Listagens ativa e removida derivam ownership da sessão.
- [x] Criação, edição e remoção lógica são atômicas com auditoria.
- [x] Duplicidade ativa retorna `409`, inclusive sob concorrência.
- [x] Marcadores removidos permanecem no histórico e não bloqueiam recriação.
- [x] IDs alheios, removidos e inexistentes são indistinguíveis nas mutações.
- [x] Nenhuma rota médica ou conversão de alertas foi antecipada.
- [x] Revisão de impacto no frontend registrada depois do backend verde.
- [x] Interface possui estados isolados e não introduz padrão visual legado.
- [x] Diálogos são responsivos, navegáveis por teclado e restauram foco.
- [x] A superfície tocada não mantém confirmação nativa de remoção de vacina.
- [x] Suítes afetadas, regressão e build passam.
- [x] Evidência RED, GREEN e REFACTOR registrada.
- [ ] Roadmap e referência de commit ou PR atualizados.

## Decisões propostas para revisão

1. Duplicidade considera `patient_id`, tipo e nome normalizado, sem dosagem,
   frequência ou descrição.
2. Espaços externos e repetições internas são normalizados; caixa é ignorada e
   acentos permanecem significativos.
3. O próprio paciente pode consultar ativos e removidos; autoria interna não é
   exposta no contrato HTTP.
4. Removidos não são reativados nesta versão, mas não bloqueiam um novo registro
   equivalente.
5. Campos de medicação são rejeitados para outros tipos em vez de ignorados.
6. Alertas legados permanecem separados e somente leitura.
7. O frontend usa diálogo acessível de confirmação, não `window.confirm`.
8. As mutações retornam o recurso criado/atualizado; remoção preserva a mensagem
   simples já usada pelas mutações atuais.

## Decisões e observações

- Revisão aprofundada iniciada em 2026-10-06 na branch
  `feat/health-markers`.
- Spec e decisões propostas aprovadas pelo usuário em 2026-10-06.
- A dependência circular anterior do próprio Step 6 foi removida.
- O modelo de dados foi alinhado à convenção em inglês da decisão D005.
- A revisão do frontend foi incorporada desde a spec e deverá ser repetida após
  o backend ficar verde, conforme a Definition of Done.
- O checkpoint pós-backend identificou `window.confirm` na remoção de vacina
  dentro de `PatientDashboard`; a correção foi incorporada à spec antes do código.
- Implementação e checkpoint de frontend concluídos em 2026-10-06; a entrega
  aguarda somente commits e referência do PR para encerrar o tracker.
