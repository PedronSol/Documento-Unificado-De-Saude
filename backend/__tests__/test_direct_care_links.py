from uuid import uuid4

from database_admin import create_admin
from test_administrative_governance import (  # noqa: F401 - fixtures
    database,
    engine,
    fetch_one,
    login,
    make_client,
    make_cpf,
    new_admin,
    patient_id_of,
    pytestmark,
    register_patient,
    seed_doctor_id,
    user_id_of,
)


def cpf_of(engine, user_id: int) -> str:
    return fetch_one(engine, "SELECT cpf FROM users WHERE user_id = %s", (user_id,))[
        "cpf"
    ]


def request_link(doctor, cpf: str):
    return doctor.post("/medical/patient-links", json={"cpf": cpf})


def medical_patient_ids(doctor) -> set[int]:
    response = doctor.get("/medical/patients")
    assert response.status_code == 200, response.text
    return {patient["patient_id"] for patient in response.json()}


def test_doctor_requests_link_and_gains_access_only_after_acceptance(
    make_client, engine
):
    doctor = login(make_client, "marcos.nunes@email.com")
    other_doctor = login(make_client, "helena.costa@email.com")
    patient, user_id = register_patient(make_client)
    patient_id = patient_id_of(engine, user_id)
    cpf = cpf_of(engine, user_id)

    requested = request_link(doctor, cpf)
    before_access = doctor.get(f"/medical/patients/{patient_id}")
    pending = doctor.get("/medical/patient-links", params={"status": "pending"})
    inbox = patient.get("/me/care-requests")

    assert requested.status_code == 202, requested.text
    assert requested.json()["result"] == "request_sent"
    link_id = requested.json()["link_id"]
    assert before_access.status_code == 403
    assert patient_id not in medical_patient_ids(doctor)
    pending_item = next(
        item for item in pending.json() if item["link_id"] == link_id
    )
    assert set(pending_item) == {
        "link_id",
        "patient_display_name",
        "masked_cpf",
        "expires_at",
    }
    assert cpf not in pending.text
    assert inbox.json() == [
        {
            "link_id": link_id,
            "doctor_display_name": "Dr. Marcos Nunes",
            "crm_number": "100002",
            "crm_state": "RN",
            "expires_at": inbox.json()[0]["expires_at"],
        }
    ]

    accepted = patient.post(f"/me/care-requests/{link_id}/accept")
    record = doctor.get(f"/medical/patients/{patient_id}")
    marker = doctor.post(
        f"/medical/patients/{patient_id}/markers",
        json={"type": "condition", "name": "Asma"},
    )
    direct_doctors = patient.get("/me/care-doctors")

    assert accepted.status_code == 204
    assert patient_id in medical_patient_ids(doctor)
    assert record.status_code == 200
    assert marker.status_code == 201, marker.text
    assert patient_id not in medical_patient_ids(other_doctor)
    assert other_doctor.get(f"/medical/patients/{patient_id}").status_code == 403
    assert [item["link_id"] for item in direct_doctors.json()] == [link_id]
    assert patient.get("/me/care-requests").json() == []
    events = fetch_one(
        engine,
        """
        SELECT GROUP_CONCAT(action ORDER BY audit_event_id) AS actions
        FROM clinical_audit_events
        WHERE resource_type = 'doctor_patient_link' AND resource_id = %s
        """,
        (link_id,),
    )["actions"]
    assert events == "care_link.direct_requested,care_link.direct_accepted"


def test_link_request_validates_actor_and_target(make_client, engine):
    doctor = login(make_client, "marcos.nunes@email.com")
    pending_doctor = login(make_client, "paula.reis@email.com")
    admin = login(make_client, "admin@email.com")
    patient_client, user_id = register_patient(make_client)
    _minor, minor_id = register_patient(make_client, birth_date="2015-01-01")
    cpf = cpf_of(engine, user_id)

    first = request_link(doctor, cpf)
    duplicate = request_link(doctor, cpf)
    unknown = request_link(doctor, make_cpf())
    minor = request_link(doctor, cpf_of(engine, minor_id))
    _inactive_client, inactive_id = register_patient(make_client)
    doctor_only_cpf = make_cpf()
    admin_email = f"admin.alvo.{uuid4().hex[:8]}@example.com"
    admin_cpf_value = make_cpf()
    create_admin(
        engine,
        email=admin_email,
        cpf=admin_cpf_value,
        display_name="Admin Alvo",
        password="senha-admin-segura",
    )
    with engine.begin() as connection:
        connection.exec_driver_sql(
            "UPDATE users SET active = FALSE WHERE user_id = %s", (inactive_id,)
        )
        doctor_only_user = connection.exec_driver_sql(
            "INSERT INTO users (cpf, display_name, email, password_hash, active) "
            "VALUES (%s, 'Dr. Somente Médico', %s, NULL, TRUE)",
            (doctor_only_cpf, f"so.medico.{uuid4().hex[:8]}@example.com"),
        ).lastrowid
        connection.exec_driver_sql(
            "INSERT INTO user_roles (user_id, role) VALUES (%s, 'doctor')",
            (doctor_only_user,),
        )
    inactive = request_link(doctor, cpf_of(engine, inactive_id))
    doctor_only = request_link(doctor, doctor_only_cpf)
    admin_cpf = request_link(doctor, admin_cpf_value)
    invalid_cpf = request_link(doctor, "123")
    extra = doctor.post("/medical/patient-links", json={"cpf": cpf, "role": "x"})
    by_pending_doctor = request_link(pending_doctor, cpf)
    by_admin = request_link(admin, cpf)
    by_patient = request_link(patient_client, cpf)
    anonymous = request_link(make_client(), cpf)

    assert first.status_code == 202
    assert duplicate.status_code == 409
    assert unknown.status_code == 404
    assert minor.status_code == 409
    assert minor.json()["detail"] == "Paciente menor exige responsável."
    assert inactive.status_code == 409
    assert doctor_only.status_code == 409
    assert admin_cpf.status_code == 409
    assert inactive.json() == doctor_only.json() == admin_cpf.json()
    assert invalid_cpf.status_code == 422
    assert extra.status_code == 422
    assert by_pending_doctor.status_code == 403
    assert by_admin.status_code == 403
    assert by_patient.status_code == 403
    assert anonymous.status_code == 401


