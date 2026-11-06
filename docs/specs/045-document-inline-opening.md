# Abertura direta de documentos digitais

## Status

IMPLEMENTED — aprovada pelo usuário em 2026-11-06; implementação na branch
`feat/document-open-doctor-alerts` (commit registrado no roadmap).

## Dependências e tarefa selecionada

- Complemento do Step 11, desbloqueado: specs `020-secure-document-storage.md`
  e `022-medical-document-upload.md` (armazenamento, download e auditoria).
- Spec `041-same-origin-api-proxy.md`: arquivos lidos por `apiFetch` na mesma
  origem, com cookie HTTP-only.
- Specs `031-interface-design-system.md` e `037-frontend-organization.md`.

## Contexto e problema

Em `DigitalDocuments` (paciente, dependente e prontuário médico), a única ação
de leitura é o ícone `Baixar <título>`. Ele busca o arquivo por
`GET <basePath>/<id>/file`, cria um `<a download>` e salva o arquivo no
dispositivo. Para apenas consultar um exame ou receita, a pessoa precisa baixar
e abrir o arquivo manualmente, o que é lento em celular e deixa cópias locais
de dados clínicos sem necessidade.

## Objetivos

- Ao tocar no documento, abri-lo diretamente em uma nova aba/visualizador do
  navegador, sem salvar o arquivo.
- Manter o download explícito disponível como ação secundária.
- Reutilizar o endpoint, a autorização e a auditoria atuais.

## Não objetivos

- Criar visualizador embutido (iframe, PDF.js), miniaturas ou nova dependência.
- Alterar backend, endpoint, `Content-Disposition`, schemas, migrations ou
  ações de auditoria.
- Criar URLs assinadas, links compartilháveis ou cache de arquivos.
- Mudar upload, remoção, filtros ou paginação.

## Regras de negócio

1. Cada item da lista ganha a ação primária `Abrir <título>`: o bloco com
   título, tipo e nome do arquivo passa a ser um botão (alvo ≥ 44 px, foco
   visível). O ícone `Baixar <título>` permanece como ação secundária.
2. Ao acionar `Abrir`, o frontend abre uma aba em branco **sincronamente**
   dentro do gesto (evita bloqueio de pop-up), busca o arquivo pelo mesmo
   `GET <basePath>/<id>/file` com `apiFetch`, cria um `Blob` com o
   `Content-Type` recebido e direciona a aba para a URL `blob:` gerada.
3. A aba aberta não mantém referência ao app (`opener = null`). A URL `blob:`
   é revogada após um intervalo fixo (60 s), tempo suficiente para o
   visualizador carregar, e nunca é persistida.
4. Somente uma abertura por documento pode estar pendente: o botão fica
   desabilitado e anuncia `Abrindo documento…` enquanto aguarda.
5. `401` fecha a aba pré-aberta e aciona `onUnauthenticated`, como no download.
6. Erro HTTP, falha de rede ou de leitura fecham a aba pré-aberta e exibem a
   mensagem controlada no alerta já existente da seção:
   `Não foi possível abrir o documento.` (ou o `detail` lido por
   `readApiError` com esse fallback).
7. Se o navegador recusar abrir a aba (`window.open` retorna `null`), nenhuma
   requisição é feita e exibe-se `Permita pop-ups para abrir o documento ou use
   Baixar.`
8. A ação vale para paciente, dependente e médico (`viewer` e `basePath`
   atuais); a autorização continua inteiramente no backend.

## Cenários Given/When/Then

### Abrir documento autorizado

Dado um documento PDF ou imagem listado
Quando a pessoa toca em `Abrir <título>`
Então uma nova aba exibe o arquivo pelo visualizador do navegador
E nenhum `<a download>` é acionado
E o backend registra o acesso pela auditoria existente.

### Download explícito preservado

Dado um documento listado
Quando a pessoa usa `Baixar <título>`
Então o arquivo é salvo com o nome original, como hoje.

### Falha ao abrir

