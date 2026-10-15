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
from models import (
    BloodTypeUpdate,
    HealthShareCreatedResponse,
    MarkerCreateUpdate,
    PublicHealthSummaryResponse,
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


def test_guardian_and_doctor_both_edit_blood_type(make_client, engine):
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
    assert overwrite.status_code == 200, overwrite.text
    assert overwrite.json() == {"blood_type": "AB+", "blood_type_source": "guardian"}
    stored = fetch_one(
        engine,
        "SELECT tipo_sanguineo, tipo_sanguineo_origem FROM patients WHERE patient_id = %s",
        (child_id,),
    )
    assert stored == {"tipo_sanguineo": "AB+", "tipo_sanguineo_origem": "guardian"}
    events = fetch_one(
        engine,
        "SELECT COUNT(*) AS total FROM clinical_audit_events "
        "WHERE patient_id = %s AND action = 'patient.blood_type_updated'",
        (child_id,),
    )
    assert events["total"] == 3


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


def test_same_share_reads_current_blood_type_and_markers_without_extending_expiry(make_client, engine):
    patient, _user_id = register_patient(make_client)
    initial = patient.put("/me/blood-type", json=BloodTypeUpdate(blood_type="AB+").model_dump())
    assert initial.status_code == 200
    marker = patient.post("/me/markers", json=MarkerCreateUpdate(type="allergy", name="Dipirona").model_dump())
    assert marker.status_code == 201, marker.text
    created = patient.post("/me/shares")
    assert created.status_code == 201, created.text
    share = HealthShareCreatedResponse.model_validate(created.json())
    token = share.share_url.split("#", 1)[1]
    public = make_client()

    first = public.get("/public/shares/summary", headers={"X-Share-Token": token})
    assert first.status_code == 200
    before = PublicHealthSummaryResponse.model_validate(first.json())
    assert before.patient.blood_type == "AB+"
    assert [item.name for item in before.markers.allergies] == ["Dipirona"]

    changed = patient.put("/me/blood-type", json=BloodTypeUpdate(blood_type="O-").model_dump())
    assert changed.status_code == 200
    removed = patient.delete(f"/me/markers/{marker.json()['marker_id']}")
    assert removed.status_code == 200
    second = public.get("/public/shares/summary", headers={"X-Share-Token": token})
    assert second.status_code == 200, second.text
    after = PublicHealthSummaryResponse.model_validate(second.json())
    assert after.patient.blood_type == "O-"
    assert after.markers.allergies == []
    assert before.expires_at == after.expires_at == share.expires_at

    revoked = patient.delete(f"/me/shares/{share.share_id}")
    assert revoked.status_code == 204
    refused = public.get("/public/shares/summary", headers={"X-Share-Token": token})
    assert refused.status_code == 404
    assert refused.json() == {"detail": "Compartilhamento indisponível."}
    assert refused.headers["cache-control"] == "no-store, max-age=0"


def test_expired_share_cannot_be_reopened(make_client, engine):
    patient, _user_id = register_patient(make_client)
    created = patient.post("/me/shares")
    assert created.status_code == 201
    share = HealthShareCreatedResponse.model_validate(created.json())
    token = share.share_url.split("#", 1)[1]
    public = make_client()
    assert public.get("/public/shares/summary", headers={"X-Share-Token": token}).status_code == 200
    with engine.begin() as connection:
        connection.exec_driver_sql(
            "UPDATE health_shares SET created_at = UTC_TIMESTAMP(6) - INTERVAL 3 HOUR, "
            "expires_at = UTC_TIMESTAMP(6) - INTERVAL 1 HOUR, last_accessed_at = NULL "
            "WHERE share_id = %s", (share.share_id,),
        )
    refused = public.get("/public/shares/summary", headers={"X-Share-Token": token})
    assert refused.status_code == 404
    assert refused.json() == {"detail": "Compartilhamento indisponível."}
