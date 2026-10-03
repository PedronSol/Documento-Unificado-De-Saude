from copy import deepcopy
from datetime import date, datetime

from httpx import ASGITransport, AsyncClient
import pytest

from config import AppSettings, SESSION_COOKIE
from main import create_app
from security import hash_password, hash_session_token


VALID_PASSWORD = "senha-forte"
pytestmark = pytest.mark.anyio


class FakeCursor:
    def __init__(self, database):
        self.database = database
        self.result = None
        self.rowcount = 0

    def execute(self, statement, parameters=None):
        sql = " ".join(statement.split())
        parameters = parameters or ()
        self.database.executed.append((sql, parameters))
        self.rowcount = 0

        if sql.startswith("SELECT * FROM users WHERE email"):
            self.result = deepcopy(
                next(
                    (
                        user
                        for user in self.database.users.values()
                        if user["email"] == parameters[0]
                    ),
                    None,
                )
            )
        elif sql.startswith("SELECT role FROM user_roles"):
            self.result = [
                {"role": role}
                for role in self.database.roles.get(parameters[0], [])
            ]
        elif sql.startswith("SELECT verification_status FROM doctors"):
            status = self.database.doctors.get(parameters[0])
            self.result = (
                {"verification_status": status} if status is not None else None
            )
        elif sql.startswith("SELECT u.user_id, u.display_name, u.email"):
            user_id = self.database.sessions.get(parameters[0])
            user = self.database.users.get(user_id)
            self.result = (
                {
                    "user_id": user["user_id"],
                    "display_name": user["display_name"],
                    "email": user["email"],
                }
                if user and user["active"]
                else None
            )
        elif sql.startswith("SELECT * FROM patients WHERE user_id"):
            self.result = deepcopy(
                next(
                    (
                        patient
                        for patient in self.database.patients.values()
                        if patient["user_id"] == parameters[0]
                    ),
                    None,
                )
            )
        elif sql.startswith("SELECT * FROM patients WHERE patient_id"):
            self.result = deepcopy(self.database.patients.get(parameters[0]))
        elif "FROM vaccines WHERE patient_id" in sql:
            self.result = [
                deepcopy(vaccine)
                for vaccine in self.database.vaccines
                if vaccine["patient_id"] == parameters[0]
            ]
        elif "FROM alerts WHERE patient_id" in sql:
            self.result = []
        elif "FROM documents WHERE patient_id" in sql:
            self.result = []
        elif sql.startswith("DELETE FROM sessions WHERE expires_at"):
            self.rowcount = 0
        elif sql.startswith("INSERT INTO sessions"):
            token_hash, user_id, _expires_at = parameters
            self.database.sessions[token_hash] = user_id
            self.rowcount = 1
        elif sql.startswith("DELETE FROM sessions WHERE token_hash"):
            self.rowcount = int(self.database.sessions.pop(parameters[0], None) is not None)
        else:
            raise AssertionError(f"SQL não caracterizado: {sql}")

    def fetchone(self):
        return self.result

    def fetchall(self):
        return self.result

    def close(self):
        pass


class FakeConnection:
    def __init__(self, database):
        self.database = database

    def cursor(self, dictionary=False):
        return FakeCursor(self.database)

    def commit(self):
        self.database.commits += 1

    def rollback(self):
        self.database.rollbacks += 1

    def close(self):
        pass


