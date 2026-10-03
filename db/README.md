# Banco de dados

A revisão `0002` introduz identidade unificada: todo registro em `users` possui
CPF obrigatório e único, independentemente das roles. Relações, sessões e
identificadores técnicos usam IDs internos; CPF não é removido do cadastro.
O seed de desenvolvimento contém contas demonstrativas de paciente, médico
verificado/pendente e administrador. Credenciais seedadas são exclusivamente
para desenvolvimento local.

O schema MySQL é versionado pelo Alembic. A aplicação não usa SQLAlchemy ORM;
SQLAlchemy fornece apenas a conexão usada pela infraestrutura de migrations,
seed e reset.

## Fluxo local

```bash
make db-migrate
make db-seed
make db-reset
```

`db-seed` e `db-reset` exigem `APP_ENV=development`. O reset é destrutivo e
deve ser executado explicitamente; o fluxo normal nunca remove o database ou o
volume Docker.

## Criar uma revisão

Dentro de `backend/`, com as dependências instaladas:

```bash
alembic -c ../db/alembic.ini revision -m "descricao_curta"
```

Edite o `upgrade()` gerado e cubra a mudança com um teste que falhe antes da
implementação. Não use `--autogenerate`: este projeto não mantém metadados ORM.

Revisões aplicadas são imutáveis e forward-only. Se uma alteração precisar ser
corrigida, crie uma nova revisão compensatória; não edite uma revisão já
aplicada e não conte com rollback automático de DDL no MySQL.
