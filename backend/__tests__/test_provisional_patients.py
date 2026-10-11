import json
from uuid import uuid4

from test_administrative_governance import (  # noqa: F401 - fixtures
    database,
    engine,
    fetch_one,
    google_credential,
    login,
    make_client,
    make_cpf,
    pytestmark,
)


ADULT_BIRTH_DATE = "1979-08-15"


def provisional_payload(cpf: str, **overrides) -> dict:
    return {
        "cpf": cpf,
        "patient": {
            "full_name": "Joana Prado Ribeiro",
            "preferred_name": "Joana",
            "birth_date": ADULT_BIRTH_DATE,
            **overrides,
        },
    }


def create_provisional(doctor, cpf: str | None = None):
    cpf = cpf or make_cpf()
    response = doctor.post("/medical/patient-links", json=provisional_payload(cpf))
    assert response.status_code == 201, response.text
    return cpf, response.json()


def claim_local(client, token: str, cpf: str, birth_date: str = ADULT_BIRTH_DATE, email=None):
    return client.post(
        "/auth/patient-claim/local",
        json={
            "token": token,
            "cpf": cpf,
            "birth_date": birth_date,
            "email": email or f"joana.{uuid4().hex[:8]}@example.com",
            "password": "senha-paciente-segura",
        },
    )


def test_doctor_creates_provisional_adult_with_immediate_access(make_client, engine):
    doctor = login(make_client, "marcos.nunes@email.com")
    admin = login(make_client, "admin@email.com")
    cpf, created = create_provisional(doctor)
    patient_id = created["patient_id"]

    record = doctor.get(f"/medical/patients/{patient_id}")
    marker = doctor.post(
        f"/medical/patients/{patient_id}/markers",
        json={"type": "allergy", "name": "Dipirona"},
    )
    directory = admin.get("/admin/users", params={"query": cpf})

    assert created["result"] == "provisional_created"
    assert created["claim"]["recipient"] == "patient"
    assert len(created["claim"]["token"]) >= 43
    assert record.status_code == 200
    assert record.json()["patient"]["account_status"] == "provisional"
    assert record.json()["patient"]["manages_provisional"] is True
    assert marker.status_code == 201, marker.text
    assert directory.json()["items"] == []
    stored = fetch_one(
        engine,
        """
        SELECT u.email, u.password_hash, u.claimed_at, d.user_id AS doctor_user,
               dpl.status AS link_status, dpl.origin,
               (SELECT GROUP_CONCAT(role) FROM user_roles ur
                WHERE ur.user_id = u.user_id) AS roles,
               (SELECT COUNT(*) FROM patient_claims pc
                WHERE pc.account_patient_id = p.patient_id
                  AND pc.status = 'pending') AS pending_claims
        FROM patients p
        JOIN users u ON u.user_id = p.user_id
        JOIN doctors d ON d.doctor_id = u.provisioned_by_doctor_id
        JOIN doctor_patient_links dpl ON dpl.patient_id = p.patient_id
        WHERE p.patient_id = %s
        """,
        (patient_id,),
    )
    assert stored["email"] is None
    assert stored["password_hash"] is None
    assert stored["claimed_at"] is None
    assert stored["roles"] == "patient"
    assert (stored["link_status"], stored["origin"]) == ("active", "provisional")
    assert stored["pending_claims"] == 1


def test_provisional_creation_validates_input(make_client, engine):
    doctor = login(make_client, "marcos.nunes@email.com")
    cpf = make_cpf()

    without_patient = doctor.post("/medical/patient-links", json={"cpf": cpf})
    minor = doctor.post(
        "/medical/patient-links",
        json=provisional_payload(cpf, birth_date="2016-03-01"),
    )
    missing_field = doctor.post(
        "/medical/patient-links",
        json={"cpf": cpf, "patient": {"full_name": "Sem Data", "preferred_name": "S"}},
    )
    extra_field = doctor.post(
        "/medical/patient-links",
        json=provisional_payload(cpf, email="x@example.com"),
    )

    assert without_patient.status_code == 404
    assert minor.status_code == 409
    assert minor.json()["detail"] == "Paciente menor exige responsável."
    assert missing_field.status_code == 422
    assert extra_field.status_code == 422
    assert fetch_one(
        engine, "SELECT COUNT(*) AS total FROM users WHERE cpf = %s", (cpf,)
    )["total"] == 0


def test_patient_claims_account_locally_and_keeps_doctor_link(make_client, engine):
    doctor = login(make_client, "marcos.nunes@email.com")
    cpf, created = create_provisional(doctor)
    patient_id = created["patient_id"]
    doctor.post(
        f"/medical/patients/{patient_id}/markers",
        json={"type": "condition", "name": "Hipotireoidismo"},
    )
    patient = make_client()
    email = f"joana.{uuid4().hex[:8]}@example.com"

    claimed = claim_local(patient, created["claim"]["token"], cpf, email=email)
    markers = patient.get("/me/markers", params={"status": "active"})
    care_doctors = patient.get("/me/care-doctors")
    reused = claim_local(make_client(), created["claim"]["token"], cpf)
    record = doctor.get(f"/medical/patients/{patient_id}")
    relogin = make_client().post(
        "/login", data={"username": email, "password": "senha-paciente-segura"}
    )

    assert claimed.status_code == 201, claimed.text
    assert claimed.json()["user"]["roles"] == ["patient"]
    assert [marker["name"] for marker in markers.json()] == ["Hipotireoidismo"]
    assert [item["doctor_display_name"] for item in care_doctors.json()] == [
        "Dr. Marcos Nunes"
    ]
    assert reused.status_code == 403
    assert record.json()["patient"]["account_status"] == "active"
    assert record.json()["patient"]["manages_provisional"] is False
    assert relogin.status_code == 200
    assert fetch_one(
        engine,
        "SELECT action FROM clinical_audit_events WHERE patient_id = %s "
        "AND action = 'patient.account_claimed'",
        (patient_id,),
    ) is not None


