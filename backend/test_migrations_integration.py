import os
from pathlib import Path
from uuid import uuid4

import pytest

from database_admin import seed_database
from database_config import DatabaseSettings, create_database_engine
from migration_service import upgrade_database


PROJECT_ROOT = Path(__file__).resolve().parent.parent


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
        upgrade_database(database_engine, alembic_config)
        seed_database(database_engine, seed_path, app_env="development")

        with database_engine.connect() as connection:
            assert connection.exec_driver_sql(
                "SELECT version_num FROM alembic_version"
            ).scalar_one() == "0001"
            assert connection.exec_driver_sql(
                "SELECT COUNT(*) FROM pacientes"
            ).scalar_one() > 0
    finally:
        database_engine.dispose()
        with admin_engine.begin() as connection:
            connection.exec_driver_sql(f"DROP DATABASE IF EXISTS `{database_name}`")
        admin_engine.dispose()
