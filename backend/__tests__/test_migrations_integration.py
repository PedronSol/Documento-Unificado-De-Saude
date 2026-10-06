import json
import os
import shutil
from datetime import date
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException
import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy.exc import SQLAlchemyError

from database import create_connection
from database_admin import seed_database
from database_config import DatabaseSettings, create_database_engine
from migration_service import upgrade_database
from models import VaccineCreateUpdate
from vaccines.router import add_vaccine


PROJECT_ROOT = Path(__file__).resolve().parents[2]


def upgrade_to(database_engine, revision):
    config = Config(str(PROJECT_ROOT / "db" / "alembic.ini"))
    with database_engine.connect() as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, revision)


@pytest.mark.skipif(
    os.getenv("RUN_DB_INTEGRATION") != "1",
    reason="Requer MySQL real com RUN_DB_INTEGRATION=1",
)
def test_aplica_alembic_e_seed_em_mysql_real():
    database_name = f"dus_migration_test_{uuid4().hex[:12]}"
    settings = DatabaseSettings(
        host=os.getenv("DB_HOST", "127.0.0.1"),
        port=int(os.getenv("DB_PORT", "3307")),
        user=os.getenv("DB_USER", "root"),
        password=os.getenv("DB_PASSWORD", "root"),
        database=database_name,
    )
    admin_engine = create_database_engine(settings, include_database=False)

    with admin_engine.begin() as connection:
        connection.exec_driver_sql(
            f"CREATE DATABASE `{database_name}` "
            "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
        )

    database_engine = create_database_engine(settings)
    try:
        alembic_config = PROJECT_ROOT / "db" / "alembic.ini"
        seed_path = PROJECT_ROOT / "db" / "seeds" / "development.sql"

        upgrade_database(database_engine, alembic_config)
        seed_database(database_engine, seed_path, app_env="development")

        with database_engine.connect() as connection:
            patient_count = connection.exec_driver_sql(
                "SELECT COUNT(*) FROM patients"
            ).scalar_one()
            user_counts = connection.exec_driver_sql(
                """
                SELECT COUNT(*) AS total,
                       COUNT(DISTINCT cpf) AS unique_cpfs,
                       SUM(cpf IS NULL) AS missing_cpfs
                FROM users
                """
            ).mappings().one()
            doctor_count = connection.exec_driver_sql(
                "SELECT COUNT(*) FROM doctors"
            ).scalar_one()
            audit_table_count = connection.exec_driver_sql(
                "SELECT COUNT(*) FROM information_schema.tables "
                f"WHERE table_schema='{database_name}' "
                "AND table_name='clinical_audit_events'"
            ).scalar_one()
            pending_doctor_roles = connection.exec_driver_sql(
                """
                SELECT COUNT(*)
                FROM user_roles r
                JOIN users u ON u.user_id = r.user_id
                WHERE u.email = 'paula.reis@email.com' AND r.role = 'doctor'
                """
            ).scalar_one()

        upgrade_database(database_engine, alembic_config)

        with database_engine.connect() as connection:
            revision = connection.exec_driver_sql(
                "SELECT version_num FROM alembic_version"
            ).scalar_one()
            patient_count_after_second_upgrade = connection.exec_driver_sql(
                "SELECT COUNT(*) FROM patients"
            ).scalar_one()

        assert revision == "0003"
        assert patient_count > 0
        assert user_counts["total"] == 7
        assert user_counts["unique_cpfs"] == 7
        assert user_counts["missing_cpfs"] == 0
        assert doctor_count == 3
        assert audit_table_count == 1
        assert pending_doctor_roles == 0
        assert patient_count_after_second_upgrade == patient_count
    finally:
        database_engine.dispose()
        with admin_engine.begin() as connection:
            connection.exec_driver_sql(f"DROP DATABASE IF EXISTS `{database_name}`")
        admin_engine.dispose()


