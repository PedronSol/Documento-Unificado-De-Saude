import json
import os
import shutil
from datetime import date
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, Response
from fastapi.testclient import TestClient
import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy.exc import SQLAlchemyError

from config import AppSettings
from database import create_connection
from database_admin import seed_database
from database_config import DatabaseSettings, create_database_engine
from migration_service import upgrade_database
from markers.router import add_marker, delete_marker
from main import create_app
from medical.router import (
    add_medical_marker,
    get_medical_record,
    list_medical_patients,
)
from models import MarkerCreateUpdate, VaccineCreateUpdate
from shares.router import (
    create_health_share,
    get_public_health_summary,
    revoke_health_share,
)
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
            markers_table_count = connection.exec_driver_sql(
                "SELECT COUNT(*) FROM information_schema.tables "
                f"WHERE table_schema='{database_name}' "
                "AND table_name='health_markers'"
            ).scalar_one()
            shares_table_count = connection.exec_driver_sql(
                "SELECT COUNT(*) FROM information_schema.tables "
                f"WHERE table_schema='{database_name}' "
                "AND table_name='health_shares'"
            ).scalar_one()
            external_identities_table_count = connection.exec_driver_sql(
                "SELECT COUNT(*) FROM information_schema.tables "
                f"WHERE table_schema='{database_name}' "
                "AND table_name='external_identities'"
            ).scalar_one()
            password_hash_nullable = connection.exec_driver_sql(
                """
                SELECT is_nullable
                FROM information_schema.columns
                WHERE table_schema = DATABASE()
                  AND table_name = 'users'
                  AND column_name = 'password_hash'
                """
            ).scalar_one()
            care_group_count = connection.exec_driver_sql(
                "SELECT COUNT(*) FROM care_groups"
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

        assert revision == "0015"
        assert patient_count > 0
        assert user_counts["total"] == 7
        assert user_counts["unique_cpfs"] == 7
        assert user_counts["missing_cpfs"] == 0
        assert doctor_count == 3
        assert audit_table_count == 1
        assert markers_table_count == 1
        assert shares_table_count == 1
        assert external_identities_table_count == 1
        assert password_hash_nullable == "YES"
        assert care_group_count == 3
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
def test_cadastros_local_e_google_persistem_atomicamente_no_mysql():
    database_name = f"dus_registration_test_{uuid4().hex[:12]}"
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
        app_settings = AppSettings.from_mapping(
            {
                "DB_HOST": settings.host,
                "DB_PORT": str(settings.port),
                "DB_USER": settings.user,
                "DB_PASSWORD": settings.password,
                "DB_NAME": settings.database,
                "GOOGLE_AUTH_ENABLED": "true",
                "GOOGLE_CLIENT_ID": "client-id.apps.googleusercontent.com",
            }
        )
        application = create_app(
            settings=app_settings,
            google_identity_verifier=lambda _credential: {
                "iss": "https://accounts.google.com",
                "sub": "mysql-google-subject",
                "email": "google.patient@example.com",
                "email_verified": True,
                "name": "Paciente Google",
            },
        )

        with TestClient(application) as client:
            local_response = client.post(
                "/auth/patient-registration",
                json={
                    "email": "local.patient@example.com",
                    "password": "senha-local-segura",
                    "cpf": "52998224725",
                    "display_name": "Paciente Local",
                    "preferred_name": "Local",
                    "birth_date": "1990-01-10",
                },
            )
            google_response = client.post(
                "/auth/google/patient-registration",
                json={
                    "credential": "fake-signed-token",
                    "cpf": "16899535009",
                    "preferred_name": "Google",
                    "birth_date": "1992-09-20",
                },
            )
            google_profile_response = client.get("/me")

        assert local_response.status_code == 201
        assert google_response.status_code == 201
        assert google_profile_response.status_code == 200
        assert google_profile_response.json()["patient_profile"]["blood_type"] is None
        with database_engine.connect() as connection:
            users = connection.exec_driver_sql(
                """
                SELECT email, password_hash
                FROM users
                ORDER BY email
                """
            ).mappings().all()
            roles = connection.exec_driver_sql(
                "SELECT role FROM user_roles ORDER BY user_id"
            ).scalars().all()
            external_identities = connection.exec_driver_sql(
                """
                SELECT provider, issuer, subject
                FROM external_identities
                """
            ).mappings().all()
            audit_actions = connection.exec_driver_sql(
                """
                SELECT action
                FROM clinical_audit_events
                ORDER BY audit_event_id
                """
            ).scalars().all()

        assert [user["email"] for user in users] == [
            "google.patient@example.com",
            "local.patient@example.com",
        ]
        assert users[0]["password_hash"] is None
        assert users[1]["password_hash"].startswith("pbkdf2_sha256$")
        assert roles == ["patient", "patient"]
        assert external_identities == [
            {
                "provider": "google",
                "issuer": "https://accounts.google.com",
                "subject": "mysql-google-subject",
            }
        ]
        assert audit_actions == ["patient.registered", "patient.registered"]
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
            migrated_document = connection.exec_driver_sql(
                """
                SELECT titulo_documento, tipo_documento, status_documento,
                       storage_key, sha256, created_at, removed_at
                FROM documents WHERE id_documento = 1
                """
            ).mappings().one()
            legacy_tables = connection.exec_driver_sql(
                """
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = DATABASE()
                  AND table_name IN ('pacientes', 'sessoes', 'vacinas',
                                     'alertas', 'documentos')
                """
            ).scalars().all()

        assert revision == "0015"
        assert user["display_name"] == "Ana da Silva"
        assert user["email"] == "ana@example.com"
        assert user["password_hash"] == "hash-legado"
        assert user["active"] == 1
        assert patient["user_id"] == user["user_id"]
        assert roles == ["patient"]
        assert session_user_id == user["user_id"]
        assert set(related_patient_ids.values()) == {patient["patient_id"]}
        assert migrated_document["titulo_documento"] == "Hemograma"
        assert migrated_document["tipo_documento"] == "exam"
        assert migrated_document["status_documento"] == "removed"
        assert migrated_document["storage_key"] is None
        assert migrated_document["sha256"] is None
        assert migrated_document["created_at"] is not None
        assert migrated_document["removed_at"] is not None
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
def test_health_markers_preserve_history_uniqueness_and_atomicity_in_mysql():
    database_name = f"dus_markers_test_{uuid4().hex[:12]}"
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
            created = add_marker(
                marker=MarkerCreateUpdate(
                    type="condition",
                    name="Hipertensão",
                    description="Acompanhamento contínuo",
                ),
                patient=dict(patient),
                connection=app_connection,
            )
        finally:
            app_connection.close()

        duplicate_connection = create_connection(settings)
        try:
            with pytest.raises(HTTPException) as duplicate_error:
                add_marker(
                    marker=MarkerCreateUpdate(
                        type="condition",
                        name="  HIPERTENSÃO  ",
                    ),
                    patient=dict(patient),
                    connection=duplicate_connection,
                )
        finally:
            duplicate_connection.close()

        removal_connection = create_connection(settings)
        try:
            delete_marker(
                marker_id=created["marker_id"],
                patient=dict(patient),
                connection=removal_connection,
            )
        finally:
            removal_connection.close()

        recreation_connection = create_connection(settings)
        try:
            recreated = add_marker(
                marker=MarkerCreateUpdate(
                    type="condition",
                    name="Hipertensão",
                ),
                patient=dict(patient),
                connection=recreation_connection,
            )
        finally:
            recreation_connection.close()

        with database_engine.connect() as connection:
            marker_counts = connection.exec_driver_sql(
                """
                SELECT COUNT(*) AS total,
                       SUM(status = 'active') AS active_count,
                       SUM(status = 'removed') AS removed_count
                FROM health_markers
                WHERE patient_id = %s AND marker_type = 'condition'
                  AND normalized_name = 'hipertensão'
                """,
                (patient["patient_id"],),
            ).mappings().one()
            marker_audit_count = connection.exec_driver_sql(
                """
                SELECT COUNT(*) FROM clinical_audit_events
                WHERE resource_type = 'health_marker'
                """
            ).scalar_one()

        assert duplicate_error.value.status_code == 409
        assert created["status"] == "active"
        assert recreated["marker_id"] != created["marker_id"]
        assert marker_counts == {
            "total": 2,
            "active_count": 1,
            "removed_count": 1,
        }
        assert marker_audit_count == 3

        with database_engine.begin() as connection:
            total_before_failure = connection.exec_driver_sql(
                "SELECT COUNT(*) FROM health_markers"
            ).scalar_one()
            connection.exec_driver_sql("DROP TABLE clinical_audit_events")

        failed_connection = create_connection(settings)
        try:
            with pytest.raises(HTTPException) as audit_error:
                add_marker(
                    marker=MarkerCreateUpdate(
                        type="allergy",
                        name="Dipirona",
                    ),
                    patient=dict(patient),
                    connection=failed_connection,
                )
        finally:
            failed_connection.close()

        with database_engine.connect() as connection:
            total_after_failure = connection.exec_driver_sql(
                "SELECT COUNT(*) FROM health_markers"
            ).scalar_one()

        assert audit_error.value.status_code == 503
        assert total_after_failure == total_before_failure
    finally:
        database_engine.dispose()
        with admin_engine.begin() as connection:
            connection.exec_driver_sql(f"DROP DATABASE IF EXISTS `{database_name}`")
        admin_engine.dispose()


@pytest.mark.skipif(
    os.getenv("RUN_DB_INTEGRATION") != "1",
    reason="Requer MySQL real com RUN_DB_INTEGRATION=1",
)
def test_medical_groups_enforce_access_and_resolve_doctor_crm_in_mysql():
    database_name = f"dus_medical_test_{uuid4().hex[:12]}"
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
            doctor = connection.exec_driver_sql(
                """
                SELECT d.doctor_id, d.user_id
                FROM doctors d
                JOIN users u ON u.user_id = d.user_id
                WHERE u.email = 'helena.costa@email.com'
                """
            ).mappings().one()
            patients = {
                row["email"]: row["patient_id"]
                for row in connection.exec_driver_sql(
                    """
                    SELECT u.email, p.patient_id
                    FROM patients p
                    JOIN users u ON u.user_id = p.user_id
                    WHERE u.email IN (
                        'carlos.silva@email.com',
                        'mariana.souza@email.com'
                    )
                    """
                ).mappings()
            }

        app_connection = create_connection(settings)
        try:
            listed = list_medical_patients(
                query=None,
                doctor=dict(doctor),
                connection=app_connection,
            )
            created = add_medical_marker(
                patient_id=patients["carlos.silva@email.com"],
                marker=MarkerCreateUpdate(
                    type="diagnosis",
                    name="Insuficiência renal leve",
                ),
                doctor=dict(doctor),
                connection=app_connection,
            )
            record = get_medical_record(
                patient_id=patients["carlos.silva@email.com"],
                doctor=dict(doctor),
                connection=app_connection,
            )
            with pytest.raises(HTTPException) as denied:
                get_medical_record(
                    patient_id=patients["mariana.souza@email.com"],
                    doctor=dict(doctor),
                    connection=app_connection,
                )
        finally:
            app_connection.close()

        with database_engine.connect() as connection:
            author = connection.exec_driver_sql(
                """
                SELECT u.display_name, d.crm_number, d.crm_state
                FROM clinical_audit_events a
                JOIN users u ON u.user_id = a.actor_user_id
                JOIN doctors d ON d.user_id = u.user_id
                WHERE a.action = 'health_marker.created'
                  AND a.resource_id = %s
                """,
                (created["marker_id"],),
            ).mappings().one()

        assert [patient["full_name"] for patient in listed] == [
            "Carlos Eduardo Silva"
        ]
        assert record["markers"]["active"][0]["name"] == (
            "Insuficiência renal leve"
        )
        assert denied.value.status_code == 403
        assert author == {
            "display_name": "Dra. Helena Costa",
            "crm_number": "100001",
            "crm_state": "RN",
        }
    finally:
        database_engine.dispose()
        with admin_engine.begin() as connection:
            connection.exec_driver_sql(f"DROP DATABASE IF EXISTS `{database_name}`")
        admin_engine.dispose()


@pytest.mark.skipif(
    os.getenv("RUN_DB_INTEGRATION") != "1",
    reason="Requer MySQL real com RUN_DB_INTEGRATION=1",
)
def test_health_share_expires_revokes_and_audits_in_mysql():
    database_name = f"dus_share_test_{uuid4().hex[:12]}"
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
            add_marker(
                marker=MarkerCreateUpdate(type="allergy", name="Dipirona"),
                patient=dict(patient),
                connection=app_connection,
            )
            created = create_health_share(
                patient=dict(patient),
                settings=AppSettings.from_mapping(
                    {"PUBLIC_APP_URL": "https://app.example"}
                ),
                connection=app_connection,
            )
            raw_token = created["share_url"].split("#", 1)[1]
            summary = get_public_health_summary(
                response=Response(),
                share_token=raw_token,
                connection=app_connection,
            )
            revoked = revoke_health_share(
                share_id=created["share_id"],
                patient=dict(patient),
                connection=app_connection,
            )
            with pytest.raises(HTTPException) as unavailable:
                get_public_health_summary(
                    response=Response(),
                    share_token=raw_token,
                    connection=app_connection,
                )
        finally:
            app_connection.close()

        with database_engine.connect() as connection:
            stored = connection.exec_driver_sql(
                """
                SELECT token_hash, revoked_at, last_accessed_at
                FROM health_shares WHERE share_id = %s
                """,
                (created["share_id"],),
            ).mappings().one()
            actions = connection.exec_driver_sql(
                """
                SELECT action
                FROM clinical_audit_events
                WHERE resource_type = 'health_share'
                  AND resource_id = %s
                ORDER BY audit_event_id
                """,
                (created["share_id"],),
            ).scalars().all()

        assert summary["patient"] == {
            "preferred_name": "Carlos Silva",
            "blood_type": "A+",
        }
        assert summary["markers"]["allergies"] == [
            {"name": "Dipirona", "description": None}
        ]
        assert revoked.status_code == 204
        assert unavailable.value.status_code == 404
        assert stored["token_hash"] != raw_token
        assert stored["revoked_at"] is not None
        assert stored["last_accessed_at"] is not None
        assert actions == [
            "health_share.created",
            "health_share.accessed",
            "health_share.revoked",
        ]
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


@pytest.mark.skipif(
    os.getenv("RUN_DB_INTEGRATION") != "1",
    reason="Requer MySQL real com RUN_DB_INTEGRATION=1",
)
def test_migration_0015_preenche_autor_dos_documentos_pelo_evento_de_upload():
    database_name = f"dus_uploader_test_{uuid4().hex[:12]}"
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
        upgrade_to(database_engine, "0014")
        seed_database(
            database_engine,
            PROJECT_ROOT / "db" / "seeds" / "development.sql",
            app_env="development",
        )
        with database_engine.begin() as connection:
            patient = connection.exec_driver_sql(
                "SELECT patient_id, user_id FROM patients ORDER BY patient_id LIMIT 1"
            ).mappings().one()
            connection.exec_driver_sql(
                """
                INSERT INTO documents (
                    patient_id, titulo_documento, tipo_documento, original_filename,
                    storage_key, media_type, size_bytes, sha256,
                    status_documento, created_at
                ) VALUES (%s, 'Hemograma', 'exam', 'hemograma.pdf', %s,
                          'application/pdf', 10, %s, 'uploaded', UTC_TIMESTAMP(6))
                """,
                (patient["patient_id"], f"{uuid4().hex}.pdf", "a" * 64),
            )
            document_id = connection.exec_driver_sql(
                "SELECT LAST_INSERT_ID()"
            ).scalar_one()
            connection.exec_driver_sql(
                """
                INSERT INTO clinical_audit_events (
                    actor_user_id, patient_id, action, resource_type,
                    resource_id, occurred_at
                ) VALUES (%s, %s, 'document.uploaded', 'document', %s,
                          UTC_TIMESTAMP(6))
                """,
                (patient["user_id"], patient["patient_id"], document_id),
            )

        upgrade_to(database_engine, "0015")

        with database_engine.connect() as connection:
            uploader = connection.exec_driver_sql(
                """
                SELECT uploaded_by_user_id, uploader_role
                FROM documents WHERE id_documento = %s
                """,
                (document_id,),
            ).mappings().one()
        assert uploader["uploaded_by_user_id"] == patient["user_id"]
        assert uploader["uploader_role"] == "patient"

        with pytest.raises(SQLAlchemyError):
            with database_engine.begin() as connection:
                connection.exec_driver_sql(
                    """
                    INSERT INTO documents (
                        patient_id, titulo_documento, tipo_documento,
                        original_filename, storage_key, media_type, size_bytes,
                        sha256, status_documento, created_at
                    ) VALUES (%s, 'Sem autor', 'exam', 'x.pdf', %s,
                              'application/pdf', 10, %s, 'uploaded',
                              UTC_TIMESTAMP(6))
                    """,
                    (patient["patient_id"], f"{uuid4().hex}.pdf", "b" * 64),
                )
    finally:
        database_engine.dispose()
        with admin_engine.begin() as connection:
            connection.exec_driver_sql(f"DROP DATABASE IF EXISTS `{database_name}`")
        admin_engine.dispose()
