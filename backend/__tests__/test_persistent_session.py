import os
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from config import AppSettings, SESSION_COOKIE
from database_admin import seed_database
from database_config import DatabaseSettings, create_database_engine
from main import create_app
from migration_service import upgrade_database
from security import hash_session_token


PROJECT_ROOT = Path(__file__).resolve().parents[2]
SEED_PASSWORD = "senha123"
PATIENT_EMAIL = "carlos.silva@email.com"

pytestmark = pytest.mark.skipif(
    os.getenv("RUN_DB_INTEGRATION") != "1",
    reason="Requer MySQL real com RUN_DB_INTEGRATION=1",
)


@pytest.fixture(scope="module")
def database():
    database_name = f"dus_session_test_{uuid4().hex[:12]}"
    settings = DatabaseSettings(
        host=os.getenv("DB_HOST", "127.0.0.1"),
        port=int(os.getenv("DB_PORT", "3307")),
        user=os.getenv("DB_USER", "root"),
        password=os.getenv("DB_PASSWORD", "root"),
        database=database_name,
    )
    server_engine = create_database_engine(settings, include_database=False)
    with server_engine.begin() as connection:
        connection.exec_driver_sql(
            f"CREATE DATABASE `{database_name}` "
            "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
        )
    engine = create_database_engine(settings)
    try:
        upgrade_database(engine, PROJECT_ROOT / "db" / "alembic.ini")
        seed_database(
            engine,
            PROJECT_ROOT / "db" / "seeds" / "development.sql",
            app_env="development",
        )
        yield settings, engine
    finally:
        engine.dispose()
        with server_engine.begin() as connection:
            connection.exec_driver_sql(f"DROP DATABASE IF EXISTS `{database_name}`")
        server_engine.dispose()


@pytest.fixture
def engine(database):
    return database[1]


@pytest.fixture
def make_client(database):
    settings, _engine = database
    app_settings = AppSettings.from_mapping(
        {
            "DB_HOST": settings.host,
            "DB_PORT": str(settings.port),
            "DB_USER": settings.user,
            "DB_PASSWORD": settings.password,
            "DB_NAME": settings.database,
        }
    )
    application = create_app(settings=app_settings)
    clients = []

    def build() -> TestClient:
        client = TestClient(application)
        clients.append(client)
        return client

    yield build
    for client in clients:
        client.close()


def login(make_client, email: str = PATIENT_EMAIL) -> TestClient:
    client = make_client()
    response = client.post(
        "/login",
        data={"username": email, "password": SEED_PASSWORD},
    )
    assert response.status_code == 200, response.text
    return client


def session_hash(client: TestClient) -> str:
    return hash_session_token(client.cookies[SESSION_COOKIE])


def execute(engine, statement: str, parameters=()):
    with engine.begin() as connection:
        connection.exec_driver_sql(statement, parameters)


def fetch_one(engine, statement: str, parameters=()):
    with engine.connect() as connection:
        return connection.exec_driver_sql(statement, parameters).mappings().first()


def age_session(engine, client: TestClient, hours: float) -> None:
    """Simula a passagem do tempo desde o último uso e desde o login."""
    execute(
        engine,
        """
        UPDATE sessions
        SET expires_at = expires_at - INTERVAL %s MINUTE,
            created_at = created_at - INTERVAL %s MINUTE
        WHERE token_hash = %s
        """,
        (int(hours * 60), int(hours * 60), session_hash(client)),
    )


def test_sessao_sem_uso_por_9h_continua_valida(make_client, engine):
    client = login(make_client)
    age_session(engine, client, 9)

    assert client.get("/me").status_code == 200


def test_uso_renova_a_janela_de_inatividade(make_client, engine):
    client = login(make_client)
    age_session(engine, client, 23)
    assert client.get("/me").status_code == 200

    age_session(engine, client, 2)

    assert client.get("/me").status_code == 200


def test_renovacao_grava_no_maximo_uma_vez_por_hora(make_client, engine):
    client = login(make_client)
    age_session(engine, client, 0.5)
    before = fetch_one(
        engine,
        "SELECT expires_at FROM sessions WHERE token_hash = %s",
        (session_hash(client),),
    )["expires_at"]

    assert client.get("/me").status_code == 200

    after = fetch_one(
        engine,
        "SELECT expires_at FROM sessions WHERE token_hash = %s",
        (session_hash(client),),
    )["expires_at"]
    assert after == before


def test_sessao_sem_uso_por_mais_de_24h_expira(make_client, engine):
    client = login(make_client)
    age_session(engine, client, 24.5)

    assert client.get("/me").status_code == 401


def test_teto_absoluto_encerra_sessao_mesmo_com_uso(make_client, engine):
    client = login(make_client)
    execute(
        engine,
        """
        UPDATE sessions
        SET absolute_expires_at = UTC_TIMESTAMP() - INTERVAL 1 MINUTE
        WHERE token_hash = %s
        """,
        (session_hash(client),),
    )

    assert client.get("/me").status_code == 401


def test_renovacao_nunca_ultrapassa_o_teto_absoluto(make_client, engine):
    client = login(make_client)
    execute(
        engine,
        """
        UPDATE sessions
        SET expires_at = UTC_TIMESTAMP() + INTERVAL 10 MINUTE,
            absolute_expires_at = UTC_TIMESTAMP() + INTERVAL 2 HOUR
        WHERE token_hash = %s
        """,
        (session_hash(client),),
    )

    assert client.get("/me").status_code == 200

    session = fetch_one(
        engine,
        "SELECT expires_at, absolute_expires_at FROM sessions WHERE token_hash = %s",
        (session_hash(client),),
    )
    assert session["expires_at"] == session["absolute_expires_at"]


