from collections.abc import Callable
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy.engine import Engine


UpgradeCommand = Callable[[Config, str], None]


def upgrade_database(
    engine: Engine,
    config_path: Path,
    *,
    upgrade_command: UpgradeCommand = command.upgrade,
) -> None:
    config = Config(str(config_path))
    with engine.connect() as connection:
        config.attributes["connection"] = connection
        upgrade_command(config, "head")
