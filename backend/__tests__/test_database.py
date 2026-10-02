import mysql.connector
import pytest
from fastapi import HTTPException

from database import connection_scope, create_connection, cursor_scope, transaction
from database_config import DatabaseSettings


class ConnectionDouble:
    def __init__(self):
        self.closed = False
        self.commits = 0
        self.rollbacks = 0
        self.cursor_double = CursorDouble()

    def cursor(self, dictionary=False):
        self.cursor_double.dictionary = dictionary
        return self.cursor_double

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1

    def close(self):
        self.closed = True


class CursorDouble:
    def __init__(self):
        self.closed = False
        self.dictionary = False

    def close(self):
        self.closed = True


def test_create_connection_uses_injected_settings():
    captured = {}

    def connector(**kwargs):
        captured.update(kwargs)
        return ConnectionDouble()

    settings = DatabaseSettings(
        host="mysql.internal",
        port=3307,
        user="app",
        password="secret",
        database="health",
    )

    create_connection(settings, connector=connector)

    assert captured == {
        "host": "mysql.internal",
        "port": 3307,
        "user": "app",
        "password": "secret",
        "database": "health",
        "charset": "utf8mb4",
    }


def test_create_connection_preserves_database_unavailable_contract():
    settings = DatabaseSettings.from_mapping({})

    def unavailable_connector(**_kwargs):
        raise mysql.connector.Error("offline")

    with pytest.raises(HTTPException) as error:
        create_connection(settings, connector=unavailable_connector)

    assert error.value.status_code == 503
    assert error.value.detail == "Banco de dados indisponível."


def test_connection_and_cursor_scopes_always_close_resources():
    connection = ConnectionDouble()

    with pytest.raises(RuntimeError):
        with connection_scope(lambda: connection) as scoped_connection:
            with cursor_scope(scoped_connection, dictionary=True):
                raise RuntimeError("failure")

    assert connection.closed is True
    assert connection.cursor_double.closed is True
    assert connection.cursor_double.dictionary is True


def test_transaction_commits_on_success_and_rolls_back_on_error():
    successful_connection = ConnectionDouble()
    failed_connection = ConnectionDouble()

    with transaction(successful_connection):
        pass

    with pytest.raises(mysql.connector.Error):
        with transaction(failed_connection):
            raise mysql.connector.Error("failure")

    assert successful_connection.commits == 1
    assert successful_connection.rollbacks == 0
    assert failed_connection.commits == 0
    assert failed_connection.rollbacks == 1
