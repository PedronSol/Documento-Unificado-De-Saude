from pathlib import Path
import importlib.util

import pytest
import sqlalchemy as sa

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


def test_migration_de_auditoria_clinica_e_a_revisao_0003_forward_only():
    migration_path = (
        PROJECT_ROOT
        / "db"
        / "migrations"
        / "versions"
        / "0003_clinical_audit.py"
    )
    assert migration_path.is_file()

    spec = importlib.util.spec_from_file_location("clinical_audit_migration", migration_path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)

    assert migration.revision == "0003"
    assert migration.down_revision == "0002"
    with pytest.raises(NotImplementedError, match="forward-only"):
        migration.downgrade()


def test_migration_0003_cria_eventos_de_auditoria_com_indices_e_constraints():
    migration_path = (
        PROJECT_ROOT
        / "db"
        / "migrations"
        / "versions"
        / "0003_clinical_audit.py"
    )
    spec = importlib.util.spec_from_file_location("clinical_audit_schema", migration_path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)

    class OperationsDouble:
        def __init__(self):
            self.table = None
            self.elements = ()
            self.indexes = []

        def create_table(self, table, *elements):
            self.table = table
            self.elements = elements

        def create_index(self, name, table, columns):
            self.indexes.append((name, table, columns))

    operations = OperationsDouble()
    migration.op = operations

    migration.upgrade()

    columns = {
        element.name: element
        for element in operations.elements
        if isinstance(element, sa.Column)
    }
    constraints = {
        element.name: element
        for element in operations.elements
        if isinstance(element, sa.Constraint)
    }

    assert operations.table == "clinical_audit_events"
    assert set(columns) == {
        "audit_event_id",
        "actor_type",
        "actor_user_id",
        "patient_id",
        "action",
        "resource_type",
        "resource_id",
        "before_snapshot",
        "after_snapshot",
        "occurred_at",
    }
    assert columns["actor_type"].type.enums == ["user", "public_share", "system"]
    assert columns["actor_user_id"].nullable is True
    assert columns["patient_id"].nullable is False
    assert columns["occurred_at"].nullable is False
    assert {
        "ck_clinical_audit_actor",
        "fk_clinical_audit_actor",
        "fk_clinical_audit_patient",
    } <= set(constraints)
    assert operations.indexes == [
        (
            "idx_clinical_audit_patient_occurred",
            "clinical_audit_events",
            ["patient_id", "occurred_at"],
        ),
        (
            "idx_clinical_audit_actor_occurred",
            "clinical_audit_events",
            ["actor_user_id", "occurred_at"],
        ),
        (
            "idx_clinical_audit_resource",
            "clinical_audit_events",
            ["resource_type", "resource_id"],
        ),
    ]


def test_migration_de_marcadores_e_a_revisao_0004_forward_only():
    migration_path = (
        PROJECT_ROOT
        / "db"
        / "migrations"
        / "versions"
        / "0004_health_markers.py"
    )
    assert migration_path.is_file()

    spec = importlib.util.spec_from_file_location("health_markers_migration", migration_path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)

    assert migration.revision == "0004"
    assert migration.down_revision == "0003"
    with pytest.raises(NotImplementedError, match="forward-only"):
        migration.downgrade()


