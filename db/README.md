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

## Bootstrap administrativo

Contas administrativas não têm cadastro público. A primeira conta é criada
pelo operador, em qualquer ambiente:

```bash
make admin-create EMAIL=gestao@example.com CPF=52998224725 NAME="Gestão Central"
```

A senha é solicitada por prompt sem eco e nunca é aceita por argumento ou
variável de ambiente. O comando recusa e-mail ou CPF já cadastrados e não
promove contas existentes. A revisão `0008` adiciona convites profissionais,
gestão de grupos por admin, convites de cuidado e auditoria administrativa; o
seed de desenvolvimento torna `admin@email.com` gestor dos dados demonstrativos.

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
