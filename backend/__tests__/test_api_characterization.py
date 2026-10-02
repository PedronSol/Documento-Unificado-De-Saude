from copy import deepcopy
from datetime import date, datetime, timedelta, timezone

from fastapi.testclient import TestClient
import mysql.connector
import pytest

from config import SESSION_COOKIE
from main import app
from security import hash_password, hash_session_token


PATIENT_CPF = "12345678901"
OTHER_PATIENT_CPF = "98765432100"
VALID_PASSWORD = "senha-forte"


class FakeCursor:
    def __init__(self, database, *, dictionary=False):
        self.database = database
        self.dictionary = dictionary
        self.result = None
        self.rowcount = 0

    def execute(self, statement, parameters=None):
        sql = " ".join(statement.split())
        parameters = parameters or ()
        self.database.executed.append((sql, parameters))
        self.rowcount = 0

        if sql.startswith("SELECT * FROM pacientes WHERE email"):
            patient = next(
                (
                    item
                    for item in self.database.patients.values()
                    if item["email"] == parameters[0]
                ),
                None,
            )
            self.result = deepcopy(patient)
        elif sql.startswith("SELECT p.* FROM sessoes"):
            cpf = self.database.sessions.get(parameters[0])
            self.result = deepcopy(self.database.patients.get(cpf))
        elif sql.startswith("SELECT * FROM pacientes WHERE cpf_paciente"):
            self.result = deepcopy(self.database.patients.get(parameters[0]))
        elif "FROM vacinas WHERE paciente_id" in sql:
            self.result = [
                deepcopy(vaccine)
                for vaccine in self.database.vaccines
                if vaccine["paciente_id"] == parameters[0]
            ]
        elif "FROM alertas WHERE paciente_id" in sql:
            self.result = deepcopy(self.database.alerts)
        elif "FROM documentos WHERE paciente_id" in sql:
            self.result = deepcopy(self.database.documents)
        elif sql.startswith("DELETE FROM sessoes WHERE expira_em"):
            self.rowcount = 0
        elif sql.startswith("INSERT INTO sessoes"):
            token_hash, cpf, _expires_at = parameters
            self.database.sessions[token_hash] = cpf
            self.rowcount = 1
        elif sql.startswith("DELETE FROM sessoes WHERE token_hash"):
            self.rowcount = int(self.database.sessions.pop(parameters[0], None) is not None)
        elif sql.startswith("INSERT INTO vacinas"):
            cpf, name, dose, applied_at, vaccine_status = parameters
            next_id = max(
                (vaccine["id_vacina"] for vaccine in self.database.vaccines),
                default=0,
            ) + 1
            self.database.vaccines.append(
                {
                    "id_vacina": next_id,
                    "paciente_id": cpf,
                    "nome_vacina": name,
                    "dose": dose,
                    "data_aplicacao": applied_at,
                    "status_vacina": vaccine_status,
                }
            )
            self.rowcount = 1
        elif sql.startswith("UPDATE vacinas"):
            name, dose, applied_at, vaccine_status, vaccine_id, cpf = parameters
            for vaccine in self.database.vaccines:
                if (
                    vaccine["id_vacina"] == vaccine_id
                    and vaccine["paciente_id"] == cpf
                ):
                    vaccine.update(
                        nome_vacina=name,
                        dose=dose,
                        data_aplicacao=applied_at,
                        status_vacina=vaccine_status,
                    )
                    self.rowcount = 1
                    break
        elif sql.startswith("DELETE FROM vacinas"):
            vaccine_id, cpf = parameters
            original_size = len(self.database.vaccines)
            self.database.vaccines = [
                vaccine
                for vaccine in self.database.vaccines
                if not (
                    vaccine["id_vacina"] == vaccine_id
                    and vaccine["paciente_id"] == cpf
                )
            ]
            self.rowcount = original_size - len(self.database.vaccines)
        else:
            raise AssertionError(f"SQL não caracterizado: {sql}")

    def fetchone(self):
        return self.result

    def fetchall(self):
        return self.result

    def close(self):
        self.database.closed_cursors += 1


class FakeConnection:
    def __init__(self, database):
        self.database = database

    def cursor(self, dictionary=False):
        return FakeCursor(self.database, dictionary=dictionary)

    def commit(self):
        self.database.commits += 1

    def rollback(self):
        self.database.rollbacks += 1

    def close(self):
        self.database.closed_connections += 1


