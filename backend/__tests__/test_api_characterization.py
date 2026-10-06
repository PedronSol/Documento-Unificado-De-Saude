from copy import deepcopy
from datetime import date, datetime, timedelta, timezone

from httpx import ASGITransport, AsyncClient
import pytest

from config import AppSettings, SESSION_COOKIE
from main import create_app
from security import hash_password, hash_session_token


PATIENT_ID = 10
OTHER_PATIENT_ID = 20
VALID_PASSWORD = "senha-forte"
pytestmark = pytest.mark.anyio


class FakeCursor:
    def __init__(self, database, *, dictionary=False):
        self.database = database
        self.dictionary = dictionary
        self.result = None
        self.rowcount = 0
        self.lastrowid = None

    def execute(self, statement, parameters=None):
        sql = " ".join(statement.split())
        parameters = parameters or ()
        self.database.executed.append((sql, parameters))
        self.rowcount = 0

        if sql.startswith("SELECT * FROM users WHERE email"):
            user = next(
                (
                    item
                    for item in self.database.users.values()
                    if item["email"] == parameters[0]
                ),
                None,
            )
            self.result = deepcopy(user)
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
        elif sql.startswith("SELECT id_vacina AS vaccine_id") and "FOR UPDATE" in sql:
            vaccine_id, patient_id = parameters
            vaccine = next(
                (
                    deepcopy(item)
                    for item in self.database.vaccines
                    if item["id_vacina"] == vaccine_id
                    and item["patient_id"] == patient_id
                ),
                None,
            )
            self.result = (
                {
                    "vaccine_id": vaccine["id_vacina"],
                    "name": vaccine["nome_vacina"],
                    "dose": vaccine["dose"],
                    "administered_on": vaccine["data_aplicacao"],
                    "status": vaccine["status_vacina"],
                }
                if vaccine
                else None
            )
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
            self.result = [
                {
                    "alert_id": alert["id_alerta"],
                    "type": alert["tipo_alerta"],
                    "title": alert["titulo_alerta"],
                    "description": alert["descricao_alerta"],
                    "severity": alert["severidade_alerta"],
                }
                for alert in self.database.alerts
                if alert["patient_id"] == parameters[0]
            ]
        elif "FROM documents WHERE patient_id" in sql:
            self.result = [
                {
                    "document_id": document["id_documento"],
                    "title": document["titulo_documento"],
                    "type": document["tipo_documento"],
                    "created_on": document["data_criacao_documento"],
                    "status": document["status_documento"],
                }
                for document in self.database.documents
                if document["patient_id"] == parameters[0]
            ]
        elif sql.startswith("DELETE FROM sessions WHERE expires_at"):
            self.rowcount = 0
        elif sql.startswith("INSERT INTO sessions"):
            token_hash, user_id, _expires_at = parameters
            self.database.sessions[token_hash] = user_id
            self.rowcount = 1
        elif sql.startswith("DELETE FROM sessions WHERE token_hash"):
            self.rowcount = int(self.database.sessions.pop(parameters[0], None) is not None)
        elif sql.startswith("INSERT INTO vaccines"):
            patient_id, name, dose, applied_at, vaccine_status = parameters
            next_id = max(
                (vaccine["id_vacina"] for vaccine in self.database.vaccines),
                default=0,
            ) + 1
            self.database.vaccines.append(
                {
                    "id_vacina": next_id,
                    "patient_id": patient_id,
                    "nome_vacina": name,
                    "dose": dose,
                    "data_aplicacao": applied_at,
                    "status_vacina": vaccine_status,
                }
            )
            self.rowcount = 1
            self.lastrowid = next_id
        elif sql.startswith("INSERT INTO clinical_audit_events"):
            self.database.audit_events.append(parameters)
            self.rowcount = 1
        elif sql.startswith("UPDATE vaccines"):
            name, dose, applied_at, vaccine_status, vaccine_id, patient_id = parameters
            for vaccine in self.database.vaccines:
                if (
                    vaccine["id_vacina"] == vaccine_id
                    and vaccine["patient_id"] == patient_id
                ):
                    vaccine.update(
                        nome_vacina=name,
                        dose=dose,
                        data_aplicacao=applied_at,
                        status_vacina=vaccine_status,
                    )
                    self.rowcount = 1
                    break
        elif sql.startswith("DELETE FROM vaccines"):
            vaccine_id, patient_id = parameters
            original_size = len(self.database.vaccines)
            self.database.vaccines = [
                vaccine
                for vaccine in self.database.vaccines
                if not (
                    vaccine["id_vacina"] == vaccine_id
                    and vaccine["patient_id"] == patient_id
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
        self.users = {
            1: {
                "user_id": 1,
                "cpf": "12345678901",
                "display_name": "Ana da Silva",
                "email": "ana@example.com",
                "password_hash": hash_password(VALID_PASSWORD),
                "active": True,
                "created_at": datetime(2026, 1, 1),
            }
        }
        self.roles = {1: ["patient"]}
        self.doctors = {}
        self.patients = {
            PATIENT_ID: {
                "patient_id": PATIENT_ID,
                "user_id": 1,
                "nome_paciente": "Ana",
                "nome_completo": "Ana da Silva",
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
                "patient_id": PATIENT_ID,
                "nome_vacina": "Hepatite B",
                "dose": "1ª dose",
                "data_aplicacao": date(2025, 1, 15),
                "status_vacina": "applied",
            },
            {
                "id_vacina": 2,
                "patient_id": OTHER_PATIENT_ID,
                "nome_vacina": "BCG",
                "dose": "Dose única",
                "data_aplicacao": date(2025, 2, 1),
                "status_vacina": "applied",
            },
        ]
        self.alerts = [
            {
                "id_alerta": 1,
                "patient_id": PATIENT_ID,
                "tipo_alerta": "allergy",
                "titulo_alerta": "Alergia",
                "descricao_alerta": "Alergia a sulfa",
                "severidade_alerta": "high",
            }
        ]
        self.documents = [
            {
                "id_documento": 1,
                "patient_id": PATIENT_ID,
                "titulo_documento": "Hemograma",
                "tipo_documento": "exam",
                "data_criacao_documento": date(2025, 3, 1),
                "status_documento": "new",
            }
        ]
        self.audit_events = []
        self.executed = []
        self.commits = 0
        self.rollbacks = 0
        self.closed_cursors = 0
        self.closed_connections = 0

    def connect(self):
        return FakeConnection(self)

    def create_session(self, raw_token="valid-session"):
        self.sessions[hash_session_token(raw_token)] = 1
        return raw_token


@pytest.fixture
def fake_database():
    return FakeDatabase()


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def client(fake_database):
    application = create_app(
        settings=AppSettings.from_mapping({}),
        connection_factory=fake_database.connect,
    )
    async with AsyncClient(
        transport=ASGITransport(app=application),
        base_url="http://testserver",
    ) as test_client:
        yield test_client


def authenticate(client, database):
    raw_token = database.create_session()
    client.cookies.set(SESSION_COOKIE, raw_token)


async def test_login_returns_only_identity_and_cookie(client, fake_database):
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
        },
    }
    cookie = response.headers["set-cookie"]
    assert f"{SESSION_COOKIE}=" in cookie
    assert "HttpOnly" in cookie
    assert "SameSite=lax" in cookie
    assert "Path=/" in cookie
    assert len(fake_database.sessions) == 1
    assert all(raw_token not in fake_database.sessions for raw_token in client.cookies.values())