@pytest.mark.skipif(
    os.getenv("RUN_DB_INTEGRATION") != "1",
    reason="Requer MySQL real com RUN_DB_INTEGRATION=1",
)
def test_migra_identidade_e_relacoes_legadas_para_ids_internos():
    database_name = f"dus_identity_test_{uuid4().hex[:12]}"
    settings = DatabaseSettings(
        host=os.getenv("DB_HOST", "127.0.0.1"),
        port=int(os.getenv("DB_PORT", "3307")),
        user=os.getenv("DB_USER", "root"),
        password=os.getenv("DB_PASSWORD", "root"),
        database=database_name,
    )
    admin_engine = create_database_engine(settings, include_database=False)

    with admin_engine.begin() as connection:
        connection.exec_driver_sql(
            f"CREATE DATABASE `{database_name}` "
            "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
        )

    database_engine = create_database_engine(settings)
    try:
        upgrade_to(database_engine, "0001")
        with database_engine.begin() as connection:
            connection.exec_driver_sql(
                """
                INSERT INTO pacientes (
                    cpf_paciente, nome_paciente, nome_completo, email,
                    senha_hash, status_saude, tipo_sanguineo, data_nascimento
                ) VALUES (
                    '12345678901', 'Ana', 'Ana da Silva', 'ana@example.com',
                    'hash-legado', 'updated', 'O+', '1990-05-10'
                )
                """
            )
            connection.exec_driver_sql(
                """
                INSERT INTO sessoes (token_hash, paciente_id, expira_em)
                VALUES (REPEAT('a', 64), '12345678901', '2030-01-01 00:00:00')
                """
            )
            for table, columns, values in (
                (
                    "vacinas",
                    "id_vacina, paciente_id, nome_vacina, dose, status_vacina",
                    "1, '12345678901', 'BCG', 'Dose única', 'applied'",
                ),
                (
                    "alertas",
                    "id_alerta, paciente_id, tipo_alerta, titulo_alerta",
                    "1, '12345678901', 'allergy', 'Alergia'",
                ),
                (
                    "documentos",
                    "id_documento, paciente_id, titulo_documento, tipo_documento",
                    "1, '12345678901', 'Hemograma', 'exam'",
                ),
            ):
                connection.exec_driver_sql(
                    f"INSERT INTO {table} ({columns}) VALUES ({values})"
                )

        upgrade_database(database_engine, PROJECT_ROOT / "db" / "alembic.ini")

        with database_engine.connect() as connection:
            revision = connection.exec_driver_sql(
                "SELECT version_num FROM alembic_version"
            ).scalar_one()
            user = connection.exec_driver_sql(
                """
                SELECT user_id, cpf, display_name, email, password_hash, active
                FROM users WHERE cpf = '12345678901'
                """
            ).mappings().one()
            patient = connection.exec_driver_sql(
                "SELECT patient_id, user_id FROM patients"
            ).mappings().one()
            roles = connection.exec_driver_sql(
                "SELECT role FROM user_roles WHERE user_id = %s",
                (user["user_id"],),
            ).scalars().all()
            session_user_id = connection.exec_driver_sql(
                "SELECT user_id FROM sessions"
            ).scalar_one()
            related_patient_ids = {
                table: connection.exec_driver_sql(
                    f"SELECT patient_id FROM {table}"
                ).scalar_one()
                for table in ("vaccines", "alerts", "documents")
            }
            legacy_tables = connection.exec_driver_sql(
                """
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = DATABASE()
                  AND table_name IN ('pacientes', 'sessoes', 'vacinas',
                                     'alertas', 'documentos')
                """
            ).scalars().all()

        assert revision == "0003"
        assert user["display_name"] == "Ana da Silva"
        assert user["email"] == "ana@example.com"
        assert user["password_hash"] == "hash-legado"
        assert user["active"] == 1
        assert patient["user_id"] == user["user_id"]
        assert roles == ["patient"]
        assert session_user_id == user["user_id"]
        assert set(related_patient_ids.values()) == {patient["patient_id"]}
        assert legacy_tables == []
    finally:
        database_engine.dispose()
        with admin_engine.begin() as connection:
            connection.exec_driver_sql(f"DROP DATABASE IF EXISTS `{database_name}`")
        admin_engine.dispose()


