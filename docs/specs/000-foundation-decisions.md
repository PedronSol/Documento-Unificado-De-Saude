# Decisões de Fundação Arquitetural

## Status

SPEC APPROVED

## Dependências

- Nenhuma.

## Contexto e problema

As próximas features exigem evolução de identidade, banco, auditoria, arquivos e
processamento assíncrono. Antes do código, precisamos aprovar escolhas simples e
consistentes para evitar retrabalho e abstrações concorrentes.

## Objetivos

- Registrar as decisões que orientam os Steps 1 a 12.
- Explicitar alternativas rejeitadas e decisões ainda abertas.
- Preservar um monólito modular e uma infraestrutura pequena.

## Não objetivos

- Implementar qualquer uma das decisões.
- Definir detalhes internos de todas as features.
- Escolher fornecedores externos de armazenamento ou OCR.

## Decisões propostas

### D001 — Arquitetura da aplicação

**Proposta:** manter um monólito modular com um único backend FastAPI, um
frontend Next.js e um banco MySQL.

**Motivo:** o volume e o domínio atuais não justificam comunicação distribuída,
deploy independente ou consistência eventual.

**Não adotaremos agora:** microserviços, API gateway, event sourcing ou broker de
mensagens.

### D002 — Identificadores internos

**Proposta:** usar `BIGINT AUTO_INCREMENT` como chave interna e manter CPF e CRM
como identificadores de negócio únicos.

**Motivo:** é simples, eficiente no MySQL e evita propagar CPF por chaves
estrangeiras e URLs.

### D003 — Preservação dos dados atuais

**Proposta:** considerar os dados atuais como demonstrativos e recriáveis durante
a migração inicial para o novo modelo.

**Decisão aprovada:** os dados atuais são demonstrativos e podem ser recriados.
Se essa premissa mudar no futuro, será obrigatório escrever backfill e migração
em fases antes de alterar um ambiente com dados persistentes.

### D004 — Estratégia de migrações

**Decisão revisada:** usar Alembic para histórico e execução das migrations, com
SQLAlchemy limitado à engine de infraestrutura. O backend mantém SQL explícito e
`mysql-connector` nas rotas enquanto não existir uma spec que justifique ORM.

**Motivo:** evita manter internamente ordenação, histórico, CLI e resolução de
revisões. Alembic e SQLAlchemy entram somente no limite técnico que precisam
resolver.

**Dependency inversion:** casos de uso de seed/reset recebem conexão ou engine;
configuração e criação da engine ficam no composition root. Nenhuma regra clínica
depende de Alembic ou SQLAlchemy.

### D005 — Papéis de usuário

**Proposta:** um papel principal por usuário: `patient`, `doctor` ou `admin`.

**Motivo:** atende aos cenários conhecidos. Múltiplos papéis somente serão
introduzidos se uma spec exigir que a mesma conta atue em mais de um perfil.

### D006 — Armazenamento de documentos

**Proposta:** contrato pequeno de armazenamento, implementação local em
desenvolvimento e possibilidade de implementação S3 no ambiente produtivo.

**Motivo:** arquivos não devem ser armazenados no MySQL, mas não precisamos
escolher um provedor remoto antes da feature de documentos.

### D007 — Processamento OCR

**Proposta:** worker separado usando uma tabela de jobs no MySQL, sem Redis na
primeira versão.

**Motivo:** fornece durabilidade e processamento fora da requisição HTTP com a
infraestrutura já existente.

### D008 — Organização da API

**Proposta:** autenticação retorna identidade mínima; vacinas, marcadores,
documentos e compartilhamentos possuem endpoints próprios.

**Motivo:** impede que login e `/me` se tornem um payload de dashboard crescente.

## Segurança e autorização

- CPF e CRM não serão usados como identificadores internos em URLs.
- Autorização permanece no backend e combina usuário, papel, ownership e vínculo.
- Tokens de sessão e compartilhamento serão armazenados somente como hash.
- Logs e auditoria não poderão armazenar senhas, tokens ou documentos integrais.

## Estratégia de testes

Cada decisão será testada na spec que a consumir. As primeiras evidências serão
os testes de migração e os testes de autenticação por papel.

## Critérios de conclusão

- [x] D001 aprovada.
- [x] D002 aprovada.
- [x] D003 aprovada: dados atuais são demonstrativos e recriáveis.
- [x] D004 revisada e aprovada: Alembic com SQLAlchemy apenas na infraestrutura.
- [x] D005 aprovada: um papel principal por usuário inicialmente.
- [x] D006 aprovada: sem provedor obrigatório neste momento.
- [x] D007 aprovada: sem provedor obrigatório neste momento.
- [x] D008 aprovada.
- [x] Status alterado para `SPEC APPROVED`.

## Questões para revisão

1. Podemos descartar e recriar os dados atuais de demonstração? **Sim.**
2. Uma mesma conta precisa atuar como paciente e médico na primeira versão?
   **Não; um único papel por usuário foi aprovado.**
3. Existe um provedor obrigatório para armazenamento ou OCR? **Não neste momento.**

## Registro de aprovação

- Aprovada em 2026-10-01 após revisão das decisões principais.
- D004 revisada em 2026-10-02 para substituir o executor próprio por Alembic.
