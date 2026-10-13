# Migrações Versionadas de Banco

## Status

IMPLEMENTED

## Dependências

- Aprovação de `000-foundation-decisions.md`, especialmente D003 e D004.
- Step 0 do roadmap.

## Contexto e problema

O banco é inicializado por scripts que removem e recriam o database. Isso atende
ao protótipo, mas destrói dados e não permite saber quais mudanças já foram
aplicadas.

## Objetivos

- Aplicar alterações de schema em ordem e uma única vez.
- Separar estrutura do banco de dados demonstrativos.
- Bloquear a inicialização do backend quando uma migration falhar.
- Delegar histórico, ordenação e execução ao Alembic.
- Injetar configuração e conexões nos limites de infraestrutura.

## Não objetivos

- Adotar SQLAlchemy ORM no código da aplicação.
- Gerar migrations automaticamente.
- Implementar rollback automático de DDL.
- Preservar dados atuais se D003 confirmar que são descartáveis.

## Regras de negócio e técnicas

1. Configuração Alembic fica em `db/alembic.ini` e `db/migrations/`.
2. Revisões ficam em `db/migrations/versions/` e são imutáveis após aplicadas.
3. Alembic registra a revisão corrente em `alembic_version`.
4. `alembic upgrade head` não reaplica uma revisão registrada.
5. Uma falha interrompe o upgrade e impede o backend de iniciar.
6. Seeds ficam em `db/seeds/` e nunca são aplicados automaticamente em produção.
6a. Os CPFs das contas demonstrativas têm dígitos verificadores válidos, para
    que fluxos que validam CPF (como o vínculo direto do médico) possam usá-las.
6b. O seed cria uma guarda `active` de Carlos (`carlos.silva@email.com`,
    responsável, parentesco `parent`) sobre Mariana
    (`mariana.souza@email.com`, menor), já aceita pelo responsável e
    confirmada pela dependente, para demonstrar o contexto de dependente sem
    passos manuais. O seed continua idempotente.
7. Reset destrutivo exige `APP_ENV=development` e comando explícito.
8. Correções de schema usam nova revisão forward-only.
9. Apenas o serviço `migrate` executa upgrades no Compose.
10. A URL é construída por `DatabaseSettings`, sem credenciais hardcoded no INI.
11. Engine e conexões são injetadas nos serviços de seed/reset.
12. Código clínico e routers não importam Alembic nem SQLAlchemy.

## Cenários de aceitação

### Cenário: aplicar migrations em banco vazio

Dado um banco vazio
Quando o executor de migrations for iniciado
Então os arquivos são aplicados em ordem crescente
E a revisão é registrada em `alembic_version`.

### Cenário: executar novamente sem alterações

Dado um banco com todas as migrations registradas
Quando o executor for iniciado novamente
Então nenhuma migration é reaplicada
E a execução termina com sucesso.

### Cenário: interromper após falha

Dado que uma migration possui SQL inválido
Quando o executor tentar aplicá-la
Então a execução termina com erro
E migrations posteriores não são executadas
E a migration com falha não é registrada como aplicada.

### Cenário: dados demonstrativos utilizáveis

Dado um banco migrado e populado pelo seed de desenvolvimento
Quando os CPFs das contas demonstrativas são conferidos
Então todos têm dígitos verificadores válidos
E Carlos tem guarda `active` de Mariana
E executar o seed novamente não duplica a guarda.

### Cenário: configuração injetada

Dado um conjunto de variáveis de ambiente de teste
Quando a configuração de banco é construída
Então a URL SQLAlchemy usa esses valores
E nenhuma credencial é lida diretamente pela regra de seed ou reset.

### Cenário: bloquear reset fora do desenvolvimento

Dado que `APP_ENV` não é `development`
Quando `make db-reset` for executado
Então o banco não é removido
E o comando termina com uma mensagem de bloqueio.

## Contratos afetados

### Comandos

```text
make db-migrate
make db-seed
make db-reset
```

### Dados

```text
alembic_version
- version_num
```

### Compose