Dado que a API responde erro, `401` ou a rede falha
Quando a abertura é solicitada
Então a aba pré-aberta é fechada
E a seção anuncia a mensagem controlada (ou a sessão expira em `401`).

### Pop-up bloqueado

Dado que o navegador bloqueia novas abas
Quando a pessoa toca em `Abrir`
Então nenhuma requisição é feita e a orientação de pop-up é anunciada.

## Contratos, erros e configuração

- Sem alteração de API: `GET /me/documents/{id}/file` (paciente e contexto de
  dependente) e `GET /medical/patients/{patient_id}/documents/{id}/file`.
- Mensagens: `Não foi possível abrir o documento.` e
  `Permita pop-ups para abrir o documento ou use Baixar.`

## Segurança e autorização

- Arquivo trafega apenas pelo `apiFetch` com cookie HTTP-only; nunca em URL,
  query string, Web Storage, store global ou service worker.
- Tipos aceitos continuam restritos a PDF, JPEG e PNG validados no upload; o
  backend mantém `nosniff` e `no-store`.
- A URL `blob:` é local ao navegador, temporária e revogada.
- A auditoria permanece `document.downloaded` (abrir também transfere o
  conteúdo); nenhuma ação nova é criada.

## Interface e acessibilidade

- Componente segue em `components/documents/`; estilos em
  `styles/documents.css` com tokens `--ds-*`.
- Botão de abrir com nome acessível `Abrir <título>`, alvo de 44 px, foco
  visível, sem overflow a 320 px; ação de baixar continua alcançável por
  teclado.

## Estratégia de testes e evidência TDD

1. RED: em `tests/digital-documents.test.jsx`, esperar o botão
   `Abrir <título>` e que, ao acioná-lo, `window.open` seja chamado e a aba
   receba a URL `blob:` sem criar `<a download>`. Confirmar falha pela ausência
   do botão.
2. Ciclos RED/GREEN para `401`, erro HTTP, pop-up bloqueado e pendência.
3. Regressão do download explícito e dos testes de documentos médicos.
4. E2E em `medical-documents.spec.ts` (ou equivalente) verificando nova aba em
   320 px e 1440 px.
5. `npm test` afetado e `npm run build`.

| Ciclo | RED | GREEN | REFACTOR | Referência |
|---|---|---|---|---|
| Abertura em nova aba | Antes de produção, `vitest run tests/digital-documents.test.jsx --maxWorkers=1`: 6 falhas e 14 sucessos; botão `Abrir Hemograma` ausente | `openDocument` abre a aba no gesto, busca pelo mesmo endpoint, aponta para URL `blob:` revogada em 60 s e trata `401`, erro, rede e pop-up bloqueado; 20 sucessos | Sem extração: download e abertura têm efeitos distintos (âncora × aba) e a duplicação é de poucas linhas; estilos com tokens `--ds-*` | Branch `feat/document-open-doctor-alerts` |

## Critérios de aceite e conclusão

- [x] Spec revisada antes de implementar.
- [x] Tocar no documento abre em nova aba sem baixar.
- [x] Download explícito preservado.
- [x] Erros, `401` e pop-up bloqueado tratados.
- [x] 320 px e viewport ampla verificados.
- [x] Evidência TDD, roadmap e commit registrados.

## Verificações da entrega

- `vitest run --maxWorkers=2`: 367 testes unitários aprovados (35 arquivos).
- `npm run build` aprovado; `PLAYWRIGHT_BASE_URL=http://localhost:3001 npx
  playwright test`: 61 E2E aprovados no build de produção, incluindo
  `paciente abre documento em nova aba sem baixar` em 320 px e 1280 px (alvo
  ≥ 44 px, sem overflow, aba em `blob:` exibindo o arquivo e nenhum evento de
  download).
- O E2E usa um documento PNG: o Chromium headless não possui visualizador de
  PDF e converte PDFs em download. A abertura de PDF depende do visualizador do
  navegador; não foi verificada manualmente em Chrome/Safari com interface.
- Backend inalterado; suíte backend completa aprovada (ver spec `046`).
