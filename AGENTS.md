# AGENTS.md

## Objetivo

Evolua o Documento Unificado de Saúde de forma incremental. Prefira soluções simples, legíveis e fáceis de testar. Não introduza camadas, serviços ou dependências sem uma necessidade concreta.

O roadmap arquitetural e sua árvore de dependências estão em `docs/architecture-evolution-plan.md`. Atualize o status e a referência do commit ou PR nesse documento ao concluir cada entrega planejada.

## Estrutura

- `backend/`: API FastAPI e regras de autorização; testes ficam em
  `backend/__tests__/`.
- `frontend/`: aplicação Next.js e testes Playwright.
- `db/`: criação do schema e dados locais de demonstração.

Pastas na raiz devem usar nomes minúsculos. Código gerado, caches e resultados de build não devem ser versionados.

## Comandos principais

- Frontend local: `make front-dev`
- Backend local: `make back-dev`
- Frontend e backend locais: `make both`
- Build das imagens: `make build`
- Backend e banco via Docker: `make local-up`
- Aplicar migrations: `make db-migrate`
- Carregar dados demonstrativos: `make db-seed`
- Recriar banco local: `make db-reset`
- Aplicação completa: `docker compose up --build`
- Testes do backend: `python -m pytest` dentro de `backend/`
- Desenvolvimento do frontend: `npm run dev` dentro de `frontend/`
- Testes do frontend: `npm test` dentro de `frontend/`
- Build do frontend: `npm run build` dentro de `frontend/`

Use npm como gerenciador de pacotes do frontend e mantenha somente `package-lock.json`.

## Design system do frontend

- A fonte de verdade visual é `docs/design-system.md`; os tokens executáveis
  ficam em `frontend/styles/design-tokens.css` e usam o prefixo `--ds-*`.
- O estilo é institucional clínico: claro, calmo e preciso. Use canvas
  cinza-azulado, superfícies brancas, azul para ação/foco e verde apenas para
  sucesso ou estado clínico positivo. Fluxos clínicos usam Instrument Sans;
  não crie uma linguagem editorial própria por área.
- Implemente mobile-first a partir de 320 px. O CSS-base atende telas pequenas
  e expansões usam preferencialmente `min-width`; nenhuma tela pode depender de
  redução posterior por `max-width` para se tornar utilizável.
- Reutilize primeiro os componentes de `frontend/components/ui/` e os padrões
  compostos catalogados. Não duplique Button, Card, Badge, Avatar, Tooltip,
  ClinicalSelect, cabeçalho de seção, busca, item de lista, estado vazio ou
  diálogo. Campos de seleção usam `ClinicalSelect`, não `<select>` nativo, salvo
  justificativa explícita de acessibilidade na spec.
- Cores, tipografia, espaços, raios, sombras, movimento, larguras e camadas do
  código tocado devem consumir tokens semânticos. Não adicione hex, shadow,
  radius ou breakpoint isolado sem necessidade concreta e atualização conjunta
  do guia e dos tokens.
- Preserve alvo interativo de 44 px, foco visível, contraste, reduced motion,
  zoom de texto, quebra de conteúdo e ausência de overflow em 320 px.
- Em contas com vários contextos, mantenha o seletor no dock inferior flutuante
  abaixo de 1200 px, com safe area e espaço rolável reservado; a partir de
  1200 px ele volta ao cabeçalho. Contas de uma role não reservam esse espaço.
- O service worker pode armazenar somente a página offline genérica; nunca faça
  cache de API, HTML autenticado ou dados pessoais/clínicos.
- Toda mudança visual deve testar ao menos a menor viewport afetada e uma
  viewport ampla; componentes compartilhados exigem regressão nos consumidores.

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
- Use Alembic para migrations; mantenha SQLAlchemy restrito à infraestrutura
  enquanto uma spec não justificar ORM na aplicação.
- Injete configuração e dependências externas no composition root; regras de
  domínio não devem ler ambiente nem instanciar conexões.
- Nunca altere uma migration já aplicada; crie uma nova migration forward-only.
- Seeds e reset destrutivo são permitidos somente em desenvolvimento.

## Antes de concluir

- Execute os testes afetados e o build relevante.
- Confira `git diff --check` e `git status`.
- Documente qualquer verificação que não pôde ser executada.
- Confirme que a spec, o roadmap e a implementação estão sincronizados.
- Registre evidência do teste RED antes do GREEN.