def test_rejected_cancelled_and_expired_requests_never_grant_access(
    make_client, engine
):
    doctor = login(make_client, "marcos.nunes@email.com")
    patient, user_id = register_patient(make_client)
    intruder, _intruder_id = register_patient(make_client)
    patient_id = patient_id_of(engine, user_id)
    cpf = cpf_of(engine, user_id)

    first = request_link(doctor, cpf).json()["link_id"]
    by_intruder = intruder.post(f"/me/care-requests/{first}/accept")
    rejected = patient.post(f"/me/care-requests/{first}/reject")
    accept_rejected = patient.post(f"/me/care-requests/{first}/accept")
    second = request_link(doctor, cpf).json()["link_id"]
    cancelled = doctor.delete(f"/medical/patient-links/{second}")
    accept_cancelled = patient.post(f"/me/care-requests/{second}/accept")
    third = request_link(doctor, cpf).json()["link_id"]
    with engine.begin() as connection:
        connection.exec_driver_sql(
            "UPDATE doctor_patient_links "
            "SET expires_at = UTC_TIMESTAMP(6) - INTERVAL 1 MINUTE "
            "WHERE link_id = %s",
            (third,),
        )
    accept_expired = patient.post(f"/me/care-requests/{third}/accept")
    after_expiry = request_link(doctor, cpf)

    assert by_intruder.status_code == 404
    assert rejected.status_code == 204
    assert accept_rejected.status_code == 404
    assert cancelled.status_code == 204
    assert accept_cancelled.status_code == 404
    assert accept_expired.status_code == 404
    assert after_expiry.status_code == 202
    assert patient_id not in medical_patient_ids(doctor)
    statuses = fetch_one(
        engine,
        """
        SELECT GROUP_CONCAT(status ORDER BY link_id) AS statuses
        FROM doctor_patient_links WHERE link_id IN (%s, %s, %s)
        """,
        (first, second, third),
    )["statuses"]
    assert statuses == "rejected,cancelled,expired"


def test_patient_or_doctor_ends_direct_link_immediately(make_client, engine):
    doctor = login(make_client, "marcos.nunes@email.com")
    other_doctor = login(make_client, "helena.costa@email.com")
    patient, user_id = register_patient(make_client)
    patient_id = patient_id_of(engine, user_id)
    cpf = cpf_of(engine, user_id)

    first = request_link(doctor, cpf).json()["link_id"]
    patient.post(f"/me/care-requests/{first}/accept")
    revoked = patient.delete(f"/me/care-doctors/{first}")
    after_revoke = doctor.get(f"/medical/patients/{patient_id}")
    revoked_again = patient.delete(f"/me/care-doctors/{first}")

    second = request_link(doctor, cpf).json()["link_id"]
    patient.post(f"/me/care-requests/{second}/accept")
    restored = doctor.get(f"/medical/patients/{patient_id}")
    foreign_end = other_doctor.delete(f"/medical/patient-links/{second}")
    ended = doctor.delete(f"/medical/patient-links/{second}")
    after_end = doctor.get(f"/medical/patients/{patient_id}")

    assert revoked.status_code == 204
    assert after_revoke.status_code == 403
    assert revoked_again.status_code == 404
    assert restored.status_code == 200
    assert foreign_end.status_code == 404
    assert ended.status_code == 204
    assert after_end.status_code == 403
    assert patient.get("/me/care-doctors").json() == []


def test_suspended_doctor_loses_direct_access(make_client, engine):
    admin = login(make_client, "admin@email.com")
    patient, user_id = register_patient(make_client)
    patient_id = patient_id_of(engine, user_id)
    payload_email = f"medico.direto.{uuid4().hex[:8]}@example.com"
    invitation = admin.post(
        "/admin/doctor-invitations",
        json={
            "cpf": make_cpf(),
            "display_name": "Dr. Direto",
            "email": payload_email,
            "crm_number": str(700000 + int(uuid4().int % 99999)),
            "crm_state": "SP",
        },
    ).json()
    doctor = make_client()
    from test_administrative_governance import claim

    assert claim(doctor, invitation["token"], payload_email).status_code == 201
    doctor_id = next(
        item["doctor_id"]
        for item in admin.get("/admin/doctors").json()["items"]
        if item["display_name"] == "Dr. Direto"
    )
    admin.post(f"/admin/doctors/{doctor_id}/status", json={"action": "verify"})
    link_id = request_link(doctor, cpf_of(engine, user_id)).json()["link_id"]
    patient.post(f"/me/care-requests/{link_id}/accept")
    access_before = doctor.get(f"/medical/patients/{patient_id}")

    admin.post(f"/admin/doctors/{doctor_id}/status", json={"action": "suspend"})

    assert access_before.status_code == 200
    assert doctor.get(f"/medical/patients/{patient_id}").status_code == 403
    assert seed_doctor_id(engine, "marcos.nunes@email.com") != doctor_id
