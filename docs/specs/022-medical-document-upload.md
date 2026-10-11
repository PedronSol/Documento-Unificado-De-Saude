# Envio de Documentos pelo Médico Responsável

## Status

SPEC APPROVED

## Dependências

- Step 11 e spec `020-secure-document-storage.md`, implementados.
- Spec `030-medical-panel.md` (autorização médica por grupo) e spec `036`
  (vínculo direto e prontuário de menor), implementadas.
- Spec `037-frontend-organization.md` (prontuário em
  `/medical/patients/[patientId]` e componentes de documentos por feature).
- Complemento do Step 11 do roadmap.

## Contexto e problema

A spec `020` entregou documentos com leitura médica, mas a regra 25 proíbe o
médico de enviar ou remover documentos: `POST` e `DELETE` médicos retornam
`403`. Na prática, o médico que acompanha o paciente produz laudos, receitas e
resultados que deveriam entrar no prontuário sem depender de o paciente fazer o
upload.

Esta entrega permite que o médico com acesso autorizado envie documentos ao
prontuário do paciente e remova somente os documentos que ele mesmo enviou. O
armazenamento, as validações de arquivo, a auditoria e o sigilo contra a role
`admin` continuam os da spec `020`.

## Objetivos

- Permitir ao médico verificado com acesso autorizado ao paciente enviar PDF,
  JPEG ou PNG, por arquivo ou digitalização de uma página, ao prontuário.
- Registrar no servidor quem enviou cada documento.
- Permitir ao médico remover somente documentos ativos enviados por ele.
- Mostrar ao paciente e ao médico quando um documento foi enviado por um médico.
- Auditar envio e remoção médicos com o médico como ator.

## Não objetivos

- Permitir ao médico remover documentos enviados pelo paciente, pelo
  responsável ou por outro médico.
- Editar título, tipo ou arquivo depois do envio.
- Notificar o paciente por e-mail ou push sobre o novo documento.
- Permitir upload ou acesso pela role `admin`.
- OCR, extração ou biomarcadores (Step 12).
- Alterar o limite de 10 MiB, os formatos aceitos ou o armazenamento.
- Assinatura digital ou certificação do documento médico.

## Regras de negócio e técnicas

1. Esta spec substitui a regra 25 da spec `020` e as linhas correspondentes de
   sua matriz. As demais regras da `020` continuam válidas para os dois atores.
2. `POST /medical/patients/{patient_id}/documents` exige médico verificado e
   autoriza o paciente com o mesmo verificador das demais rotas `/medical`
   (grupo ativo ou vínculo direto ativo aceito). Vínculo pendente, recusado,
   revogado, expirado ou inexistente retorna o `403` uniforme da spec `030`.
3. O envio médico usa o mesmo `multipart/form-data` (`title`, `type`, `file`),
   as mesmas validações de extensão, MIME, assinatura, integridade, tamanho e
   título, a mesma chave aleatória e a mesma publicação atômica da spec `020`.
   `patient_id` vem do caminho já autorizado; ator e autoria vêm da sessão.
4. O médico pode enviar documentos a paciente menor e a paciente provisório,
   alinhado à regra 15 da spec `036` para marcadores. Não há
   `X-Acting-Patient` em rotas médicas.
5. `documents` ganha `uploaded_by_user_id`, FK para `users`, e
   `uploader_role` (`patient` ou `doctor`), ambos preenchidos pelo servidor em
   todo novo envio: `patient` pelas rotas `/me` (paciente ou responsável) e
   `doctor` pela rota médica. O cliente nunca informa autoria. O papel é
   necessário porque uma mesma conta pode ser paciente e médica, ou responsável
   e médica; somente envios pela rota médica contam como envio de médico.
6. `DELETE /medical/patients/{patient_id}/documents/{document_id}` autoriza o
   paciente, bloqueia o documento ativo daquele paciente com `FOR UPDATE` e só
   remove se `uploaded_by_user_id` for o usuário do médico autenticado.
   - Documento ausente, removido ou de outro paciente: `404`
     `Documento não encontrado.`
   - Documento ativo do paciente que não tenha `uploader_role = 'doctor'` e
     `uploaded_by_user_id` do médico autenticado: `403`
     `Você só pode remover documentos enviados por você.` O documento já é
     visível ao médico autorizado, então o `403` não revela informação nova.
7. A remoção médica segue as regras 17 e 18 da `020`: estado `removed`,
   `removed_at`, `document.removed` na mesma transação e limpeza física após o
   commit.