async def test_invalid_login_preserves_generic_error(client, fake_database):
    response = await client.post(
        "/login",
        data={"username": "ana@example.com", "password": "senha-errada"},
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "E-mail ou senha incorretos."}
    assert fake_database.sessions == {}


async def test_logout_removes_session_and_cookie(client, fake_database):
    authenticate(client, fake_database)

    response = await client.post("/logout")

    assert response.status_code == 204
    assert fake_database.sessions == {}
    assert f'{SESSION_COOKIE}=""' in response.headers["set-cookie"]


async def test_logout_without_cookie_does_not_access_database(
    client, fake_database
):
    response = await client.post("/logout")

    assert response.status_code == 204
    assert fake_database.executed == []


async def test_me_returns_only_sanitized_profile(client, fake_database):
    authenticate(client, fake_database)

    response = await client.get("/me")

    assert response.status_code == 200
    assert response.json() == {
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
            "age": date.today().year - 1990,
        },
    }


async def test_patient_resources_are_loaded_from_separate_endpoints(
    client, fake_database
):
    authenticate(client, fake_database)

    vaccines = await client.get("/me/vaccines")
    alerts = await client.get("/me/alerts")
    documents = await client.get("/me/documents")

    assert vaccines.json() == [
        {
            "vaccine_id": 1,
            "name": "Hepatite B",
            "dose": "1ª dose",
            "administered_on": "2025-01-15",
            "status": "applied",
        }
    ]
    assert alerts.json() == [
        {
            "alert_id": 1,
            "type": "allergy",
            "title": "Alergia",
            "description": "Alergia a sulfa",
            "severity": "high",
        }
    ]
    assert documents.json() == [
        {
            "document_id": 1,
            "title": "Hemograma",
            "type": "exam",
            "created_on": "2025-03-01",
            "status": "new",
        }
    ]


