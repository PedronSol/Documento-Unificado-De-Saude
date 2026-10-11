from copy import deepcopy
from datetime import date

from httpx import ASGITransport, AsyncClient
import mysql.connector
import pytest

from config import AppSettings, SESSION_COOKIE
from main import create_app
from security import verify_password


pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend():
    return "asyncio"


class RegistrationCursor:
    def __init__(self, database):
        self.database = database
        self.lastrowid = None

    def execute(self, statement, parameters=None):
        sql = " ".join(statement.split())
        parameters = parameters or ()
        self.database.executed.append((sql, parameters))

        if sql.startswith("INSERT INTO users"):
            user_id = self.database.next_user_id
            cpf, display_name, email, password_hash = parameters
            if any(
                user["cpf"] == cpf or user["email"] == email
                for user in self.database.users.values()
            ):
                raise mysql.connector.IntegrityError(
                    msg="duplicate",
                    errno=1062,
                )
            self.database.next_user_id += 1
            self.database.users[user_id] = {
                "user_id": user_id,
                "cpf": cpf,
                "display_name": display_name,
                "email": email,
                "password_hash": password_hash,
                "active": True,
            }
            self.lastrowid = user_id
        elif sql.startswith("INSERT INTO user_roles"):
            user_id, role = parameters
            self.database.roles[user_id] = [role]
        elif sql.startswith("INSERT INTO patients"):
            user_id, preferred_name, full_name, health_status, birth_date = parameters
            patient_id = self.database.next_patient_id
            self.database.next_patient_id += 1
            self.database.patients[patient_id] = {
                "patient_id": patient_id,
                "user_id": user_id,
                "nome_paciente": preferred_name,
                "nome_completo": full_name,
                "status_saude": health_status,
                "data_nascimento": birth_date,
            }
            self.lastrowid = patient_id
        elif sql.startswith("DELETE FROM sessions WHERE expires_at"):
            return
        elif sql.startswith("INSERT INTO sessions"):
            token_hash, user_id, expires_at = parameters
            self.database.sessions[token_hash] = {
                "user_id": user_id,
                "expires_at": expires_at,
            }
        elif sql.startswith("INSERT INTO clinical_audit_events"):
            if self.database.fail_audit:
                raise mysql.connector.Error("audit unavailable")
            self.database.audit_events.append(parameters)
        else:
            raise AssertionError(f"SQL não caracterizado: {sql}")

    def close(self):
        pass


class RegistrationConnection:
    def __init__(self, database):
        self.database = database
        self.snapshot = deepcopy(database.state)

    def cursor(self, dictionary=False):
        return RegistrationCursor(self.database)

    def commit(self):
        self.database.commits += 1

    def rollback(self):
        self.database.restore(self.snapshot)
        self.database.rollbacks += 1

    def close(self):
        pass


class RegistrationDatabase:
    def __init__(self):
        self.users = {}
        self.roles = {}
        self.patients = {}
        self.sessions = {}
        self.audit_events = []
        self.executed = []
        self.next_user_id = 1
        self.next_patient_id = 10
        self.commits = 0
        self.rollbacks = 0
        self.fail_audit = False

    @property
    def state(self):
        return (
            self.users,
            self.roles,
            self.patients,
            self.sessions,
            self.audit_events,
            self.next_user_id,
            self.next_patient_id,
        )

    def restore(self, state):
        (
            self.users,
            self.roles,
            self.patients,
            self.sessions,
            self.audit_events,
            self.next_user_id,
            self.next_patient_id,
        ) = deepcopy(state)

    def connect(self):
        return RegistrationConnection(self)


@pytest.fixture
def registration_database():
    return RegistrationDatabase()


@pytest.fixture
async def client(registration_database):

    application = create_app(
        settings=AppSettings.from_mapping({}),
        connection_factory=registration_database.connect,
    )
    async with AsyncClient(
        transport=ASGITransport(app=application),
        base_url="http://testserver",
    ) as test_client:
        yield test_client


