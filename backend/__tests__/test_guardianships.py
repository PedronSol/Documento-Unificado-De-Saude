from uuid import uuid4

from database_admin import create_admin
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


CHILD_BIRTH = "2016-05-02"
GUARDIAN_BIRTH = "1986-02-11"


def minor_payload(child_cpf: str, guardian_cpf: str, **guardian) -> dict:
    return {
        "cpf": child_cpf,
        "patient": {
            "full_name": "Lia Prado Ribeiro",
            "preferred_name": "Lia",
            "birth_date": CHILD_BIRTH,
        },
        "guardian": {
            "cpf": guardian_cpf,
            "full_name": "Joana Prado Ribeiro",
            "birth_date": GUARDIAN_BIRTH,
            "relationship": "parent",
            **guardian,
        },
    }


def cpf_of(engine, user_id: int) -> str:
    return fetch_one(engine, "SELECT cpf FROM users WHERE user_id = %s", (user_id,))["cpf"]


def acting(patient_id: int) -> dict:
    return {"X-Acting-Patient": str(patient_id)}


def claim_guardian(client, token, guardian_cpf, dependent_birth=CHILD_BIRTH):
    return client.post(
        "/auth/patient-claim/local",
        json={
            "token": token,
            "cpf": guardian_cpf,
            "birth_date": GUARDIAN_BIRTH,
            "dependent_birth_date": dependent_birth,
            "email": f"responsavel.{uuid4().hex[:8]}@example.com",
            "password": "senha-responsavel-segura",
        },
    )


def test_minor_with_new_guardian_is_claimed_and_managed_by_guardian(make_client, engine):
    doctor = login(make_client, "marcos.nunes@email.com")
    other_doctor = login(make_client, "helena.costa@email.com")
    child_cpf, guardian_cpf = make_cpf(), make_cpf()

    created = doctor.post("/medical/patient-links", json=minor_payload(child_cpf, guardian_cpf))
    assert created.status_code == 201, created.text
    body = created.json()
    child_id = body["patient_id"]
    marker = doctor.post(
        f"/medical/patients/{child_id}/markers",
        json={"type": "allergy", "name": "Amendoim"},
    )
    wrong_dependent = claim_guardian(
        make_client(), body["claim"]["token"], guardian_cpf, dependent_birth="2016-05-03"
    )
    guardian = make_client()
    claimed = claim_guardian(guardian, body["claim"]["token"], guardian_cpf)
    me = guardian.get("/me")
    own_markers = guardian.get("/me/markers", params={"status": "active"})
    child_markers = guardian.get(
        "/me/markers", params={"status": "active"}, headers=acting(child_id)
    )
    request = other_doctor.post("/medical/patient-links", json={"cpf": child_cpf})
    assert request.status_code == 202, request.text
    child_requests = guardian.get("/me/care-requests", headers=acting(child_id))
    accepted = guardian.post(
        f"/me/care-requests/{request.json()['link_id']}/accept",
        headers=acting(child_id),
    )

    assert body["claim"]["recipient"] == "guardian"
    assert marker.status_code == 201, marker.text
    assert wrong_dependent.status_code == 403
    assert claimed.status_code == 201, claimed.text
    assert [item["patient_id"] for item in me.json()["dependents"]] == [child_id]
    assert own_markers.json() == []
    assert [item["name"] for item in child_markers.json()] == ["Amendoim"]
    assert request.status_code == 202, request.text
    assert len(child_requests.json()) == 1
    assert accepted.status_code == 204
    assert other_doctor.get(f"/medical/patients/{child_id}").status_code == 200
    guardian_user = fetch_one(
        engine, "SELECT user_id FROM users WHERE cpf = %s", (guardian_cpf,)
    )["user_id"]
    decision = fetch_one(
        engine,
        "SELECT actor_user_id FROM clinical_audit_events "
        "WHERE patient_id = %s AND action = 'care_link.direct_accepted'",
        (child_id,),
    )
    assert decision["actor_user_id"] == guardian_user
    guardianship = fetch_one(
        engine,
        "SELECT status, relationship FROM patient_guardianships "
        "WHERE dependent_patient_id = %s",
        (child_id,),
    )
    assert guardianship == {"status": "active", "relationship": "parent"}


def test_existing_guardian_accepts_guardianship_in_own_login(make_client, engine):
    doctor = login(make_client, "marcos.nunes@email.com")
    guardian, guardian_user = register_patient(make_client, birth_date=GUARDIAN_BIRTH)
    guardian_cpf = cpf_of(engine, guardian_user)
    child_cpf = make_cpf()

    created = doctor.post("/medical/patient-links", json=minor_payload(child_cpf, guardian_cpf))
    child_id = created.json()["patient_id"]
    pending = guardian.get("/me/guardianships", params={"status": "pending"})
    guardianship_id = pending.json()[0]["guardianship_id"]
    header_before = guardian.get("/me/markers", params={"status": "active"}, headers=acting(child_id))
    wrong = guardian.post(
        f"/me/guardianships/{guardianship_id}/accept",
        json={"dependent_birth_date": "2016-01-01"},
    )
    accepted = guardian.post(
        f"/me/guardianships/{guardianship_id}/accept",
        json={"dependent_birth_date": CHILD_BIRTH},
    )
    dependents = guardian.get("/me/dependents")

    assert created.status_code == 201, created.text
    assert created.json()["claim"] is None
    assert pending.json()[0]["dependent_full_name"] == "Lia Prado Ribeiro"
    assert header_before.status_code == 403
    assert wrong.status_code == 403
    assert accepted.status_code == 204
    assert [item["patient_id"] for item in dependents.json()] == [child_id]
    assert dependents.json()[0]["guardianship_id"] == guardianship_id