@pytest.mark.skipif(
    os.getenv("RUN_DB_INTEGRATION") != "1",
    reason="Requer MySQL real com RUN_DB_INTEGRATION=1",
)
def test_vaccine_and_clinical_audit_are_atomic_in_mysql():
    database_name = f"dus_audit_test_{uuid4().hex[:12]}"
    settings = DatabaseSettings(
        host=os.getenv("DB_HOST", "127.0.0.1"),
        port=int(os.getenv("DB_PORT", "3307")),
        user=os.getenv("DB_USER", "root"),
        password=os.getenv("DB_PASSWORD", "root"),
        database=database_name,
    )
    admin_engine = create_database_engine(settings, include_database=False)

    with admin_engine.begin() as connection:
        connection.exec_driver_sql(
            f"CREATE DATABASE `{database_name}` "
            "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
        )

    database_engine = create_database_engine(settings)
    try:
        upgrade_database(database_engine, PROJECT_ROOT / "db" / "alembic.ini")
        seed_database(
            database_engine,
            PROJECT_ROOT / "db" / "seeds" / "development.sql",
            app_env="development",
        )
        with database_engine.connect() as connection:
            patient = connection.exec_driver_sql(
                """
                SELECT p.patient_id, p.user_id
                FROM patients p
                JOIN users u ON u.user_id = p.user_id
                WHERE u.email = 'carlos.silva@email.com'
                """
            ).mappings().one()

        app_connection = create_connection(settings)
        try:
            add_vaccine(
                vaccine=VaccineCreateUpdate(
                    name="Febre amarela",
                    dose="Dose única",
                    administered_on=date(2026, 8, 20),
                    status="applied",
                ),
                patient=dict(patient),
                connection=app_connection,
            )
        finally:
            app_connection.close()

        with database_engine.connect() as connection:
            created_vaccine = connection.exec_driver_sql(
                """
                SELECT id_vacina, patient_id
                FROM vaccines
                WHERE nome_vacina = 'Febre amarela'
                """
            ).mappings().one()
            audit_event = connection.exec_driver_sql(
                """
                SELECT actor_type, actor_user_id, patient_id, action,
                       resource_type, resource_id, before_snapshot,
                       after_snapshot, occurred_at
                FROM clinical_audit_events
                WHERE action = 'vaccine.created'
                """
            ).mappings().one()

        assert audit_event["actor_type"] == "user"
        assert audit_event["actor_user_id"] == patient["user_id"]
        assert audit_event["patient_id"] == patient["patient_id"]
        assert audit_event["resource_type"] == "vaccine"
        assert audit_event["resource_id"] == created_vaccine["id_vacina"]
        assert audit_event["before_snapshot"] is None
        assert json.loads(audit_event["after_snapshot"])["name"] == "Febre amarela"
        assert audit_event["occurred_at"] is not None

        with database_engine.begin() as connection:
            vaccine_count_before_failure = connection.exec_driver_sql(
                "SELECT COUNT(*) FROM vaccines"
            ).scalar_one()
            connection.exec_driver_sql("DROP TABLE clinical_audit_events")

        failed_connection = create_connection(settings)
        try:
            with pytest.raises(HTTPException) as error:
                add_vaccine(
                    vaccine=VaccineCreateUpdate(
                        name="Vacina sem auditoria",
                        dose="Dose única",
                        administered_on=None,
                        status="pending",
                    ),
                    patient=dict(patient),
                    connection=failed_connection,
                )
        finally:
            failed_connection.close()

        with database_engine.connect() as connection:
            vaccine_count_after_failure = connection.exec_driver_sql(
                "SELECT COUNT(*) FROM vaccines"
            ).scalar_one()
            failed_vaccine_count = connection.exec_driver_sql(
                """
                SELECT COUNT(*) FROM vaccines
                WHERE nome_vacina = 'Vacina sem auditoria'
                """
            ).scalar_one()

        assert error.value.status_code == 503
        assert vaccine_count_after_failure == vaccine_count_before_failure
        assert failed_vaccine_count == 0
    finally:
        database_engine.dispose()
        with admin_engine.begin() as connection:
            connection.exec_driver_sql(f"DROP DATABASE IF EXISTS `{database_name}`")
        admin_engine.dispose()


@pytest.mark.skipif(
    os.getenv("RUN_DB_INTEGRATION") != "1",
    reason="Requer MySQL real com RUN_DB_INTEGRATION=1",
)
def test_interrompe_sequencia_quando_migration_falha_no_mysql_real(tmp_path):
    database_name = f"dus_migration_failure_{uuid4().hex[:12]}"
    settings = DatabaseSettings(
        host=os.getenv("DB_HOST", "127.0.0.1"),
        port=int(os.getenv("DB_PORT", "3307")),
        user=os.getenv("DB_USER", "root"),
        password=os.getenv("DB_PASSWORD", "root"),
        database=database_name,
    )
    admin_engine = create_database_engine(settings, include_database=False)

    with admin_engine.begin() as connection:
        connection.exec_driver_sql(
            f"CREATE DATABASE `{database_name}` "
            "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
        )

    temporary_db = tmp_path / "db"
    shutil.copytree(PROJECT_ROOT / "db", temporary_db)
    versions = temporary_db / "migrations" / "versions"
    (versions / "0002_unified_identity_roles.py").unlink()
    (versions / "0003_clinical_audit.py").unlink()
    (versions / "0002_invalid_sql.py").write_text(
        '''from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("THIS IS NOT VALID SQL")


def downgrade():
    pass
''',
        encoding="utf-8",
    )
    (versions / "0003_must_not_run.py").write_text(
        '''from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "migration_that_must_not_run",
        sa.Column("id", sa.Integer(), primary_key=True),
    )


def downgrade():
    op.drop_table("migration_that_must_not_run")
''',
        encoding="utf-8",
    )

    database_engine = create_database_engine(settings)
    try:
        with pytest.raises(SQLAlchemyError):
            upgrade_database(database_engine, temporary_db / "alembic.ini")

        with database_engine.connect() as connection:
            revision = connection.exec_driver_sql(
                "SELECT version_num FROM alembic_version"
            ).scalar_one()
            later_table_count = connection.exec_driver_sql(
                "SELECT COUNT(*) FROM information_schema.tables "
                f"WHERE table_schema='{database_name}' "
                "AND table_name='migration_that_must_not_run'"
            ).scalar_one()

        assert revision == "0001"
        assert later_table_count == 0
    finally:
        database_engine.dispose()
        with admin_engine.begin() as connection:
            connection.exec_driver_sql(f"DROP DATABASE IF EXISTS `{database_name}`")
        admin_engine.dispose()
