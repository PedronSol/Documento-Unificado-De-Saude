from typing import Any

from fastapi import HTTPException, status

from audit.service import record_clinical_event
from auth.dependencies import calculate_age


def _not_found() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Recurso não encontrado.",
    )


def _record(cursor: Any, *, actor_user_id: int, dependent_id: int, action: str, guardianship_id: int):
    record_clinical_event(
        cursor,
        actor_user_id=actor_user_id,
        patient_id=dependent_id,
        action=action,
        resource_type="patient_guardianship",
        resource_id=guardianship_id,
    )


def list_dependents(cursor: Any, *, guardian_patient_id: int) -> list[dict]:
    cursor.execute(
        """
        SELECT p.patient_id, g.guardianship_id, p.nome_paciente AS preferred_name,
               p.nome_completo AS full_name, p.avatar AS avatar_url,
               p.status_saude AS health_status, p.tipo_sanguineo AS blood_type,
               p.data_nascimento AS birth_date
        FROM patient_guardianships g
        JOIN patients p ON p.patient_id = g.dependent_patient_id
        WHERE g.guardian_patient_id = %s AND g.status = 'active'
        ORDER BY p.nome_paciente, p.patient_id
        """,
        (guardian_patient_id,),
    )
    dependents = []
    for row in cursor.fetchall():
        age = calculate_age(row.pop("birth_date"))
        dependents.append({**row, "age": age, "is_adult": age >= 18})
    return dependents


def list_pending_guardianships(cursor: Any, *, guardian_patient_id: int) -> list[dict]:
    cursor.execute(
        """
        SELECT g.guardianship_id, p.nome_completo AS dependent_full_name,
               p.nome_paciente AS dependent_preferred_name, g.relationship,
               du.display_name AS requested_by
        FROM patient_guardianships g
        JOIN patients p ON p.patient_id = g.dependent_patient_id
        LEFT JOIN doctors d ON d.doctor_id = g.created_by_doctor_id
        LEFT JOIN users du ON du.user_id = d.user_id
        WHERE g.guardian_patient_id = %s AND g.status = 'pending'
        ORDER BY g.created_at, g.guardianship_id
        """,
        (guardian_patient_id,),
    )
    return cursor.fetchall()


def _lock_own_guardianship(cursor: Any, *, guardian: dict, guardianship_id: int, status_value: str) -> dict:
    cursor.execute(
        """
        SELECT g.guardianship_id, g.dependent_patient_id,
               p.data_nascimento AS dependent_birth_date
        FROM patient_guardianships g
        JOIN patients p ON p.patient_id = g.dependent_patient_id
        WHERE g.guardianship_id = %s
          AND g.guardian_patient_id = %s
          AND g.status = %s
        FOR UPDATE
        """,
        (guardianship_id, guardian["patient_id"], status_value),
    )
    guardianship = cursor.fetchone()
    if not guardianship:
        raise _not_found()
    return guardianship


def decide_guardianship(
    cursor: Any,
    *,
    guardian: dict,
    guardianship_id: int,
    accept: bool,
    dependent_birth_date=None,
) -> None:
    guardianship = _lock_own_guardianship(
        cursor,
        guardian=guardian,
        guardianship_id=guardianship_id,
        status_value="pending",
    )
    if accept and guardianship["dependent_birth_date"] != dependent_birth_date:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Os dados do dependente não conferem.",
        )
    cursor.execute(
        """
        UPDATE patient_guardianships
        SET status = %s, accepted_at = IF(%s, UTC_TIMESTAMP(6), accepted_at),
            ended_at = IF(%s, ended_at, UTC_TIMESTAMP(6)),
            updated_at = UTC_TIMESTAMP(6)
        WHERE guardianship_id = %s
        """,
        ("active" if accept else "rejected", accept, accept, guardianship_id),
    )
    _record(
        cursor,
        actor_user_id=guardian["user_id"],
        dependent_id=guardianship["dependent_patient_id"],
        action="guardianship.accepted" if accept else "guardianship.rejected",
        guardianship_id=guardianship_id,
    )


def renounce_guardianship(cursor: Any, *, guardian: dict, guardianship_id: int) -> None:
    guardianship = _lock_own_guardianship(
        cursor,
        guardian=guardian,
        guardianship_id=guardianship_id,
        status_value="active",
    )
    dependent_id = guardianship["dependent_patient_id"]
    if calculate_age(guardianship["dependent_birth_date"]) < 18:
        cursor.execute(
            """
            SELECT
                EXISTS (
                    SELECT 1 FROM patient_guardianships
                    WHERE dependent_patient_id = %s AND status = 'active'
                      AND guardianship_id <> %s
                ) AS other_guardian,
                EXISTS (
                    SELECT 1 FROM doctor_patient_links
                    WHERE patient_id = %s AND status = 'active'
                ) OR EXISTS (
                    SELECT 1 FROM patient_care_groups
                    WHERE patient_id = %s AND status = 'active'
                      AND (ends_at IS NULL OR ends_at > UTC_TIMESTAMP(6))
                ) AS medical_access
            """,
            (dependent_id, guardianship_id, dependent_id, dependent_id),
        )
        state = cursor.fetchone()
        if not state["other_guardian"] and state["medical_access"]:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Último responsável não renuncia enquanto houver médicos com acesso.",
            )
    cursor.execute(
        """
        UPDATE patient_guardianships
        SET status = 'renounced', ended_at = UTC_TIMESTAMP(6),
            updated_at = UTC_TIMESTAMP(6)
        WHERE guardianship_id = %s
        """,
        (guardianship_id,),
    )
    _record(
        cursor,
        actor_user_id=guardian["user_id"],
        dependent_id=dependent_id,
        action="guardianship.renounced",
        guardianship_id=guardianship_id,
    )
