# Paginação e Busca de Listagens no Servidor

## Status

IMPLEMENTED — [PR #13](https://github.com/PedronSol/Documento-Unificado-De-Saude/pull/13)

## Dependências

- Spec `007-administrative-access-governance.md`: contrato de páginas do admin,
  implementado e evoluído aqui.
- Specs `010`, `020`, `022`, `030`, `036`, `037` e `040`, implementadas.
- Complemento transversal do Step 13 (frontend) e dos contratos do Step 4.

## Contexto e problema

Somente as listagens administrativas são paginadas no servidor. As demais
devolvem todos os registros em uma única resposta: vacinas, alertas,
documentos, marcadores, equipes de cuidado, guardas, carteira de pacientes do
médico e solicitações de vínculo. Com o histórico crescendo, resposta, tempo de
renderização e volume de dados clínicos trafegados crescem sem limite, e
qualquer filtro feito no cliente exige baixar tudo antes.

O resumo público por QR-Code mostra todos os marcadores em quatro cartões
lado a lado; em telas pequenas a leitura de uma categoria exige rolar por
todas as outras.

## Objetivos

- Paginar no servidor toda listagem de lista crescente, com 20 itens por
  padrão e tamanho escolhido entre 10, 20, 50 e 100.
- Aplicar busca textual e filtros no SQL, antes do corte da página.
- Informar o total de itens que satisfazem a busca e os filtros.
- Oferecer rolagem infinita acessível, com o mesmo componente em todas as
  listas, e campo de busca com filtros.
- Organizar o resumo público em abas por categoria, mostrando tudo.

## Não objetivos

- Paginar o prontuário médico (`GET /medical/patients/{id}`), que continua
  embutindo vacinas e marcadores completos (decisão 2).
- Paginar o resumo público por QR-Code (decisão 3); ele ganha abas, não
  páginas.
- Paginar dependentes (`/me` e `GET /me/dependents`): o volume esperado é de no
  máximo cerca de 10 por responsável (decisão 4). Nenhum limite novo de
  dependentes é imposto por esta spec.
- Paginação por cursor, ordenação escolhida pelo usuário ou busca de texto
  completo (full-text index).
- Cache de páginas no cliente ou em service worker.

## Regras de negócio e técnicas

### Contrato

1. Toda listagem paginada aceita na query string:
   - `page`: inteiro ≥ 1, padrão `1`;
   - `page_size`: um de `10`, `20`, `50` ou `100`, padrão `20`;
   - `query`: texto opcional de busca, de 2 a 100 caracteres após trim;
   - filtros específicos do endpoint (tabela abaixo).

   E responde:

   ```json
   { "items": [ ... ], "page": 1, "page_size": 20, "total": 45, "has_next": true }
   ```

2. `page_size` fora do conjunto, `page` < 1, valores não inteiros, `query`
   com 1 caractere ou acima de 100, e filtro com valor desconhecido retornam
   `422`. Não há como pedir mais de 100 itens por requisição.
3. `total` é o número de itens que satisfazem autorização, busca e filtros,
   calculado por `COUNT(*)` com as mesmas condições da consulta da página.
   `has_next` é `page * page_size < total`.
4. A página usa `LIMIT page_size OFFSET (page - 1) * page_size` no SQL.
   Nenhuma rota busca tudo para cortar ou filtrar em Python.
5. Página além do fim responde `200` com `items: []`, o `total` real e
   `has_next: false`.
6. Toda listagem mantém a ordenação atual da feature e termina com o ID do
   recurso como desempate, garantindo páginas estáveis.

### Busca e filtros no servidor

7. `query` é comparada sem diferenciar maiúsculas e minúsculas (collation
   atual) com `LIKE`, contendo o termo em qualquer posição. `%`, `_` e `\` do
   termo são escapados; o termo é sempre parâmetro SQL, nunca interpolado.
8. Campos pesquisados e filtros por endpoint:

   | Endpoint | `query` pesquisa em | Filtros |
   |---|---|---|
   | `GET /me/vaccines` | nome e dose | `status` (`applied`, `pending`, `overdue`) |
   | `GET /me/alerts` | título e descrição | `severity` (`low`, `medium`, `high`) |
   | `GET /me/documents` | título e nome original | `type` (`exam`, `prescription`, `report`, `other`) |
   | `GET /me/markers` | nome e descrição | `status` (`active`, `removed`, padrão `active`), `type` |
   | `GET /me/care-invitations` | nome do grupo | — |
   | `GET /me/care-groups` | nome do grupo | — |
   | `GET /me/care-requests` | nome do médico | — |
   | `GET /me/care-doctors` | nome do médico | — |
   | `GET /me/guardianships` | nome do dependente | `status` (`pending`) |
   | `GET /me/guardians` | nome do responsável | — |
   | `GET /medical/patients` | nome ou CPF completo (regra atual) | — |
   | `GET /medical/patient-links` | nome do paciente | `status` (`pending`) |
   | `GET /medical/patients/{id}/documents` | título e nome original | `type` |
   | `GET /admin/*` paginados | busca atual | filtros atuais |

   CPF continua aceito somente como busca exata da carteira médica e nunca
   aparece nos resultados.
9. Filtros ausentes não restringem. Combinar busca e filtros aplica todas as
   condições (E lógico).

### Autorização e auditoria

10. Ownership, role, vínculo, guarda e `X-Acting-Patient` são verificados antes
    da contagem e da página, como hoje. Paginação, busca e filtros nunca mudam
    quais registros o ator pode ver.
11. Listagens que hoje auditam leitura (`medical_documents.viewed`) auditam
    cada página requisitada; a busca e os filtros não entram no evento, para
    não registrar termos clínicos digitados. Listagens rotineiras continuam
    sem auditoria (spec `005`).

### Backend compartilhado

12. O módulo `backend/pagination.py` concentra `PAGE_SIZES = (10, 20, 50, 100)`,
    `DEFAULT_PAGE_SIZE = 20`, a dependência FastAPI de `page`/`page_size`/
    `query`, o escape de `LIKE`, o cálculo de `LIMIT/OFFSET` e a montagem da
    resposta. O schema genérico `Page[T]` substitui os modelos de página
    duplicados do admin, que passa a usar o mesmo módulo e o mesmo conjunto de
    tamanhos e a informar `page_size` e `total`.

### Frontend

13. O hook `usePaginatedResource(path, { fallback, params, abortStale })` estende o
    contrato de `useApiResource` com `items`, `total`, `hasNext`, `loadMore()`,
    `isLoadingMore`, `loadMoreError` e `reload()`. Mudar `params` (busca,
    filtro ou tamanho) reinicia na página 1 e descarta respostas de
    requisições anteriores; com `abortStale` (carteira médica, spec `030`) a
    requisição superada também é cancelada. `replaceItem` permite a
    atualização pontual de um item já carregado no admin.
14. **Rolagem infinita.** Um sentinela ao fim de cada lista, observado por
    `IntersectionObserver`, chama `loadMore()` quando entra no viewport e há
    `hasNext`. Nunca há duas cargas simultâneas da mesma lista.
15. **Acessibilidade da rolagem infinita.** Abaixo do sentinela, o botão
    `Carregar mais` permanece disponível enquanto houver próxima página, para
    teclado, leitores de tela, zoom e navegadores sem `IntersectionObserver`.
    Uma região `aria-live="polite"` anuncia `{carregados} de {total}` após cada
    carga, somente em listas com mais de uma página (há próxima página ou já
    se carregou além da primeira), para não gerar ruído em listas curtas. O
    foco nunca é movido automaticamente pela rolagem.
16. Falha ao carregar mais mantém os itens exibidos, interrompe a carga
    automática e mostra o erro com `Tentar novamente` junto ao botão.
17. **Barra de busca e filtros.** Cada lista paginada tem campo de busca
    (debounce de 300 ms, mínimo de 2 caracteres, botão de limpar), os filtros
    do endpoint como `ClinicalSelect` e o seletor `Itens por página`
    (`10`, `20`, `50`, `100`; padrão `20`). O contador mostra `{total}
    resultados`. Estado vazio distingue "nenhum item cadastrado" de "nenhum
    resultado para a busca", com ação para limpar filtros.
17a. Para não poluir listas curtas (por exemplo as quatro sublistas de equipes
    de cuidado), a barra de busca, filtros e tamanho aparece quando o total da
    lista sem filtros passa de 10 itens ou quando há busca ou filtro ativo. O
    rodapé de rolagem aparece sempre que houver itens.
17b. Listas do admin cujo endpoint não aceita busca exibem apenas o seletor de
    tamanho e o contador; o diretório mantém sua busca atual (mínimo de 3
    caracteres) e ganha rolagem infinita.
18. Busca, filtros e tamanho valem enquanto a tela estiver aberta e não são
    persistidos no navegador nem na URL.
19. Criar, editar ou remover item recarrega a lista a partir da página 1,
    preservando busca, filtros e tamanho.
20. O prontuário médico mantém a timeline completa de vacinas e marcadores; a
    lista de documentos do prontuário é paginada como as demais.

### Resumo público por QR-Code

21. O resumo público continua completo e sem paginação. As quatro categorias
    (`Alergias`, `Medicações ativas`, `Condições`, `Diagnósticos`) passam a
    abas acessíveis (Radix Tabs: setas do teclado, `tab`/`tabpanel`), cada uma
    mostrando todos os seus itens.
22. Cada aba exibe a quantidade no rótulo, por exemplo `Alergias (2)`, para que
    nenhuma categoria fique oculta sem aviso. A aba inicial é `Alergias`. As
    abas quebram em linhas em qualquer largura, sem rolagem horizontal que
    esconda categorias em 320 px.
23. A API do resumo público não muda.

## Cenários de aceitação

### Cenário: primeira página com total

Dado um paciente com 45 vacinas
Quando o frontend pede `GET /me/vaccines`
Então recebe 20 itens, `page: 1`, `page_size: 20`, `total: 45` e
`has_next: true`.

### Cenário: rolagem infinita

Dado a primeira página exibida
Quando o paciente rola até o fim da lista
Então o frontend pede `page=2`, acrescenta os próximos itens sem repetição
E anuncia `40 de 45 vacinas carregadas`.

### Cenário: carregar mais pelo teclado

Dado um usuário de teclado no fim da lista
Quando ativa `Carregar mais`
Então a próxima página é acrescentada e o foco permanece no botão.

### Cenário: tamanho de página

Quando o paciente escolhe `50` em `Itens por página`
Então o frontend pede `page=1&page_size=50`
E `page_size=15` ou `page_size=200` na API retornam `422`.

### Cenário: busca no servidor

Dado vacinas `Hepatite B` e `Febre amarela`
Quando o paciente digita `hepa`
Então o frontend pede `GET /me/vaccines?query=hepa&page=1`
E recebe somente `Hepatite B` com `total: 1`.

### Cenário: filtro combinado

Quando o paciente filtra documentos por `Laudo` e busca `eco`
Então a API aplica `type=report` e `query=eco` no SQL.

### Cenário: busca sem resultado

Quando a busca não encontra itens
Então a lista mostra `Nenhum resultado para "termo".` com `Limpar busca`.

### Cenário: falha ao carregar mais

Dado 20 documentos exibidos
Quando a página 2 falha com `503`
Então os 20 documentos permanecem
E aparecem o erro e `Tentar novamente`.

### Cenário: mutação reinicia a lista

Dado a página 2 de vacinas carregada com busca `hepa`
Quando o paciente registra uma vacina
Então a lista recarrega a página 1 mantendo a busca.

### Cenário: autorização preservada

Dado um médico sem vínculo
Quando pede `GET /medical/patients/77/documents?page=2`
Então recebe `403` sem consulta nem contagem de documentos.

### Cenário: resumo público em abas

Dado um resumo com 2 alergias e 3 medicações
Quando o profissional abre o link
Então vê as abas `Alergias (2)`, `Medicações ativas (3)`, `Condições (0)` e
`Diagnósticos (0)`, com `Alergias` selecionada
E cada aba mostra todos os itens da categoria.

## Contratos afetados

- As listagens da tabela da regra 8 trocam `T[]` por
  `{ items, page, page_size, total, has_next }`. Mudança incompatível,
  entregue com o frontend na mesma PR.
- O admin acrescenta `page_size` e `total` e restringe `page_size` ao conjunto
  `10/20/50/100` (hoje aceita 1 a 20).
- Prontuário médico, `/me`, `GET /me/dependents` e resumo público não mudam.

## Segurança e autorização

- Nenhuma rota aceita `page_size` acima de 100, limitando a extração em massa
  por requisição.
- `page`, `page_size`, `query` e filtros são validados pelo FastAPI e usados
  somente como parâmetros SQL; o termo de busca é escapado para `LIKE`.
- Autorização sempre antes da contagem e da página.
- Termos de busca não são registrados em auditoria nem em logs.

## Casos de erro e limites

| Situação | Resposta |
|---|---|
| `page` < 1 ou não inteiro | `422` |
| `page_size` fora de `10`, `20`, `50`, `100` | `422` |
| `query` com 1 caractere ou acima de 100 | `422` |
| filtro com valor desconhecido | `422` |
| página além do fim | `200` com `items: []` |
| falha de banco | `503`, como hoje |

## Estratégia de testes

### Primeiro ciclo RED

Teste unitário de `pagination.py`: tamanhos aceitos e rejeitados, `LIMIT/OFFSET`
das páginas 1 e 3, `has_next` a partir do total e escape de `%`, `_` e `\`.

### Ciclos seguintes

1. Admin migrado para o módulo comum, com `page_size` e `total`.
2. Um ciclo por grupo de endpoints (registros clínicos do paciente; cuidado e
   guarda; médico): contrato, contagem, `LIMIT/OFFSET`, desempate, busca,
   filtros, `422` e página além do fim.
3. Integração MySQL: 45 registros percorridos em páginas sem repetição, busca
   com caracteres curinga e contagem coerente com o filtro.
4. Frontend: `usePaginatedResource` (página inicial, `loadMore`, carga única
   simultânea, erro sem perder itens, reinício por parâmetro e mutação).
5. Componente de lista paginada: sentinela, botão de fallback, anúncio
   `aria-live`, busca com debounce, filtros, tamanho e estados vazios.
6. Resumo público em abas com contagens e navegação por teclado.
7. Regressão das suítes existentes e Playwright em 320 px e 1280 px com mais
   de 20 itens, busca e rolagem.

## Evidência TDD

| Ciclo | Teste RED | Implementação GREEN | Refactor | Referência |
|---|---|---|---|---|
| 1 | `test_pagination.py`: `pagination` inexistente | módulo com tamanhos, dependência, escape de `LIKE` e montagem de página | — | backend |
| 2 | `fetch_page`/`search_clause` inexistentes (3 falhas) | contagem e página com as mesmas condições | página além do total não executa a consulta | backend |
| 3 | `test_list_pagination.py`: 14 falhas (rotas sem `page`) | 13 listagens com busca, filtros e desempate por ID | serviços de cuidado, guarda e médico divididos em colunas/origem/ordem | backend |
| 4 | admin sem `total`/`page_size` e diretório agrupado (6 falhas) | admin no módulo comum; diretório conta por tabela derivada | `page_params` para rotas com busca própria | backend |
| 5 | `use-paginated-resource.test.jsx`: hook inexistente; depois `abortStale` e `replaceItem` | hook com página inicial, `loadMore` único, reinício por parâmetro | cancelamento opcional e patch local | frontend |
| 6 | `paginated-list*.test.jsx` e `use-paginated-list.test.jsx`: componentes inexistentes | `ListToolbar`, `InfiniteListFooter`, `ListEmptyState`, `PaginatedList`, `usePaginatedList` | barra só em listas longas ou filtradas; anúncio só multipágina | frontend |
| 7 | testes de área, documentos, prontuário, cuidado, guarda, carteira, vínculos e admin exigindo URLs paginadas | adoção em cada feature; mutações recarregam a página 1 | helpers `stripPaging`/`installPagedApiMock`/`fulfillPaged` nos testes | frontend |
| 8 | `public-health-share.test.jsx`: abas inexistentes | resumo em Radix Tabs com contagem | abas quebram em linhas em 320 px | frontend |
| 9 | `design-system.test.js`: `lists.css` inexistente | estilos tokenizados mobile-first | — | frontend |

## Verificações executadas

- Backend: `RUN_DB_INTEGRATION=1 python -m pytest` no MySQL 8 real (316
  passed), incluindo a integração que percorre 45 vacinas reais em 20+20+5
  sem repetição e busca `50%` literalmente.
- Frontend: `npm test` (287 passed), `npx playwright test` (47 passed, com
  `tests/pagination.spec.ts` em 320 px e 1280 px: rolagem infinita, botão de
  fallback, busca e tamanho no servidor) e `npm run build`. A suíte E2E foi
  executada três vezes seguidas sem falhas após tornar os mocks fiéis ao
  servidor (a lista recarrega após mutações).
- Conferência visual em 320 px da barra de busca e das abas do resumo.
- Não executado: `npm run lint` (`eslint` não instalado, situação anterior).

## Critérios de conclusão

- [x] Spec revisada e aprovada.
- [x] Listagens paginadas no servidor com 20 itens por padrão e somente
      10/20/50/100 por página.
- [x] Busca e filtros aplicados no SQL antes do corte, com total coerente.
- [x] Rolagem infinita acessível com botão de fallback e anúncio de progresso.
- [x] Resumo público em abas com contagem, mostrando tudo.
- [x] Prontuário médico e dependentes inalterados.
- [x] Testes backend (inclusive MySQL real), Vitest, Playwright e build
      aprovados.
- [x] Specs afetadas, roadmap e índice atualizados.

## Decisões

| # | Decisão | Status |
|---|---|---|
| 1 | Rolagem infinita com busca e filtros no servidor; botão `Carregar mais` mantido como fallback acessível | APROVADA |
| 2 | Prontuário médico mantém vacinas e marcadores embutidos e completos | APROVADA |
| 3 | Resumo público em abas por categoria, sem paginação | APROVADA |
| 4 | Dependentes sem paginação (volume esperado de até cerca de 10) | APROVADA |
| 5 | Resposta informa `total` | APROVADA |
| 6 | Tamanhos de página 10, 20, 50 e 100, padrão 20 | APROVADA |
