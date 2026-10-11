import hashlib
import itertools
import json
import os
from pathlib import Path
from uuid import uuid4

from fastapi.testclient import TestClient
import pytest

from config import AppSettings
from database_admin import AdminBootstrapError, create_admin, seed_database
from database_config import DatabaseSettings, create_database_engine
from main import create_app
from migration_service import upgrade_database


PROJECT_ROOT = Path(__file__).resolve().parents[2]
SEED_PASSWORD = "senha123"

pytestmark = pytest.mark.skipif(
    os.getenv("RUN_DB_INTEGRATION") != "1",
    reason="Requer MySQL real com RUN_DB_INTEGRATION=1",
)

_cpf_sequence = itertools.count(100_000_000)


def make_cpf() -> str:
    digits = [int(char) for char in f"{next(_cpf_sequence):09d}"]
    for length in (9, 10):
        total = sum(
            digit * weight
            for digit, weight in zip(digits, range(length + 1, 1, -1))
        )
        remainder = total * 10 % 11
        digits.append(0 if remainder == 10 else remainder)
    return "".join(str(digit) for digit in digits)


_crm_sequence = itertools.count(500_000)


def make_crm() -> str:
    return str(next(_crm_sequence))


def google_credential(email: str, subject: str | None = None, **claims) -> str:
    return json.dumps(
        {
            "iss": "https://accounts.google.com",
            "sub": subject or f"subject-{uuid4().hex}",
            "email": email,
            "email_verified": True,
            "name": "Pessoa Convidada",
            **claims,
        }
    )


@pytest.fixture(scope="module")
def database():
    database_name = f"dus_admin_test_{uuid4().hex[:12]}"
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
            "GOOGLE_AUTH_ENABLED": "true",
            "GOOGLE_CLIENT_ID": "client-id.apps.googleusercontent.com",
        }
    )
    application = create_app(
        settings=app_settings,
        google_identity_verifier=lambda credential: json.loads(credential),
    )
    clients = []

    def build() -> TestClient:
        client = TestClient(application)
        clients.append(client)
        return client

    yield build
    for client in clients:
        client.close()


def login(make_client, email: str, password: str = SEED_PASSWORD) -> TestClient:
    client = make_client()
    response = client.post(
        "/login",
        data={"username": email, "password": password},
    )
    assert response.status_code == 200, response.text
    return client


def fetch_one(engine, statement: str, parameters=()):
    with engine.connect() as connection:
        return connection.exec_driver_sql(statement, parameters).mappings().first()


def invitation_payload(**overrides) -> dict:
    return {
        "cpf": make_cpf(),
        "display_name": "Dra. Ana Lima",
        "email": f"medica.{uuid4().hex[:10]}@example.com",
        "crm_number": make_crm(),
        "crm_state": "SP",
        **overrides,
    }


def test_admin_issues_single_use_doctor_invitation(make_client, engine):
    admin = login(make_client, "admin@email.com")
    payload = invitation_payload()

    response = admin.post("/admin/doctor-invitations", json=payload)

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["status"] == "pending"
    assert len(body["token"]) >= 43
    stored = fetch_one(
        engine,
        """
        SELECT di.token_hash, di.status, di.email, di.created_by_admin_user_id,
               TIMESTAMPDIFF(DAY, UTC_TIMESTAMP(6), di.expires_at) AS days_left
        FROM doctor_invitations di
        WHERE di.doctor_invitation_id = %s
        """,
        (body["invitation_id"],),
    )
    admin_user = fetch_one(
        engine, "SELECT user_id FROM users WHERE email = 'admin@email.com'"
    )
    assert stored["token_hash"] == hashlib.sha256(
        body["token"].encode("utf-8")
    ).hexdigest()
    assert stored["status"] == "pending"
    assert stored["email"] == payload["email"]
    assert stored["created_by_admin_user_id"] == admin_user["user_id"]
    assert stored["days_left"] == 6


def test_bootstrap_creates_exclusive_admin_and_refuses_duplicates(engine):
    email = f"gestor.{uuid4().hex[:10]}@example.com"
    cpf = make_cpf()

    create_admin(
        engine,
        email=f"  {email.upper()} ",
        cpf=cpf,
        display_name="Gestor Bootstrap",
        password="senha-admin-segura",
    )
    with pytest.raises(AdminBootstrapError):
        create_admin(
            engine,
            email=email,
            cpf=make_cpf(),
            display_name="Outro Gestor",
            password="senha-admin-segura",
        )
    with pytest.raises(AdminBootstrapError):
        create_admin(
            engine,
            email="curta@example.com",
            cpf=make_cpf(),
            display_name="Senha Curta",
            password="curta",
        )

    user = fetch_one(
        engine,
        """
        SELECT u.password_hash, GROUP_CONCAT(ur.role) AS roles
        FROM users u
        JOIN user_roles ur ON ur.user_id = u.user_id
        WHERE u.email = %s
        GROUP BY u.user_id
        """,
        (email,),
    )
    assert user["roles"] == "admin"
    assert user["password_hash"].startswith("pbkdf2_sha256$")
    assert fetch_one(
        engine,
        "SELECT COUNT(*) AS total FROM users WHERE email = 'curta@example.com'",
    )["total"] == 0


