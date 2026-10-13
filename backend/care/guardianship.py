from typing import Any

from fastapi import HTTPException, status

from audit.service import record_clinical_event
from auth.dependencies import calculate_age
from care.provisional import issue_claim
from pagination import PageRequest, fetch_page, search_clause


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
        SELECT p.patient_id, g.guardianship_id,
               u.claimed_at IS NOT NULL AS has_own_access,
               p.nome_paciente AS preferred_name,
               p.nome_completo AS full_name, p.avatar AS avatar_url,
               p.status_saude AS health_status, p.tipo_sanguineo AS blood_type,
               p.tipo_sanguineo_origem AS blood_type_source,
               p.data_nascimento AS birth_date
        FROM patient_guardianships g
        JOIN patients p ON p.patient_id = g.dependent_patient_id
        JOIN users u ON u.user_id = p.user_id
        WHERE g.guardian_patient_id = %s AND g.status = 'active'
        ORDER BY p.nome_paciente, p.patient_id
        """,
        (guardian_patient_id,),
    )
    dependents = []
    for row in cursor.fetchall():
        age = calculate_age(row.pop("birth_date"))
        dependents.append({
            **row,
            "has_own_access": bool(row["has_own_access"]),
            "age": age,
            "is_adult": age >= 18,
        })
    return dependents


def list_pending_guardianships(
    cursor: Any,
    *,
    guardian_patient_id: int,
    request: PageRequest,
) -> dict:
    search, search_params = search_clause(
        request.query,
        ["p.nome_completo", "p.nome_paciente"],
    )
    return fetch_page(
        cursor,
        columns="""g.guardianship_id, p.nome_completo AS dependent_full_name,
                   p.nome_paciente AS dependent_preferred_name, g.relationship,
                   du.display_name AS requested_by""",
        source=f"""FROM patient_guardianships g
        JOIN patients p ON p.patient_id = g.dependent_patient_id
        LEFT JOIN doctors d ON d.doctor_id = g.created_by_doctor_id
        LEFT JOIN users du ON du.user_id = d.user_id
        WHERE g.guardian_patient_id = %s
          AND g.status = 'pending'
          AND g.accepted_at IS NULL{search}""",
        params=(guardian_patient_id, *search_params),
        order_by="g.created_at, g.guardianship_id",
        request=request,
    )


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
    if accept:
        cursor.execute(
            """
            UPDATE patient_guardianships
            SET status = IF(
                    requires_dependent_confirmation AND dependent_confirmed_at IS NULL,
                    'pending',
                    'active'
                ),
                accepted_at = UTC_TIMESTAMP(6),
                updated_at = UTC_TIMESTAMP(6)
            WHERE guardianship_id = %s
            """,
            (guardianship_id,),
        )
    else:
        cursor.execute(
            """
            UPDATE patient_guardianships
            SET status = 'rejected', ended_at = UTC_TIMESTAMP(6),
                updated_at = UTC_TIMESTAMP(6)
            WHERE guardianship_id = %s
            """,
            (guardianship_id,),
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


def list_my_guardians(cursor: Any, *, patient_id: int, request: PageRequest) -> dict:
    search, search_params = search_clause(request.query, ["gu.display_name"])
    return fetch_page(
        cursor,
        columns="""g.guardianship_id, gu.display_name AS guardian_display_name,
                   g.relationship, g.status,
                   (g.status = 'pending') AS awaiting_my_confirmation""",
        source=f"""FROM patient_guardianships g
        JOIN patients gp ON gp.patient_id = g.guardian_patient_id
        JOIN users gu ON gu.user_id = gp.user_id
        WHERE g.dependent_patient_id = %s
          AND (
              g.status = 'active'
              OR (
                  g.status = 'pending'
                  AND g.requires_dependent_confirmation
                  AND g.dependent_confirmed_at IS NULL
              )
          ){search}""",
        params=(patient_id, *search_params),
        order_by="g.created_at, g.guardianship_id",
        request=request,
        mapper=lambda row: {
            **row,
            "awaiting_my_confirmation": bool(row["awaiting_my_confirmation"]),
        },
    )


def confirm_guardianship(cursor: Any, *, dependent: dict, guardianship_id: int) -> None:
    cursor.execute(
        """
        SELECT guardianship_id
        FROM patient_guardianships
        WHERE guardianship_id = %s
          AND dependent_patient_id = %s
          AND status = 'pending'
          AND requires_dependent_confirmation
          AND dependent_confirmed_at IS NULL
        FOR UPDATE
        """,
        (guardianship_id, dependent["patient_id"]),
    )
    if not cursor.fetchone():
        raise _not_found()
    cursor.execute(
        """
        UPDATE patient_guardianships
        SET dependent_confirmed_at = UTC_TIMESTAMP(6),
            status = IF(accepted_at IS NULL, 'pending', 'active'),
            updated_at = UTC_TIMESTAMP(6)
        WHERE guardianship_id = %s
        """,
        (guardianship_id,),
    )
    _record(
        cursor,
        actor_user_id=dependent["user_id"],
        dependent_id=dependent["patient_id"],
        action="guardianship.confirmed_by_dependent",
        guardianship_id=guardianship_id,
    )


def release_guardian(cursor: Any, *, dependent: dict, guardianship_id: int) -> None:
    if calculate_age(dependent["data_nascimento"]) < 18:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Menores de idade não removem responsáveis.",
        )
    cursor.execute(
        """
        SELECT guardianship_id
        FROM patient_guardianships
        WHERE guardianship_id = %s
          AND dependent_patient_id = %s
          AND status = 'active'
        FOR UPDATE
        """,
        (guardianship_id, dependent["patient_id"]),
    )
    if not cursor.fetchone():
        raise _not_found()
    cursor.execute(
        """
        UPDATE patient_guardianships
        SET status = 'released', ended_at = UTC_TIMESTAMP(6),
            updated_at = UTC_TIMESTAMP(6)
        WHERE guardianship_id = %s
        """,
        (guardianship_id,),
    )
    _record(
        cursor,
        actor_user_id=dependent["user_id"],
        dependent_id=dependent["patient_id"],
        action="guardianship.released_by_dependent",
        guardianship_id=guardianship_id,
    )


def issue_transfer(cursor: Any, *, guardian: dict, dependent_patient_id: int) -> dict:
    cursor.execute(
        """
        SELECT p.data_nascimento AS birth_date, u.claimed_at
        FROM patient_guardianships g
        JOIN patients p ON p.patient_id = g.dependent_patient_id
        JOIN users u ON u.user_id = p.user_id
        WHERE g.guardian_patient_id = %s
          AND g.dependent_patient_id = %s
          AND g.status = 'active'
        FOR UPDATE
        """,
        (guardian["patient_id"], dependent_patient_id),
    )
    dependent = cursor.fetchone()
    if not dependent:
        raise _not_found()
    if calculate_age(dependent["birth_date"]) < 18 or dependent["claimed_at"] is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Transferência disponível somente para dependente adulto sem acesso próprio.",
        )
    claim = issue_claim(
        cursor,
        patient_id=dependent_patient_id,
        issued_by_user_id=guardian["user_id"],
        claim_type="transfer",
    )
    return {**claim, "recipient": "patient"}
