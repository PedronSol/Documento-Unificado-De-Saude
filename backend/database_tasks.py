import argparse
from getpass import getpass
import os
from pathlib import Path

from database_admin import AdminBootstrapError, create_admin, reset_database, seed_database
from database_config import DatabaseSettings, create_database_engine
from documents.cleanup import cleanup_removed_documents
from documents.storage import LocalDocumentStorage
from migration_service import upgrade_database


def main(
    argv=None,
    environ=None,
    *,
    engine_builder=create_database_engine,
    migrate_use_case=upgrade_database,
    seed_use_case=seed_database,
    reset_use_case=reset_database,
    create_admin_use_case=create_admin,
    cleanup_documents_use_case=cleanup_removed_documents,
    password_prompt=None,
) -> None:
    parser = argparse.ArgumentParser(description="Gerencia o banco de dados do DUS")
    parser.add_argument(
        "command",
        choices=("migrate", "seed", "reset", "create-admin", "cleanup-documents"),
    )
    parser.add_argument("path", nargs="?")
    parser.add_argument("--email")
    parser.add_argument("--cpf")
    parser.add_argument("--name")
    args = parser.parse_args(argv)
    if args.command == "create-admin" and not (args.email and args.cpf and args.name):
        parser.error("create-admin exige --email, --cpf e --name")

    values = os.environ if environ is None else environ
    settings = DatabaseSettings.from_mapping(values)
    include_database = args.command != "reset"
    engine = engine_builder(settings, include_database=include_database)

    try:
        if args.command == "migrate":
            migrate_use_case(engine, Path(args.path or "../db/alembic.ini"))
        elif args.command == "create-admin":
            create_admin_use_case(
                engine,
                email=args.email,
                cpf=args.cpf,
                display_name=args.name,
                password=(password_prompt or _prompt_admin_password)(),
            )
        elif args.command == "seed":
            seed_use_case(
                engine,
                Path(args.path or "../db/seeds/development.sql"),
                app_env=values.get("APP_ENV", "production"),
            )
        elif args.command == "cleanup-documents":
            cleanup_documents_use_case(
                engine,
                LocalDocumentStorage(
                    Path(values.get("DOCUMENT_STORAGE_ROOT", ".data/documents"))
                ),
            )
        else:
            reset_use_case(
                engine,
                settings.database,
                app_env=values.get("APP_ENV", "production"),
            )
    finally:
        engine.dispose()


def _prompt_admin_password() -> str:
    password = getpass("Senha do administrador: ")
    if password != getpass("Confirme a senha: "):
        raise AdminBootstrapError("As senhas não conferem.")
    return password


if __name__ == "__main__":
    try:
        main()
    except AdminBootstrapError as error:
        raise SystemExit(str(error)) from error