def new_admin(engine, make_client) -> TestClient:
    email = f"gestor.{uuid4().hex[:10]}@example.com"
    create_admin(
        engine,
        email=email,
        cpf=make_cpf(),
        display_name="Gestor Secundário",
        password="senha-admin-segura",
    )
    return login(make_client, email, "senha-admin-segura")


def issue_invitation(admin: TestClient, **overrides) -> tuple[dict, dict]:
    payload = invitation_payload(**overrides)
    response = admin.post("/admin/doctor-invitations", json=payload)
    assert response.status_code == 201, response.text
    return payload, response.json()


def claim(client: TestClient, token: str, email: str, subject: str | None = None):
    return client.post(
        "/auth/google/doctor-invitation",
        json={
            "credential": google_credential(email, subject),
            "invitation_token": token,
        },
    )


def test_doctor_invitation_requires_admin_and_rejects_duplicates(
    make_client, engine
):
    admin = login(make_client, "admin@email.com")
    patient = login(make_client, "carlos.silva@email.com")
    payload, _created = issue_invitation(admin)

    anonymous = make_client().post("/admin/doctor-invitations", json=payload)
    as_patient = patient.post("/admin/doctor-invitations", json=payload)
    same_email = admin.post(
        "/admin/doctor-invitations",
        json=invitation_payload(email=payload["email"]),
    )
    same_cpf = admin.post(
        "/admin/doctor-invitations",
        json=invitation_payload(cpf=payload["cpf"]),
    )
    existing_crm = admin.post(
        "/admin/doctor-invitations",
        json=invitation_payload(crm_number="100001", crm_state="RN"),
    )
    extra_field = admin.post(
        "/admin/doctor-invitations",
        json={**invitation_payload(), "role": "admin"},
    )

    assert anonymous.status_code == 401
    assert as_patient.status_code == 403
    assert same_email.status_code == 409
    assert same_cpf.status_code == 409
    assert existing_crm.status_code == 409
    assert extra_field.status_code == 422


def test_admin_lists_and_revokes_only_own_doctor_invitations(make_client, engine):
    admin = login(make_client, "admin@email.com")
    other_admin = new_admin(engine, make_client)
    payload, created = issue_invitation(admin)

    own_list = admin.get("/admin/doctor-invitations")
    other_list = other_admin.get("/admin/doctor-invitations")
    other_revoke = other_admin.delete(
        f"/admin/doctor-invitations/{created['invitation_id']}"
    )
    own_revoke = admin.delete(f"/admin/doctor-invitations/{created['invitation_id']}")
    repeated_revoke = admin.delete(
        f"/admin/doctor-invitations/{created['invitation_id']}"
    )
    claim_after_revoke = claim(make_client(), created["token"], payload["email"])

    assert own_list.status_code == 200
    listed = {
        item["invitation_id"]: item for item in own_list.json()["items"]
    }[created["invitation_id"]]
    assert listed["status"] == "pending"
    assert listed["email"] == payload["email"]
    assert "token" not in listed and "token_hash" not in listed
    assert other_list.json()["items"] == []
    assert other_revoke.status_code == 404
    assert own_revoke.status_code == 204
    assert repeated_revoke.status_code == 404
    assert claim_after_revoke.status_code == 403


def test_doctor_claims_invitation_with_matching_google_identity(make_client, engine):
    admin = login(make_client, "admin@email.com")
    payload, created = issue_invitation(admin)
    doctor = make_client()

    response = claim(doctor, created["token"], payload["email"])
    medical_access = doctor.get("/medical/patients")
    reused = claim(make_client(), created["token"], payload["email"])

    assert response.status_code == 201, response.text
    assert response.json()["user"]["roles"] == []
    assert medical_access.status_code == 403
    assert reused.status_code == 403
    stored = fetch_one(
        engine,
        """
        SELECT u.password_hash, u.cpf, u.display_name, d.verification_status,
               d.professional_status, d.crm_number,
               d.created_by_admin_user_id, di.status AS invitation_status,
               di.accepted_user_id = u.user_id AS accepted_by_user,
               admin.email AS admin_email,
               (SELECT COUNT(*) FROM external_identities ei
                WHERE ei.user_id = u.user_id) AS identities,
               (SELECT GROUP_CONCAT(role) FROM user_roles ur
                WHERE ur.user_id = u.user_id) AS roles
        FROM users u
        JOIN doctors d ON d.user_id = u.user_id
        JOIN doctor_invitations di ON di.doctor_invitation_id = %s
        JOIN users admin ON admin.user_id = d.created_by_admin_user_id
        WHERE u.email = %s
        """,
        (created["invitation_id"], payload["email"]),
    )
    assert stored["password_hash"] is None
    assert stored["cpf"] == payload["cpf"]
    assert stored["display_name"] == payload["display_name"]
    assert stored["verification_status"] == "pending"
    assert stored["professional_status"] == "active"
    assert stored["crm_number"] == payload["crm_number"]
    assert stored["admin_email"] == "admin@email.com"
    assert stored["invitation_status"] == "accepted"
    assert stored["accepted_by_user"] == 1
    assert stored["identities"] == 1
    assert stored["roles"] == "doctor"