def test_migration_0004_cria_marcadores_com_historico_e_unicidade_ativa():
    migration_path = (
        PROJECT_ROOT
        / "db"
        / "migrations"
        / "versions"
        / "0004_health_markers.py"
    )
    spec = importlib.util.spec_from_file_location("health_markers_schema", migration_path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)

    class OperationsDouble:
        def __init__(self):
            self.table = None
            self.elements = ()
            self.indexes = []

        def create_table(self, table, *elements):
            self.table = table
            self.elements = elements

        def create_index(self, name, table, columns):
            self.indexes.append((name, table, columns))

    operations = OperationsDouble()
    migration.op = operations

    migration.upgrade()

    columns = {
        element.name: element
        for element in operations.elements
        if isinstance(element, sa.Column)
    }
    constraints = {
        element.name: element
        for element in operations.elements
        if isinstance(element, sa.Constraint)
    }

    assert operations.table == "health_markers"
    assert set(columns) == {
        "marker_id",
        "patient_id",
        "marker_type",
        "name",
        "normalized_name",
        "active_name_key",
        "description",
        "dosage",
        "frequency",
        "status",
        "created_by_user_id",
        "updated_by_user_id",
        "created_at",
        "updated_at",
        "removed_at",
    }
    assert columns["marker_type"].type.enums == [
        "medication",
        "diagnosis",
        "condition",
        "allergy",
    ]
    assert columns["status"].type.enums == ["active", "removed"]
    assert columns["active_name_key"].computed is not None
    assert {
        "ck_health_markers_medication_fields",
        "ck_health_markers_removed_at",
        "fk_health_markers_patient",
        "fk_health_markers_created_by",
        "fk_health_markers_updated_by",
        "uq_health_markers_active_name",
    } <= set(constraints)
    assert operations.indexes == [
        (
            "idx_health_markers_patient_status_type_name",
            "health_markers",
            ["patient_id", "status", "marker_type", "name"],
        ),
        (
            "idx_health_markers_patient_status_removed",
            "health_markers",
            ["patient_id", "status", "removed_at"],
        ),
    ]


def test_migration_0005_cria_grupos_e_vinculos_vigentes_forward_only():
    migration_path = (
        PROJECT_ROOT
        / "db"
        / "migrations"
        / "versions"
        / "0005_care_groups.py"
    )
    assert migration_path.is_file()

    spec = importlib.util.spec_from_file_location("care_groups_schema", migration_path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)

    class OperationsDouble:
        def __init__(self):
            self.tables = {}
            self.indexes = []

        def create_table(self, table, *elements):
            self.tables[table] = elements

        def create_index(self, name, table, columns):
            self.indexes.append((name, table, columns))

    operations = OperationsDouble()
    migration.op = operations

    migration.upgrade()

    assert migration.revision == "0005"
    assert migration.down_revision == "0004"
    assert set(operations.tables) == {
        "care_groups",
        "doctor_care_groups",
        "patient_care_groups",
    }

    group_columns = {
        element.name: element
        for element in operations.tables["care_groups"]
        if isinstance(element, sa.Column)
    }
    assert set(group_columns) == {
        "care_group_id",
        "name",
        "status",
        "created_at",
        "updated_at",
    }
    assert group_columns["status"].type.enums == ["active", "inactive"]

    for table, subject, foreign_key in (
        ("doctor_care_groups", "doctor_id", "fk_doctor_care_groups_doctor"),
        ("patient_care_groups", "patient_id", "fk_patient_care_groups_patient"),
    ):
        elements = operations.tables[table]
        columns = {
            element.name: element
            for element in elements
            if isinstance(element, sa.Column)
        }
        constraints = {
            element.name: element
            for element in elements
            if isinstance(element, sa.Constraint)
        }
        assert set(columns) == {
            "care_group_id",
            subject,
            "status",
            "starts_at",
            "ends_at",
            "created_at",
            "updated_at",
        }
        assert columns["status"].type.enums == ["active", "inactive"]
        assert {
            f"pk_{table}",
            f"fk_{table}_group",
            foreign_key,
            f"ck_{table}_period",
        } <= set(constraints)

    assert operations.indexes == [
        (
            "idx_doctor_care_groups_authorization",
            "doctor_care_groups",
            ["doctor_id", "status", "starts_at", "ends_at", "care_group_id"],
        ),
        (
            "idx_patient_care_groups_authorization",
            "patient_care_groups",
            ["patient_id", "status", "starts_at", "ends_at", "care_group_id"],
        ),
        (
            "idx_patient_care_groups_listing",
            "patient_care_groups",
            ["care_group_id", "status", "starts_at", "ends_at", "patient_id"],
        ),
    ]
    with pytest.raises(NotImplementedError, match="forward-only"):
        migration.downgrade()


