from collections.abc import Callable, Mapping
from dataclasses import dataclass

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine, URL


@dataclass(frozen=True)
class DatabaseSettings:
    host: str
    port: int
    user: str
    password: str
    database: str

    @classmethod
    def from_mapping(cls, values: Mapping[str, str]) -> "DatabaseSettings":
        return cls(
            host=values.get("DB_HOST", "db"),
            port=int(values.get("DB_PORT", "3306")),
            user=values.get("DB_USER", "root"),
            password=values.get("DB_PASSWORD", "root"),
            database=values.get("DB_NAME", "passaporte_saude"),
        )

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
