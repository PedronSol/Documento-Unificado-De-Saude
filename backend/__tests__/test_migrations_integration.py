import os
import shutil
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy.exc import SQLAlchemyError

from database_admin import seed_database
from database_config import DatabaseSettings, create_database_engine
from migration_service import upgrade_database


PROJECT_ROOT = Path(__file__).resolve().parents[2]


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
                "SELECT COUNT(*) FROM pacientes"
            ).scalar_one()

        upgrade_database(database_engine, alembic_config)

        with database_engine.connect() as connection:
            revision = connection.exec_driver_sql(
                "SELECT version_num FROM alembic_version"
            ).scalar_one()
            patient_count_after_second_upgrade = connection.exec_driver_sql(
                "SELECT COUNT(*) FROM pacientes"
            ).scalar_one()

        assert revision == "0001"
        assert patient_count > 0
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
