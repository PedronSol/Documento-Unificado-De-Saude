# Contratos e Autorização por Recurso

## Status

IMPLEMENTED

## Dependências

- Step 3 concluído no [PR #3](https://github.com/PedronSol/Documento-Unificado-De-Saude/pull/3).
- Decisões D002, D005 e D008 de `000-foundation-decisions.md`.
- Contrato transitório e regras de identidade definidos em
  `003-unified-identity-roles-frontend.md`.

## Contexto e problema

`POST /login` e `GET /me` ainda retornam um envelope de dashboard com identidade,
perfil de paciente, vacinas, alertas e documentos. Isso acopla autenticação a
consultas clínicas, faz recursos sem relação com o login falharem juntos e mantém
campos legados em português no contrato HTTP.

As rotas de vacina já derivam o paciente da sessão e filtram mutações por
`patient_id`, mas a política ainda não está descrita como uma matriz aplicável aos
recursos futuros. O roadmap também reserva acesso médico, embora os grupos e
vínculos necessários para concedê-lo só sejam criados no Step 7.

Esta entrega substitui o envelope transitório por contratos pequenos, mantém cada
recurso em seu endpoint e formaliza autorização e respostas de erro sem antecipar
as features clínicas futuras.

## Objetivos

- Fazer o login retornar apenas a identidade autenticada e criar a sessão.
- Fazer `/me` retornar apenas identidade e perfil, sem coleções clínicas.
- Carregar vacinas, alertas e metadados de documentos por endpoints próprios.
- Normalizar em inglês os nomes dos campos novos da API, mantendo texto visível e
  mensagens em português do Brasil.
- Centralizar a resolução do paciente autenticado para rotas `/me/*`.
- Definir uma matriz de autorização para rotas atuais e namespaces futuros.
- Padronizar o significado de `401`, `403`, `404`, `409` e `422`.
- Cobrir IDs manipulados sem revelar se um recurso pertence a outra pessoa.
- Atualizar o frontend para consumir os recursos separadamente.

## Não objetivos

- Criar marcadores, upload, download, OCR, compartilhamento ou auditoria.
- Criar grupos de atendimento ou conceder acesso de médico a um paciente; isso
  pertence ao Step 7.
- Criar rotas vazias, stubs de autorização ou interfaces sem consumidor apenas
  para antecipar o Step 7.
- Alterar o schema, criar migration ou renomear colunas legadas no banco.
- Alterar o algoritmo de senha, o cookie ou a duração da sessão.
- Criar um envelope genérico de sucesso ou substituir o formato padrão de erros
  de validação do FastAPI.
- Reorganizar toda a estrutura de páginas e componentes do frontend; isso
  permanece no Step 13.

## Convenções de contrato

1. Novos schemas e campos HTTP usam inglês; o banco legado pode ser projetado com
   aliases SQL ou serialização explícita, sem migration nesta entrega.
2. Mensagens apresentadas à pessoa usuária permanecem em português do Brasil.
3. Rotas do próprio paciente ficam sob `/me/{resource}` e nunca recebem
   `patient_id`, CPF ou e-mail do cliente.
4. Rotas profissionais que receberem `patient_id` ficarão sob
   `/medical/patients/{patient_id}/...`.
5. Marcadores permanecem reservados em `/me/markers` para o Step 6.
6. Documentos permanecem em `/me/documents`; neste step existe apenas a listagem
   dos metadados legados. Os demais métodos pertencem aos Steps 11 e 12.
7. Alertas legados permanecem somente leitura em `/me/alerts`; eles não são
   convertidos em marcadores e não ganham operações de escrita.

## Regras de negócio e técnicas

1. Login válido cria a sessão e retorna somente `user`; não consulta vacinas,
   alertas ou documentos.
2. A validação de consistência entre `role` e perfil continua ocorrendo antes de
   criar a sessão. Uma `role` `patient` sem `Patient` ou `doctor` sem `Doctor`
   retorna `409`.
3. `/me` retorna `user` e `patient_profile`. A segunda propriedade é preenchida
   somente quando a identidade possui `role` `patient`; não contém coleções.
4. `doctor`, `admin` e identidades sem contexto liberado recebem
   `patient_profile: null` em `/me` e não causam consultas a tabelas clínicas.
5. Toda rota `/me/vaccines`, `/me/alerts` ou `/me/documents` exige sessão válida,
   `role` `patient` e um perfil `Patient` consistente.
6. O backend deriva `patient_id` exclusivamente da sessão. Parâmetros ou payloads
   adicionais com identidade do paciente não fazem parte dos schemas aceitos.
7. Listagens filtram pelo `patient_id` derivado e retornam uma lista vazia quando
   o próprio paciente não possui registros.
8. Atualização e remoção de vacina filtram simultaneamente `vaccine_id` e o
   `patient_id` derivado.
9. Vacina inexistente e vacina de outro paciente produzem a mesma resposta `404`.
10. Somente paciente adulto pode criar, atualizar ou remover vacinas. A listagem
    permanece disponível para pacientes menores de idade.
11. Uma identidade combinada usa `/me/*` exclusivamente no contexto do próprio
    perfil de paciente; possuir também `doctor` não amplia esse escopo.
12. Nenhuma rota clínica é registrada sob `/medical` neste step. Quando o Step 7
    introduzir a primeira rota, todas deverão compartilhar uma única verificação
    de `role` profissional, perfil verificado e vínculo ativo com o paciente.
13. Até existir esse vínculo, não há caminho HTTP para um médico informar um
    `patient_id` e obter dados clínicos.
14. CPF, CRM, hash de senha, token bruto e chaves internas de armazenamento não
    aparecem nos contratos desta entrega.
15. Falhas de um recurso no frontend não são representadas como lista vazia; cada
    seção diferencia carregamento, vazio e erro recuperável.

## Matriz de autorização

| Operação | Sessão | Papel/contexto | Escopo adicional | Resultado sem permissão |
|---|---|---|---|---|
| `POST /login` | não | público | credenciais válidas e conta ativa | `401` ou `403` |
| `POST /logout` | opcional | qualquer | remove a sessão apresentada, se existir | `204` idempotente |
| `GET /me` | sim | qualquer identidade ativa | perfil coerente com as roles concedidas | `401` ou `409` |
| `GET /me/vaccines` | sim | `patient` | próprio `patient_id` derivado | `403` |
| `POST /me/vaccines` | sim | `patient` adulto | próprio `patient_id` derivado | `403` |
| `PUT /me/vaccines/{vaccine_id}` | sim | `patient` adulto | vacina própria | `403` ou `404` |
| `DELETE /me/vaccines/{vaccine_id}` | sim | `patient` adulto | vacina própria | `403` ou `404` |
| `GET /me/alerts` | sim | `patient` | próprio `patient_id` derivado | `403` |
| `GET /me/documents` | sim | `patient` | próprio `patient_id` derivado | `403` |
| `/me/markers...` futuro | sim | `patient` | próprio `patient_id` derivado | não registrado neste step |
| `/medical/patients/{patient_id}...` futuro | sim | `doctor` verificado | vínculo ativo definido no Step 7 | não registrado neste step |

`admin` não recebe acesso clínico implícito. Uma operação administrativa futura
deve possuir spec e rota próprias.

## Cenários de aceitação

### Cenário: login não carrega dashboard

Dado um paciente ativo com credenciais válidas
Quando envia `POST /login`
Então recebe `200`, cookie de sessão e somente sua identidade autenticada
E nenhuma consulta é feita a vacinas, alertas ou documentos.

### Cenário: consultar o próprio perfil

Dado um paciente autenticado
Quando solicita `GET /me`
Então recebe identidade e perfil sanitizado
E a resposta não contém vacinas, alertas, documentos ou código de
compartilhamento.

### Cenário: consultar identidade sem perfil de paciente

Dado um médico ou administrador autenticado sem `role` `patient`
Quando solicita `GET /me`
Então recebe sua identidade com `patient_profile` igual a `null`
E nenhuma tabela clínica é consultada.

### Cenário: carregar recursos independentemente

Dado um paciente autenticado com perfil, vacinas, alertas e documentos
Quando a home termina de consultar `/me`
Então consulta as três coleções em seus endpoints próprios
E renderiza cada seção conforme sua resposta, sem depender de um envelope de
dashboard.

### Cenário: isolar falha de uma coleção

Dado que o perfil e as vacinas foram carregados
E a listagem de documentos falha
Quando a home renderiza
Então perfil e vacinas permanecem disponíveis
E a seção de documentos mostra erro recuperável em vez de fingir que está vazia.

### Cenário: bloquear papel incorreto antes da consulta clínica

Dado um médico sem `role` `patient`
Quando solicita `GET /me/vaccines`, `/me/alerts` ou `/me/documents`
Então recebe `403`
E nenhuma consulta de perfil ou recurso clínico é executada.

### Cenário: ocultar ownership de vacina

Dado um paciente adulto autenticado
Quando altera o `vaccine_id` da URL para uma vacina de outro paciente
Então recebe a mesma resposta `404` de uma vacina inexistente
E nenhum registro é alterado.

### Cenário: rejeitar identificador inválido

Dado um paciente autenticado
Quando usa um `vaccine_id` que não é inteiro
Então recebe `422` pela validação da rota
E nenhuma mutação é executada.

### Cenário: reservar acesso profissional com bloqueio padrão

Dado um médico autenticado
Quando tenta acessar um caminho clínico sob `/medical`
Então nenhuma rota clínica está disponível neste step
E não existe fallback para rotas `/me/*` com um `patient_id` informado pelo
cliente.

## Contratos afetados

### Identidade

`UserIdentity` permanece:

```json
{
  "user_id": 42,
  "display_name": "Dra. Helena Costa",
  "email": "helena.costa@example.com",
  "roles": ["patient", "doctor"]
}
```

### Login

`POST /login` retorna `200` com:

```json
{
  "user": {
    "user_id": 42,
    "display_name": "Dra. Helena Costa",
    "email": "helena.costa@example.com",
    "roles": ["patient", "doctor"]
  }
}
```

O endpoint preserva o cookie `dus_session` e deixa de retornar `message`,
`patient_data`, `vaccines`, `alerts` e `documents`.

### Perfil atual

`GET /me` retorna `200` com:

```json
{
  "user": {
    "user_id": 42,
    "display_name": "Dra. Helena Costa",
    "email": "helena.costa@example.com",
    "roles": ["patient", "doctor"]
  },
  "patient_profile": {
    "preferred_name": "Helena",
    "full_name": "Helena Costa",
    "avatar_url": null,
    "health_status": "updated",
    "blood_type": "A-",
    "is_adult": true,
    "age": 38
  }
}
```

`patient_profile` é `null` sem a `role` `patient`. `patient_id`, CPF,
`birth_date`, `created_at` e o legado `valor_qr` não são retornados.

### Recursos do próprio paciente

| Método | Rota | Entrada | Sucesso |
|---|---|---|---|
| `GET` | `/me/vaccines` | cookie | `200`, `Vaccine[]` |
| `POST` | `/me/vaccines` | cookie, `VaccineCreateUpdate` | `201`, mensagem |
| `PUT` | `/me/vaccines/{vaccine_id}` | cookie, ID e `VaccineCreateUpdate` | `200`, mensagem |
| `DELETE` | `/me/vaccines/{vaccine_id}` | cookie, ID | `200`, mensagem |
| `GET` | `/me/alerts` | cookie | `200`, `Alert[]` |
| `GET` | `/me/documents` | cookie | `200`, `DocumentSummary[]` |

`Vaccine`:

```json
{
  "vaccine_id": 7,
  "name": "Influenza",
  "dose": "Dose anual",
  "administered_on": "2026-04-15",
  "status": "applied"
}
```

`VaccineCreateUpdate` omite `vaccine_id` e aceita os demais campos.

`Alert`:

```json
{
  "alert_id": 3,
  "type": "condition",
  "title": "Hipertensão",
  "description": "Acompanhamento regular recomendado.",
  "severity": "medium"
}
```

`DocumentSummary`:

```json
{
  "document_id": 9,
  "title": "Hemograma Completo",
  "type": "exam",
  "created_on": "2026-03-01",
  "status": "new"
}
```

Os valores de enum existentes são preservados. Esta listagem de documento não
promete arquivo, conteúdo extraído ou operações de escrita.

### Dados

- Nenhuma migration.
- Tabelas e colunas atuais permanecem inalteradas.
- A normalização HTTP ocorre por aliases SQL ou serialização explícita.
- Nenhum novo armazenamento ou vínculo médico é criado.

## Padronização de erros

| Status | Significado nesta API | Exemplos |
|---|---|---|
| `401` | não há identidade autenticada válida | cookie ausente, token inválido ou expirado, credencial incorreta |
| `403` | identidade válida, mas a política nega a operação | role incorreta, paciente menor em escrita, conta inativa no login |
| `404` | recurso endereçado não existe dentro do escopo autorizado | vacina inexistente ou pertencente a outro paciente |
| `409` | estado persistido contradiz um contrato válido | role sem perfil correspondente |
| `422` | path, query ou payload não atende ao schema | ID não inteiro, enum inválido, texto vazio |

- Erros HTTP de domínio mantêm o envelope simples `{"detail": "..."}`.
- Erros `422` mantêm o formato padrão de validação do FastAPI.
- Falha de banco continua `503` com mensagem genérica e sem credenciais.
- Erro de infraestrutura não é convertido em `400`; `400` não é usado pelos
  contratos desta entrega.

Mensagens preservadas:

| Caso | Status e `detail` |
|---|---|
| credencial incorreta | `401`, `E-mail ou senha incorretos.` |
| cookie ausente | `401`, `Autenticação necessária.` |
| sessão inválida ou expirada | `401`, `Sessão inválida ou expirada.` |
| conta inativa no login | `403`, `Conta inativa.` |
| role sem permissão | `403`, `Acesso não permitido para este perfil.` |
| paciente menor em escrita | `403`, `Menores de idade não podem alterar o prontuário.` |
| vacina inexistente ou alheia | `404`, `Vacina não encontrada.` |
| role `patient` sem perfil | `409`, `Perfil de paciente inconsistente.` |
| role `doctor` sem perfil | `409`, `Perfil profissional inconsistente.` |

## Segurança e autorização

- A sessão resolve `user_id`; o perfil resolve `patient_id` no backend.
- `role` é lida do banco e não de header, query, body ou estado do frontend.
- Filtros de ownership fazem parte da mesma query que lê ou altera o recurso.
- `404` deliberadamente torna recurso alheio indistinguível de inexistente.
- Listagens próprias não aceitam filtros capazes de trocar o proprietário.
- Rotas futuras sob `/medical` deverão negar tanto paciente inexistente quanto
  paciente sem vínculo sem retornar dados que confirmem sua existência.
- O frontend esconde operações conforme contexto apenas por usabilidade; o
  backend repete todas as verificações.
- Logs não incluem tokens, CPF, conteúdo documental ou payload clínico integral.

## Estratégia de testes

### Primeiro ciclo RED

Alterar o teste de login para esperar somente `user` e provar que nenhuma query
de vacina, alerta ou documento ocorreu. O teste deve falhar contra o
`LoginResponse` atual porque o envelope ainda contém o dashboard.

### Ciclos seguintes

1. `/me` retorna apenas `user` e `patient_profile`, com campos normalizados.
2. Listagens separadas de alerta e documento falham com `404` antes de seus
   routers existirem e passam com dados filtrados pelo paciente da sessão.
3. Vacinas aceitam e retornam o contrato em inglês sem mudar o schema do banco.
4. Matriz negativa cobre sessão ausente, role incorreta, menoridade, perfil
   inconsistente, ID inválido, ID inexistente e ID de outro paciente.
5. Testes inspecionam SQL e parâmetros para provar filtro de ownership e ausência
   de consulta clínica após um bloqueio de role.
6. Testes React esperam `/me` sem coleções e chamadas independentes apenas no
   contexto `patient`, incluindo loading, vazio, erro local e `401`.
7. Playwright preserva login, troca de contexto e operações de vacina com os
   contratos novos.

### Regressão

- Suíte completa de `backend/__tests__/`.
- `npm test` e `npm run test:e2e` no frontend.
- `npm run build`.
- Tabela de rotas/OpenAPI para confirmar que nenhum endpoint clínico `/medical`
  foi registrado antecipadamente.

## Evidência TDD

| Ciclo | Teste RED | Implementação GREEN | Refactor | Referência |
|---|---|---|---|---|
| contratos mínimos | Login e `/me` ainda expunham o dashboard legado. | Respostas reduzidas a identidade e perfil sanitizado. | Serialização de perfil concentrada no módulo de pacientes. | `ec4c614` |
| recursos separados | Alertas e documentos não possuíam rotas próprias; vacinas usavam campos legados. | Routers e schemas em inglês implementados por recurso. | Queries mantidas próximas aos routers, sem nova camada prematura. | `ec4c614` |
| ownership e erros | Payload novo falhou na validação; erro de banco ainda retornava `400`; ID alheio precisava ser indistinguível. | Ownership derivado da sessão, ID alheio e ausente em `404`, infraestrutura em `503`. | Dependência de paciente autenticado reutilizada pelas três coleções. | `ec4c614` |
| frontend desacoplado | Falha de documentos removia vacinas e estados vazios não eram explícitos. | Recursos carregados independentemente, com loading, vazio, erro e retry locais. | Hook local reutilizado nas três seções, preservando o carregamento concorrente. | `96a3360` |

## Critérios de conclusão

- [x] Spec aprovada antes do primeiro teste RED.
- [x] Login não retorna nem consulta recursos clínicos.
- [x] `/me` retorna apenas identidade e perfil sanitizado.
- [x] Vacinas, alertas e documentos são carregados por endpoints próprios.
- [x] Contratos HTTP afetados usam campos em inglês.
- [x] Toda rota `/me/*` deriva ownership da sessão.
- [x] Matriz possui casos positivos e negativos automatizados.
- [x] ID alheio e inexistente são indistinguíveis nas rotas próprias.
- [x] Nenhuma rota ou abstração médica sem consumidor foi criada.
- [x] Frontend possui estados independentes por recurso.
- [x] Testes afetados, regressão e build passam.
- [x] Evidência RED, GREEN e REFACTOR registrada.
- [x] Roadmap e referência de commit ou PR atualizados.

## Decisões propostas para revisão

1. Preservar os alertas legados como recurso somente leitura em `/me/alerts`,
   sem tratá-los como marcadores.
2. Preservar a listagem de metadados legados em `/me/documents`; upload e arquivo
   continuam fora do escopo.
3. Remover `message` dos sucessos de login e `/me`; mensagens das mutações de
   vacina permanecem por serem texto de interface já consumido.
4. Normalizar apenas o contrato HTTP neste step, sem migration cosmética.
5. Definir agora a política e o namespace médico, mas implementar a verificação
   central de vínculo no Step 7, junto de sua primeira tabela e rota consumidoras.

## Decisões e observações

- Documento iniciado em 2026-10-05 na branch `develop`.
- Spec aprovada pelo usuário em 2026-10-05.
- A proposta de postergar o verificador médico executável evita uma abstração sem
  dados ou consumidor e mantém o sistema fechado por padrão.
- Implementação concluída nos commits `ec4c614` (API) e `96a3360` (frontend).