8. O paciente adulto e o responsável continuam podendo remover qualquer
   documento ativo do próprio prontuário, inclusive os enviados por médico. A
   API não muda; a proteção contra remoção indevida fica na confirmação:
   - Toda remoção de documento, pelo paciente, responsável ou médico, exige o
     diálogo de confirmação acessível já existente, com foco inicial em
     `Cancelar` e nenhuma requisição antes da confirmação.
   - Quando o documento foi enviado por médico e quem remove é o paciente ou o
     responsável, o diálogo usa o título `Remover documento enviado por
     médico`, informa o nome e o CRM do médico, explica que o documento deixará
     de ficar disponível para o paciente e para as equipes que acompanham o
     prontuário e que a ação é registrada e não pode ser desfeita, e exige
     marcar `Entendo que este documento foi enviado por {nome}` antes de
     habilitar `Remover documento`.
   - Na remoção pelo médico, o diálogo informa que o documento sairá do
     prontuário do paciente.
   - Fechar ou cancelar o diálogo desmarca a confirmação.
9. As listagens do paciente e do médico passam a informar
   `uploaded_by_doctor`: `null` quando `uploader_role` não é `doctor`, ou
   `{ display_name, crm_number, crm_state }` do médico que enviou. Nunca expõem
   `uploaded_by_user_id`, e-mail, CPF ou outro dado do usuário.
10. A listagem médica informa ainda `can_remove`, calculado pelo servidor como
    `uploader_role = 'doctor'` e `uploaded_by_user_id` do médico autenticado.
    A interface usa esse campo
    apenas para exibir o controle; o `DELETE` repete a verificação.
11. Auditoria: `document.uploaded` e `document.removed` com
    `actor_user_id` do médico e `patient_id` do paciente, mesma allowlist de
    snapshot da `020`. Autoria e dados do médico não entram no snapshot.
12. Admin continua recebendo `403` em todas as rotas `/medical` e `/me`.
13. Migration forward-only `0015`: adiciona `uploaded_by_user_id` nulo (FK
    `RESTRICT` para `users`) e `uploader_role` `ENUM('patient','doctor')` não
    nulo com padrão `patient`, pois todos os envios anteriores foram feitos por
    rotas `/me`. Preenche `uploaded_by_user_id` com o `actor_user_id` do evento
    `document.uploaded` correspondente. Registros legados sem evento (os
    `removed` convertidos pela `0013`) permanecem nulos. Uma check constraint
    exige `uploaded_by_user_id` em todo documento que não esteja `removed`; o
    teste em MySQL real prova o backfill. O código informa `uploader_role`
    explicitamente em todo INSERT; o padrão existe apenas para o backfill.

## Matriz de autorização (alterações)

| Operação | Papel | Ownership | Falhas relevantes |
|---|---|---|---|
| `POST /medical/patients/{patient_id}/documents` | médico verificado | acesso autorizado ao paciente | `401`, `403`, `413`, `422`, `503` |
| `DELETE /medical/patients/{patient_id}/documents/{document_id}` | médico verificado | acesso autorizado e documento ativo enviado por ele | `401`, `403`, `404`, `503` |

As demais linhas da matriz da spec `020` não mudam.

## Cenários de aceitação

### Cenário: médico envia documento ao paciente acompanhado

Dado um médico verificado com vínculo ativo ao paciente 42
Quando ele envia `laudo.pdf` com título `Laudo do ecocardiograma` e tipo `report`
Então recebe `201` com o documento no estado `uploaded`
E `uploaded_by_doctor` traz seu nome e CRM
E `document.uploaded` é auditado com o médico como ator.

### Cenário: médico sem vínculo não envia

Dado um médico sem acesso autorizado ao paciente 77
Quando envia um documento a ele
Então recebe `403` e nenhum arquivo ou registro é criado.

### Cenário: arquivo inválido pelo médico

Dado um médico autorizado
Quando envia um PNG disfarçado de PDF ou um arquivo acima de 10 MB
Então recebe `422` ou `413` como na spec `020`, sem estado parcial.

### Cenário: médico remove documento que enviou

Dado um documento ativo enviado pelo médico ao paciente 42
Quando o mesmo médico o remove
Então recebe `204`, o documento sai das listagens e `document.removed` é
auditado com o médico como ator.

### Cenário: médico não remove documento de outra pessoa

Dado um documento ativo do paciente 42 enviado pelo próprio paciente ou por
outro médico
Quando o médico autenticado tenta removê-lo
Então recebe `403` `Você só pode remover documentos enviados por você.`
E o documento continua ativo.

### Cenário: paciente vê quem enviou

Dado um documento enviado pela Dra. Ana Lima ao paciente
Quando o paciente lista seus documentos
Então o item indica `Enviado por Dra. Ana Lima · CRM 123456/SP`.

### Cenário: envio ao paciente menor

Dado um médico autorizado a acompanhar um paciente menor
Quando envia um documento
Então o documento entra no prontuário do menor com o médico como autor.

### Cenário: operar no prontuário médico

Dado o prontuário em `/medical/patients/42`
Quando o médico abre `Adicionar documento`
Então vê o mesmo diálogo do paciente, com arquivo ou digitalização
E após o envio o documento aparece na lista com a opção de remover
E documentos enviados por outras pessoas não exibem a opção de remover.

## Contratos afetados

### API