- Um serviço ou comando de migration deve concluir antes do backend.
- Falha na migration deve impedir a disponibilidade do backend.

## Segurança

- Credenciais são recebidas por variáveis de ambiente.
- O reset não pode ser acionado implicitamente.
- Logs não exibem senha do banco nem conteúdo sensível de seeds.

## Casos de erro e limites

- Revisões conflitantes ou com dependência inválida são rejeitadas pelo Alembic.
- Falha de conexão mantém o upgrade incompleto e impede o backend de iniciar.
- DDL MySQL pode realizar commit implícito; por isso o plano usa correção
  forward-only, sem prometer rollback automático.

## Estratégia de testes

### Primeiro ciclo TDD

**RED:** teste da configuração injetada espera uma URL SQLAlchemy segura e a
camada de configuração ainda não existe.

**GREEN:** implementar `DatabaseSettings` e a factory mínima de URL/engine.

**REFACTOR:** separar configuração, composição e casos de uso de seed/reset.

### Testes seguintes

- `alembic upgrade head` em banco vazio;
- segunda execução não reaplica;
- falha interrompe a sequência;
- reset fora de desenvolvimento é bloqueado;
- smoke test em MySQL real via Compose.

## Evidência TDD

| Ciclo | Teste RED | Implementação GREEN | Refactor | Referência |
|---|---|---|---|---|
| legado | Executor próprio chegou a RED/GREEN/REFACTOR | Substituído antes do commit | Motivo: evitar reimplementar responsabilidades do Alembic | Não será mantido |
| Alembic 1 | `database_config` ausente durante a coleta | `DatabaseSettings` e factory: 2 testes passaram | URL criada por `URL.create`, sem interpolar credenciais | `backend/__tests__/test_database_config.py` |
| Alembic 2 | `database_admin` ausente durante a coleta | Executor Alembic e administração: 10 testes passaram | Configuração, migration e administração separadas | `backend/__tests__/test_migrations.py` |
| Alembic 3 | CLI não aceitava dependências injetadas | Teste direcionado passou | Composition root recebe factories e casos de uso | `backend/database_tasks.py` |
| MySQL real | Teste legado falhou ao importar `migrate` removido | Testes adaptados ao Alembic passaram no MySQL 8 real | Cobertura separada para idempotência, preservação de dados e interrupção após falha | `backend/__tests__/test_migrations_integration.py` |
| Seed demonstrativo | `test_migrations.py`: 7 CPFs do seed com dígito verificador inválido; `test_migrations_integration.py` (MySQL real): nenhuma guarda após o seed | CPFs corrigidos e guarda `active` Carlos → Mariana com `INSERT IGNORE`; seed reaplicado no teste sem duplicar | `db/README.md` documenta a guarda e a necessidade de `make db-reset` | `47a4534` |

## Critérios de conclusão

- [x] Spec aprovada.
- [x] Todos os cenários possuem testes executados no MySQL real.
- [x] Banco vazio é inicializado sem `DROP DATABASE` no fluxo normal.
- [x] Execução repetida está coberta pelo teste de integração no MySQL real.
- [x] Seeds são independentes e restritos ao ambiente de desenvolvimento.
- [x] Definition of Done do roadmap atendida.

## Questões para revisão

1. Revisões Alembic aplicadas são imutáveis por política e revisão de código.
2. O reset local pode remover automaticamente o volume Docker? **Não; a remoção
   de volume permanece um comando explícito separado.**

## Registro de aprovação

- Aprovada em 2026-10-01 junto às decisões de fundação.
- Revisada e aprovada em 2026-10-02 para adoção de Alembic, SQLAlchemy e DI nos
  limites de infraestrutura.
- Implementada e validada em 2026-10-02 com MySQL 8 real via Docker: banco
  vazio, segunda execução idempotente, preservação de dados, interrupção após
  SQL inválido e persistência do volume após reinício do container.
- Revisada em 2026-10-12 a pedido do produto: CPFs do seed com dígitos
  verificadores válidos (regra 6a) e guarda demonstrativa Carlos → Mariana
  (regra 6b).
