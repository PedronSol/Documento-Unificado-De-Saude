from copy import deepcopy
from datetime import date, datetime
from types import SimpleNamespace

from fastapi import Response
from httpx import ASGITransport, AsyncClient
import pytest
import mysql.connector

from auth.router import login
from config import AppSettings, SESSION_COOKIE
from main import create_app
from models import VaccineCreateUpdate
from patients.router import get_me
from security import hash_password, hash_session_token
from vaccines.router import get_vaccines


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
        elif sql.startswith("SELECT patient_id FROM patients WHERE user_id"):
            self.result = next(
                (
                    {"patient_id": patient["patient_id"]}
                    for patient in self.database.patients.values()
                    if patient["user_id"] == parameters[0]
                ),
                None,
            )
        elif sql.startswith("UPDATE users SET display_name"):
            display_name, user_id = parameters
            if self.database.fail_user_update:
                self.database.fail_user_update = False
                raise mysql.connector.Error("Falha simulada")
            self.database.users[user_id]["display_name"] = display_name
            self.rowcount = 1
        elif sql.startswith("UPDATE patients SET nome_paciente"):
            preferred_name, user_id = parameters
            patient = next(
                patient
                for patient in self.database.patients.values()
                if patient["user_id"] == user_id
            )
            patient["nome_paciente"] = preferred_name
            self.rowcount = 1
        elif sql.startswith("SELECT * FROM patients WHERE patient_id"):
            self.result = deepcopy(self.database.patients.get(parameters[0]))
        elif "FROM vaccines WHERE patient_id" in sql:
            vaccines = [
                deepcopy(vaccine)
                for vaccine in self.database.vaccines
                if vaccine["patient_id"] == parameters[0]
            ]
            if "AS vaccine_id" in sql:
                self.result = [
                    {
                        "vaccine_id": vaccine["id_vacina"],
                        "name": vaccine["nome_vacina"],
                        "dose": vaccine["dose"],
                        "administered_on": vaccine["data_aplicacao"],
                        "status": vaccine["status_vacina"],
                    }
                    for vaccine in vaccines
                ]
            else:
                self.result = vaccines
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
        self.snapshot = (
            deepcopy(database.users),
            deepcopy(database.patients),
        )

    def cursor(self, dictionary=False):
        return FakeCursor(self.database)

    def commit(self):
        self.database.commits += 1

    def rollback(self):
        self.database.rollbacks += 1
        self.database.users, self.database.patients = deepcopy(self.snapshot)

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
        self.fail_user_update = False

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


async def test_login_de_paciente_retorna_somente_identidade_sem_dashboard(
    client, identity_database
):
    response = await client.post(
        "/login",
        data={"username": "ana@example.com", "password": VALID_PASSWORD},
    )

    assert response.status_code == 200
    assert response.json() == {
        "user": {
            "user_id": 1,
            "display_name": "Ana da Silva",
            "email": "ana@example.com",
            "roles": ["patient"],
        }
    }
    assert list(identity_database.sessions.values()) == [1]
    assert not any(
        "FROM vaccines" in statement
        or "FROM alerts" in statement
        or "FROM documents" in statement
        for statement, _ in identity_database.executed
    )


async def test_usuario_pode_atualizar_seu_nome_de_exibicao(client, identity_database):
    identity_database.create_session(1)
    client.cookies.set(SESSION_COOKIE, "valid-session")

    response = await client.patch(
        "/me/profile",
        json={"display_name": "Ana Costa"},
    )

    assert response.status_code == 200
    assert response.json()["user"]["display_name"] == "Ana Costa"


async def test_paciente_atualiza_nome_preferido_sem_alterar_nome_civil(
    client, identity_database
):
    identity_database.create_session(1)
    client.cookies.set(SESSION_COOKIE, "valid-session")

    response = await client.patch(
        "/me/profile",
        json={"preferred_name": "Aninha"},
    )

    assert response.status_code == 200
    assert response.json()["patient_profile"]["preferred_name"] == "Aninha"
    assert response.json()["patient_profile"]["full_name"] == "Ana da Silva"


async def test_atualizacao_rejeita_campos_protegidos_sem_alterar_conta(
    client, identity_database
):
    identity_database.create_session(1)
    client.cookies.set(SESSION_COOKIE, "valid-session")

    response = await client.patch(
        "/me/profile",
        json={"display_name": "Nome falso", "user_id": 2, "email": "attacker@example.com"},
    )

    assert response.status_code == 422
    assert identity_database.users[1]["display_name"] == "Ana da Silva"
    assert identity_database.users[2]["display_name"] == "Dr. Rui Lima"


async def test_usuario_sem_perfil_paciente_nao_pode_alterar_nome_preferido(
    client, identity_database
):
    identity_database.create_session(2)
    client.cookies.set(SESSION_COOKIE, "valid-session")

    response = await client.patch(
        "/me/profile",
        json={"preferred_name": "Outro"},
    )

    assert response.status_code == 422
    assert identity_database.patients[10]["nome_paciente"] == "Ana"