class FakeDatabase:
    def __init__(self):
        self.patients = {
            PATIENT_CPF: {
                "cpf_paciente": PATIENT_CPF,
                "nome_paciente": "Ana",
                "nome_completo": "Ana da Silva",
                "email": "ana@example.com",
                "senha_hash": hash_password(VALID_PASSWORD),
                "avatar": None,
                "status_saude": "updated",
                "tipo_sanguineo": "O+",
                "valor_qr": None,
                "criado_em": datetime(2026, 1, 1),
                "data_nascimento": date(1990, 5, 10),
            }
        }
        self.sessions = {}
        self.vaccines = [
            {
                "id_vacina": 1,
                "paciente_id": PATIENT_CPF,
                "nome_vacina": "Hepatite B",
                "dose": "1ª dose",
                "data_aplicacao": date(2025, 1, 15),
                "status_vacina": "applied",
            },
            {
                "id_vacina": 2,
                "paciente_id": OTHER_PATIENT_CPF,
                "nome_vacina": "BCG",
                "dose": "Dose única",
                "data_aplicacao": date(2025, 2, 1),
                "status_vacina": "applied",
            },
        ]
        self.alerts = [
            {
                "id_alerta": 1,
                "tipo_alerta": "allergy",
                "titulo_alerta": "Alergia",
                "descricao_alerta": "Alergia a sulfa",
                "severidade_alerta": "high",
            }
        ]
        self.documents = [
            {
                "id_documento": 1,
                "titulo_documento": "Hemograma",
                "tipo_documento": "exam",
                "data_criacao_documento": date(2025, 3, 1),
                "status_documento": "new",
            }
        ]
        self.executed = []
        self.commits = 0
        self.rollbacks = 0
        self.closed_cursors = 0
        self.closed_connections = 0

    def connect(self, **_kwargs):
        return FakeConnection(self)

    def create_session(self, raw_token="valid-session"):
        self.sessions[hash_session_token(raw_token)] = PATIENT_CPF
        return raw_token


@pytest.fixture
def fake_database(monkeypatch):
    database = FakeDatabase()
    monkeypatch.setattr(mysql.connector, "connect", database.connect)
    return database


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


def authenticate(client, database):
    raw_token = database.create_session()
    client.cookies.set(SESSION_COOKIE, raw_token)


def test_login_preserves_dashboard_and_cookie_contract(client, fake_database):
    response = client.post(
        "/login",
        data={"username": "ana@example.com", "password": VALID_PASSWORD},
    )

    assert response.status_code == 200
    assert response.json() == {
        "message": "Login efetuado com sucesso!",
        "patient_data": {
            "cpf_paciente": PATIENT_CPF,
            "nome_paciente": "Ana",
            "nome_completo": "Ana da Silva",
            "email": "ana@example.com",
            "avatar": None,
            "status_saude": "updated",
            "tipo_sanguineo": "O+",
            "valor_qr": None,
            "maior_de_idade": True,
            "idade": date.today().year - 1990,
        },
        "vaccines": [
            {
                "id_vacina": 1,
                "nome_vacina": "Hepatite B",
                "dose": "1ª dose",
                "data_aplicacao": "2025-01-15",
                "status_vacina": "applied",
            }
        ],
        "alerts": fake_database.alerts,
        "documents": [
            {
                **fake_database.documents[0],
                "data_criacao_documento": "2025-03-01",
            }
        ],
    }
    cookie = response.headers["set-cookie"]
    assert f"{SESSION_COOKIE}=" in cookie
    assert "HttpOnly" in cookie
    assert "SameSite=lax" in cookie
    assert "Path=/" in cookie
    assert len(fake_database.sessions) == 1
    assert all(raw_token not in fake_database.sessions for raw_token in client.cookies.values())


def test_invalid_login_preserves_generic_error(client, fake_database):
    response = client.post(
        "/login",
        data={"username": "ana@example.com", "password": "senha-errada"},
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "E-mail ou senha incorretos."}
    assert fake_database.sessions == {}


def test_logout_removes_session_and_cookie(client, fake_database):
    authenticate(client, fake_database)

    response = client.post("/logout")

    assert response.status_code == 204
    assert fake_database.sessions == {}
    assert f'{SESSION_COOKIE}=""' in response.headers["set-cookie"]


def test_logout_without_cookie_does_not_access_database(client, monkeypatch):
    def unavailable_database(**_kwargs):
        raise mysql.connector.Error("offline")

    monkeypatch.setattr(mysql.connector, "connect", unavailable_database)

    response = client.post("/logout")

    assert response.status_code == 204