def test_migration_0006_cria_compartilhamentos_temporarios_forward_only():
    migration_path = (
        PROJECT_ROOT
        / "db"
        / "migrations"
        / "versions"
        / "0006_health_shares.py"
    )
    assert migration_path.is_file()

    spec = importlib.util.spec_from_file_location("health_shares_schema", migration_path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)

    class OperationsDouble:
        def __init__(self):
            self.table = None
            self.elements = ()
            self.indexes = []

        def create_table(self, table, *elements):
            self.table = table
            self.elements = elements

        def create_index(self, name, table, columns):
            self.indexes.append((name, table, columns))

    operations = OperationsDouble()
    migration.op = operations

    migration.upgrade()

    columns = {
        element.name: element
        for element in operations.elements
        if isinstance(element, sa.Column)
    }
    constraints = {
        element.name: element
        for element in operations.elements
        if isinstance(element, sa.Constraint)
    }

    assert migration.revision == "0006"
    assert migration.down_revision == "0005"
    assert operations.table == "health_shares"
    assert set(columns) == {
        "share_id",
        "token_hash",
        "patient_id",
        "created_by_user_id",
        "created_at",
        "expires_at",
        "revoked_at",
        "last_accessed_at",
        "active_patient_id",
    }
    assert columns["token_hash"].nullable is False
    assert columns["active_patient_id"].computed is not None
    assert {
        "ck_health_shares_expiration",
        "ck_health_shares_revocation",
        "ck_health_shares_last_access",
        "fk_health_shares_patient",
        "fk_health_shares_created_by",
        "uq_health_shares_token_hash",
        "uq_health_shares_active_patient",
    } <= set(constraints)
    assert operations.indexes == [
        (
            "idx_health_shares_patient_expiration",
            "health_shares",
            ["patient_id", "expires_at"],
        ),
    ]
    with pytest.raises(NotImplementedError, match="forward-only"):
        migration.downgrade()


def test_migration_0007_cria_identidades_externas_e_senha_opcional_forward_only():
    migration_path = (
        PROJECT_ROOT
        / "db"
        / "migrations"
        / "versions"
        / "0007_external_identities.py"
    )
    assert migration_path.is_file()

    spec = importlib.util.spec_from_file_location("external_identities_schema", migration_path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)

    class OperationsDouble:
        def __init__(self):
            self.altered_columns = []
            self.table = None
            self.elements = ()
            self.indexes = []

        def alter_column(self, table, column, **options):
            self.altered_columns.append((table, column, options))

        def create_table(self, table, *elements):
            self.table = table
            self.elements = elements

        def create_index(self, name, table, columns):
            self.indexes.append((name, table, columns))

    operations = OperationsDouble()
    migration.op = operations

    migration.upgrade()

    columns = {
        element.name: element
        for element in operations.elements
        if isinstance(element, sa.Column)
    }
    constraints = {
        element.name: element
        for element in operations.elements
        if isinstance(element, sa.Constraint)
    }

    assert migration.revision == "0007"
    assert migration.down_revision == "0006"
    assert len(operations.altered_columns) == 1
    altered_table, altered_column, altered_options = operations.altered_columns[0]
    assert (altered_table, altered_column) == ("users", "password_hash")
    assert isinstance(altered_options["existing_type"], sa.String)
    assert altered_options["existing_type"].length == 255
    assert altered_options["existing_nullable"] is False
    assert altered_options["nullable"] is True
    assert operations.table == "external_identities"
    assert set(columns) == {
        "external_identity_id",
        "user_id",
        "provider",
        "issuer",
        "subject",
        "created_at",
    }
    assert columns["provider"].type.enums == ["google"]
    assert {
        "fk_external_identities_user",
        "uq_external_identities_issuer_subject",
        "uq_external_identities_user_provider",
    } <= set(constraints)
    assert operations.indexes == [
        ("idx_external_identities_user", "external_identities", ["user_id"])
    ]
    with pytest.raises(NotImplementedError, match="forward-only"):
        migration.downgrade()


def test_seed_de_desenvolvimento_provisiona_grupos_medicos_idempotentes():
    seed = (PROJECT_ROOT / "db" / "seeds" / "development.sql").read_text(
        encoding="utf-8"
    )

    assert "INSERT IGNORE INTO care_groups" in seed
    assert "INSERT IGNORE INTO doctor_care_groups" in seed
    assert "INSERT IGNORE INTO patient_care_groups" in seed
    assert "Unidade Centro" in seed
    assert "Unidade Norte" in seed
    assert "Grupo Inativo de Demonstração" in seed


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