async def test_atualizacao_com_payload_vazio_ou_nome_acima_do_limite_e_rejeitada(
    client, identity_database
):
    identity_database.create_session(1)
    client.cookies.set(SESSION_COOKIE, "valid-session")

    empty_response = await client.patch("/me/profile", json={})
    long_name_response = await client.patch(
        "/me/profile",
        json={"display_name": "N" * 101},
    )
    long_preferred_name_response = await client.patch(
        "/me/profile",
        json={"preferred_name": "A" * 21},
    )

    assert empty_response.status_code == 422
    assert long_name_response.status_code == 422
    assert long_preferred_name_response.status_code == 422
    assert identity_database.users[1]["display_name"] == "Ana da Silva"


async def test_atualizacao_combinada_faz_rollback_se_um_update_falha(
    client, identity_database
):
    identity_database.create_session(1)
    identity_database.fail_user_update = True
    client.cookies.set(SESSION_COOKIE, "valid-session")

    response = await client.patch(
        "/me/profile",
        json={"display_name": "Ana Costa", "preferred_name": "Aninha"},
    )

    assert response.status_code == 503
    assert identity_database.users[1]["display_name"] == "Ana da Silva"
    assert identity_database.patients[10]["nome_paciente"] == "Ana"
    assert identity_database.rollbacks == 1


async def test_atualizacao_de_perfil_exige_sessao(client):
    response = await client.patch(
        "/me/profile",
        json={"display_name": "Ana Costa"},
    )

    assert response.status_code == 401


async def test_cors_permite_preflight_patch_apenas_na_origem_configurada(client):
    response = await client.options(
        "/me/profile",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "PATCH",
            "Access-Control-Request-Headers": "content-type",
        },
    )

    assert response.status_code == 200
    assert "PATCH" in response.headers["access-control-allow-methods"]

    rejected = await client.options(
        "/me/profile",
        headers={
            "Origin": "https://unexpected.example",
            "Access-Control-Request-Method": "PATCH",
            "Access-Control-Request-Headers": "content-type",
        },
    )

    assert rejected.status_code == 400
    assert "access-control-allow-origin" not in rejected.headers


def test_contrato_de_login_minimo_nao_retorna_dashboard(identity_database):
    response = Response()
    result = login(
        response=response,
        form_data=SimpleNamespace(
            username="ana@example.com",
            password=VALID_PASSWORD,
        ),
        settings=AppSettings.from_mapping({}),
        connection=identity_database.connect(),
    )

    assert result == {
        "user": {
            "user_id": 1,
            "display_name": "Ana da Silva",
            "email": "ana@example.com",
            "roles": ["patient"],
        }
    }


def test_me_retorna_somente_identidade_e_perfil_normalizado(identity_database):
    result = get_me(
        user={
            "user_id": 1,
            "display_name": "Ana da Silva",
            "email": "ana@example.com",
            "roles": ["patient"],
        },
        connection=identity_database.connect(),
    )

    assert result == {
        "user": {
            "user_id": 1,
            "display_name": "Ana da Silva",
            "email": "ana@example.com",
            "roles": ["patient"],
        },
        "patient_profile": {
            "preferred_name": "Ana",
            "full_name": "Ana da Silva",
            "avatar_url": None,
            "health_status": "updated",
            "blood_type": "O+",
            "is_adult": True,
            "age": 36,
        },
    }
    assert not any(
        "FROM vaccines" in statement
        or "FROM alerts" in statement
        or "FROM documents" in statement
        for statement, _ in identity_database.executed
    )


def test_listagem_de_vacinas_usa_contrato_em_ingles(identity_database):
    result = get_vaccines(
        patient=identity_database.patients[10],
        connection=identity_database.connect(),
    )

    assert result == [
        {
            "vaccine_id": 1,
            "name": "BCG",
            "dose": "Dose única",
            "administered_on": date(2025, 1, 15),
            "status": "applied",
        }
    ]


def test_payload_de_vacina_usa_campos_em_ingles():
    payload = VaccineCreateUpdate(
        name="Tríplice viral",
        dose="Reforço",
        administered_on=date(2026, 8, 20),
        status="applied",
    )

    assert payload.model_dump() == {
        "name": "Tríplice viral",
        "dose": "Reforço",
        "administered_on": date(2026, 8, 20),
        "status": "applied",
    }


async def test_login_profissional_nao_consulta_nem_retorna_dados_clinicos(
    client, identity_database
):
    response = await client.post(
        "/login",
        data={"username": "rui@example.com", "password": VALID_PASSWORD},
    )

    assert response.status_code == 200
    assert response.json() == {
        "user": {
            "user_id": 2,
            "display_name": "Dr. Rui Lima",
            "email": "rui@example.com",
            "roles": ["doctor"],
        }
    }
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
