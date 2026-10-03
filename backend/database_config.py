from collections.abc import Callable
from dataclasses import dataclass

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine, URL

from config import DatabaseSettings as BaseDatabaseSettings


@dataclass(frozen=True)
class DatabaseSettings(BaseDatabaseSettings):
    def to_url(self, *, include_database: bool = True) -> URL:
        return URL.create(
            drivername="mysql+mysqlconnector",
            username=self.user,
            password=self.password,
            host=self.host,
            port=self.port,
            database=self.database if include_database else None,
            query={"charset": "utf8mb4"},
        )


EngineFactory = Callable[..., Engine]


def create_database_engine(
    settings: DatabaseSettings,
    *,
    include_database: bool = True,
    engine_factory: EngineFactory = create_engine,
) -> Engine:
    return engine_factory(
        settings.to_url(include_database=include_database),
        pool_pre_ping=True,
    )