def test_google_without_valid_invitation_never_creates_doctor(make_client, engine):
    admin = login(make_client, "admin@email.com")
    payload, created = issue_invitation(admin)
    _expired_payload, expired = issue_invitation(admin)
    with engine.begin() as connection:
        connection.exec_driver_sql(
            """
            UPDATE doctor_invitations
            SET expires_at = UTC_TIMESTAMP(6) - INTERVAL 1 MINUTE
            WHERE doctor_invitation_id = %s
            """,
            (expired["invitation_id"],),
        )

    wrong_email = claim(make_client(), created["token"], "outra@example.com")
    unknown_token = claim(make_client(), "x" * 43, payload["email"])
    expired_token = claim(make_client(), expired["token"], _expired_payload["email"])
    unverified_email = make_client().post(
        "/auth/google/doctor-invitation",
        json={
            "credential": google_credential(payload["email"], email_verified=False),
            "invitation_token": created["token"],
        },
    )

    assert wrong_email.status_code == 403
    assert unknown_token.status_code == 403
    assert expired_token.status_code == 403
    assert unverified_email.status_code == 401
    assert fetch_one(
        engine,
        "SELECT COUNT(*) AS total FROM users WHERE email IN (%s, %s, %s)",
        (payload["email"], _expired_payload["email"], "outra@example.com"),
    )["total"] == 0
    assert fetch_one(
        engine,
        "SELECT status FROM doctor_invitations WHERE doctor_invitation_id = %s",
        (created["invitation_id"],),
    )["status"] == "pending"


def test_existing_account_must_claim_with_its_own_google_identity(
    make_client, engine
):
    admin = login(make_client, "admin@email.com")
    patient_email = f"paciente.medica.{uuid4().hex[:8]}@example.com"
    patient_cpf = make_cpf()
    subject = f"subject-{uuid4().hex}"
    patient = make_client()
    registered = patient.post(
        "/auth/google/patient-registration",
        json={
            "credential": google_credential(patient_email, subject),
            "cpf": patient_cpf,
            "preferred_name": "Ana",
            "birth_date": "1980-03-02",
        },
    )
    assert registered.status_code == 201, registered.text
    _local_payload, local_conflict = issue_invitation(
        admin, email="mariana.souza@email.com"
    )
    _mismatch_payload, mismatch = issue_invitation(admin, email=patient_email)

    local_account = claim(
        make_client(), local_conflict["token"], "mariana.souza@email.com"
    )
    other_cpf = claim(make_client(), mismatch["token"], patient_email, subject)
    admin.delete(f"/admin/doctor-invitations/{mismatch['invitation_id']}")
    _payload, created = issue_invitation(admin, email=patient_email, cpf=patient_cpf)
    linked = claim(make_client(), created["token"], patient_email, subject)

    assert local_account.status_code == 409
    assert other_cpf.status_code == 409
    assert linked.status_code == 201, linked.text
    assert linked.json()["user"]["roles"] == ["patient"]
    roles = fetch_one(
        engine,
        """
        SELECT GROUP_CONCAT(ur.role ORDER BY ur.role) AS roles
        FROM user_roles ur JOIN users u ON u.user_id = ur.user_id
        WHERE u.email = %s
        """,
        (patient_email,),
    )
    assert set(roles["roles"].split(",")) == {"doctor", "patient"}


def test_concurrent_claims_accept_doctor_invitation_once(make_client, engine):
    from concurrent.futures import ThreadPoolExecutor

    admin = login(make_client, "admin@email.com")
    payload, created = issue_invitation(admin)
    clients = [make_client(), make_client()]

    with ThreadPoolExecutor(max_workers=2) as executor:
        responses = list(
            executor.map(
                lambda client: claim(client, created["token"], payload["email"]),
                clients,
            )
        )

    assert sorted(response.status_code for response in responses) in (
        [201, 403],
        [201, 409],
    )
    assert fetch_one(
        engine,
        "SELECT COUNT(*) AS total FROM doctors d JOIN users u "
        "ON u.user_id = d.user_id WHERE u.email = %s",
        (payload["email"],),
    )["total"] == 1


def onboard_doctor(make_client, admin: TestClient) -> tuple[TestClient, dict, int]:
    payload, created = issue_invitation(admin)
    doctor = make_client()
    response = claim(doctor, created["token"], payload["email"])
    assert response.status_code == 201, response.text
    doctor_id = admin.get("/admin/doctors").json()["items"]
    match = next(item for item in doctor_id if item["crm_number"] == payload["crm_number"])
    return doctor, payload, match["doctor_id"]


def seed_doctor_id(engine, email: str) -> int:
    return fetch_one(
        engine,
        "SELECT d.doctor_id FROM doctors d JOIN users u ON u.user_id = d.user_id "
        "WHERE u.email = %s",
        (email,),
    )["doctor_id"]


