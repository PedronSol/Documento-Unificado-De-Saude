# AGENTS.md

## Objetivo

Evolua o Documento Unificado de Saúde de forma incremental. Prefira soluções simples, legíveis e fáceis de testar. Não introduza camadas, serviços ou dependências sem uma necessidade concreta.

## Estrutura

- `backend/`: API FastAPI, regras de autorização e testes Python.
- `frontend/`: aplicação Next.js e testes Playwright.
- `db/`: criação do schema e dados locais de demonstração.

Pastas na raiz devem usar nomes minúsculos. Código gerado, caches e resultados de build não devem ser versionados.

## Comandos principais

- Frontend local: `make front-dev`
- Backend local: `make back-dev`
- Frontend e backend locais: `make both`
- Build das imagens: `make build`
- Aplicação completa: `docker compose up --build`
- Testes do backend: `python -m pytest` dentro de `backend/`
- Desenvolvimento do frontend: `npm run dev` dentro de `frontend/`
- Testes do frontend: `npm test` dentro de `frontend/`
- Build do frontend: `npm run build` dentro de `frontend/`

Use npm como gerenciador de pacotes do frontend e mantenha somente `package-lock.json`.

## Regras de implementação

- Aplique autenticação e autorização no backend; esconder controles na interface não é autorização.
- Nunca armazene senhas em texto puro nem exponha dados de outro paciente por identificadores fornecidos pelo cliente.
- Configure URLs, credenciais e opções de ambiente por variáveis de ambiente.
- Reutilize os schemas Pydantic usados pela API nos testes.
- Adicione testes pequenos para regras de segurança e para o comportamento alterado.
- Preserve o contrato atual quando isso não comprometer segurança ou clareza.
- Não faça refatorações não relacionadas à tarefa atual.

## Antes de concluir

- Execute os testes afetados e o build relevante.
- Confira `git diff --check` e `git status`.
- Documente qualquer verificação que não pôde ser executada.
