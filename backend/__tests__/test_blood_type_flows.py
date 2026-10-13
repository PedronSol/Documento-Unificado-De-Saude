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
    cpf_of,
    minor_payload,
)


def guardian_with_dependent(make_client, engine):
    doctor = login(make_client, "marcos.nunes@email.com")
    guardian, guardian_user = register_patient(make_client, birth_date=GUARDIAN_BIRTH)
    created = doctor.post(
        "/medical/patient-links",
        json=minor_payload(make_cpf(), cpf_of(engine, guardian_user)),
    )
    assert created.status_code == 201, created.text
    guardianship_id = guardian.get("/me/guardianships").json()["items"][0]["guardianship_id"]
    accepted = guardian.post(
        f"/me/guardianships/{guardianship_id}/accept",
        json={"dependent_birth_date": CHILD_BIRTH},
    )
    assert accepted.status_code == 204
    return doctor, guardian, created.json()["patient_id"]


def test_adult_patient_informs_and_changes_own_blood_type(make_client, engine):
    patient, _user_id = register_patient(make_client)

    informed = patient.put("/me/blood-type", json={"blood_type": "O+"})
    changed = patient.put("/me/blood-type", json={"blood_type": "O-"})
    invalid = patient.put("/me/blood-type", json={"blood_type": "C+"})
    me = patient.get("/me").json()["patient_profile"]

    assert informed.status_code == 200, informed.text
    assert informed.json() == {"blood_type": "O+", "blood_type_source": "patient"}
    assert changed.json() == {"blood_type": "O-", "blood_type_source": "patient"}
    assert invalid.status_code == 422
    assert (me["blood_type"], me["blood_type_source"]) == ("O-", "patient")


def test_guardian_informs_and_doctor_registration_prevails(make_client, engine):
    doctor, guardian, child_id = guardian_with_dependent(make_client, engine)
    unlinked_doctor = login(make_client, "helena.costa@email.com")
    stranger, _stranger_user = register_patient(make_client)
    admin = login(make_client, "admin@email.com")

    by_guardian = guardian.put(
        "/me/blood-type", json={"blood_type": "B+"}, headers=acting(child_id)
    )
    dependent = guardian.get("/me").json()["dependents"][0]
    by_stranger = stranger.put(
        "/me/blood-type", json={"blood_type": "A+"}, headers=acting(child_id)
    )
    by_unlinked = unlinked_doctor.put(
        f"/medical/patients/{child_id}/blood-type", json={"blood_type": "A+"}
    )
    by_admin = admin.put(
        f"/medical/patients/{child_id}/blood-type", json={"blood_type": "A+"}
    )
    by_doctor = doctor.put(
        f"/medical/patients/{child_id}/blood-type", json={"blood_type": "B-"}
    )
    record = doctor.get(f"/medical/patients/{child_id}").json()["patient"]
    overwrite = guardian.put(
        "/me/blood-type", json={"blood_type": "AB+"}, headers=acting(child_id)
    )

    assert by_guardian.status_code == 200, by_guardian.text
    assert by_guardian.json() == {"blood_type": "B+", "blood_type_source": "guardian"}
    assert (dependent["blood_type"], dependent["blood_type_source"]) == ("B+", "guardian")
    assert by_stranger.status_code == 403
    assert by_unlinked.status_code == 403
    assert by_admin.status_code == 403
    assert by_doctor.status_code == 200, by_doctor.text
    assert by_doctor.json() == {"blood_type": "B-", "blood_type_source": "doctor"}
    assert (record["blood_type"], record["blood_type_source"]) == ("B-", "doctor")
    assert overwrite.status_code == 409
    stored = fetch_one(
        engine,
        "SELECT tipo_sanguineo, tipo_sanguineo_origem FROM patients WHERE patient_id = %s",
        (child_id,),
    )
    assert stored == {"tipo_sanguineo": "B-", "tipo_sanguineo_origem": "doctor"}
    events = fetch_one(
        engine,
        "SELECT COUNT(*) AS total FROM clinical_audit_events "
        "WHERE patient_id = %s AND action = 'patient.blood_type_updated'",
        (child_id,),
    )
    assert events["total"] == 2


def test_public_summary_does_not_expose_blood_type_source(make_client, engine):
    patient, _user_id = register_patient(make_client)
    patient.put("/me/blood-type", json={"blood_type": "A-"})

    share = patient.post("/me/shares")
    assert share.status_code == 201, share.text
    token = share.json()["share_url"].split("#", 1)[1]
    public = make_client().get(
        "/public/shares/summary", headers={"X-Share-Token": token}
    )

    assert public.status_code == 200, public.text
    assert public.json()["patient"] == {
        "preferred_name": "Convidado",
        "blood_type": "A-",
    }
