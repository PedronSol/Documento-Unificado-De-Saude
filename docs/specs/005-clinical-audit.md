# Auditoria Clínica

## Status

IMPLEMENTED

## Dependências

- Step 4 concluído no [PR #4](https://github.com/PedronSol/Documento-Unificado-De-Saude/pull/4).
- Decisões D002, D004, D005 e D008 de `000-foundation-decisions.md`.
- Contratos e matriz de autorização definidos em
  `004-resource-contracts-authorization.md`.

## Contexto e problema

As mutações de vacina alteram dados clínicos sem registrar quem realizou a
operação, qual registro foi afetado ou quais valores mudaram. Os próximos steps
adicionarão marcadores, documentos, compartilhamento público e acesso médico;
implementar essas features antes de uma base transacional de auditoria permitiria
mudanças clínicas sem autoria ou eventos separados da operação que descrevem.

Esta entrega cria a fundação de auditoria e a aplica às três mutações clínicas
existentes. A escrita do evento participa da mesma transação da mudança, usa IDs
internos e armazena somente snapshots explicitamente permitidos para o recurso.

## Objetivos

- Criar uma tabela append-only para eventos de auditoria clínica.
- Registrar ator, paciente, ação, tipo e ID do recurso e instante do evento.
- Auditar criação, atualização e remoção de vacinas.
- Armazenar snapshots anterior e posterior somente quando úteis para explicar a
  mudança.
- Garantir atomicidade entre a mutação clínica e seu evento.
- Impedir que senha, token, CPF, e-mail ou conteúdo integral de documentos seja
  persistido em snapshots.
- Oferecer uma função pequena de escrita reutilizável pelas features clínicas
  seguintes, sem criar endpoints ou infraestrutura ainda sem consumidor.
- Alinhar o modal de criação e edição de vacina à direção visual vigente, pois
  ele é a superfície do fluxo de mutação tocado por esta entrega.

## Não objetivos

- Criar uma API ou interface para consultar a auditoria.
- Redesenhar o dashboard inteiro ou componentes sem relação com vacinas.
- Auditar login, logout, falhas de autenticação ou logs operacionais.
- Auditar as listagens rotineiras do próprio paciente em `/me/*`.
- Implementar marcadores, upload, OCR, compartilhamento ou área médica.
- Criar antecipadamente eventos para recursos que ainda não existem.
- Registrar IP, user-agent, corpo HTTP ou payload bruto da requisição.
- Tornar a tabela imutável contra um administrador do banco; nesta entrega ela é
  append-only pelo contrato da aplicação.
- Alterar respostas de sucesso ou contratos HTTP das vacinas.

## Vocabulário

- **Ator:** identidade que iniciou a operação. Nas mutações atuais é sempre um
  `user` autenticado.
- **Paciente:** pessoa cujo dado clínico foi acessado ou alterado.
- **Recurso:** entidade clínica afetada, como `vaccine`.
- **Ação:** operação concluída, expressa no passado e vinculada ao recurso, como
  `vaccine.created`.
- **Snapshot:** representação JSON mínima dos campos clínicos permitidos antes ou
  depois da mudança; não é uma cópia do payload HTTP.

## Autorização, auditoria e consulta

Auditoria e autorização possuem responsabilidades diferentes:

- **Autorização** decide se a operação pode acontecer. As permissões continuam
  vindo das roles, do perfil, da maioridade e do ownership definidos nos Steps 3
  e 4.
- **Auditoria** é uma consequência obrigatória de uma operação já autorizada.
  Ela não concede role, não cria vínculo e não permite que uma pessoa dê acesso
  a outra.
- **Consulta da auditoria** não existe na aplicação neste step. Nenhum paciente,
  médico ou administrador recebe uma rota para ler eventos.

Para as mutações atuais, o próprio backend autoriza o paciente adulto a alterar
somente suas vacinas. Depois da autorização, o código grava automaticamente o
evento; não há consentimento, botão ou permissão separada para ativar ou desativar
essa gravação.

| Questão | Regra nesta entrega |
|---|---|
| Quem pode alterar vacina? | paciente adulto autenticado, somente no próprio prontuário |
| Quem concede essa permissão? | a política do backend, com roles e ownership persistidos pelo servidor |
| Quem grava a auditoria? | o backend, obrigatoriamente, dentro da transação da mutação |
| Quem pode dispensar a auditoria? | ninguém; falha ao auditar reverte a mutação |
| Quem pode consultar os eventos pela aplicação? | ninguém neste step |
| Como médico terá acesso futuro? | por vínculo ativo do Step 7, sem usar a auditoria como autorização |

Se surgir necessidade de exibir histórico de auditoria, uma spec futura deverá
definir público, escopo, retenção, paginação, campos expostos e casos positivos e
negativos de autorização antes da criação de qualquer endpoint.

## Regras de negócio e técnicas

1. Um evento só representa uma operação clínica concluída com sucesso.
2. Mutação e auditoria usam a mesma conexão e a mesma transação de banco.
3. Se a mutação falhar, nenhum evento é persistido.
4. Se a gravação do evento falhar, a mutação clínica é revertida.
5. Autorização, validação, ownership e resolução do recurso ocorrem antes do
   evento; respostas `401`, `403`, `404`, `409` e `422` não geram auditoria nesta
   entrega.
6. O backend deriva `actor_user_id` e `patient_id` da sessão e de suas relações;
   nenhum dos dois é aceito do payload do cliente.
7. A data é gerada pelo banco em UTC e não pode ser informada pelo cliente.
8. IDs internos identificam ator, paciente e recurso. CPF, CRM e e-mail não são
   identificadores de auditoria.
9. A criação de vacina registra `vaccine.created`, snapshot anterior nulo e
   snapshot posterior com os dados persistidos.
10. A atualização bloqueia e lê a vacina própria antes de alterá-la, registra
    `vaccine.updated` e armazena snapshots anterior e posterior.
11. A remoção bloqueia e lê a vacina própria antes de excluí-la, registra
    `vaccine.deleted`, preserva o snapshot anterior e deixa o posterior nulo.
12. Vacina inexistente e vacina de outro paciente continuam retornando o mesmo
    `404` e não deixam evento.
13. Os snapshots de vacina permitem somente `name`, `dose`, `administered_on` e
    `status`; a data usa formato ISO `YYYY-MM-DD` e valores nulos são preservados.
14. Snapshot é montado por um serializador explícito do recurso. Payload bruto,
    objetos de request e dicionários arbitrários não são enviados ao gravador de
    auditoria.
15. Novos recursos deverão definir seu próprio schema de snapshot e teste de
    sanitização antes de integrar a função de auditoria.
16. Conteúdo binário, texto integral ou texto extraído de documentos nunca pode
    ser snapshot. Quando documentos existirem, somente metadados estritamente
    necessários poderão ser permitidos por sua spec.
17. A aplicação não oferece atualização nem remoção de eventos de auditoria.
18. A função de auditoria recebe um cursor já aberto; ela não cria conexão, não
    inicia transação e não executa `commit` ou `rollback`.
19. A migration é `0003`, forward-only e não altera migrations aplicadas.
20. A tabela começa vazia; seeds não criam histórico fictício.
21. Depois que o backend estiver verde, o modal de criação e edição de vacina é
    atualizado sem nova dependência visual e sem alterar o contrato HTTP.
22. O modal segue a direção de credencial clínica editorial da spec `003`, com
    hierarquia clara, labels associados, foco visível, estados de salvamento e
    erro no próprio diálogo e layout responsivo.
23. Ao abrir, o foco entra no diálogo; `Escape`, cancelar e fechar encerram o
    modal; ao encerrar, o foco retorna ao controle que o abriu.

## Catálogo de ações

Esta entrega implementa somente:

| Ação | Recurso | Momento do evento |
|---|---|---|
| `vaccine.created` | `vaccine` | depois do `INSERT` e antes do commit |
| `vaccine.updated` | `vaccine` | depois do `UPDATE` e antes do commit |
| `vaccine.deleted` | `vaccine` | depois do `DELETE` e antes do commit |

Os próximos steps deverão manter o padrão `{resource}.{past_action}` e incorporar
seus eventos à spec antes da implementação. São consumidores já conhecidos, mas
não implementados aqui: alterações de marcadores, ciclo de documentos, geração e
revogação de compartilhamentos, acesso público por compartilhamento e acesso
médico ao prontuário.

## Cenários de aceitação

### Cenário: auditar criação de vacina

Dado um paciente adulto autenticado
Quando cadastra uma vacina válida
Então a vacina e um evento `vaccine.created` são persistidos no mesmo commit
E o evento identifica usuário, paciente e vacina
E contém somente o snapshot posterior permitido.

### Cenário: auditar atualização com antes e depois

Dado um paciente adulto autenticado com uma vacina própria
Quando altera seus dados
Então a vacina é bloqueada e lida antes da atualização
E um evento `vaccine.updated` registra os valores anteriores e posteriores
E ambos são confirmados em uma única transação.

### Cenário: auditar remoção preservando o estado anterior

Dado um paciente adulto autenticado com uma vacina própria
Quando remove a vacina
Então um evento `vaccine.deleted` preserva o último snapshot permitido
E o snapshot posterior é nulo
E exclusão e evento são confirmados juntos.

### Cenário: reverter mutação quando a auditoria falha

Dado que a mutação clínica seria válida
E o banco rejeita a inserção do evento
Quando o endpoint executa a operação
Então a transação é revertida
E a vacina permanece no estado anterior
E a API retorna `503` sem expor detalhes do banco.

### Cenário: não criar evento para operação recusada

Dado uma sessão ausente, papel incorreto, paciente menor, payload inválido,
vacina inexistente ou vacina de outro paciente
Quando uma mutação é recusada
Então nenhum evento de sucesso é gravado
E o contrato de erro definido no Step 4 é preservado.

### Cenário: sanitizar snapshots

Dado um dado de recurso que também contenha senha, token, CPF, e-mail ou conteúdo
documental
Quando o snapshot de auditoria é construído
Então somente os campos explicitamente permitidos pelo recurso são serializados
E o evento não contém os campos sensíveis.

### Cenário: registrar o instante no banco

Dado uma mutação clínica válida
Quando o evento é inserido
Então `occurred_at` é preenchido pelo banco em UTC
E nenhum timestamp fornecido pelo cliente participa da inserção.

### Cenário: usar o formulário de vacina no padrão visual vigente

Dado um paciente adulto na seção de vacinas
Quando abre o formulário para adicionar ou editar uma vacina
Então vê um diálogo responsivo alinhado à direção visual atual
E os campos, ações, foco, salvamento e erro possuem estados claros e acessíveis
E ao fechar o diálogo o foco retorna ao controle que o abriu.

## Contratos afetados

### API

Não há endpoint novo. Permanecem os contratos do Step 4:

```text
POST   /me/vaccines
PUT    /me/vaccines/{vaccine_id}
DELETE /me/vaccines/{vaccine_id}
```

- Respostas de sucesso permanecem inalteradas.
- Falha da mutação ou da auditoria por indisponibilidade do banco retorna `503`
  com `{"detail": "Banco de dados indisponível."}`.
- Erros anteriores à mutação preservam os status e mensagens existentes.
- Não existe `GET /audit` nem exposição de snapshots ao frontend.

### Frontend

- O contrato HTTP consumido pelo frontend permanece inalterado.
- O modal de adicionar e editar vacina é atualizado dentro do fluxo existente;
  não se cria uma nova página nem um design system.
- Os estados funcionais existentes são preservados: criar, editar, cancelar,
  salvar, exibir erro e atualizar a listagem.
- A implementação deve funcionar por teclado, respeitar foco e manter leitura
  adequada em viewport móvel.

### Dados

A migration `0003_clinical_audit.py` cria `clinical_audit_events`:

| Coluna | Tipo | Regra |
|---|---|---|
| `audit_event_id` | `BIGINT` | chave primária auto incremental |
| `actor_type` | `ENUM('user', 'public_share', 'system')` | origem controlada do evento |
| `actor_user_id` | `BIGINT NULL` | FK para `users`; obrigatório quando `actor_type = 'user'` |
| `patient_id` | `BIGINT` | FK obrigatória para `patients` |
| `action` | `VARCHAR(64)` | ação do catálogo da aplicação |
| `resource_type` | `VARCHAR(32)` | tipo singular do recurso |
| `resource_id` | `BIGINT` | ID interno do recurso afetado |
| `before_snapshot` | `JSON NULL` | estado permitido antes da operação |
| `after_snapshot` | `JSON NULL` | estado permitido depois da operação |
| `occurred_at` | `DATETIME(6)` | UTC, preenchido pelo banco |

Regras estruturais:

- `actor_user_id` e `patient_id` usam `ON DELETE RESTRICT` para não apagar a
  autoria junto com identidades clínicas.
- Uma constraint exige `actor_user_id` para `actor_type = 'user'` e exige valor
  nulo para atores sem conta.
- `resource_id` não possui FK porque referencia tabelas diferentes conforme
  `resource_type`; a aplicação resolve o recurso autorizado antes do evento.
- Índices suportam busca futura por `(patient_id, occurred_at)`,
  `(actor_user_id, occurred_at)` e `(resource_type, resource_id)`.
- O `INSERT` usa `UTC_TIMESTAMP(6)` diretamente no SQL, sem receber o instante
  como parâmetro; nenhuma coluna possui `ON UPDATE`.
- A migration é forward-only e `downgrade()` falha explicitamente.

`public_share` e `system` existem apenas para que acessos públicos e tarefas
internas dos steps já planejados possam ter autoria honesta, sem atribuí-los
indevidamente ao paciente. Nenhum evento desses tipos é produzido neste step.

## Segurança e autorização

- Auditoria complementa autorização; não concede acesso nem substitui os filtros
  de ownership.
- O ator atual vem de `get_current_user`; o paciente vem de
  `get_current_patient`/`require_adult`.
- O ID da vacina é aceito apenas na rota e combinado com `patient_id` na leitura
  bloqueante e na mutação.
- O gravador de eventos não recebe conexão própria, evitando commit separado.
- Snapshots usam allowlist por recurso e não incluem CPF, CRM, e-mail, nome do
  paciente, senha, token de sessão, chave de armazenamento, arquivo ou conteúdo
  documental.
- Erros e logs operacionais não imprimem snapshots ou dados clínicos integrais.
- Não há endpoint de leitura da tabela nesta entrega.

## Casos de erro e limites

| Caso | Resultado | Auditoria |
|---|---|---|
| sessão ausente ou inválida | `401` | nenhum evento |
| papel sem permissão ou menor de idade | `403` | nenhum evento |
| vacina ausente ou alheia | `404` | nenhum evento |
| perfil inconsistente | `409` | nenhum evento |
| ID ou payload inválido | `422` | nenhum evento |
| falha de banco na mutação | `503` | rollback, nenhum evento |
| falha de banco na auditoria | `503` | rollback da mutação e do evento |

- Um request produz no máximo um evento para a única mutação clínica realizada.
- Snapshots de vacina respeitam os limites já definidos pelo schema HTTP e pelas
  colunas existentes.
- Não são registrados eventos de tentativa ou falha nesta entrega; um catálogo
  futuro para segurança operacional exige spec própria.

## Estratégia de testes

### Primeiro ciclo RED

Adicionar o teste estrutural da revisão `0003`, esperando a nova migration
forward-only e a tabela de auditoria. O teste deve falhar inicialmente porque a
revisão ainda não existe.

### Ciclos seguintes

1. Migration cria colunas, constraints, FKs e índices no MySQL real.
2. Criação de vacina grava `vaccine.created` antes do único commit.
3. Falha do insert de auditoria causa rollback; teste de integração confirma que
   nenhuma vacina ou evento parcial permanece.
4. Atualização lê o registro próprio com bloqueio e grava snapshots anterior e
   posterior.
5. Remoção grava apenas o snapshot anterior.
6. Casos `401`, `403`, `404`, `409` e `422` não chamam o gravador.
7. Serialização permite somente os campos de vacina previstos e usa data ISO.
8. Teste inspeciona SQL e parâmetros para provar IDs derivados e ausência de
   timestamp fornecido pelo cliente.
9. Suíte de caracterização confirma que contratos HTTP e frontend não mudaram.
10. Teste React entra em RED para foco, fechamento e retorno de foco do diálogo;
    GREEN preserva criação, edição, erro e loading.
11. Playwright cobre o fluxo de criação no diálogo atualizado e a viewport móvel.

### Regressão

- Suíte completa de `backend/__tests__/`.
- Testes de migration e atomicidade com MySQL 8 real.
- Depois do backend verde, revisão registrada do impacto no fluxo de vacinas e
  nos componentes que consomem os endpoints alterados.
- A auditoria não cria uma UI própria, mas a revisão já identificou o modal de
  vacina como padrão legado no fluxo tocado; executar testes React, Playwright e
  build após seu alinhamento visual.
- `git diff --check` e `git status`.

## Evidência TDD

| Ciclo | Teste RED | Implementação GREEN | Refactor | Referência |
|---|---|---|---|---|
| migration `0003` | revisão ausente e depois tabela ausente no schema atualizado | migration forward-only, constraints, FKs e índices | nomes e verificações estruturais consolidados | `test_migrations.py`, `test_migrations_integration.py` |
| criação atômica | criação executava somente o `INSERT` da vacina | evento `vaccine.created` incluído antes do commit | escrita centralizada em `record_clinical_event` | `test_clinical_audit.py` |
| atualização e snapshots | update não lia o estado anterior nem gravava evento | leitura com `FOR UPDATE` e snapshots anterior/posterior | leitura própria extraída para `_lock_owned_vaccine` | `test_clinical_audit.py` |
| remoção e rollback | delete não preservava snapshot e falha de auditoria não era exercitada | remoção e evento na mesma transação, com rollback em falha | indisponibilidade de banco normalizada pelo endpoint | `test_clinical_audit.py`, `test_migrations_integration.py` |
| sanitização e regressão | serialização ainda não possuía allowlist comprovada | `VaccineBase` limita e normaliza o snapshot | serializador explícito reutilizado nas três ações | `test_clinical_audit.py`, `test_api_characterization.py`, `test_resource_contracts.py` |
| diálogo de vacina | foco permanecia no acionador ao abrir | diálogo acessível, responsivo e com retorno de foco | modal isolado em componente e primitives do Radix reutilizadas | `authenticated-home.test.jsx`, `login.spec.ts` |

### Verificações executadas

- Backend completo no MySQL 8 real: `75 passed`.
- Integração de migrations e atomicidade no MySQL 8 real: `4 passed`.
- Frontend unitário: `13 passed`.
- Playwright: `12 passed`.
- Build Next.js com Webpack: concluído com sucesso.
- `git diff --check`: concluído sem erros.
- `npm run lint`: não executado porque o binário `eslint` não está instalado no
  projeto; nenhuma dependência foi adicionada fora do escopo desta spec.

## Critérios de conclusão

- [x] Spec aprovada antes do primeiro teste RED.
- [x] Migration `0003` aplicada e validada no MySQL 8 real.
- [x] Eventos identificam ator, paciente, ação, recurso e instante.
- [x] Criação, atualização e remoção de vacina são auditadas.
- [x] Mutação e auditoria são atômicas em sucesso e falha.
- [x] Snapshots seguem allowlist e representam corretamente antes/depois.
- [x] Nenhum segredo, identificador pessoal desnecessário ou conteúdo documental
      aparece na auditoria.
- [x] Operações recusadas não produzem eventos de sucesso.
- [x] Nenhum endpoint ou UI de auditoria foi criado.
- [x] Revisão de impacto no frontend registrada após o backend ficar verde.
- [x] Modal de vacina alinhado à direção visual vigente, responsivo e acessível.
- [x] Fluxos de criação, edição, cancelamento, erro e loading permanecem testados.
- [x] Suítes afetadas e regressão passam.
- [x] Evidência RED, GREEN e REFACTOR registrada.
- [x] Roadmap e referências dos commits atualizados.

## Decisões propostas para revisão

1. Auditar nesta entrega apenas mutações de vacina já existentes; listagens do
   próprio paciente não são consideradas acesso privilegiado.
2. Auditar futuramente download de documento, acesso médico e acesso público por
   compartilhamento nas respectivas specs, usando esta mesma tabela.
3. Usar tabela e colunas em inglês conforme D005, apesar do nome histórico
   `auditoria` no resumo do roadmap.
4. Manter ações e tipos de recurso como strings controladas pela aplicação para
   não exigir migration a cada feature clínica.
5. Permitir atores `public_share` e `system` no schema, mas não produzir esses
   eventos até existir consumidor concreto.
6. Usar snapshots completos dos campos permitidos para vacina, em vez de diffs,
   para manter reconstrução e teste simples.
7. Não criar uma API de consulta antes de haver um caso de uso e uma matriz de
   autorização específicos.
8. Manter autorização e auditoria separadas: permissões vêm das políticas do
   backend e eventos nunca concedem acesso.
9. Atualizar o modal de vacina nesta entrega por ser o fluxo de frontend tocado,
   sem ampliar o trabalho para um redesign do dashboard.

## Decisões e observações

- Documento iniciado em 2026-10-06 e implementado na branch
  `feat/clinical-audit`.
- Regra transversal de revisão do impacto no frontend alinhada com o usuário em
  2026-10-06 e incorporada ao roadmap.
- Spec aprovada pelo usuário em 2026-10-06.
- A implementação seguiu os ciclos RED, GREEN e REFACTOR documentados acima.
- A revisão posterior ao backend identificou impacto no fluxo de mutação de
  vacinas. O modal legado foi atualizado na mesma entrega, sem alterar o contrato
  HTTP nem ampliar o redesign para outras superfícies.
- Implementação do backend e banco: commit `850e2ad`.
- Alinhamento do modal e testes do frontend: commit `fe56d2a`.
