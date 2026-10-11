from copy import deepcopy
from datetime import date

from httpx import ASGITransport, AsyncClient
import pytest

from config import AppSettings
from main import create_app
from security import hash_session_token


pytestmark = pytest.mark.anyio


class GoogleAuthCursor:
    def __init__(self, database):
        self.database = database
        self.result = None
        self.lastrowid = None

    def execute(self, statement, parameters=None):
        sql = " ".join(statement.split())
        parameters = parameters or ()
        self.database.executed.append((sql, parameters))

        if "FROM external_identities" in sql:
            issuer, subject = parameters
            user_id = self.database.identities.get((issuer, subject))
            user = self.database.users.get(user_id)
            self.result = deepcopy(user)
        elif sql.startswith("SELECT u.user_id, u.display_name, u.email"):
            session = self.database.sessions.get(parameters[0])
            user = self.database.users.get(session["user_id"]) if session else None
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
        elif sql.startswith("INSERT INTO users"):
            user_id = self.database.next_user_id
            self.database.next_user_id += 1
            cpf, display_name, email = parameters
            self.database.users[user_id] = {
                "user_id": user_id,
                "cpf": cpf,
                "display_name": display_name,
                "email": email,
                "password_hash": None,
                "active": True,
            }
            self.lastrowid = user_id
        elif sql.startswith("INSERT INTO external_identities"):
            user_id, provider, issuer, subject = parameters
            assert provider == "google"
            self.database.identities[(issuer, subject)] = user_id
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
        elif sql.startswith("INSERT INTO clinical_audit_events"):
            self.database.audit_events.append(parameters)
        elif sql.startswith("DELETE FROM sessions WHERE expires_at"):
            return
        elif sql.startswith("INSERT INTO sessions"):
            token_hash, user_id, expires_at = parameters
            self.database.sessions[token_hash] = {
                "user_id": user_id,
                "expires_at": expires_at,
            }
        elif sql.startswith("SELECT role FROM user_roles"):
            self.result = [
                {"role": role}
                for role in self.database.roles.get(parameters[0], [])
            ]
        else:
            raise AssertionError(f"SQL não caracterizado: {sql}")

    def fetchone(self):
        return self.result

    def fetchall(self):
        return self.result

    def close(self):
        pass


class GoogleAuthConnection:
    def __init__(self, database):
        self.database = database
        self.snapshot = deepcopy(database.state)

    def cursor(self, dictionary=False):
        return GoogleAuthCursor(self.database)

    def commit(self):
        self.database.commits += 1

    def rollback(self):
        self.database.restore(self.snapshot)
        self.database.rollbacks += 1

    def close(self):
        pass


class GoogleAuthDatabase:
    def __init__(self):
        self.identities = {}
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

    @property
    def state(self):
        return (
            self.identities,
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
            self.identities,
            self.users,
            self.roles,
            self.patients,
            self.sessions,
            self.audit_events,
            self.next_user_id,
            self.next_patient_id,
        ) = deepcopy(state)

    def connect(self):
        return GoogleAuthConnection(self)

    def seed_local_patient(self, raw_session="local-session"):
        self.users[1] = {
            "user_id": 1,
            "cpf": "52998224725",
            "display_name": "Paciente Local",
            "email": "local@example.com",
            "password_hash": "hash-local",
            "active": True,
        }
        self.roles[1] = ["patient"]
        self.patients[10] = {
            "patient_id": 10,
            "user_id": 1,
            "nome_paciente": "Paciente",
            "nome_completo": "Paciente Local",
            "status_saude": "pending",
            "data_nascimento": date(1990, 1, 1),
        }
        self.sessions[hash_session_token(raw_session)] = {
            "user_id": 1,
            "expires_at": None,
        }
        self.next_user_id = 2
        self.next_patient_id = 11
        return raw_session


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
def google_claims():
    return {
        "iss": "https://accounts.google.com",
        "sub": "google-subject-123",
        "email": "novo.paciente@example.com",
        "email_verified": True,
        "name": "Novo Paciente",
    }


async def test_new_google_identity_requires_onboarding_without_creating_account(
    google_claims,
):
    database = GoogleAuthDatabase()
    verified_credentials = []

    def verifier(credential):
        verified_credentials.append(credential)
        return google_claims

    application = create_app(
        settings=AppSettings.from_mapping(
            {
                "GOOGLE_AUTH_ENABLED": "true",
                "GOOGLE_CLIENT_ID": "client-id.apps.googleusercontent.com",
            }
        ),
        connection_factory=database.connect,
        google_identity_verifier=verifier,
    )
    async with AsyncClient(
        transport=ASGITransport(app=application),
        base_url="http://testserver",
    ) as client:
        response = await client.post(
            "/auth/google",
            json={"credential": "signed-google-id-token"},
        )

    assert response.status_code == 200
    assert response.json() == {"status": "onboarding_required"}
    assert verified_credentials == ["signed-google-id-token"]
    assert len(database.executed) == 1


