# AGENTS.md

## Objetivo

Evolua o Documento Unificado de Saúde de forma incremental. Prefira soluções simples, legíveis e fáceis de testar. Não introduza camadas, serviços ou dependências sem uma necessidade concreta.

O roadmap arquitetural e sua árvore de dependências estão em `docs/architecture-evolution-plan.md`. Atualize o status e a referência do commit ou PR nesse documento ao concluir cada entrega planejada.

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
- Backend e banco via Docker: `make local-up`
- Aplicação completa: `docker compose up --build`
- Testes do backend: `python -m pytest` dentro de `backend/`
- Desenvolvimento do frontend: `npm run dev` dentro de `frontend/`
- Testes do frontend: `npm test` dentro de `frontend/`
- Build do frontend: `npm run build` dentro de `frontend/`

Use npm como gerenciador de pacotes do frontend e mantenha somente `package-lock.json`.

## Princípios de engenharia

- **Spec-driven:** nenhuma mudança de comportamento começa sem uma spec revisada e versionada em `docs/specs/`.
- **Strict TDD:** sempre execute RED, GREEN e REFACTOR. Escreva e confirme o teste falhando antes do código de produção.
- **DRY:** remova duplicação real e estável, mas não crie abstrações prematuras para casos hipotéticos.
- **Keep It Simple:** implemente a menor solução explícita que satisfaça a spec.
- **SOLID:** mantenha responsabilidades claras e regras testáveis, sem criar interfaces ou camadas sem necessidade concreta.
- **No overengineering:** não adicione infraestrutura, dependências ou flexibilidade que não tenham consumidor atual na spec.

Em caso de conflito, segurança e correção prevalecem; entre soluções corretas, escolha a mais simples.

## Workflow obrigatório

1. Selecione apenas uma tarefa desbloqueada no roadmap.
2. Crie ou atualize a spec com contexto, regras, cenários Given/When/Then, contratos, erros, segurança, não objetivos e critérios de aceite.
3. Aguarde a revisão da spec antes da implementação.
4. Escreva o menor teste do cenário e confirme o estado RED pela razão esperada.
5. Implemente somente o necessário para chegar ao estado GREEN.
6. Faça REFACTOR mantendo a suíte verde.
7. Atualize documentação, roadmap e referência do commit ou PR.

Não implemente comportamento descoberto durante o desenvolvimento antes de incorporá-lo à spec.

## Regras de implementação

- Aplique autenticação e autorização no backend; esconder controles na interface não é autorização.
- Nunca armazene senhas em texto puro nem exponha dados de outro paciente por identificadores fornecidos pelo cliente.
- Configure URLs, credenciais e opções de ambiente por variáveis de ambiente.
- Reutilize os schemas Pydantic usados pela API nos testes.
- Adicione testes pequenos para regras de segurança e para o comportamento alterado seguindo strict TDD.
- Preserve o contrato atual quando isso não comprometer segurança ou clareza.
- Não faça refatorações não relacionadas à tarefa atual.

## Antes de concluir

- Execute os testes afetados e o build relevante.
- Confira `git diff --check` e `git status`.
- Documente qualquer verificação que não pôde ser executada.
- Confirme que a spec, o roadmap e a implementação estão sincronizados.
- Registre evidência do teste RED antes do GREEN.
