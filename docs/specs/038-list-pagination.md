# Paginação de Listagens no Servidor

## Status

SPEC REVIEW

## Dependências

- Spec `007-administrative-access-governance.md`: contrato de páginas do admin,
  implementado e reaproveitado aqui.
- Specs `010`, `020`, `022`, `030`, `036` e `037`, implementadas.
- Complemento transversal do Step 13 (frontend) e dos contratos do Step 4.

## Contexto e problema

Somente as listagens administrativas são paginadas no servidor
(`page`, `page_size ≤ 20`, resposta `{items, page, has_next}`). As demais
listagens devolvem todos os registros em uma única resposta: vacinas, alertas,
documentos, marcadores, equipes de cuidado, guardas, dependentes, carteira de
pacientes do médico, solicitações de vínculo e documentos do prontuário. Com
o crescimento do histórico, a resposta, o tempo de renderização e o volume de
dados clínicos trafegados crescem sem limite, e qualquer filtro feito no
cliente exige baixar tudo antes.

## Objetivos

- Toda listagem da API é paginada no servidor, com 20 itens por padrão e
  tamanho escolhido entre 10, 20, 50 e 100.
- O backend define um contrato único de paginação, e o frontend pede a página
  e os filtros na própria requisição; filtro, ordenação e corte acontecem no
  SQL.
- Ordenação estável, para que páginas consecutivas não repitam nem pulem itens.
- Frontend com um único padrão de paginação reutilizado por todas as listas.

## Não objetivos

- Paginação por cursor, contagem total ou número total de páginas.
- Novos filtros além dos já existentes (`status` de marcadores, guardas e
  vínculos; busca `query` de pacientes), salvo os listados nesta spec.
- Mudar o contrato do admin, que já atende a regra.
- Paginar o resumo público compartilhado por QR-Code (decisão 3).
- Paginar `dependents` dentro de `/me`, usado pelo seletor de contexto
  (decisão 4).
- Cache de páginas no cliente ou em service worker.

## Regras de negócio e técnicas

1. **Contrato único.** Toda listagem aceita `page` (inteiro ≥ 1, padrão 1) e
   `page_size` (um de `10`, `20`, `50` ou `100`; padrão `20`) como query string
   e responde:

   ```json
   { "items": [ ... ], "page": 1, "has_next": true }
   ```

   É o mesmo formato do admin. Qualquer `page_size` fora do conjunto
   permitido (por exemplo `15`, `200`, zero, negativo ou não inteiro) retorna
   `422`; não há como pedir mais de 100 itens.
2. **Corte no banco.** A consulta usa `LIMIT page_size + 1 OFFSET
   (page - 1) * page_size`; o item extra só define `has_next` e nunca é
   devolvido. Nenhuma rota busca tudo para cortar em Python.
3. **Ordenação estável.** Toda listagem ordena pela regra atual da feature e
   termina com o ID do recurso como desempate. Ordenações atuais preservadas:
   documentos por `created_at DESC, id DESC`; marcadores ativos por tipo e
   nome, removidos por `removed_at DESC`; demais conforme o endpoint, sempre
   com desempate por ID.
4. **Filtros na requisição.** Filtros existentes continuam como query string
   e são aplicados no SQL antes da paginação: `status` de marcadores
   (`active`/`removed`), guardas e vínculos; `query` da busca de pacientes. A
   página volta a 1 sempre que o filtro muda no frontend.
5. **Página além do fim.** Retorna `200` com `items: []` e `has_next: false`.
6. **Autorização inalterada.** Ownership, role, vínculo, guarda e
   `X-Acting-Patient` são verificados antes da consulta paginada, como hoje.
   A paginação nunca muda quais registros o ator pode ver.
7. **Auditoria.** Listagens que hoje auditam leitura
   (`medical_documents.viewed`) auditam cada página requisitada, com os mesmos
   campos; listagens rotineiras continuam sem auditoria (spec `005`).
8. **Módulo compartilhado.** Um módulo `pagination.py` no backend concentra a
   dependência de query (`page`, `page_size`), as constantes
   `PAGE_SIZES = (10, 20, 50, 100)` e `DEFAULT_PAGE_SIZE = 20`,
   o cálculo de `LIMIT/OFFSET` e o `page_slice`; o admin passa a importá-lo e
   adota o mesmo conjunto de tamanhos (hoje aceita qualquer valor de 1 a 20;
   `10` e `20` continuam válidos). Um schema genérico `Page[T]` substitui os
   modelos de página duplicados.