async def test_patient_can_start_local_registration(client, registration_database):
    response = await client.post(
        "/auth/patient-registration",
        json={
            "email": " NOVO.PACIENTE@example.com ",
            "password": "senha-local-segura",
            "cpf": "529.982.247-25",
            "display_name": "Carlos da Silva",
            "preferred_name": "Carlos",
            "birth_date": "1985-04-12",
        },
    )

    assert response.status_code == 201
    assert response.json() == {
        "user": {
            "user_id": 1,
            "display_name": "Carlos da Silva",
            "email": "novo.paciente@example.com",
            "roles": ["patient"],
        }
    }
    assert response.cookies.get(SESSION_COOKIE)

    stored_user = registration_database.users[1]
    assert stored_user["cpf"] == "52998224725"
    assert stored_user["email"] == "novo.paciente@example.com"
    assert stored_user["password_hash"] != "senha-local-segura"
    assert verify_password("senha-local-segura", stored_user["password_hash"])
    assert registration_database.roles == {1: ["patient"]}
    assert registration_database.patients[10] == {
        "patient_id": 10,
        "user_id": 1,
        "nome_paciente": "Carlos",
        "nome_completo": "Carlos da Silva",
        "status_saude": "pending",
        "data_nascimento": date(1985, 4, 12),
    }
    assert list(registration_database.sessions.values())[0]["user_id"] == 1
    assert registration_database.audit_events[0][0:6] == (
        "user",
        1,
        10,
        "patient.registered",
        "patient",
        10,
    )
    assert "novo.paciente@example.com" not in str(
        registration_database.audit_events
    )
    assert "52998224725" not in str(registration_database.audit_events)
    assert "senha-local-segura" not in str(registration_database.executed)
    assert registration_database.commits == 1


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("password", "curta"),
        ("password", " " * 12),
        ("password", "x" * 129),
        ("cpf", "111.111.111-11"),
        ("cpf", "٥٢٩٩٨٢٢٤٧25"),
        ("birth_date", "2999-01-01"),
        ("display_name", "   "),
        ("preferred_name", "   "),
    ],
)
async def test_local_registration_rejects_invalid_data_without_writes(
    client,
    registration_database,
    field,
    value,
):
    payload = {
        "email": "novo.paciente@example.com",
        "password": "senha-local-segura",
        "cpf": "529.982.247-25",
        "display_name": "Carlos da Silva",
        "preferred_name": "Carlos",
        "birth_date": "1985-04-12",
    }
    payload[field] = value

    response = await client.post("/auth/patient-registration", json=payload)

    assert response.status_code == 422
    assert registration_database.executed == []


async def test_local_registration_rejects_role_and_professional_fields(
    client,
    registration_database,
):
    response = await client.post(
        "/auth/patient-registration",
        json={
            "email": "novo.paciente@example.com",
            "password": "senha-local-segura",
            "cpf": "529.982.247-25",
            "display_name": "Carlos da Silva",
            "preferred_name": "Carlos",
            "birth_date": "1985-04-12",
            "role": "doctor",
            "crm": "12345",
        },
    )

    assert response.status_code == 422
    assert registration_database.executed == []


async def test_local_registration_conflict_is_generic_and_atomic(
    client,
    registration_database,
):
    payload = {
        "email": "novo.paciente@example.com",
        "password": "senha-local-segura",
        "cpf": "529.982.247-25",
        "display_name": "Carlos da Silva",
        "preferred_name": "Carlos",
        "birth_date": "1985-04-12",
    }
    first = await client.post("/auth/patient-registration", json=payload)
    second = await client.post("/auth/patient-registration", json=payload)

    assert first.status_code == 201
    assert second.status_code == 409
    assert second.json() == {"detail": "Dados cadastrais já utilizados."}
    assert len(registration_database.users) == 1
    assert len(registration_database.patients) == 1
    assert registration_database.rollbacks == 1


async def test_local_registration_rolls_back_when_audit_fails(
    client,
    registration_database,
):
    registration_database.fail_audit = True

    response = await client.post(
        "/auth/patient-registration",
        json={
            "email": "novo.paciente@example.com",
            "password": "senha-local-segura",
            "cpf": "529.982.247-25",
            "display_name": "Carlos da Silva",
            "preferred_name": "Carlos",
            "birth_date": "1985-04-12",
        },
    )

    assert response.status_code == 503
    assert registration_database.users == {}
    assert registration_database.roles == {}
    assert registration_database.patients == {}
    assert registration_database.sessions == {}
    assert registration_database.rollbacks == 1