def test_me_preserves_sanitized_dashboard_contract(client, fake_database):
    authenticate(client, fake_database)

    response = client.get("/me")

    assert response.status_code == 200
    assert response.json()["message"] == "Sessão válida."
    assert "senha_hash" not in response.json()["patient_data"]
    assert "data_nascimento" not in response.json()["patient_data"]
    assert response.json()["vaccines"][0]["id_vacina"] == 1


def test_missing_session_preserves_unauthorized_contract(client, fake_database):
    response = client.get("/me")

    assert response.status_code == 401
    assert response.json() == {"detail": "Autenticação necessária."}
    assert fake_database.executed == []


def test_vaccine_crud_preserves_routes_messages_and_ownership(client, fake_database):
    authenticate(client, fake_database)
    create_payload = {
        "nome_vacina": "Tríplice viral",
        "dose": "Reforço",
        "data_aplicacao": "2026-08-20",
        "status_vacina": "applied",
    }

    list_response = client.get("/me/vaccines")
    create_response = client.post("/me/vaccines", json=create_payload)
    created_id = max(vaccine["id_vacina"] for vaccine in fake_database.vaccines)
    update_response = client.put(
        f"/me/vaccines/{created_id}",
        json={**create_payload, "dose": "2ª dose"},
    )
    delete_response = client.delete(f"/me/vaccines/{created_id}")
    other_patient_response = client.delete("/me/vaccines/2")

    assert list_response.status_code == 200
    assert [vaccine["id_vacina"] for vaccine in list_response.json()] == [1]
    assert create_response.status_code == 201
    assert create_response.json() == {"message": "Vacina registrada com sucesso!"}
    assert update_response.status_code == 200
    assert update_response.json() == {"message": "Vacina atualizada com sucesso!"}
    assert delete_response.status_code == 200
    assert delete_response.json() == {"message": "Vacina removida com sucesso!"}
    assert other_patient_response.status_code == 404
    assert other_patient_response.json() == {"detail": "Vacina não encontrada."}
    assert any(vaccine["id_vacina"] == 2 for vaccine in fake_database.vaccines)


def test_minor_cannot_mutate_vaccines(client, fake_database):
    fake_database.patients[PATIENT_CPF]["data_nascimento"] = (
        datetime.now(timezone.utc).date() - timedelta(days=10 * 365)
    )
    authenticate(client, fake_database)

    response = client.delete("/me/vaccines/1")

    assert response.status_code == 403
    assert response.json() == {
        "detail": "Menores de idade não podem alterar o prontuário."
    }
    assert any(vaccine["id_vacina"] == 1 for vaccine in fake_database.vaccines)


def test_login_keeps_sql_injection_payload_out_of_statement(client, fake_database):
    malicious_email = "' OR 1=1 --"

    response = client.post(
        "/login",
        data={"username": malicious_email, "password": "irrelevant"},
    )

    statement, parameters = fake_database.executed[0]
    assert response.status_code == 401
    assert malicious_email not in statement
    assert parameters == (malicious_email,)
    assert fake_database.sessions == {}


def test_session_token_is_hashed_before_parameterized_query(client, fake_database):
    malicious_token = "' OR 1=1 --"
    client.cookies.set(SESSION_COOKIE, malicious_token)

    response = client.get("/me")

    statement, parameters = fake_database.executed[0]
    assert response.status_code == 401
    assert malicious_token not in statement
    assert parameters == (hash_session_token(malicious_token),)


def test_vaccine_payload_is_sent_as_query_parameters(client, fake_database):
    authenticate(client, fake_database)
    malicious_name = "BCG', status_vacina='overdue"

    response = client.post(
        "/me/vaccines",
        json={
            "nome_vacina": malicious_name,
            "dose": "Dose única; DROP TABLE vacinas",
            "data_aplicacao": "2026-08-20",
            "status_vacina": "applied",
        },
    )

    statement, parameters = next(
        item
        for item in fake_database.executed
        if item[0].startswith("INSERT INTO vacinas")
    )
    assert response.status_code == 201
    assert malicious_name not in statement
    assert parameters[1] == malicious_name
    assert "DROP TABLE" not in statement
    assert parameters[2] == "Dose única; DROP TABLE vacinas"


def test_sql_fragment_in_vaccine_id_is_rejected_before_mutation(client, fake_database):
    authenticate(client, fake_database)

    response = client.delete("/me/vaccines/1%20OR%201=1")

    assert response.status_code == 422
    assert not any(
        statement.startswith("DELETE FROM vacinas")
        for statement, _parameters in fake_database.executed
    )
    assert any(vaccine["id_vacina"] == 1 for vaccine in fake_database.vaccines)