def test_guardian_rejects_guardianship(make_client, engine):
    doctor = login(make_client, "marcos.nunes@email.com")
    guardian, guardian_user = register_patient(make_client, birth_date=GUARDIAN_BIRTH)
    created = doctor.post(
        "/medical/patient-links",
        json=minor_payload(make_cpf(), cpf_of(engine, guardian_user)),
    )
    guardianship_id = guardian.get("/me/guardianships").json()[0]["guardianship_id"]

    rejected = guardian.post(f"/me/guardianships/{guardianship_id}/reject")
    header = guardian.get(
        "/me/markers",
        params={"status": "active"},
        headers=acting(created.json()["patient_id"]),
    )

    assert rejected.status_code == 204
    assert header.status_code == 403
    assert guardian.get("/me/dependents").json() == []


def test_acting_header_is_denied_to_third_parties_and_ignored_on_account_routes(
    make_client, engine
):
    doctor = login(make_client, "marcos.nunes@email.com")
    guardian, guardian_user = register_patient(make_client, birth_date=GUARDIAN_BIRTH)
    stranger, _stranger_user = register_patient(make_client)
    created = doctor.post(
        "/medical/patient-links",
        json=minor_payload(make_cpf(), cpf_of(engine, guardian_user)),
    )
    child_id = created.json()["patient_id"]
    guardianship_id = guardian.get("/me/guardianships").json()[0]["guardianship_id"]
    guardian.post(
        f"/me/guardianships/{guardianship_id}/accept",
        json={"dependent_birth_date": CHILD_BIRTH},
    )

    by_stranger = stranger.get("/me/vaccines", headers=acting(child_id))
    unknown = guardian.get("/me/vaccines", headers=acting(999999))
    malformed = guardian.get("/me/vaccines", headers={"X-Acting-Patient": "abc"})
    me_with_header = guardian.get("/me", headers=acting(child_id))
    vaccine = guardian.post(
        "/me/vaccines",
        json={"name": "Tríplice viral", "dose": "Reforço", "status": "pending"},
        headers=acting(child_id),
    )

    assert by_stranger.status_code == 403
    assert unknown.status_code == 403
    assert malformed.status_code == 403
    assert me_with_header.json()["user"]["user_id"] == guardian_user
    assert me_with_header.json()["patient_profile"]["preferred_name"] == "Convidado"
    assert vaccine.status_code in (200, 201), vaccine.text
    audit = fetch_one(
        engine,
        "SELECT actor_user_id FROM clinical_audit_events "
        "WHERE patient_id = %s AND resource_type = 'vaccine'",
        (child_id,),
    )
    assert audit["actor_user_id"] == guardian_user


def test_link_request_validates_minor_and_guardian(make_client, engine):
    doctor = login(make_client, "marcos.nunes@email.com")
    child_cpf = make_cpf()
    admin_cpf = make_cpf()
    create_admin(
        engine,
        email=f"admin.resp.{uuid4().hex[:8]}@example.com",
        cpf=admin_cpf,
        display_name="Admin Responsável",
        password="senha-admin-segura",
    )
    _claimed_minor, minor_user = register_patient(make_client, birth_date="2014-01-01")

    without_guardian = doctor.post(
        "/medical/patient-links",
        json={"cpf": child_cpf, "patient": minor_payload(child_cpf, make_cpf())["patient"]},
    )
    minor_guardian = doctor.post(
        "/medical/patient-links",
        json=minor_payload(child_cpf, make_cpf(), birth_date="2010-01-01"),
    )
    same_cpf = doctor.post("/medical/patient-links", json=minor_payload(child_cpf, child_cpf))
    admin_guardian = doctor.post("/medical/patient-links", json=minor_payload(child_cpf, admin_cpf))
    titular_minor = doctor.post(
        "/medical/patient-links",
        json={"cpf": cpf_of(engine, minor_user), "guardian": minor_payload("", make_cpf())["guardian"]},
    )

    assert without_guardian.status_code == 409
    assert without_guardian.json()["detail"] == "Paciente menor exige responsável."
    assert minor_guardian.status_code == 422
    assert same_cpf.status_code == 422
    assert admin_guardian.status_code == 409
    assert admin_guardian.json()["detail"] == "Responsável indisponível."
    assert titular_minor.status_code == 409
    assert fetch_one(
        engine, "SELECT COUNT(*) AS total FROM users WHERE cpf = %s", (child_cpf,)
    )["total"] == 0


def test_last_guardian_cannot_renounce_while_doctors_have_access(make_client, engine):
    doctor = login(make_client, "marcos.nunes@email.com")
    guardian, guardian_user = register_patient(make_client, birth_date=GUARDIAN_BIRTH)
    created = doctor.post(
        "/medical/patient-links",
        json=minor_payload(make_cpf(), cpf_of(engine, guardian_user)),
    )
    child_id = created.json()["patient_id"]
    guardianship_id = guardian.get("/me/guardianships").json()[0]["guardianship_id"]
    guardian.post(
        f"/me/guardianships/{guardianship_id}/accept",
        json={"dependent_birth_date": CHILD_BIRTH},
    )
    link_id = fetch_one(
        engine,
        "SELECT link_id FROM doctor_patient_links WHERE patient_id = %s",
        (child_id,),
    )["link_id"]

    blocked = guardian.delete(f"/me/guardianships/{guardianship_id}")
    doctor.delete(f"/medical/patient-links/{link_id}")
    renounced = guardian.delete(f"/me/guardianships/{guardianship_id}")
    after = guardian.get("/me/vaccines", headers=acting(child_id))

    assert blocked.status_code == 409
    assert renounced.status_code == 204
    assert after.status_code == 403