async def test_google_onboarding_creates_patient_without_local_password(
    google_claims,
):
    database = GoogleAuthDatabase()

    application = create_app(
        settings=AppSettings.from_mapping(
            {
                "GOOGLE_AUTH_ENABLED": "true",
                "GOOGLE_CLIENT_ID": "client-id.apps.googleusercontent.com",
            }
        ),
        connection_factory=database.connect,
        google_identity_verifier=lambda _credential: google_claims,
    )
    async with AsyncClient(
        transport=ASGITransport(app=application),
        base_url="http://testserver",
    ) as client:
        response = await client.post(
            "/auth/google/patient-registration",
            json={
                "credential": "signed-google-id-token",
                "cpf": "529.982.247-25",
                "preferred_name": "Novo",
                "birth_date": "1992-09-20",
            },
        )

    assert response.status_code == 201
    assert response.json() == {
        "user": {
            "user_id": 1,
            "display_name": "Novo Paciente",
            "email": "novo.paciente@example.com",
            "roles": ["patient"],
        }
    }
    assert database.users[1]["password_hash"] is None
    assert database.identities == {
        ("https://accounts.google.com", "google-subject-123"): 1
    }
    assert database.roles == {1: ["patient"]}
    assert database.patients[10]["data_nascimento"] == date(1992, 9, 20)
    assert list(database.sessions.values())[0]["user_id"] == 1
    assert database.audit_events[0][0:6] == (
        "user",
        1,
        10,
        "patient.registered",
        "patient",
        10,
    )
    assert "signed-google-id-token" not in str(database.executed)
    assert database.commits == 1


async def test_authenticated_local_patient_can_explicitly_link_google(
    google_claims,
):
    database = GoogleAuthDatabase()
    raw_session = database.seed_local_patient()
    application = create_app(
        settings=AppSettings.from_mapping(
            {
                "GOOGLE_AUTH_ENABLED": "true",
                "GOOGLE_CLIENT_ID": "client-id.apps.googleusercontent.com",
            }
        ),
        connection_factory=database.connect,
        google_identity_verifier=lambda _credential: google_claims,
    )

    async with AsyncClient(
        transport=ASGITransport(app=application),
        base_url="http://testserver",
    ) as client:
        client.cookies.set("dus_session", raw_session)
        response = await client.post(
            "/me/external-identities/google",
            json={"credential": "signed-google-id-token"},
        )

    assert response.status_code == 204
    assert database.identities == {
        ("https://accounts.google.com", "google-subject-123"): 1
    }
    assert database.users[1]["email"] == "local@example.com"
    assert database.audit_events[-1][0:6] == (
        "user",
        1,
        10,
        "external_identity.linked",
        "patient",
        10,
    )
    assert "signed-google-id-token" not in str(database.executed)


async def test_known_google_identity_creates_local_session(google_claims):
    database = GoogleAuthDatabase()
    database.users[1] = {
        "user_id": 1,
        "cpf": "52998224725",
        "display_name": "Novo Paciente",
        "email": "novo.paciente@example.com",
        "password_hash": None,
        "active": True,
    }
    database.roles[1] = ["patient"]
    database.identities[
        ("https://accounts.google.com", "google-subject-123")
    ] = 1
    application = create_app(
        settings=AppSettings.from_mapping(
            {
                "GOOGLE_AUTH_ENABLED": "true",
                "GOOGLE_CLIENT_ID": "client-id.apps.googleusercontent.com",
            }
        ),
        connection_factory=database.connect,
        google_identity_verifier=lambda _credential: google_claims,
    )

    async with AsyncClient(
        transport=ASGITransport(app=application),
        base_url="http://testserver",
    ) as client:
        response = await client.post(
            "/auth/google",
            json={"credential": "fresh-signed-google-token"},
        )

    assert response.status_code == 200
    assert response.json()["user"] == {
        "user_id": 1,
        "display_name": "Novo Paciente",
        "email": "novo.paciente@example.com",
        "roles": ["patient"],
    }
    assert list(database.sessions.values())[0]["user_id"] == 1
    assert "fresh-signed-google-token" not in str(database.executed)


@pytest.mark.parametrize(
    "claims_or_error",
    [
        ValueError("expired"),
        ValueError("invalid signature"),
        ValueError("invalid audience"),
        ValueError("invalid issuer"),
        {
            "iss": "https://accounts.google.com",
            "sub": "subject",
            "email": "person@example.com",
            "email_verified": False,
            "name": "Person",
        },
        {
            "iss": "https://accounts.google.com",
            "sub": "subject",
            "email": "not-an-email",
            "email_verified": True,
            "name": "Person",
        },
        {
            "iss": "https://accounts.google.com",
            "sub": "subject",
            "email": "person@example.com",
            "email_verified": True,
            "name": "N" * 101,
        },
    ],
)
async def test_invalid_google_credential_is_generic_and_does_not_access_database(
    claims_or_error,
):
    database = GoogleAuthDatabase()

    def verifier(_credential):
        if isinstance(claims_or_error, Exception):
            raise claims_or_error
        return claims_or_error

    application = create_app(
        settings=AppSettings.from_mapping(
            {
                "GOOGLE_AUTH_ENABLED": "true",
                "GOOGLE_CLIENT_ID": "client-id.apps.googleusercontent.com",
            }
        ),
        connection_factory=database.connect,
        google_identity_verifier=verifier,
    )
    async with AsyncClient(
        transport=ASGITransport(app=application),
        base_url="http://testserver",
    ) as client:
        response = await client.post(
            "/auth/google",
            json={"credential": "invalid-token"},
        )

    assert response.status_code == 401
    assert response.json() == {"detail": "Credencial Google inválida."}
    assert database.executed == []
