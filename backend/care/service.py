from typing import Any

from fastapi import HTTPException, status

from audit.service import record_administrative_event


def _not_found() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Recurso não encontrado.",
    )


def _care_team(cursor: Any, group_id: int) -> list[dict]:
    cursor.execute(
        """
        SELECT u.display_name, d.crm_number, d.crm_state
        FROM doctor_care_groups dcg
        JOIN doctors d ON d.doctor_id = dcg.doctor_id
        JOIN users u ON u.user_id = d.user_id
        WHERE dcg.care_group_id = %s
          AND dcg.status = 'active'
          AND dcg.starts_at <= UTC_TIMESTAMP(6)
          AND (dcg.ends_at IS NULL OR dcg.ends_at > UTC_TIMESTAMP(6))
          AND d.verification_status = 'verified'
          AND d.professional_status = 'active'
          AND u.active = TRUE
        ORDER BY u.display_name, d.doctor_id
        """,
        (group_id,),
    )
    return cursor.fetchall()


def list_patient_invitations(cursor: Any, *, patient_id: int) -> list[dict]:
    cursor.execute(
        """
        SELECT ci.care_invitation_id AS invitation_id, ci.care_group_id,
               cg.name AS care_group_name, ci.expires_at
        FROM care_group_patient_invitations ci
        JOIN care_groups cg ON cg.care_group_id = ci.care_group_id
        WHERE ci.patient_id = %s
          AND ci.status = 'pending'
          AND ci.expires_at > UTC_TIMESTAMP(6)
          AND cg.status = 'active'
        ORDER BY ci.created_at, ci.care_invitation_id
        """,
        (patient_id,),
    )
    invitations = cursor.fetchall()
    return [
        {**invitation, "doctors": _care_team(cursor, invitation["care_group_id"])}
        for invitation in invitations
    ]


def list_patient_care_groups(cursor: Any, *, patient_id: int) -> list[dict]:
    cursor.execute(
        """
        SELECT cg.care_group_id, cg.name, pcg.starts_at
        FROM patient_care_groups pcg
        JOIN care_groups cg ON cg.care_group_id = pcg.care_group_id
        WHERE pcg.patient_id = %s
          AND pcg.status = 'active'
          AND (pcg.ends_at IS NULL OR pcg.ends_at > UTC_TIMESTAMP(6))
          AND cg.status = 'active'
        ORDER BY cg.name, cg.care_group_id
        """,
        (patient_id,),
    )
    groups = cursor.fetchall()
    return [
        {**group, "doctors": _care_team(cursor, group["care_group_id"])}
        for group in groups
    ]


def decide_invitation(
    cursor: Any,
    *,
    patient: dict,
    invitation_id: int,
    accept: bool,
) -> None:
    cursor.execute(
        """
        SELECT ci.care_group_id, cg.managed_by_admin_user_id
        FROM care_group_patient_invitations ci
        JOIN care_groups cg ON cg.care_group_id = ci.care_group_id
        WHERE ci.care_invitation_id = %s
          AND ci.patient_id = %s
          AND ci.status = 'pending'
          AND ci.expires_at > UTC_TIMESTAMP(6)
          AND cg.status = 'active'
        FOR UPDATE
        """,
        (invitation_id, patient["patient_id"]),
    )
    invitation = cursor.fetchone()
    if not invitation:
        raise _not_found()

    cursor.execute(
        """
        UPDATE care_group_patient_invitations
        SET status = %s, decided_at = UTC_TIMESTAMP(6),
            updated_at = UTC_TIMESTAMP(6)
        WHERE care_invitation_id = %s
        """,
        ("accepted" if accept else "rejected", invitation_id),
    )
    if accept:
        cursor.execute(
            """
            INSERT INTO patient_care_groups (
                care_group_id, patient_id, status, starts_at, ends_at
            ) VALUES (%s, %s, 'active', UTC_TIMESTAMP(6), NULL)
            ON DUPLICATE KEY UPDATE
                status = 'active',
                starts_at = UTC_TIMESTAMP(6),
                ends_at = NULL,
                updated_at = UTC_TIMESTAMP(6)
            """,
            (invitation["care_group_id"], patient["patient_id"]),
        )
    record_administrative_event(
        cursor,
        actor_user_id=patient["user_id"],
        managing_admin_user_id=invitation["managed_by_admin_user_id"],
        action="care_link.accepted" if accept else "care_link.rejected",
        target_type="care_group",
        target_id=invitation["care_group_id"],
        details={"invitation_id": invitation_id},
    )


def end_patient_link(
    cursor: Any,
    *,
    actor_user_id: int,
    group_id: int,
    patient_id: int,
) -> None:
    cursor.execute(
        """
        SELECT pcg.care_group_id, cg.managed_by_admin_user_id
        FROM patient_care_groups pcg
        JOIN care_groups cg ON cg.care_group_id = pcg.care_group_id
        WHERE pcg.care_group_id = %s
          AND pcg.patient_id = %s
          AND pcg.status = 'active'
          AND (pcg.ends_at IS NULL OR pcg.ends_at > UTC_TIMESTAMP(6))
        FOR UPDATE
        """,
        (group_id, patient_id),
    )
    link = cursor.fetchone()
    if not link:
        raise _not_found()
    cursor.execute(
        """
        UPDATE patient_care_groups
        SET status = 'inactive', ends_at = UTC_TIMESTAMP(6),
            updated_at = UTC_TIMESTAMP(6)
        WHERE care_group_id = %s AND patient_id = %s
        """,
        (group_id, patient_id),
    )
    record_administrative_event(
        cursor,
        actor_user_id=actor_user_id,
        managing_admin_user_id=link["managed_by_admin_user_id"],
        action="care_link.revoked",
        target_type="care_group",
        target_id=group_id,
    )