9. **Prontuário médico.** `GET /medical/patients/{id}` deixa de embutir
   vacinas e marcadores (decisão 2). O prontuário carrega cada lista por rotas
   paginadas próprias, autorizadas pelo mesmo verificador médico:
   `GET /medical/patients/{id}/vaccines` e
   `GET /medical/patients/{id}/markers?status=active|removed`. O evento
   `medical_record.viewed` continua na rota do prontuário; as novas listas
   registram `medical_vaccines.viewed` e `medical_markers.viewed` por página,
   como os documentos.
10. **Frontend.** Um hook `usePaginatedResource(path, { fallback, params })`
    estende o contrato de `useApiResource` com `items`, `hasNext`,
    `loadMore()`, `isLoadingMore` e `reload()`. `loadMore` pede a próxima
    página e acrescenta os itens; mudança de `params` reinicia na página 1.
    Uma falha ao carregar mais mantém os itens já exibidos e mostra o erro
    junto ao botão.
11. **Tamanho escolhido pelo usuário.** Cada lista oferece o seletor
    `Itens por página` com `10`, `20`, `50` e `100` (`ClinicalSelect`, padrão
    `20`). Trocar o tamanho reinicia a lista na página 1 com o novo
    `page_size`. A escolha vale para a lista enquanto a tela estiver aberta e
    não é persistida no navegador. O seletor só aparece quando a lista tem mais
    de 10 itens ou há próxima página, para não poluir listas curtas.
12. **Interface.** Toda lista paginada exibe, quando `has_next`, o botão
    `Carregar mais` (alvo de 44 px, foco visível, estado `Carregando…`), sem
    rolagem infinita automática (decisão 1). Ao concluir, o foco permanece no
    botão ou, se acabou a lista, vai para o último item carregado.
13. **Mutações.** Criar, editar ou remover item recarrega a lista a partir da
    página 1, preservando o filtro, para manter a ordenação do servidor como
    fonte de verdade.

## Endpoints afetados

| Endpoint | Filtros na requisição | Ordenação (com desempate por ID) |
|---|---|---|
| `GET /me/vaccines` | — | atual |
| `GET /me/alerts` | — | atual |
| `GET /me/documents` | — | `created_at DESC` |
| `GET /me/markers` | `status` | tipo e nome / `removed_at DESC` |
| `GET /me/care-invitations` | — | atual |
| `GET /me/care-groups` | — | atual |
| `GET /me/care-requests` | — | atual |
| `GET /me/care-doctors` | — | atual |
| `GET /me/dependents` | — | nome preferido |
| `GET /me/guardianships` | `status` | atual |
| `GET /me/guardians` | — | atual |
| `GET /medical/patients` | `query` | atual |
| `GET /medical/patient-links` | `status` | atual |
| `GET /medical/patients/{id}/documents` | — | `created_at DESC` |
| `GET /medical/patients/{id}/vaccines` (nova) | — | igual a `/me/vaccines` |
| `GET /medical/patients/{id}/markers` (nova leitura) | `status` | igual a `/me/markers` |
| `GET /admin/*` paginados | inalterados | inalterados |

`GET /medical/patients/{id}` passa a responder somente `{ patient }`.

## Cenários de aceitação

### Cenário: primeira página limitada a 20

Dado um paciente com 45 vacinas
Quando o frontend pede `GET /me/vaccines`
Então recebe 20 itens, `page: 1` e `has_next: true`.

### Cenário: carregar mais

Dado a primeira página exibida
Quando o paciente aciona `Carregar mais`
Então o frontend pede `page=2`, acrescenta os próximos 20 itens sem repetir
nenhum e mantém o botão enquanto `has_next` for verdadeiro.

### Cenário: última página

Dado a terceira página com 5 itens
Quando ela é carregada
Então o botão `Carregar mais` some.

### Cenário: tamanho de página fora do conjunto

Quando o cliente pede `page_size=15` ou `page_size=200`
Então recebe `422`.

### Cenário: escolher 50 itens por página

Dado 20 vacinas exibidas de um total de 70
Quando o paciente escolhe `50` em `Itens por página`
Então o frontend pede `page=1&page_size=50`
E exibe 50 vacinas com `Carregar mais` para as 20 restantes.

### Cenário: filtro na requisição

Dado o histórico de marcadores removidos
Quando o paciente troca a visão para `Histórico`
Então o frontend pede `GET /me/markers?status=removed&page=1`
E nenhum marcador ativo é baixado para filtrar no cliente.

### Cenário: busca médica paginada

Dado um médico com 60 pacientes autorizados
Quando pesquisa `Silva`
Então recebe somente a primeira página dos resultados que casam com a busca,
filtrados no SQL.

### Cenário: falha ao carregar mais

Dado 20 documentos exibidos
Quando a página 2 falha com `503`
Então os 20 documentos permanecem
E aparece erro com `Tentar novamente` junto ao botão.