def test_admin_manages_only_doctors_created_by_them(make_client, engine):
    admin = login(make_client, "admin@email.com")
    other_admin = new_admin(engine, make_client)
    doctor = login(make_client, "marcos.nunes@email.com")
    helena_id = seed_doctor_id(engine, "helena.costa@email.com")

    own = admin.get("/admin/doctors")
    detail = admin.get(f"/admin/doctors/{helena_id}")
    foreign_detail = other_admin.get(f"/admin/doctors/{helena_id}")
    unknown_detail = other_admin.get("/admin/doctors/999999")
    foreign_patch = other_admin.patch(
        f"/admin/doctors/{helena_id}",
        json={"crm_number": "999999", "crm_state": "SP"},
    )
    foreign_status = other_admin.post(
        f"/admin/doctors/{helena_id}/status", json={"action": "suspend"}
    )
    as_doctor = doctor.get("/admin/doctors")

    assert own.status_code == 200
    emails = {item["display_name"] for item in own.json()["items"]}
    assert {"Dra. Helena Costa", "Dr. Marcos Nunes", "Dra. Paula Reis"} <= emails
    assert detail.status_code == 200
    assert detail.json() == {
        "doctor_id": helena_id,
        "display_name": "Dra. Helena Costa",
        "masked_cpf": detail.json()["masked_cpf"],
        "crm_number": "100001",
        "crm_state": "RN",
        "verification_status": "verified",
        "professional_status": "active",
        "verified_at": detail.json()["verified_at"],
    }
    assert detail.json()["masked_cpf"].startswith("***.")
    assert detail.json()["masked_cpf"].endswith("-**")
    assert other_admin.get("/admin/doctors").json()["items"] == []
    assert foreign_detail.status_code == 404
    assert foreign_detail.json() == unknown_detail.json()
    assert foreign_patch.status_code == 404
    assert foreign_status.status_code == 404
    assert as_doctor.status_code == 403
    assert fetch_one(
        engine, "SELECT crm_number FROM doctors WHERE doctor_id = %s", (helena_id,)
    )["crm_number"] == "100001"


def test_doctor_status_transitions_take_effect_on_next_request(make_client, engine):
    admin = login(make_client, "admin@email.com")
    doctor, _payload, doctor_id = onboard_doctor(make_client, admin)
    with engine.begin() as connection:
        connection.exec_driver_sql(
            """
            INSERT INTO doctor_care_groups (
                care_group_id, doctor_id, status, starts_at, ends_at
            ) VALUES (1, %s, 'active', UTC_TIMESTAMP(6), NULL)
            """,
            (doctor_id,),
        )

    def act(action: str):
        return admin.post(f"/admin/doctors/{doctor_id}/status", json={"action": action})

    pending_access = doctor.get("/medical/patients")
    reactivate_active = act("reactivate")
    verified = act("verify")
    verified_access = doctor.get("/medical/patients")
    verify_again = act("verify")
    suspended = act("suspend")
    suspended_access = doctor.get("/medical/patients")
    reactivated = act("reactivate")
    reactivated_access = doctor.get("/medical/patients")
    deactivated = act("deactivate")
    deactivated_access = doctor.get("/medical/patients")
    reactivate_deactivated = act("reactivate")
    unknown_action = act("promote")

    assert pending_access.status_code == 403
    assert reactivate_active.status_code == 409
    assert verified.status_code == 200
    assert verified.json()["verification_status"] == "verified"
    assert verified.json()["verified_at"] is not None
    assert verified_access.status_code == 200
    assert len(verified_access.json()) >= 1
    assert verify_again.status_code == 409
    assert suspended.json()["professional_status"] == "suspended"
    assert suspended_access.status_code == 403
    assert reactivated.json()["professional_status"] == "active"
    assert reactivated_access.status_code == 200
    assert deactivated.json()["professional_status"] == "deactivated"
    assert deactivated_access.status_code == 403
    assert reactivate_deactivated.status_code == 409
    assert unknown_action.status_code == 422
    membership = fetch_one(
        engine,
        "SELECT status, ends_at FROM doctor_care_groups WHERE doctor_id = %s",
        (doctor_id,),
    )
    assert membership["status"] == "inactive"
    assert membership["ends_at"] is not None
    actions = fetch_one(
        engine,
        """
        SELECT GROUP_CONCAT(action ORDER BY administrative_audit_event_id) AS actions
        FROM administrative_audit_events
        WHERE target_type = 'doctor' AND target_id = %s
        """,
        (doctor_id,),
    )["actions"]
    assert actions == (
        "doctor.verified,doctor.suspended,doctor.reactivated,doctor.deactivated"
    )


def test_admin_corrects_crm_and_returns_profile_to_pending(make_client, engine):
    admin = login(make_client, "admin@email.com")
    _doctor, _payload, doctor_id = onboard_doctor(make_client, admin)
    admin.post(f"/admin/doctors/{doctor_id}/status", json={"action": "verify"})
    new_crm = make_crm()

    corrected = admin.patch(
        f"/admin/doctors/{doctor_id}",
        json={"crm_number": new_crm, "crm_state": "RJ"},
    )
    duplicated = admin.patch(
        f"/admin/doctors/{doctor_id}",
        json={"crm_number": "100001", "crm_state": "RN"},
    )
    forbidden_field = admin.patch(
        f"/admin/doctors/{doctor_id}", json={"display_name": "Outro Nome"}
    )

    assert corrected.status_code == 200, corrected.text
    assert corrected.json()["crm_number"] == new_crm
    assert corrected.json()["crm_state"] == "RJ"
    assert corrected.json()["verification_status"] == "pending"
    assert corrected.json()["verified_at"] is None
    assert duplicated.status_code == 409
    assert forbidden_field.status_code == 422


def user_id_of(engine, email: str) -> int:
    return fetch_one(engine, "SELECT user_id FROM users WHERE email = %s", (email,))[
        "user_id"
    ]


