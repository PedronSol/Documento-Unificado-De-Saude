from typing import Any

from fastapi import HTTPException, status

from auth.dependencies import calculate_age
from audit.service import record_clinical_event
from care.provisional import create_guardianship, create_provisional_patient
from models import GuardianData, ProvisionalPatientData


LINK_REQUEST_DURATION_DAYS = 7
MASKED_CPF = (
    "CONCAT('***.', SUBSTRING(u.cpf, 4, 3), '.', SUBSTRING(u.cpf, 7, 3), '-**')"
)


def _not_found() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Recurso não encontrado.",
    )


def _conflict(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)


def _record(cursor: Any, *, actor_user_id: int, patient_id: int, action: str, link_id: int):
    record_clinical_event(
        cursor,
        actor_user_id=actor_user_id,
        patient_id=patient_id,
        action=action,
        resource_type="doctor_patient_link",
        resource_id=link_id,
    )


def request_direct_link(
    cursor: Any,
    *,
    doctor: dict,
    cpf: str,
    provisional: ProvisionalPatientData | None = None,
    guardian: GuardianData | None = None,
) -> dict:
    cursor.execute(
        """
        SELECT u.user_id, u.active, p.patient_id,
               p.data_nascimento AS birth_date,
               EXISTS (
                   SELECT 1 FROM user_roles ur
                   WHERE ur.user_id = u.user_id AND ur.role = 'patient'
               ) AS is_patient,
               EXISTS (
                   SELECT 1 FROM user_roles ur
                   WHERE ur.user_id = u.user_id AND ur.role = 'admin'
               ) AS is_admin
        FROM users u
        LEFT JOIN patients p ON p.user_id = u.user_id
        WHERE u.cpf = %s
        """,
        (cpf,),
    )
    target = cursor.fetchone()
    if not target and provisional is not None:
        return create_provisional_patient(
            cursor,
            doctor=doctor,
            cpf=cpf,
            data=provisional,
            guardian=guardian,
        )
    if not target:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Paciente não encontrado.",
        )
    if (
        not target["active"]
        or not target["is_patient"]
        or target["is_admin"]
        or target["patient_id"] is None
        or target["user_id"] == doctor["user_id"]
    ):
        raise _conflict("CPF indisponível para vínculo.")
    guardian_claim = None
    if calculate_age(target["birth_date"]) < 18 and not _has_active_guardian(
        cursor, target["patient_id"]
    ):
        if guardian is None:
            raise _conflict("Paciente menor exige responsável.")
        guardian_claim = create_guardianship(
            cursor,
            doctor=doctor,
            dependent_patient_id=target["patient_id"],
            guardian=guardian,
            requires_dependent_confirmation=True,
        )

    patient_id = target["patient_id"]
    cursor.execute(
        "SELECT patient_id FROM patients WHERE patient_id = %s FOR UPDATE",
        (patient_id,),
    )
    cursor.fetchone()
    cursor.execute(
        """
        UPDATE doctor_patient_links
        SET status = 'expired', updated_at = UTC_TIMESTAMP(6)
        WHERE doctor_id = %s AND patient_id = %s
          AND status = 'pending' AND expires_at <= UTC_TIMESTAMP(6)
        """,
        (doctor["doctor_id"], patient_id),
    )
    cursor.execute(
        """
        SELECT 1 FROM doctor_patient_links
        WHERE doctor_id = %s AND patient_id = %s
          AND status IN ('pending', 'active')
        """,
        (doctor["doctor_id"], patient_id),
    )
    if cursor.fetchone():
        raise _conflict("Já existe solicitação ou vínculo aberto com este paciente.")
    cursor.execute(
        """
        INSERT INTO doctor_patient_links (
            doctor_id, patient_id, origin, status, expires_at
        ) VALUES (
            %s, %s, 'request', 'pending', UTC_TIMESTAMP(6) + INTERVAL %s DAY
        )
        """,
        (doctor["doctor_id"], patient_id, LINK_REQUEST_DURATION_DAYS),
    )
    link_id = cursor.lastrowid
    _record(
        cursor,
        actor_user_id=doctor["user_id"],
        patient_id=patient_id,
        action="care_link.direct_requested",
        link_id=link_id,
    )
    return {"result": "request_sent", "link_id": link_id, "claim": guardian_claim}


def _has_active_guardian(cursor: Any, patient_id: int) -> bool:
    cursor.execute(
        """
        SELECT 1 FROM patient_guardianships
        WHERE dependent_patient_id = %s AND status = 'active'
        LIMIT 1
        """,
        (patient_id,),
    )
    return cursor.fetchone() is not None