def test_login_define_teto_de_7_dias_e_inatividade_de_24h(make_client, engine):
    client = login(make_client)

    session = fetch_one(
        engine,
        """
        SELECT TIMESTAMPDIFF(MINUTE, UTC_TIMESTAMP(), expires_at) AS idle_minutes,
               TIMESTAMPDIFF(MINUTE, UTC_TIMESTAMP(), absolute_expires_at)
                   AS absolute_minutes
        FROM sessions WHERE token_hash = %s
        """,
        (session_hash(client),),
    )
    assert 24 * 60 - 2 <= session["idle_minutes"] <= 24 * 60
    assert 168 * 60 - 2 <= session["absolute_minutes"] <= 168 * 60
    cookie = next(c for c in client.cookies.jar if c.name == SESSION_COOKIE)
    assert cookie.expires is not None


REMEMBERED_COOKIE = "dus_remembered"


def remembered_hash(client: TestClient) -> str:
    return hash_session_token(client.cookies[REMEMBERED_COOKIE])


def count_remembered(engine, token_hash: str) -> int:
    return fetch_one(
        engine,
        "SELECT COUNT(*) AS total FROM remembered_logins WHERE token_hash = %s",
        (token_hash,),
    )["total"]


def test_login_por_senha_lembra_o_aparelho_sem_expor_identidade(make_client, engine):
    client = login(make_client)

    raw_token = client.cookies[REMEMBERED_COOKIE]
    assert count_remembered(engine, hash_session_token(raw_token)) == 1
    assert count_remembered(engine, raw_token) == 0

    response = client.get("/auth/remembered")

    assert response.status_code == 200
    assert response.json() == {
        "first_name": "Carlos",
        "masked_email": "c•••@email.com",
    }
    assert PATIENT_EMAIL not in response.text


def test_sessao_encerrada_pede_somente_a_senha(make_client, engine):
    client = login(make_client)
    assert client.post("/logout").status_code == 204
    assert client.get("/me").status_code == 401
    assert client.get("/auth/remembered").status_code == 200

    wrong = client.post("/login/remembered", data={"password": "errada"})
    assert wrong.status_code == 401
    assert wrong.json() == {"detail": "E-mail ou senha incorretos."}
    assert client.get("/auth/remembered").status_code == 200

    previous_hash = remembered_hash(client)
    response = client.post("/login/remembered", data={"password": SEED_PASSWORD})

    assert response.status_code == 200
    assert response.json()["user"]["email"] == PATIENT_EMAIL
    assert client.get("/me").status_code == 200
    assert remembered_hash(client) != previous_hash
    assert count_remembered(engine, previous_hash) == 0
    assert count_remembered(engine, remembered_hash(client)) == 1


def test_login_lembrado_ignora_email_enviado_pelo_cliente(make_client):
    client = login(make_client)
    client.post("/logout")

    response = client.post(
        "/login/remembered",
        data={"password": SEED_PASSWORD, "username": "mariana.souza@email.com"},
    )

    assert response.status_code == 200
    assert response.json()["user"]["email"] == PATIENT_EMAIL


def test_usar_outra_conta_apaga_o_lembrete(make_client, engine):
    client = login(make_client)
    token_hash = remembered_hash(client)
    client.post("/logout")

    response = client.delete("/auth/remembered")

    assert response.status_code == 204
    assert count_remembered(engine, token_hash) == 0
    assert REMEMBERED_COOKIE not in client.cookies
    assert client.get("/auth/remembered").status_code == 204
    assert (
        client.post("/login/remembered", data={"password": SEED_PASSWORD}).status_code
        == 401
    )
    assert client.delete("/auth/remembered").status_code == 204


def test_logout_mantem_o_lembrete(make_client, engine):
    client = login(make_client)
    token_hash = remembered_hash(client)

    client.post("/logout")

    assert count_remembered(engine, token_hash) == 1
    assert client.cookies[REMEMBERED_COOKIE]


def test_lembrete_desconhecido_e_removido(make_client):
    client = make_client()
    client.cookies.set(REMEMBERED_COOKIE, "token-desconhecido")

    response = client.get("/auth/remembered")

    assert response.status_code == 204
    assert f'{REMEMBERED_COOKIE}=""' in response.headers["set-cookie"]


def test_lembrete_vencido_e_apagado(make_client, engine):
    client = login(make_client)
    token_hash = remembered_hash(client)
    client.post("/logout")
    execute(
        engine,
        "UPDATE remembered_logins SET expires_at = UTC_TIMESTAMP() - INTERVAL 1 MINUTE "
        "WHERE token_hash = %s",
        (token_hash,),
    )

    assert client.get("/auth/remembered").status_code == 204
    assert count_remembered(engine, token_hash) == 0
    assert (
        client.post("/login/remembered", data={"password": SEED_PASSWORD}).status_code
        == 401
    )


def test_lembrete_de_conta_inativa_nao_e_exibido(make_client, engine):
    client = login(make_client, "mariana.souza@email.com")
    client.post("/logout")
    execute(
        engine,
        "UPDATE users SET active = FALSE WHERE email = %s",
        ("mariana.souza@email.com",),
    )
    try:
        assert client.get("/auth/remembered").status_code == 204
    finally:
        execute(
            engine,
            "UPDATE users SET active = TRUE WHERE email = %s",
            ("mariana.souza@email.com",),
        )


def test_lembrete_de_conta_sem_senha_nao_e_exibido(make_client, engine):
    client = login(make_client, "paula.reis@email.com")
    client.post("/logout")
    execute(
        engine,
        "UPDATE users SET password_hash = NULL WHERE email = %s",
        ("paula.reis@email.com",),
    )

    assert client.get("/auth/remembered").status_code == 204
    assert (
        client.post("/login/remembered", data={"password": SEED_PASSWORD}).status_code
        == 401
    )
