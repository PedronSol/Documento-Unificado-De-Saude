import argparse
import os
from pathlib import Path

from database_admin import reset_database, seed_database
from database_config import DatabaseSettings, create_database_engine
from migration_service import upgrade_database


def main(
    argv=None,
    environ=None,
    *,
    engine_builder=create_database_engine,
    migrate_use_case=upgrade_database,
    seed_use_case=seed_database,
    reset_use_case=reset_database,
) -> None:
    parser = argparse.ArgumentParser(description="Gerencia o banco de dados do DUS")
    parser.add_argument("command", choices=("migrate", "seed", "reset"))
    parser.add_argument("path", nargs="?")
    args = parser.parse_args(argv)

    values = os.environ if environ is None else environ
    settings = DatabaseSettings.from_mapping(values)
    include_database = args.command != "reset"
    engine = engine_builder(settings, include_database=include_database)

    try:
        if args.command == "migrate":
            migrate_use_case(engine, Path(args.path or "../db/alembic.ini"))
        elif args.command == "seed":
            seed_use_case(
                engine,
                Path(args.path or "../db/seeds/development.sql"),
                app_env=values.get("APP_ENV", "production"),
            )
        else:
            reset_use_case(
                engine,
                settings.database,
                app_env=values.get("APP_ENV", "production"),
            )
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