def test_claim_with_wrong_data_is_uniform_and_revoked_after_five_attempts(
    make_client, engine
):
    doctor = login(make_client, "marcos.nunes@email.com")
    cpf, created = create_provisional(doctor)
    token = created["claim"]["token"]

    attempts = [
        claim_local(make_client(), token, make_cpf()),
        claim_local(make_client(), token, cpf, birth_date="1980-01-01"),
        claim_local(make_client(), token, make_cpf()),
        claim_local(make_client(), token, make_cpf()),
        claim_local(make_client(), token, make_cpf()),
    ]
    after_revocation = claim_local(make_client(), token, cpf)

    assert [response.status_code for response in attempts] == [403] * 5
    assert len({response.text for response in attempts}) == 1
    assert after_revocation.status_code == 403
    claim = fetch_one(
        engine,
        "SELECT status, failed_attempts FROM patient_claims WHERE account_patient_id = %s",
        (created["patient_id"],),
    )
    assert claim == {"status": "revoked", "failed_attempts": 5}


def test_patient_claims_with_google_and_conflicts_roll_back(make_client, engine):
    doctor = login(make_client, "marcos.nunes@email.com")
    cpf, created = create_provisional(doctor)
    token = created["claim"]["token"]
    google_email = f"joana.google.{uuid4().hex[:8]}@example.com"

    taken_email = claim_local(make_client(), token, cpf, email="mariana.souza@email.com")
    claimed = make_client().post(
        "/auth/google/patient-claim",
        json={
            "token": token,
            "cpf": cpf,
            "birth_date": ADULT_BIRTH_DATE,
            "credential": google_credential(google_email),
        },
    )

    assert taken_email.status_code == 409
    assert claimed.status_code == 201, claimed.text
    stored = fetch_one(
        engine,
        """
        SELECT u.email, u.password_hash, u.claimed_at IS NOT NULL AS claimed,
               (SELECT COUNT(*) FROM external_identities ei
                WHERE ei.user_id = u.user_id) AS identities
        FROM users u WHERE u.cpf = %s
        """,
        (cpf,),
    )
    assert stored == {
        "email": google_email,
        "password_hash": None,
        "claimed": 1,
        "identities": 1,
    }


def test_author_corrects_profile_and_reissues_claim_link(make_client, engine):
    doctor = login(make_client, "marcos.nunes@email.com")
    other_doctor = login(make_client, "helena.costa@email.com")
    cpf, created = create_provisional(doctor)
    patient_id = created["patient_id"]

    corrected = doctor.patch(
        f"/medical/patients/{patient_id}/provisional-profile",
        json={"full_name": "Joana Prado Ribeiro Lima", "birth_date": "1979-08-16"},
    )
    to_minor = doctor.patch(
        f"/medical/patients/{patient_id}/provisional-profile",
        json={"birth_date": "2015-01-01"},
    )
    empty = doctor.patch(f"/medical/patients/{patient_id}/provisional-profile", json={})
    foreign = other_doctor.patch(
        f"/medical/patients/{patient_id}/provisional-profile",
        json={"full_name": "Outro Nome"},
    )
    reissued = doctor.post(f"/medical/patients/{patient_id}/claim-link")
    foreign_link = other_doctor.post(f"/medical/patients/{patient_id}/claim-link")
    old_token = claim_local(make_client(), created["claim"]["token"], cpf, birth_date="1979-08-16")
    new_token = claim_local(make_client(), reissued.json()["token"], cpf, birth_date="1979-08-16")
    after_claim = doctor.patch(
        f"/medical/patients/{patient_id}/provisional-profile",
        json={"full_name": "Depois"},
    )

    assert corrected.status_code == 200, corrected.text
    assert corrected.json()["full_name"] == "Joana Prado Ribeiro Lima"
    assert to_minor.status_code == 409
    assert empty.status_code == 422
    assert foreign.status_code == 404
    assert reissued.status_code == 201
    assert foreign_link.status_code == 404
    assert old_token.status_code == 403
    assert new_token.status_code == 201, new_token.text
    assert after_claim.status_code == 404


def test_other_doctor_request_waits_for_claim(make_client, engine):
    doctor = login(make_client, "marcos.nunes@email.com")
    other_doctor = login(make_client, "helena.costa@email.com")
    cpf, created = create_provisional(doctor)

    request = other_doctor.post("/medical/patient-links", json={"cpf": cpf})
    patient = make_client()
    claim_local(patient, created["claim"]["token"], cpf)
    inbox = patient.get("/me/care-requests")

    assert request.status_code == 202, request.text
    assert [item["doctor_display_name"] for item in inbox.json()] == [
        "Dra. Helena Costa"
    ]


def test_expired_claim_link_is_rejected(make_client, engine):
    doctor = login(make_client, "marcos.nunes@email.com")
    cpf, created = create_provisional(doctor)
    with engine.begin() as connection:
        connection.exec_driver_sql(
            "UPDATE patient_claims SET expires_at = UTC_TIMESTAMP(6) - INTERVAL 1 MINUTE "
            "WHERE account_patient_id = %s",
            (created["patient_id"],),
        )

    assert claim_local(make_client(), created["claim"]["token"], cpf).status_code == 403
    assert json.loads(json.dumps(created))["result"] == "provisional_created"