async def test_missing_session_preserves_unauthorized_contract(client, fake_database):
    response = await client.get("/me")

    assert response.status_code == 401
    assert response.json() == {"detail": "Autenticação necessária."}
    assert fake_database.executed == []


async def test_vaccine_crud_preserves_routes_messages_and_ownership(
    client, fake_database
):
    authenticate(client, fake_database)
    create_payload = {
        "name": "Tríplice viral",
        "dose": "Reforço",
        "administered_on": "2026-08-20",
        "status": "applied",
    }

    list_response = await client.get("/me/vaccines")
    create_response = await client.post("/me/vaccines", json=create_payload)
    created_id = max(vaccine["id_vacina"] for vaccine in fake_database.vaccines)
    update_response = await client.put(
        f"/me/vaccines/{created_id}",
        json={**create_payload, "dose": "2ª dose"},
    )
    delete_response = await client.delete(f"/me/vaccines/{created_id}")
    other_patient_response = await client.delete("/me/vaccines/2")

    assert list_response.status_code == 200
    assert [vaccine["vaccine_id"] for vaccine in list_response.json()] == [1]
    assert create_response.status_code == 201
    assert create_response.json() == {"message": "Vacina registrada com sucesso!"}
    assert update_response.status_code == 200
    assert update_response.json() == {"message": "Vacina atualizada com sucesso!"}
    assert delete_response.status_code == 200
    assert delete_response.json() == {"message": "Vacina removida com sucesso!"}
    assert other_patient_response.status_code == 404
    assert other_patient_response.json() == {"detail": "Vacina não encontrada."}
    assert any(vaccine["id_vacina"] == 2 for vaccine in fake_database.vaccines)
    assert [event[3] for event in fake_database.audit_events] == [
        "vaccine.created",
        "vaccine.updated",
        "vaccine.deleted",
    ]
    assert all(event[0:3] == ("user", 1, PATIENT_ID) for event in fake_database.audit_events)


async def test_minor_cannot_mutate_vaccines(client, fake_database):
    fake_database.patients[PATIENT_ID]["data_nascimento"] = (
        datetime.now(timezone.utc).date() - timedelta(days=10 * 365)
    )
    authenticate(client, fake_database)

    response = await client.delete("/me/vaccines/1")

    assert response.status_code == 403
    assert response.json() == {
        "detail": "Menores de idade não podem alterar o prontuário."
    }
    assert any(vaccine["id_vacina"] == 1 for vaccine in fake_database.vaccines)
    assert fake_database.audit_events == []


async def test_login_keeps_sql_injection_payload_out_of_statement(
    client, fake_database
):
    malicious_email = "' OR 1=1 --"

    response = await client.post(
        "/login",
        data={"username": malicious_email, "password": "irrelevant"},
    )

    statement, parameters = fake_database.executed[0]
    assert response.status_code == 401
    assert malicious_email not in statement
    assert parameters == (malicious_email,)
    assert fake_database.sessions == {}


async def test_session_token_is_hashed_before_parameterized_query(
    client, fake_database
):
    malicious_token = "' OR 1=1 --"
    client.cookies.set(SESSION_COOKIE, malicious_token)

    response = await client.get("/me")

    statement, parameters = fake_database.executed[0]
    assert response.status_code == 401
    assert malicious_token not in statement
    assert parameters == (hash_session_token(malicious_token),)


async def test_vaccine_payload_is_sent_as_query_parameters(client, fake_database):
    authenticate(client, fake_database)
    malicious_name = "BCG', status_vacina='overdue"

    response = await client.post(
        "/me/vaccines",
        json={
            "name": malicious_name,
            "dose": "Dose única; DROP TABLE vacinas",
            "administered_on": "2026-08-20",
            "status": "applied",
        },
    )

    statement, parameters = next(
        item
        for item in fake_database.executed
        if item[0].startswith("INSERT INTO vaccines")
    )
    assert response.status_code == 201
    assert malicious_name not in statement
    assert parameters[1] == malicious_name
    assert "DROP TABLE" not in statement
    assert parameters[2] == "Dose única; DROP TABLE vacinas"


async def test_sql_fragment_in_vaccine_id_is_rejected_before_mutation(
    client, fake_database
):
    authenticate(client, fake_database)

    response = await client.delete("/me/vaccines/1%20OR%201=1")

    assert response.status_code == 422
    assert not any(
        statement.startswith("DELETE FROM vaccines")
        for statement, _parameters in fake_database.executed
    )
    assert any(vaccine["id_vacina"] == 1 for vaccine in fake_database.vaccines)