class FakeIdentityDatabase:
    def __init__(self):
        password_hash = hash_password(VALID_PASSWORD)
        self.users = {
            1: {
                "user_id": 1,
                "cpf": "12345678901",
                "display_name": "Ana da Silva",
                "email": "ana@example.com",
                "password_hash": password_hash,
                "active": True,
                "created_at": datetime(2026, 1, 1),
            },
            2: {
                "user_id": 2,
                "cpf": "23456789012",
                "display_name": "Dr. Rui Lima",
                "email": "rui@example.com",
                "password_hash": password_hash,
                "active": True,
                "created_at": datetime(2026, 1, 1),
            },
            3: {
                "user_id": 3,
                "cpf": "34567890123",
                "display_name": "Conta Inativa",
                "email": "inativa@example.com",
                "password_hash": password_hash,
                "active": False,
                "created_at": datetime(2026, 1, 1),
            },
            4: {
                "user_id": 4,
                "cpf": "45678901234",
                "display_name": "Dra. Lia Pires",
                "email": "lia@example.com",
                "password_hash": password_hash,
                "active": True,
                "created_at": datetime(2026, 1, 1),
            },
        }
        self.roles = {
            1: ["patient"],
            2: ["doctor"],
            3: ["patient"],
            4: ["patient", "doctor"],
        }
        self.doctors = {2: "verified", 4: "pending"}
        self.patients = {
            10: {
                "patient_id": 10,
                "user_id": 1,
                "nome_paciente": "Ana",
                "nome_completo": "Ana da Silva",
                "avatar": None,
                "status_saude": "updated",
                "tipo_sanguineo": "O+",
                "valor_qr": None,
                "criado_em": datetime(2026, 1, 1),
                "data_nascimento": date(1990, 5, 10),
            },
            40: {
                "patient_id": 40,
                "user_id": 4,
                "nome_paciente": "Lia",
                "nome_completo": "Dra. Lia Pires",
                "avatar": None,
                "status_saude": "updated",
                "tipo_sanguineo": "A+",
                "valor_qr": None,
                "criado_em": datetime(2026, 1, 1),
                "data_nascimento": date(1985, 3, 20),
            },
        }
        self.vaccines = [
            {
                "id_vacina": 1,
                "patient_id": 10,
                "nome_vacina": "BCG",
                "dose": "Dose única",
                "data_aplicacao": date(2025, 1, 15),
                "status_vacina": "applied",
            }
        ]
        self.sessions = {}
        self.executed = []
        self.commits = 0
        self.rollbacks = 0

    def connect(self):
        return FakeConnection(self)

    def create_session(self, user_id, raw_token="valid-session"):
        self.sessions[hash_session_token(raw_token)] = user_id
        return raw_token


@pytest.fixture
def identity_database():
    return FakeIdentityDatabase()


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def client(identity_database):
    application = create_app(
        settings=AppSettings.from_mapping({}),
        connection_factory=identity_database.connect,
    )
    async with AsyncClient(
        transport=ASGITransport(app=application),
        base_url="http://testserver",
    ) as test_client:
        yield test_client


async def test_login_de_paciente_retorna_identidade_roles_e_dashboard(
    client, identity_database
):
    response = await client.post(
        "/login",
        data={"username": "ana@example.com", "password": VALID_PASSWORD},
    )

    assert response.status_code == 200
    assert response.json()["user"] == {
        "user_id": 1,
        "display_name": "Ana da Silva",
        "email": "ana@example.com",
        "roles": ["patient"],
    }
    assert response.json()["patient_data"]["nome_paciente"] == "Ana"
    assert response.json()["vaccines"][0]["id_vacina"] == 1
    assert list(identity_database.sessions.values()) == [1]


async def test_login_profissional_nao_consulta_nem_retorna_dados_clinicos(
    client, identity_database
):
    response = await client.post(
        "/login",
        data={"username": "rui@example.com", "password": VALID_PASSWORD},
    )

    assert response.status_code == 200
    assert response.json()["user"]["roles"] == ["doctor"]
    assert response.json()["patient_data"] is None
    assert response.json()["vaccines"] == []
    assert response.json()["alerts"] == []
    assert response.json()["documents"] == []
    assert not any(
        "FROM patients" in statement
        or "FROM vaccines" in statement
        or "FROM alerts" in statement
        or "FROM documents" in statement
        for statement, _ in identity_database.executed
    )


async def test_login_inativo_com_senha_correta_retorna_403_sem_sessao(
    client, identity_database
):
    response = await client.post(
        "/login",
        data={"username": "inativa@example.com", "password": VALID_PASSWORD},
    )

    assert response.status_code == 403
    assert response.json() == {"detail": "Conta inativa."}
    assert identity_database.sessions == {}


async def test_doctor_pendente_autentica_sem_role_profissional(client):
    response = await client.post(
        "/login",
        data={
            "username": "lia@example.com",
            "password": VALID_PASSWORD,
            "role": "doctor",
        },
    )

    assert response.status_code == 200
    assert response.json()["user"]["roles"] == ["patient"]


async def test_doctor_nao_acessa_recurso_exclusivo_de_paciente(
    client, identity_database
):
    raw_token = identity_database.create_session(2)
    client.cookies.set(SESSION_COOKIE, raw_token)
    identity_database.executed.clear()

    response = await client.get("/me/vaccines")

    assert response.status_code == 403
    assert response.json() == {
        "detail": "Acesso não permitido para este perfil."
    }
    assert not any(
        "FROM patients" in statement or "FROM vaccines" in statement
        for statement, _ in identity_database.executed
    )


async def test_sessao_de_usuario_desativado_e_rejeitada(client, identity_database):
    raw_token = identity_database.create_session(3)
    client.cookies.set(SESSION_COOKIE, raw_token)

    response = await client.get("/me")

    assert response.status_code == 401
    assert response.json() == {"detail": "Sessão inválida ou expirada."}