```text
POST   /medical/patients/{patient_id}/documents
DELETE /medical/patients/{patient_id}/documents/{document_id}
```

`DocumentSummary` (paciente e médico) ganha:

```json
"uploaded_by_doctor": {
  "display_name": "Dra. Ana Lima",
  "crm_number": "123456",
  "crm_state": "SP"
}
```

ou `null`. A listagem médica e a resposta do `POST` médico usam
`MedicalDocumentSummary`, que acrescenta `can_remove: bool`. Os schemas Pydantic
são reutilizados nos testes de contrato.

### Erros

| Situação | Status | `detail` |
|---|---:|---|
| médico sem acesso ao paciente | `403` | `Paciente não autorizado.` |
| documento ativo enviado por outra pessoa | `403` | `Você só pode remover documentos enviados por você.` |
| documento ausente, removido ou de outro paciente | `404` | `Documento não encontrado.` |
| arquivo grande, inválido ou campos inválidos | `413`/`422` | como na spec `020` |
| banco, auditoria ou armazenamento indisponível | `503` | `Documento temporariamente indisponível.` |

### Dados

Migration `0015_document_uploader.py`, forward-only, conforme a regra 13.

### Frontend

- O prontuário médico mostra `Adicionar documento` e reutiliza
  `DocumentUploadDialog` com o caminho médico; o digitalizador segue as regras
  28 a 33 da spec `020`.
- `DigitalDocuments` recebe o modo de remoção por item: no paciente adulto,
  todos os itens; no médico, somente os com `can_remove`.
- Itens enviados por médico exibem `Enviado por {nome} · CRM {número}/{UF}`,
  com quebra de texto em 320 px.
- Mensagens de erro usam `readApiError` (spec `037`).
- `ConfirmDialog` ganha a prop opcional `acknowledgement` (rótulo de checkbox
  obrigatório); sem ela, o comportamento atual é preservado em todos os
  consumidores.

## Segurança e autorização

- Autoria derivada da sessão; nenhum campo de autoria é aceito do cliente.
- A verificação de quem enviou é feita no banco, com o documento bloqueado,
  e não no `can_remove` do cliente.
- O médico não obtém por esta entrega nenhum dado novo do paciente além da
  própria lista de documentos que já podia ler.
- Dados do médico expostos ao paciente limitam-se a nome e CRM, já exibidos nas
  equipes de cuidado.
- Admin permanece sem acesso a metadados, binários e auditoria de documentos.

## Estratégia de testes

### Primeiro ciclo RED

Teste de migração `0015` provando a coluna e o backfill a partir do evento
`document.uploaded`.

### Ciclos seguintes

1. `POST` médico autorizado retorna `201`, grava autoria e audita o médico.
2. `POST` médico sem vínculo, com vínculo pendente ou role admin retorna `403`
   sem arquivo publicado.
3. Validações de arquivo e limite repetidas no endpoint médico.
4. Paciente menor e provisório aceitam envio médico.
5. `DELETE` médico do próprio documento: `204`, auditoria, limpeza.
6. `DELETE` de documento do paciente ou de outro médico: `403` sem alteração.
7. `DELETE` de documento ausente, removido ou de outro paciente: `404`.
8. Listagens com `uploaded_by_doctor` e `can_remove` corretos.
9. Rollback quando a auditoria falha no envio e na remoção médicos.
10. `ConfirmDialog` com `acknowledgement`: confirmação desabilitada até marcar,
    reiniciada ao fechar; consumidores existentes sem mudança.
11. Frontend: envio pelo prontuário, remoção somente com `can_remove`,
    indicação do médico autor, confirmação reforçada do paciente para documento
    médico; Playwright em 320 px e 1280 px.

## Evidência TDD

| Ciclo | Teste RED | Implementação GREEN | Refactor | Referência |
|---|---|---|---|---|
| 1 | — | — | — | — |

## Critérios de conclusão

- [x] Spec revisada e aprovada.
- [ ] Médico autorizado envia documentos; sem acesso recebe `403`.
- [ ] Médico remove somente documentos que enviou.
- [ ] Paciente remove documento médico somente após confirmação marcada.
- [ ] Autoria persistida, auditada e exibida apenas como nome e CRM.
- [ ] Migration `0015` testada em banco limpo e com backfill no MySQL 8.
- [ ] Prontuário médico permite enviar e remover conforme `can_remove` em
      320 px e viewport ampla.
- [ ] Testes backend, Vitest, Playwright e build aprovados.
- [ ] Spec `020`, roadmap e índice de specs atualizados.

## Decisões

| # | Decisão | Status |
|---|---|---|
| 1 | Paciente e responsável podem remover documento enviado por médico, com diálogo explícito e confirmação marcada obrigatória | APROVADA |
| 2 | `403` explicativo ao médico que tenta remover documento de outra pessoa | APROVADA |
| 3 | Envio médico permitido a paciente menor e provisório | APROVADA |
