from pathlib import Path
import importlib.util

import pytest

import database_tasks
from database_admin import UnsafeEnvironmentError, reset_database, seed_database
from migration_service import upgrade_database


PROJECT_ROOT = Path(__file__).resolve().parents[2]


class FakeConnection:
    def __init__(self):
        self.statements = []

    def exec_driver_sql(self, statement):
        self.statements.append(statement)


class FakeTransaction:
    def __init__(self, connection):
        self.connection = connection

    def __enter__(self):
        return self.connection

    def __exit__(self, exc_type, exc_value, traceback):
        return False


class FakeEngine:
    def __init__(self):
        self.connection = FakeConnection()

    def begin(self):
        return FakeTransaction(self.connection)

    def connect(self):
        return FakeTransaction(self.connection)

    def dispose(self):
        pass


def test_upgrade_injeta_conexao_no_alembic(tmp_path):
    ini_path = tmp_path / "alembic.ini"
    ini_path.write_text("[alembic]\nscript_location = migrations\n", encoding="utf-8")
    engine = FakeEngine()
    received = {}

    def upgrade_command(config, revision):
        received["connection"] = config.attributes["connection"]
        received["revision"] = revision

    upgrade_database(engine, ini_path, upgrade_command=upgrade_command)

    assert received == {
        "connection": engine.connection,
        "revision": "head",
    }


def test_cli_injeta_engine_e_caso_de_uso_de_migration(tmp_path):
    config_path = tmp_path / "alembic.ini"
    engine = FakeEngine()
    received = {}

    def engine_builder(settings, *, include_database=True):
        received["database"] = settings.database
        received["include_database"] = include_database
        return engine

    def migrate_use_case(received_engine, received_path):
        received["engine"] = received_engine
        received["path"] = received_path

    database_tasks.main(
        ["migrate", str(config_path)],
        environ={"DB_NAME": "health_test"},
        engine_builder=engine_builder,
        migrate_use_case=migrate_use_case,
    )

    assert received == {
        "database": "health_test",
        "include_database": True,
        "engine": engine,
        "path": config_path,
    }


def test_seed_executa_sql_por_conexao_injetada_em_desenvolvimento(tmp_path):
    seed_path = tmp_path / "development.sql"
    seed_path.write_text(
        "INSERT INTO pacientes VALUES (1);\nINSERT INTO vacinas VALUES (2);",
        encoding="utf-8",
    )
    engine = FakeEngine()

    seed_database(engine, seed_path, app_env="development")

    assert engine.connection.statements == [
        "INSERT INTO pacientes VALUES (1)",
        "INSERT INTO vacinas VALUES (2)",
    ]


def test_bloqueia_seed_fora_do_ambiente_de_desenvolvimento(tmp_path):
    engine = FakeEngine()
    seed_path = tmp_path / "development.sql"
    seed_path.write_text("INSERT INTO pacientes VALUES (1);", encoding="utf-8")

    with pytest.raises(UnsafeEnvironmentError, match="development"):
        seed_database(engine, seed_path, app_env="production")

    assert engine.connection.statements == []


def test_bloqueia_reset_fora_do_ambiente_de_desenvolvimento():
    engine = FakeEngine()

    with pytest.raises(UnsafeEnvironmentError, match="development"):
        reset_database(engine, "passaporte_saude", app_env="production")

    assert engine.connection.statements == []


def test_reset_recria_apenas_o_database_injetado_em_desenvolvimento():
    engine = FakeEngine()

    reset_database(engine, "passaporte_saude_test", app_env="development")

    assert engine.connection.statements == [
        "DROP DATABASE IF EXISTS `passaporte_saude_test`",
        (
            "CREATE DATABASE `passaporte_saude_test` "
            "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
        ),
    ]


def test_rejeita_nome_de_database_inseguro():
    with pytest.raises(ValueError, match="inválido"):
        reset_database(FakeEngine(), "health`; DROP DATABASE mysql", "development")


def test_estrutura_alembic_e_seed_estao_separados():
    assert (PROJECT_ROOT / "db" / "alembic.ini").is_file()
    assert (PROJECT_ROOT / "db" / "migrations" / "env.py").is_file()
    assert (
        PROJECT_ROOT
        / "db"
        / "migrations"
        / "versions"
        / "0001_initial_schema.py"
    ).is_file()
    assert (PROJECT_ROOT / "db" / "seeds" / "development.sql").is_file()


def test_migration_de_identidade_e_a_proxima_revisao_forward_only():
    migration_path = (
        PROJECT_ROOT
        / "db"
        / "migrations"
        / "versions"
        / "0002_unified_identity_roles.py"
    )
    assert migration_path.is_file()

    spec = importlib.util.spec_from_file_location("identity_migration", migration_path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)

    assert migration.revision == "0002"
    assert migration.down_revision == "0001"
    with pytest.raises(NotImplementedError, match="forward-only"):
        migration.downgrade()


def test_makefile_compose_e_ci_usam_executor_alembic():
    makefile = (PROJECT_ROOT / "Makefile").read_text(encoding="utf-8")
    compose = (PROJECT_ROOT / "docker-compose.yml").read_text(encoding="utf-8")
    workflow = (PROJECT_ROOT / ".github" / "workflows" / "ci.yml").read_text(
        encoding="utf-8"
    )

    assert "python database_tasks.py migrate /db/alembic.ini" in makefile
    assert "python database_tasks.py migrate /db/alembic.ini" in compose
    assert "python -m database_tasks migrate ../db/alembic.ini" in workflow
    assert "condition: service_completed_successfully" in compose