def list_doctor_pending_links(cursor: Any, *, doctor_id: int) -> list[dict]:
    cursor.execute(
        f"""
        SELECT dpl.link_id, u.display_name AS patient_display_name,
               {MASKED_CPF} AS masked_cpf, dpl.expires_at
        FROM doctor_patient_links dpl
        JOIN patients p ON p.patient_id = dpl.patient_id
        JOIN users u ON u.user_id = p.user_id
        WHERE dpl.doctor_id = %s
          AND dpl.status = 'pending'
          AND dpl.expires_at > UTC_TIMESTAMP(6)
        ORDER BY dpl.created_at DESC, dpl.link_id DESC
        LIMIT 50
        """,
        (doctor_id,),
    )
    return cursor.fetchall()


def end_doctor_link(cursor: Any, *, doctor: dict, link_id: int) -> None:
    cursor.execute(
        """
        SELECT link_id, patient_id, status
        FROM doctor_patient_links
        WHERE link_id = %s AND doctor_id = %s
          AND (status = 'active'
               OR (status = 'pending' AND expires_at > UTC_TIMESTAMP(6)))
        FOR UPDATE
        """,
        (link_id, doctor["doctor_id"]),
    )
    link = cursor.fetchone()
    if not link:
        raise _not_found()
    cancelled = link["status"] == "pending"
    cursor.execute(
        """
        UPDATE doctor_patient_links
        SET status = %s, ended_at = UTC_TIMESTAMP(6),
            updated_at = UTC_TIMESTAMP(6)
        WHERE link_id = %s
        """,
        ("cancelled" if cancelled else "revoked", link_id),
    )
    _record(
        cursor,
        actor_user_id=doctor["user_id"],
        patient_id=link["patient_id"],
        action="care_link.direct_cancelled" if cancelled else "care_link.direct_ended",
        link_id=link_id,
    )


def list_patient_care_requests(cursor: Any, *, patient_id: int) -> list[dict]:
    cursor.execute(
        """
        SELECT dpl.link_id, u.display_name AS doctor_display_name,
               d.crm_number, d.crm_state, dpl.expires_at
        FROM doctor_patient_links dpl
        JOIN doctors d ON d.doctor_id = dpl.doctor_id
        JOIN users u ON u.user_id = d.user_id
        WHERE dpl.patient_id = %s
          AND dpl.status = 'pending'
          AND dpl.expires_at > UTC_TIMESTAMP(6)
        ORDER BY dpl.created_at, dpl.link_id
        """,
        (patient_id,),
    )
    return cursor.fetchall()


def list_patient_care_doctors(cursor: Any, *, patient_id: int) -> list[dict]:
    cursor.execute(
        """
        SELECT dpl.link_id, u.display_name AS doctor_display_name,
               d.crm_number, d.crm_state,
               COALESCE(dpl.decided_at, dpl.created_at) AS since
        FROM doctor_patient_links dpl
        JOIN doctors d ON d.doctor_id = dpl.doctor_id
        JOIN users u ON u.user_id = d.user_id
        WHERE dpl.patient_id = %s AND dpl.status = 'active'
        ORDER BY u.display_name, dpl.link_id
        """,
        (patient_id,),
    )
    return cursor.fetchall()


def decide_care_request(
    cursor: Any,
    *,
    patient: dict,
    link_id: int,
    accept: bool,
) -> None:
    cursor.execute(
        """
        SELECT link_id
        FROM doctor_patient_links
        WHERE link_id = %s AND patient_id = %s
          AND status = 'pending' AND expires_at > UTC_TIMESTAMP(6)
        FOR UPDATE
        """,
        (link_id, patient["patient_id"]),
    )
    if not cursor.fetchone():
        raise _not_found()
    cursor.execute(
        """
        UPDATE doctor_patient_links
        SET status = %s, decided_by_user_id = %s,
            decided_at = UTC_TIMESTAMP(6), updated_at = UTC_TIMESTAMP(6)
        WHERE link_id = %s
        """,
        ("active" if accept else "rejected", patient["user_id"], link_id),
    )
    _record(
        cursor,
        actor_user_id=patient["user_id"],
        patient_id=patient["patient_id"],
        action="care_link.direct_accepted" if accept else "care_link.direct_rejected",
        link_id=link_id,
    )


def revoke_care_doctor(cursor: Any, *, patient: dict, link_id: int) -> None:
    cursor.execute(
        """
        SELECT link_id
        FROM doctor_patient_links
        WHERE link_id = %s AND patient_id = %s AND status = 'active'
        FOR UPDATE
        """,
        (link_id, patient["patient_id"]),
    )
    if not cursor.fetchone():
        raise _not_found()
    cursor.execute(
        """
        UPDATE doctor_patient_links
        SET status = 'revoked', ended_at = UTC_TIMESTAMP(6),
            updated_at = UTC_TIMESTAMP(6)
        WHERE link_id = %s
        """,
        (link_id,),
    )
    _record(
        cursor,
        actor_user_id=patient["user_id"],
        patient_id=patient["patient_id"],
        action="care_link.direct_revoked",
        link_id=link_id,
    )
