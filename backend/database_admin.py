from pathlib import Path
import re

from sqlalchemy.engine import Engine


class UnsafeEnvironmentError(RuntimeError):
    pass


def _require_development(app_env: str) -> None:
    if app_env != "development":
        raise UnsafeEnvironmentError(
            "Operação permitida somente em APP_ENV=development"
        )


def _read_statements(path: Path) -> list[str]:
    return [
        statement.strip()
        for statement in Path(path).read_text(encoding="utf-8").split(";")
        if statement.strip()
    ]


def seed_database(engine: Engine, seed_path: Path, app_env: str) -> None:
    _require_development(app_env)
    with engine.begin() as connection:
        for statement in _read_statements(seed_path):
            connection.exec_driver_sql(statement)


def reset_database(engine: Engine, database_name: str, app_env: str) -> None:
    _require_development(app_env)
    if not re.fullmatch(r"[A-Za-z0-9_]+", database_name):
        raise ValueError("Nome de database inválido")

    with engine.begin() as connection:
        connection.exec_driver_sql(f"DROP DATABASE IF EXISTS `{database_name}`")
        connection.exec_driver_sql(
            f"CREATE DATABASE `{database_name}` "
            "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
        )