def create_group(admin: TestClient, name: str | None = None) -> dict:
    response = admin.post(
        "/admin/care-groups",
        json={"name": name or f"Grupo {uuid4().hex[:8]}"},
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_admin_creates_and_manages_only_own_care_groups(make_client, engine):
    admin = login(make_client, "admin@email.com")
    other_admin = new_admin(engine, make_client)
    group = create_group(admin, "  Cardiologia   Centro ")

    duplicate = admin.post("/admin/care-groups", json={"name": "Cardiologia Centro"})
    other_same_name = other_admin.post(
        "/admin/care-groups", json={"name": "Cardiologia Centro"}
    )
    own_list = admin.get("/admin/care-groups")
    other_list = other_admin.get("/admin/care-groups")
    foreign_detail = other_admin.get(f"/admin/care-groups/{group['care_group_id']}")
    unknown_detail = other_admin.get("/admin/care-groups/999999")
    foreign_patch = other_admin.patch(
        f"/admin/care-groups/{group['care_group_id']}", json={"status": "inactive"}
    )
    renamed = admin.patch(
        f"/admin/care-groups/{group['care_group_id']}",
        json={"name": "Cardiologia Leste", "status": "inactive"},
    )
    seeded = admin.get("/admin/care-groups/1")

    assert group["name"] == "Cardiologia Centro"
    assert group["status"] == "active"
    assert duplicate.status_code == 409
    assert other_same_name.status_code == 201
    own_names = {item["name"] for item in own_list.json()["items"]}
    assert {"Unidade Centro", "Unidade Norte", "Cardiologia Centro"} <= own_names
    assert {item["name"] for item in other_list.json()["items"]} == {
        "Cardiologia Centro"
    }
    assert foreign_detail.status_code == 404
    assert foreign_detail.json() == unknown_detail.json()
    assert foreign_patch.status_code == 404
    assert renamed.json()["name"] == "Cardiologia Leste"
    assert renamed.json()["status"] == "inactive"
    assert seeded.status_code == 200
    assert "Dra. Helena Costa" in {
        doctor["display_name"] for doctor in seeded.json()["doctors"]
    }
    assert seeded.json()["patients"][0]["link_status"] == "active"
    assert set(seeded.json()["patients"][0]) == {
        "user_id",
        "display_name",
        "masked_cpf",
        "link_status",
        "starts_at",
    }


def test_admin_adds_and_removes_only_own_doctors_from_own_groups(
    make_client, engine
):
    admin = login(make_client, "admin@email.com")
    other_admin = new_admin(engine, make_client)
    group = create_group(admin)
    group_id = group["care_group_id"]
    marcos_id = seed_doctor_id(engine, "marcos.nunes@email.com")
    _foreign_doctor, _payload, foreign_doctor_id = onboard_doctor(
        make_client, other_admin
    )
    _retired, _retired_payload, retired_id = onboard_doctor(make_client, admin)
    admin.post(f"/admin/doctors/{retired_id}/status", json={"action": "deactivate"})

    added = admin.put(f"/admin/care-groups/{group_id}/doctors/{marcos_id}")
    added_again = admin.put(f"/admin/care-groups/{group_id}/doctors/{marcos_id}")
    foreign_doctor = admin.put(
        f"/admin/care-groups/{group_id}/doctors/{foreign_doctor_id}"
    )
    foreign_group = other_admin.put(
        f"/admin/care-groups/{group_id}/doctors/{foreign_doctor_id}"
    )
    deactivated = admin.put(f"/admin/care-groups/{group_id}/doctors/{retired_id}")
    detail = admin.get(f"/admin/care-groups/{group_id}")
    removed = admin.delete(f"/admin/care-groups/{group_id}/doctors/{marcos_id}")
    removed_again = admin.delete(f"/admin/care-groups/{group_id}/doctors/{marcos_id}")
    readded = admin.put(f"/admin/care-groups/{group_id}/doctors/{marcos_id}")

    assert added.status_code == 204
    assert added_again.status_code == 204
    assert foreign_doctor.status_code == 404
    assert foreign_group.status_code == 404
    assert deactivated.status_code == 409
    assert [doctor["doctor_id"] for doctor in detail.json()["doctors"]] == [marcos_id]
    assert removed.status_code == 204
    assert removed_again.status_code == 404
    assert readded.status_code == 204
    membership = fetch_one(
        engine,
        "SELECT status, ends_at FROM doctor_care_groups "
        "WHERE care_group_id = %s AND doctor_id = %s",
        (group_id, marcos_id),
    )
    assert membership == {"status": "active", "ends_at": None}


def test_directory_returns_only_allowlisted_active_non_admin_users(
    make_client, engine
):
    admin = login(make_client, "admin@email.com")
    patient = login(make_client, "carlos.silva@email.com")
    carlos_cpf = fetch_one(
        engine,
        "SELECT cpf FROM users WHERE email = 'carlos.silva@email.com'",
    )["cpf"]

    by_name = admin.get("/admin/users", params={"query": "carl"})
    by_cpf = admin.get(
        "/admin/users",
        params={"query": f"{carlos_cpf[:3]}.{carlos_cpf[3:6]}.{carlos_cpf[6:9]}-"
                f"{carlos_cpf[9:]}"},
    )
    helena = admin.get("/admin/users", params={"query": "Dra. Helena"})
    admins = admin.get("/admin/users", params={"query": "Alex"})
    inactive = admin.get("/admin/users", params={"query": "Conta Inativa"})
    wildcard = admin.get("/admin/users", params={"query": "%%%"})
    short = admin.get("/admin/users", params={"query": "ca"})
    missing = admin.get("/admin/users")
    oversized = admin.get("/admin/users", params={"query": "carl", "page_size": 21})
    as_patient = patient.get("/admin/users", params={"query": "carl"})

    assert by_name.status_code == 200
    item = by_name.json()["items"][0]
    assert item == {
        "user_id": user_id_of(engine, "carlos.silva@email.com"),
        "display_name": item["display_name"],
        "profiles": ["patient"],
        "masked_cpf": f"***.{carlos_cpf[3:6]}.{carlos_cpf[6:9]}-**",
    }
    assert carlos_cpf not in by_name.text
    assert by_cpf.json()["items"] == [item]
    assert helena.json()["items"][0]["profiles"] == ["patient", "doctor"]
    assert admins.json()["items"] == []
    assert inactive.json()["items"] == []
    assert wildcard.json()["items"] == []
    assert short.status_code == 422
    assert missing.status_code == 422
    assert oversized.status_code == 422
    assert as_patient.status_code == 403


def register_patient(make_client, birth_date: str = "1985-04-12") -> tuple[TestClient, int]:
    client = make_client()
    email = f"paciente.{uuid4().hex[:10]}@example.com"
    response = client.post(
        "/auth/patient-registration",
        json={
            "email": email,
            "password": "senha-paciente-segura",
            "cpf": make_cpf(),
            "display_name": "Paciente Convidado",
            "preferred_name": "Convidado",
            "birth_date": birth_date,
        },
    )
    assert response.status_code == 201, response.text
    return client, response.json()["user"]["user_id"]


def patient_id_of(engine, user_id: int) -> int:
    return fetch_one(
        engine, "SELECT patient_id FROM patients WHERE user_id = %s", (user_id,)
    )["patient_id"]


def group_with_doctor(make_client, engine, admin: TestClient) -> tuple[int, TestClient]:
    group_id = create_group(admin)["care_group_id"]
    marcos_id = seed_doctor_id(engine, "marcos.nunes@email.com")
    assert admin.put(
        f"/admin/care-groups/{group_id}/doctors/{marcos_id}"
    ).status_code == 204
    return group_id, login(make_client, "marcos.nunes@email.com")


def invite(admin: TestClient, group_id: int, user_id: int):
    return admin.post(
        f"/admin/care-groups/{group_id}/patient-invitations",
        json={"user_id": user_id},
    )


def medical_patient_ids(doctor: TestClient) -> set[int]:
    response = doctor.get("/medical/patients")
    assert response.status_code == 200, response.text
    return {patient["patient_id"] for patient in response.json()["items"]}


def test_pending_care_invitation_grants_no_medical_access(make_client, engine):
    admin = login(make_client, "admin@email.com")
    other_admin = new_admin(engine, make_client)
    group_id, doctor = group_with_doctor(make_client, engine, admin)
    patient, user_id = register_patient(make_client)
    patient_id = patient_id_of(engine, user_id)
    inactive_group = create_group(admin)["care_group_id"]
    admin.patch(f"/admin/care-groups/{inactive_group}", json={"status": "inactive"})

    created = invite(admin, group_id, user_id)
    duplicate = invite(admin, group_id, user_id)
    foreign = invite(other_admin, group_id, user_id)
    to_inactive_group = invite(admin, inactive_group, user_id)
    doctor_only = invite(admin, group_id, user_id_of(engine, "marcos.nunes@email.com"))
    inactive_user = invite(admin, group_id, user_id_of(engine, "inativo@email.com"))
    inbox = patient.get("/me/care-invitations")
    detail = admin.get(f"/admin/care-groups/{group_id}")

    assert created.status_code == 201, created.text
    assert created.json()["status"] == "pending"
    assert duplicate.status_code == 409
    assert foreign.status_code == 404
    assert to_inactive_group.status_code == 409
    assert doctor_only.status_code == 404
    assert inactive_user.status_code == 404
    assert patient_id not in medical_patient_ids(doctor)
    assert doctor.get(f"/medical/patients/{patient_id}").status_code == 403
    assert inbox.status_code == 200
    assert inbox.json()["items"] == [
        {
            "invitation_id": created.json()["invitation_id"],
            "care_group_name": inbox.json()["items"][0]["care_group_name"],
            "expires_at": inbox.json()["items"][0]["expires_at"],
            "doctors": [
                {
                    "display_name": "Dr. Marcos Nunes",
                    "crm_number": "100002",
                    "crm_state": "RN",
                }
            ],
        }
    ]
    assert [item["user_id"] for item in detail.json()["pending_invitations"]] == [
        user_id
    ]
    assert detail.json()["patients"] == []


def test_only_invited_adult_patient_accepts_and_activates_care(make_client, engine):
    admin = login(make_client, "admin@email.com")
    group_id, doctor = group_with_doctor(make_client, engine, admin)
    patient, user_id = register_patient(make_client)
    intruder, _intruder_id = register_patient(make_client)
    minor, minor_id = register_patient(make_client, birth_date="2015-01-01")
    patient_id = patient_id_of(engine, user_id)
    invitation_id = invite(admin, group_id, user_id).json()["invitation_id"]
    minor_invitation = invite(admin, group_id, minor_id).json()["invitation_id"]

    by_intruder = intruder.post(f"/me/care-invitations/{invitation_id}/accept")
    by_minor = minor.post(f"/me/care-invitations/{minor_invitation}/accept")
    minor_inbox = minor.get("/me/care-invitations")
    accepted = patient.post(f"/me/care-invitations/{invitation_id}/accept")
    accepted_again = patient.post(f"/me/care-invitations/{invitation_id}/accept")
    reinvite = invite(admin, group_id, user_id)
    groups = patient.get("/me/care-groups")

    assert by_intruder.status_code == 404
    assert by_minor.status_code == 403
    assert minor_inbox.status_code == 200
    assert len(minor_inbox.json()["items"]) == 1
    assert accepted.status_code == 204
    assert accepted_again.status_code == 404
    assert reinvite.status_code == 409
    assert patient_id in medical_patient_ids(doctor)
    assert doctor.get(f"/medical/patients/{patient_id}").status_code == 200
    assert groups.json()["items"][0]["care_group_id"] == group_id
    assert groups.json()["items"][0]["doctors"][0]["display_name"] == "Dr. Marcos Nunes"
    assert patient.get("/me/care-invitations").json()["items"] == []


def test_rejected_cancelled_or_expired_invitations_never_grant_access(
    make_client, engine
):
    admin = login(make_client, "admin@email.com")
    other_admin = new_admin(engine, make_client)
    group_id, doctor = group_with_doctor(make_client, engine, admin)
    patient, user_id = register_patient(make_client)
    patient_id = patient_id_of(engine, user_id)

    first = invite(admin, group_id, user_id).json()["invitation_id"]
    rejected = patient.post(f"/me/care-invitations/{first}/reject")
    accept_rejected = patient.post(f"/me/care-invitations/{first}/accept")
    second = invite(admin, group_id, user_id).json()["invitation_id"]
    foreign_cancel = other_admin.delete(
        f"/admin/care-groups/{group_id}/patient-invitations/{second}"
    )
    cancelled = admin.delete(
        f"/admin/care-groups/{group_id}/patient-invitations/{second}"
    )
    accept_cancelled = patient.post(f"/me/care-invitations/{second}/accept")
    third = invite(admin, group_id, user_id).json()["invitation_id"]
    with engine.begin() as connection:
        connection.exec_driver_sql(
            "UPDATE care_group_patient_invitations "
            "SET expires_at = UTC_TIMESTAMP(6) - INTERVAL 1 MINUTE "
            "WHERE care_invitation_id = %s",
            (third,),
        )
    accept_expired = patient.post(f"/me/care-invitations/{third}/accept")
    after_expiry = invite(admin, group_id, user_id)

    assert rejected.status_code == 204
    assert accept_rejected.status_code == 404
    assert foreign_cancel.status_code == 404
    assert cancelled.status_code == 204
    assert accept_cancelled.status_code == 404
    assert accept_expired.status_code == 404
    assert after_expiry.status_code == 201
    assert patient_id not in medical_patient_ids(doctor)
    statuses = fetch_one(
        engine,
        """
        SELECT GROUP_CONCAT(status ORDER BY care_invitation_id) AS statuses
        FROM care_group_patient_invitations
        WHERE care_invitation_id IN (%s, %s)
        """,
        (first, second),
    )["statuses"]
    assert statuses == "rejected,cancelled"


def test_patient_or_managing_admin_revokes_care_immediately(make_client, engine):
    admin = login(make_client, "admin@email.com")
    other_admin = new_admin(engine, make_client)
    group_id, doctor = group_with_doctor(make_client, engine, admin)
    patient, user_id = register_patient(make_client)
    patient_id = patient_id_of(engine, user_id)
    first = invite(admin, group_id, user_id).json()["invitation_id"]
    patient.post(f"/me/care-invitations/{first}/accept")

    revoked_by_patient = patient.delete(f"/me/care-groups/{group_id}")
    access_after_patient = doctor.get(f"/medical/patients/{patient_id}")
    revoked_again = patient.delete(f"/me/care-groups/{group_id}")
    second = invite(admin, group_id, user_id).json()["invitation_id"]
    patient.post(f"/me/care-invitations/{second}/accept")
    restored_access = doctor.get(f"/medical/patients/{patient_id}")
    foreign_revoke = other_admin.delete(
        f"/admin/care-groups/{group_id}/patients/{user_id}"
    )
    revoked_by_admin = admin.delete(f"/admin/care-groups/{group_id}/patients/{user_id}")
    access_after_admin = doctor.get(f"/medical/patients/{patient_id}")

    assert revoked_by_patient.status_code == 204
    assert access_after_patient.status_code == 403
    assert revoked_again.status_code == 404
    assert restored_access.status_code == 200
    assert foreign_revoke.status_code == 404
    assert revoked_by_admin.status_code == 204
    assert access_after_admin.status_code == 403
    assert patient.get("/me/care-groups").json()["items"] == []
    admin_user_id = user_id_of(engine, "admin@email.com")
    events = fetch_one(
        engine,
        """
        SELECT GROUP_CONCAT(CONCAT(action, ':', actor_user_id = %s)
                            ORDER BY administrative_audit_event_id) AS events
        FROM administrative_audit_events
        WHERE target_type = 'care_group' AND target_id = %s
          AND managing_admin_user_id = %s
          AND action LIKE 'care_link.%%'
        """,
        (user_id, group_id, admin_user_id),
    )["events"]
    assert events == (
        "care_link.invited:0,care_link.accepted:1,care_link.revoked:1,"
        "care_link.invited:0,care_link.accepted:1,care_link.revoked:0"
    )


def test_concurrent_acceptance_creates_a_single_active_link(make_client, engine):
    from concurrent.futures import ThreadPoolExecutor

    admin = login(make_client, "admin@email.com")
    group_id, _doctor = group_with_doctor(make_client, engine, admin)
    patient, user_id = register_patient(make_client)
    invitation_id = invite(admin, group_id, user_id).json()["invitation_id"]
    cookies = patient.cookies
    clients = [make_client(), make_client()]
    for client in clients:
        client.cookies = cookies

    with ThreadPoolExecutor(max_workers=2) as executor:
        responses = list(
            executor.map(
                lambda client: client.post(
                    f"/me/care-invitations/{invitation_id}/accept"
                ),
                clients,
            )
        )

    assert sorted(response.status_code for response in responses) == [204, 404]
    assert fetch_one(
        engine,
        """
        SELECT COUNT(*) AS total FROM administrative_audit_events
        WHERE action = 'care_link.accepted' AND target_id = %s
          AND actor_user_id = %s
        """,
        (group_id, user_id),
    )["total"] == 1


def test_admin_reads_only_administrative_events_under_their_management(
    make_client, engine
):
    admin = login(make_client, "admin@email.com")
    other_admin = new_admin(engine, make_client)
    payload, created = issue_invitation(other_admin)
    group_id = create_group(admin)["care_group_id"]

    own = admin.get("/admin/audit-events")
    other = other_admin.get("/admin/audit-events")
    as_patient = login(make_client, "carlos.silva@email.com").get("/admin/audit-events")
    oversized = admin.get("/admin/audit-events", params={"page_size": 21})

    assert own.status_code == 200
    first = own.json()["items"][0]
    assert set(first) == {
        "event_id",
        "actor_user_id",
        "action",
        "target_type",
        "target_id",
        "details",
        "occurred_at",
    }
    assert (first["action"], first["target_id"]) == ("care_group.created", group_id)
    assert all(
        item["target_id"] != created["invitation_id"]
        or item["target_type"] != "doctor_invitation"
        for item in own.json()["items"]
    )
    assert [item["action"] for item in other.json()["items"]] == [
        "doctor_invitation.issued"
    ]
    assert payload["cpf"] not in other.text
    assert payload["email"] not in other.text
    assert created["token"] not in other.text
    assert as_patient.status_code == 403
    assert oversized.status_code == 422


def test_admin_never_reaches_clinical_routes(make_client, engine):
    admin = login(make_client, "admin@email.com")
    carlos_patient_id = patient_id_of(
        engine, user_id_of(engine, "carlos.silva@email.com")
    )
    clinical_routes = [
        ("get", "/me/vaccines"),
        ("get", "/me/alerts"),
        ("get", "/me/documents"),
        ("get", "/me/markers"),
        ("get", "/me/shares/active"),
        ("get", "/me/care-invitations"),
        ("get", "/me/care-groups"),
        ("get", "/medical/patients"),
        ("get", f"/medical/patients/{carlos_patient_id}"),
    ]
    clinical_events_before = fetch_one(
        engine, "SELECT COUNT(*) AS total FROM clinical_audit_events"
    )["total"]

    responses = [getattr(admin, method)(path) for method, path in clinical_routes]

    assert [response.status_code for response in responses] == [403] * len(
        clinical_routes
    )
    assert fetch_one(
        engine, "SELECT COUNT(*) AS total FROM clinical_audit_events"
    )["total"] == clinical_events_before


def test_inconsistent_admin_with_clinical_roles_is_denied(make_client, engine):
    email = f"inconsistente.{uuid4().hex[:8]}@example.com"
    create_admin(
        engine,
        email=email,
        cpf=make_cpf(),
        display_name="Admin Inconsistente",
        password="senha-admin-segura",
    )
    with engine.begin() as connection:
        user_id = connection.exec_driver_sql(
            "SELECT user_id FROM users WHERE email = %s", (email,)
        ).scalar_one()
        connection.exec_driver_sql(
            "INSERT INTO user_roles (user_id, role) VALUES (%s, 'patient'), "
            "(%s, 'doctor')",
            (user_id, user_id),
        )
        connection.exec_driver_sql(
            """
            INSERT INTO patients (
                user_id, nome_paciente, nome_completo, status_saude,
                data_nascimento
            ) VALUES (%s, 'Inconsistente', 'Admin Inconsistente', 'pending',
                      '1980-01-01')
            """,
            (user_id,),
        )
    client = login(make_client, email, "senha-admin-segura")

    me = client.get("/me").json()
    assert me["user"]["roles"] == ["admin"]
    assert me["patient_profile"] is None
    assert client.get("/me/vaccines").status_code == 403
    assert client.get("/medical/patients").status_code == 403