### Cenário: mutação reinicia a lista

Dado a página 2 de vacinas carregada
Quando o paciente registra uma vacina
Então a lista é recarregada a partir da página 1.

### Cenário: autorização preservada

Dado um médico sem vínculo
Quando pede `GET /medical/patients/77/vaccines?page=2`
Então recebe `403` sem consulta às vacinas.

## Contratos afetados

- Todas as listagens acima trocam `T[]` por `{ items: T[], page, has_next }`.
  Mudança incompatível, entregue junto com o frontend na mesma PR.
- `GET /medical/patients/{id}` remove `vaccines` e `markers` do corpo.
- Novas rotas de leitura médica: vacinas e marcadores do paciente.
- `GET /me` mantém `dependents` embutido (decisão 4).
- Resumo público por QR-Code inalterado (decisão 3).

## Segurança e autorização

- Nenhuma rota aceita `page_size` acima de 100; isso limita também a extração
  em massa de dados clínicos por requisição.
- `page` e `page_size` são validados pelo FastAPI e usados como parâmetros SQL,
  nunca interpolados.
- A autorização é sempre anterior à consulta paginada.

## Casos de erro e limites

| Situação | Resposta |
|---|---|
| `page` < 1 ou não inteiro | `422` |
| `page_size` fora de `10`, `20`, `50`, `100` | `422` |
| página além do fim | `200` com `items: []`, `has_next: false` |
| filtro inválido (`status`) | `422`, como hoje |
| falha de banco | `503`, como hoje |

## Estratégia de testes

### Primeiro ciclo RED

Teste unitário do módulo `pagination`: `LIMIT/OFFSET` de páginas 1 e 3,
`page_slice` com 21 linhas (20 itens, `has_next`), aceitação de 10/20/50/100
e rejeição de qualquer outro `page_size`.

### Ciclos seguintes

1. Admin importa o módulo comum com a suíte atual verde (refactor).
2. Um ciclo por grupo de endpoints (paciente, cuidado/guarda, médico): contrato
   `{items, page, has_next}`, `LIMIT/OFFSET` parametrizados, desempate por ID,
   filtro antes do corte, `422` e página além do fim.
3. Rotas médicas novas de vacinas e marcadores: autorização, auditoria por
   página e remoção dos campos do prontuário.
4. Integração MySQL: 45 registros reais percorridos em três páginas sem
   repetição nem lacuna.
5. Frontend: `usePaginatedResource` (primeira página, `loadMore`, erro sem
   perder itens, reinício por filtro e por mutação).
6. Cada lista com `Carregar mais`, filtro na requisição e regressão dos testes
   existentes; Playwright em 320 px e 1280 px com mais de 20 itens.

## Evidência TDD

| Ciclo | Teste RED | Implementação GREEN | Refactor | Referência |
|---|---|---|---|---|
| 1 | — | — | — | — |

## Critérios de conclusão

- [ ] Spec revisada e aprovada.
- [ ] Listagens devolvem 20 itens por padrão e aceitam somente 10, 20, 50 ou
      100 por página.
- [ ] Filtros e paginação aplicados no SQL, com ordenação estável.
- [ ] Frontend usa um único hook e o mesmo controle `Carregar mais`.
- [ ] Prontuário médico carrega vacinas e marcadores paginados.
- [ ] Testes backend (inclusive MySQL real), Vitest, Playwright e build
      aprovados.
- [ ] Specs afetadas, roadmap e índice atualizados.

## Decisões para revisão

1. **Padrão de interface:** botão `Carregar mais`, que acrescenta itens, com o
   seletor de tamanho definindo quantos chegam por vez (recomendado; igual ao
   admin, natural no celular e acessível). Alternativa: páginas numeradas com
   anterior/próxima, que combinam com o seletor de tamanho no desktop, mas
   ocupam mais espaço em 320 px.
2. **Prontuário médico:** separar vacinas e marcadores em rotas paginadas
   (recomendado; cumpre "todas as listagens"). Alternativa: manter embutidos no
   prontuário, sem paginação.
3. **Resumo público por QR-Code:** manter completo (recomendado). É um resumo
   para atendimento e ocultar alergias ou medicações em uma segunda página é um
   risco clínico. Alternativa: paginar também.
4. **Dependentes em `/me`:** manter embutidos para o seletor de contexto e a
   navegação, e paginar apenas `GET /me/dependents` na tela de lista
   (recomendado). Alternativa: remover de `/me` e paginar também o seletor.
5. **Sem contagem total:** a resposta não informa o total de itens nem de
   páginas (recomendado; consulta mais barata e igual ao admin). Alternativa:
   incluir `total`.
