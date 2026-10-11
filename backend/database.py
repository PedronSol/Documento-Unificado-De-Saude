from collections.abc import Callable, Iterator
from contextlib import contextmanager
import logging
from typing import Any

from fastapi import HTTPException, Request, status
import mysql.connector

from config import DatabaseSettings


logger = logging.getLogger(__name__)

ConnectionFactory = Callable[[], Any]


def create_connection(
    settings: DatabaseSettings,
    *,
    connector: Callable[..., Any] | None = None,
):
    connector = connector or mysql.connector.connect
    try:
        return connector(
            host=settings.host,
            port=settings.port,
            user=settings.user,
            password=settings.password,
            database=settings.database,
            charset="utf8mb4",
        )
    except mysql.connector.Error as error:
        logger.exception("Falha ao conectar ao banco de dados")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Banco de dados indisponível.",
        ) from error


@contextmanager
def connection_scope(connection_factory: ConnectionFactory) -> Iterator[Any]:
    connection = connection_factory()
    try:
        yield connection
    finally:
        connection.close()


@contextmanager
def cursor_scope(connection: Any, *, dictionary: bool = False) -> Iterator[Any]:
    cursor = connection.cursor(dictionary=dictionary)
    try:
        yield cursor
    finally:
        cursor.close()


@contextmanager
def transaction(connection: Any) -> Iterator[None]:
    try:
        yield
        connection.commit()
    except Exception:
        connection.rollback()
        raise


def get_connection(request: Request) -> Iterator[Any]:
    with connection_scope(request.app.state.connection_factory) as connection:
        yield connection
