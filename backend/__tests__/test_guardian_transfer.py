from uuid import uuid4

from test_administrative_governance import (  # noqa: F401 - fixtures
    database,
    engine,
    fetch_one,
    login,
    make_client,
    make_cpf,
    pytestmark,
    register_patient,
)
from test_guardianships import (
    CHILD_BIRTH,
    GUARDIAN_BIRTH,
    acting,
    claim_guardian,
    cpf_of,
    minor_payload,
)


ADULT_BIRTH = "2006-05-02"


def guardian_payload(cpf: str) -> dict:
    return minor_payload("", cpf)["guardian"]


def test_guardian_transfers_account_and_adult_dependent_unlinks(make_client, engine):
    doctor = login(make_client, "marcos.nunes@email.com")
    stranger, _stranger = register_patient(make_client)
    child_cpf, guardian_cpf = make_cpf(), make_cpf()
    created = doctor.post(
        "/medical/patient-links", json=minor_payload(child_cpf, guardian_cpf)
    ).json()
    child_id = created["patient_id"]
    guardian = make_client()
    assert claim_guardian(guardian, created["claim"]["token"], guardian_cpf).status_code == 201

    while_minor = guardian.post(f"/me/dependents/{child_id}/claim-link")
    with engine.begin() as connection:
        connection.exec_driver_sql(
            "UPDATE patients SET data_nascimento = %s WHERE patient_id = %s",
            (ADULT_BIRTH, child_id),
        )
    dependents_before = guardian.get("/me/dependents").json()
    by_stranger = stranger.post(f"/me/dependents/{child_id}/claim-link")
    transfer = guardian.post(f"/me/dependents/{child_id}/claim-link")
    dependent = make_client()
    claimed = dependent.post(
        "/auth/patient-claim/local",
        json={
            "token": transfer.json()["token"],
            "cpf": child_cpf,
            "birth_date": ADULT_BIRTH,
            "email": f"lia.{uuid4().hex[:8]}@example.com",
            "password": "senha-dependente-segura",
        },
    )
    guardians = dependent.get("/me/guardians").json()
    guardian_still_acts = guardian.get("/me/vaccines", headers=acting(child_id))
    unlinked = dependent.delete(f"/me/guardians/{guardians[0]['guardianship_id']}")
    guardian_after = guardian.get("/me/vaccines", headers=acting(child_id))

    assert while_minor.status_code == 409
    assert dependents_before[0]["has_own_access"] is False
    assert by_stranger.status_code == 404
    assert transfer.status_code == 201, transfer.text
    assert transfer.json()["recipient"] == "patient"
    assert claimed.status_code == 201, claimed.text
    assert guardians == [
        {
            "guardianship_id": guardians[0]["guardianship_id"],
            "guardian_display_name": "Joana Prado Ribeiro",
            "relationship": "parent",
            "status": "active",
            "awaiting_my_confirmation": False,
        }
    ]
    assert guardian_still_acts.status_code == 200
    assert unlinked.status_code == 204
    assert guardian_after.status_code == 403
    assert guardian.get("/me/dependents").json() == []
    assert fetch_one(
        engine,
        "SELECT claim_type FROM patient_claims WHERE account_patient_id = %s "
        "AND status = 'claimed'",
        (child_id,),
    )["claim_type"] == "transfer"
    assert fetch_one(
        engine,
        "SELECT status FROM patient_guardianships WHERE dependent_patient_id = %s",
        (child_id,),
    )["status"] == "released"


def test_minor_with_own_account_confirms_existing_guardian(make_client, engine):
    doctor = login(make_client, "marcos.nunes@email.com")
    minor, minor_user = register_patient(make_client, birth_date="2014-01-01")
    guardian, guardian_user = register_patient(make_client, birth_date=GUARDIAN_BIRTH)
    minor_cpf = cpf_of(engine, minor_user)
    minor_id = fetch_one(
        engine, "SELECT patient_id FROM patients WHERE user_id = %s", (minor_user,)
    )["patient_id"]

    without_guardian = doctor.post("/medical/patient-links", json={"cpf": minor_cpf})
    requested = doctor.post(
        "/medical/patient-links",
        json={"cpf": minor_cpf, "guardian": guardian_payload(cpf_of(engine, guardian_user))},
    )
    guardianship_id = guardian.get("/me/guardianships").json()[0]["guardianship_id"]
    accepted = guardian.post(
        f"/me/guardianships/{guardianship_id}/accept",
        json={"dependent_birth_date": "2014-01-01"},
    )
    header_before_confirmation = guardian.get("/me/vaccines", headers=acting(minor_id))
    awaiting = minor.get("/me/guardians").json()
    confirmed = minor.post(f"/me/guardianships/{guardianship_id}/confirm")
    requests = guardian.get("/me/care-requests", headers=acting(minor_id)).json()
    decided = guardian.post(
        f"/me/care-requests/{requested.json()['link_id']}/accept",
        headers=acting(minor_id),
    )
    minor_unlink = minor.delete(f"/me/guardians/{guardianship_id}")

    assert without_guardian.status_code == 409
    assert requested.status_code == 202, requested.text
    assert requested.json()["claim"] is None
    assert accepted.status_code == 204
    assert header_before_confirmation.status_code == 403
    assert awaiting == [
        {
            "guardianship_id": guardianship_id,
            "guardian_display_name": "Paciente Convidado",
            "relationship": "parent",
            "status": "pending",
            "awaiting_my_confirmation": True,
        }
    ]
    assert confirmed.status_code == 204
    assert len(requests) == 1
    assert decided.status_code == 204
    assert doctor.get(f"/medical/patients/{minor_id}").status_code == 200
    assert minor_unlink.status_code == 403


def test_minor_with_own_account_and_new_guardian_claim(make_client, engine):
    doctor = login(make_client, "marcos.nunes@email.com")
    minor, minor_user = register_patient(make_client, birth_date="2014-01-01")
    guardian_cpf = make_cpf()

    requested = doctor.post(
        "/medical/patient-links",
        json={"cpf": cpf_of(engine, minor_user), "guardian": guardian_payload(guardian_cpf)},
    )
    guardian = make_client()
    claimed = claim_guardian(
        guardian,
        requested.json()["claim"]["token"],
        guardian_cpf,
        dependent_birth="2014-01-01",
    )
    status_after_claim = fetch_one(
        engine,
        "SELECT status FROM patient_guardianships g JOIN patients p "
        "ON p.patient_id = g.dependent_patient_id WHERE p.user_id = %s",
        (minor_user,),
    )["status"]
    guardianship_id = minor.get("/me/guardians").json()[0]["guardianship_id"]
    confirmed = minor.post(f"/me/guardianships/{guardianship_id}/confirm")

    assert requested.status_code == 202, requested.text
    assert requested.json()["claim"]["recipient"] == "guardian"
    assert claimed.status_code == 201, claimed.text
    assert status_after_claim == "pending"
    assert confirmed.status_code == 204
    assert [item["patient_id"] for item in guardian.get("/me/dependents").json()]
    assert CHILD_BIRTH
