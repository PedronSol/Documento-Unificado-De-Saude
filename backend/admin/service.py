import json
from typing import Any

from fastapi import HTTPException, status

from models import _normalize_cpf

from audit.service import record_administrative_event
from care.service import end_patient_link
from models import DoctorInvitationCreate
from security import create_invitation_token, hash_invitation_token


INVITATION_DURATION_DAYS = 7
MAX_PAGE_SIZE = 20


def not_found() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Recurso não encontrado.",
    )


def conflict(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)


def page_slice(rows: list[dict], *, page: int, page_size: int) -> dict:
    return {
        "items": rows[:page_size],
        "page": page,
        "has_next": len(rows) > page_size,
    }


def issue_doctor_invitation(
    cursor: Any,
    *,
    admin_user_id: int,
    invitation: DoctorInvitationCreate,
) -> dict:
    cursor.execute(
        """
        SELECT
            EXISTS (
                SELECT 1 FROM doctor_invitations
                WHERE status = 'pending'
                  AND expires_at > UTC_TIMESTAMP(6)
                  AND (email = %s OR cpf = %s
                       OR (crm_number = %s AND crm_state = %s))
            ) OR EXISTS (
                SELECT 1 FROM doctors
                WHERE crm_number = %s AND crm_state = %s
            ) AS duplicated
        """,
        (
            invitation.email,
            invitation.cpf,
            invitation.crm_number,
            invitation.crm_state,
            invitation.crm_number,
            invitation.crm_state,
        ),
    )
    if cursor.fetchone()["duplicated"]:
        raise conflict("Já existe convite ou perfil profissional com esses dados.")

    raw_token = create_invitation_token()
    cursor.execute(
        """
        INSERT INTO doctor_invitations (
            token_hash, created_by_admin_user_id, cpf, display_name, email,
            crm_number, crm_state, status, expires_at
        ) VALUES (
            %s, %s, %s, %s, %s, %s, %s, 'pending',
            UTC_TIMESTAMP(6) + INTERVAL %s DAY
        )
        """,
        (
            hash_invitation_token(raw_token),
            admin_user_id,
            invitation.cpf,
            invitation.display_name,
            invitation.email,
            invitation.crm_number,
            invitation.crm_state,
            INVITATION_DURATION_DAYS,
        ),
    )
    invitation_id = cursor.lastrowid
    record_administrative_event(
        cursor,
        actor_user_id=admin_user_id,
        managing_admin_user_id=admin_user_id,
        action="doctor_invitation.issued",
        target_type="doctor_invitation",
        target_id=invitation_id,
        details={"crm_state": invitation.crm_state},
    )
    cursor.execute(
        """
        SELECT expires_at
        FROM doctor_invitations
        WHERE doctor_invitation_id = %s
        """,
        (invitation_id,),
    )
    return {
        "invitation_id": invitation_id,
        "status": "pending",
        "expires_at": cursor.fetchone()["expires_at"],
        "token": raw_token,
    }


def list_doctor_invitations(
    cursor: Any,
    *,
    admin_user_id: int,
    page: int,
    page_size: int,
) -> dict:
    cursor.execute(
        """
        SELECT doctor_invitation_id AS invitation_id, display_name, email,
               crm_number, crm_state,
               IF(status = 'pending' AND expires_at <= UTC_TIMESTAMP(6),
                  'expired', status) AS status,
               expires_at
        FROM doctor_invitations
        WHERE created_by_admin_user_id = %s
        ORDER BY created_at DESC, doctor_invitation_id DESC
        LIMIT %s OFFSET %s
        """,
        (admin_user_id, page_size + 1, (page - 1) * page_size),
    )
    return page_slice(cursor.fetchall(), page=page, page_size=page_size)


def revoke_doctor_invitation(
    cursor: Any,
    *,
    admin_user_id: int,
    invitation_id: int,
) -> None:
    cursor.execute(
        """
        SELECT doctor_invitation_id
        FROM doctor_invitations
        WHERE doctor_invitation_id = %s
          AND created_by_admin_user_id = %s
          AND status = 'pending'
        FOR UPDATE
        """,
        (invitation_id, admin_user_id),
    )
    if not cursor.fetchone():
        raise not_found()
    cursor.execute(
        """
        UPDATE doctor_invitations
        SET status = 'revoked', updated_at = UTC_TIMESTAMP(6)
        WHERE doctor_invitation_id = %s
        """,
        (invitation_id,),
    )
    record_administrative_event(
        cursor,
        actor_user_id=admin_user_id,
        managing_admin_user_id=admin_user_id,
        action="doctor_invitation.revoked",
        target_type="doctor_invitation",
        target_id=invitation_id,
    )


def accept_doctor_invitation(
    cursor: Any,
    *,
    invitation_token: str,
    external_identity: dict[str, str],
) -> int:
    cursor.execute(
        """
        SELECT doctor_invitation_id, created_by_admin_user_id, cpf,
               display_name, email, crm_number, crm_state
        FROM doctor_invitations
        WHERE token_hash = %s
          AND status = 'pending'
          AND expires_at > UTC_TIMESTAMP(6)
        FOR UPDATE
        """,
        (hash_invitation_token(invitation_token),),
    )
    invitation = cursor.fetchone()
    if not invitation or invitation["email"] != external_identity["email"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Convite profissional inválido.",
        )

    cursor.execute(
        """
        SELECT u.user_id, u.cpf, u.active,
               EXISTS (
                   SELECT 1 FROM user_roles ur
                   WHERE ur.user_id = u.user_id
                     AND ur.role IN ('admin', 'doctor')
               ) AS privileged
        FROM external_identities ei
        JOIN users u ON u.user_id = ei.user_id
        WHERE ei.issuer = %s AND ei.subject = %s
        FOR UPDATE
        """,
        (external_identity["issuer"], external_identity["subject"]),
    )
    linked_user = cursor.fetchone()
    if linked_user:
        if (
            not linked_user["active"]
            or linked_user["privileged"]
            or linked_user["cpf"] != invitation["cpf"]
        ):
            raise conflict("Conta incompatível com o convite profissional.")
        user_id = linked_user["user_id"]
    else:
        cursor.execute(
            "SELECT 1 FROM users WHERE email = %s OR cpf = %s",
            (invitation["email"], invitation["cpf"]),
        )
        if cursor.fetchone():
            raise conflict(
                "Entre com sua conta e vincule o Google antes de concluir o convite."
            )
        cursor.execute(
            """
            INSERT INTO users (cpf, display_name, email, password_hash, active)
            VALUES (%s, %s, %s, NULL, TRUE)
            """,
            (invitation["cpf"], invitation["display_name"], invitation["email"]),
        )
        user_id = cursor.lastrowid
        cursor.execute(
            """
            INSERT INTO external_identities (user_id, provider, issuer, subject)
            VALUES (%s, 'google', %s, %s)
            """,
            (user_id, external_identity["issuer"], external_identity["subject"]),
        )

    cursor.execute(
        "INSERT INTO user_roles (user_id, role) VALUES (%s, 'doctor')",
        (user_id,),
    )
    cursor.execute(
        """
        INSERT INTO doctors (
            user_id, crm_number, crm_state, verification_status,
            created_by_admin_user_id, professional_status
        ) VALUES (%s, %s, %s, 'pending', %s, 'active')
        """,
        (
            user_id,
            invitation["crm_number"],
            invitation["crm_state"],
            invitation["created_by_admin_user_id"],
        ),
    )
    cursor.execute(
        """
        UPDATE doctor_invitations
        SET status = 'accepted', accepted_user_id = %s,
            updated_at = UTC_TIMESTAMP(6)
        WHERE doctor_invitation_id = %s
        """,
        (user_id, invitation["doctor_invitation_id"]),
    )
    record_administrative_event(
        cursor,
        actor_user_id=user_id,
        managing_admin_user_id=invitation["created_by_admin_user_id"],
        action="doctor_invitation.accepted",
        target_type="doctor_invitation",
        target_id=invitation["doctor_invitation_id"],
    )
    return user_id


DOCTOR_TRANSITIONS = {
    "verify": ("verification_status", ("pending",), "verified", "doctor.verified"),
    "reject": ("verification_status", ("pending",), "rejected", "doctor.rejected"),
    "suspend": ("professional_status", ("active",), "suspended", "doctor.suspended"),
    "reactivate": (
        "professional_status",
        ("suspended",),
        "active",
        "doctor.reactivated",
    ),
    "deactivate": (
        "professional_status",
        ("active", "suspended"),
        "deactivated",
        "doctor.deactivated",
    ),
}
MASKED_CPF = (
    "CONCAT('***.', SUBSTRING(u.cpf, 4, 3), '.', SUBSTRING(u.cpf, 7, 3), '-**')"
)
ADMIN_DOCTOR_COLUMNS = f"""
    d.doctor_id, u.display_name, {MASKED_CPF} AS masked_cpf,
    d.crm_number, d.crm_state, d.verification_status,
    d.professional_status, d.verified_at
"""


def list_admin_doctors(
    cursor: Any,
    *,
    admin_user_id: int,
    page: int,
    page_size: int,
) -> dict:
    cursor.execute(
        f"""
        SELECT {ADMIN_DOCTOR_COLUMNS}
        FROM doctors d
        JOIN users u ON u.user_id = d.user_id
        WHERE d.created_by_admin_user_id = %s
        ORDER BY u.display_name, d.doctor_id
        LIMIT %s OFFSET %s
        """,
        (admin_user_id, page_size + 1, (page - 1) * page_size),
    )
    return page_slice(cursor.fetchall(), page=page, page_size=page_size)


def load_admin_doctor(
    cursor: Any,
    *,
    admin_user_id: int,
    doctor_id: int,
    for_update: bool = False,
) -> dict:
    cursor.execute(
        f"""
        SELECT {ADMIN_DOCTOR_COLUMNS}
        FROM doctors d
        JOIN users u ON u.user_id = d.user_id
        WHERE d.doctor_id = %s AND d.created_by_admin_user_id = %s
        {"FOR UPDATE" if for_update else ""}
        """,
        (doctor_id, admin_user_id),
    )
    doctor = cursor.fetchone()
    if not doctor:
        raise not_found()
    return doctor


def correct_doctor(
    cursor: Any,
    *,
    admin_user_id: int,
    doctor_id: int,
    crm_number: str,
    crm_state: str,
) -> dict:
    load_admin_doctor(
        cursor,
        admin_user_id=admin_user_id,
        doctor_id=doctor_id,
        for_update=True,
    )
    cursor.execute(
        """
        UPDATE doctors
        SET crm_number = %s, crm_state = %s,
            verification_status = 'pending', verified_at = NULL
        WHERE doctor_id = %s
        """,
        (crm_number, crm_state, doctor_id),
    )
    record_administrative_event(
        cursor,
        actor_user_id=admin_user_id,
        managing_admin_user_id=admin_user_id,
        action="doctor.corrected",
        target_type="doctor",
        target_id=doctor_id,
        details={"crm_state": crm_state},
    )
    return load_admin_doctor(cursor, admin_user_id=admin_user_id, doctor_id=doctor_id)


def change_doctor_status(
    cursor: Any,
    *,
    admin_user_id: int,
    doctor_id: int,
    action: str,
) -> dict:
    column, allowed_from, target, event = DOCTOR_TRANSITIONS[action]
    doctor = load_admin_doctor(
        cursor,
        admin_user_id=admin_user_id,
        doctor_id=doctor_id,
        for_update=True,
    )
    if doctor[column] not in allowed_from:
        raise conflict("Transição de status não permitida.")

    cursor.execute(
        f"""
        UPDATE doctors
        SET {column} = %s,
            verified_at = IF(%s = 'verified', UTC_TIMESTAMP(), verified_at)
        WHERE doctor_id = %s
        """,
        (target, target, doctor_id),
    )
    if action == "deactivate":
        cursor.execute(
            """
            UPDATE doctor_care_groups
            SET status = 'inactive', ends_at = UTC_TIMESTAMP(6),
                updated_at = UTC_TIMESTAMP(6)
            WHERE doctor_id = %s AND status = 'active'
            """,
            (doctor_id,),
        )
    record_administrative_event(
        cursor,
        actor_user_id=admin_user_id,
        managing_admin_user_id=admin_user_id,
        action=event,
        target_type="doctor",
        target_id=doctor_id,
    )
    return load_admin_doctor(cursor, admin_user_id=admin_user_id, doctor_id=doctor_id)


CPF_QUERY_CHARACTERS = frozenset("0123456789.- ")


def search_directory(cursor: Any, *, query: str, page: int, page_size: int) -> dict:
    normalized_cpf = _normalize_cpf(query)
    if set(query) <= CPF_QUERY_CHARACTERS and len(normalized_cpf) == 11:
        search_clause, search_value = "u.cpf = %s", normalized_cpf
    else:
        escaped = (
            " ".join(query.split())
            .replace("\\", "\\\\")
            .replace("%", "\\%")
            .replace("_", "\\_")
        )
        search_clause, search_value = "u.display_name LIKE %s", f"{escaped}%"
    cursor.execute(
        f"""
        SELECT u.user_id, u.display_name, {MASKED_CPF} AS masked_cpf,
               GROUP_CONCAT(ur.role ORDER BY FIELD(ur.role, 'patient', 'doctor'))
                   AS profiles
        FROM users u
        JOIN user_roles ur ON ur.user_id = u.user_id
        WHERE {search_clause}
          AND u.active = TRUE
          AND u.claimed_at IS NOT NULL
          AND ur.role IN ('patient', 'doctor')
          AND NOT EXISTS (
              SELECT 1 FROM user_roles admin_role
              WHERE admin_role.user_id = u.user_id
                AND admin_role.role = 'admin'
          )
        GROUP BY u.user_id, u.display_name, u.cpf
        ORDER BY u.display_name, u.user_id
        LIMIT %s OFFSET %s
        """,
        (search_value, page_size + 1, (page - 1) * page_size),
    )
    rows = [
        {**row, "profiles": row["profiles"].split(",")}
        for row in cursor.fetchall()
    ]
    return page_slice(rows, page=page, page_size=page_size)


def create_care_group(cursor: Any, *, admin_user_id: int, name: str) -> dict:
    cursor.execute(
        """
        INSERT INTO care_groups (name, status, managed_by_admin_user_id)
        VALUES (%s, 'active', %s)
        """,
        (name, admin_user_id),
    )
    group_id = cursor.lastrowid
    record_administrative_event(
        cursor,
        actor_user_id=admin_user_id,
        managing_admin_user_id=admin_user_id,
        action="care_group.created",
        target_type="care_group",
        target_id=group_id,
    )
    return {"care_group_id": group_id, "name": name, "status": "active"}


def list_care_groups(
    cursor: Any,
    *,
    admin_user_id: int,
    page: int,
    page_size: int,
) -> dict:
    cursor.execute(
        """
        SELECT care_group_id, name, status
        FROM care_groups
        WHERE managed_by_admin_user_id = %s
        ORDER BY name, care_group_id
        LIMIT %s OFFSET %s
        """,
        (admin_user_id, page_size + 1, (page - 1) * page_size),
    )
    return page_slice(cursor.fetchall(), page=page, page_size=page_size)


def load_care_group(
    cursor: Any,
    *,
    admin_user_id: int,
    group_id: int,
    for_update: bool = False,
) -> dict:
    cursor.execute(
        f"""
        SELECT care_group_id, name, status
        FROM care_groups
        WHERE care_group_id = %s AND managed_by_admin_user_id = %s
        {"FOR UPDATE" if for_update else ""}
        """,
        (group_id, admin_user_id),
    )
    group = cursor.fetchone()
    if not group:
        raise not_found()
    return group


def load_care_group_detail(cursor: Any, *, admin_user_id: int, group_id: int) -> dict:
    group = load_care_group(cursor, admin_user_id=admin_user_id, group_id=group_id)
    cursor.execute(
        f"""
        SELECT {ADMIN_DOCTOR_COLUMNS}
        FROM doctor_care_groups dcg
        JOIN doctors d ON d.doctor_id = dcg.doctor_id
        JOIN users u ON u.user_id = d.user_id
        WHERE dcg.care_group_id = %s
          AND dcg.status = 'active'
          AND (dcg.ends_at IS NULL OR dcg.ends_at > UTC_TIMESTAMP(6))
        ORDER BY u.display_name, d.doctor_id
        """,
        (group_id,),
    )
    doctors = cursor.fetchall()
    cursor.execute(
        f"""
        SELECT u.user_id, u.display_name, {MASKED_CPF} AS masked_cpf,
               'active' AS link_status, pcg.starts_at
        FROM patient_care_groups pcg
        JOIN patients p ON p.patient_id = pcg.patient_id
        JOIN users u ON u.user_id = p.user_id
        WHERE pcg.care_group_id = %s
          AND pcg.status = 'active'
          AND (pcg.ends_at IS NULL OR pcg.ends_at > UTC_TIMESTAMP(6))
        ORDER BY u.display_name, u.user_id
        """,
        (group_id,),
    )
    patients = cursor.fetchall()
    cursor.execute(
        """
        SELECT ci.care_invitation_id AS invitation_id, u.user_id,
               u.display_name, ci.expires_at
        FROM care_group_patient_invitations ci
        JOIN patients p ON p.patient_id = ci.patient_id
        JOIN users u ON u.user_id = p.user_id
        WHERE ci.care_group_id = %s
          AND ci.status = 'pending'
          AND ci.expires_at > UTC_TIMESTAMP(6)
        ORDER BY ci.created_at, ci.care_invitation_id
        """,
        (group_id,),
    )
    return {
        **group,
        "doctors": doctors,
        "patients": patients,
        "pending_invitations": cursor.fetchall(),
    }


def update_care_group(
    cursor: Any,
    *,
    admin_user_id: int,
    group_id: int,
    name: str | None,
    group_status: str | None,
) -> dict:
    group = load_care_group(
        cursor,
        admin_user_id=admin_user_id,
        group_id=group_id,
        for_update=True,
    )
    updated = {
        **group,
        "name": name or group["name"],
        "status": group_status or group["status"],
    }
    cursor.execute(
        """
        UPDATE care_groups
        SET name = %s, status = %s, updated_at = UTC_TIMESTAMP(6)
        WHERE care_group_id = %s
        """,
        (updated["name"], updated["status"], group_id),
    )
    record_administrative_event(
        cursor,
        actor_user_id=admin_user_id,
        managing_admin_user_id=admin_user_id,
        action="care_group.updated",
        target_type="care_group",
        target_id=group_id,
        details={"status": updated["status"]},
    )
    return updated


def add_group_doctor(
    cursor: Any,
    *,
    admin_user_id: int,
    group_id: int,
    doctor_id: int,
) -> None:
    load_care_group(
        cursor,
        admin_user_id=admin_user_id,
        group_id=group_id,
        for_update=True,
    )
    doctor = load_admin_doctor(
        cursor,
        admin_user_id=admin_user_id,
        doctor_id=doctor_id,
        for_update=True,
    )
    if doctor["professional_status"] == "deactivated":
        raise conflict("Médico desativado não pode integrar grupos.")
    cursor.execute(
        """
        INSERT INTO doctor_care_groups (
            care_group_id, doctor_id, status, starts_at, ends_at
        ) VALUES (%s, %s, 'active', UTC_TIMESTAMP(6), NULL)
        ON DUPLICATE KEY UPDATE
            starts_at = IF(status = 'active', starts_at, UTC_TIMESTAMP(6)),
            status = 'active',
            ends_at = NULL,
            updated_at = UTC_TIMESTAMP(6)
        """,
        (group_id, doctor_id),
    )
    record_administrative_event(
        cursor,
        actor_user_id=admin_user_id,
        managing_admin_user_id=admin_user_id,
        action="care_group.doctor_added",
        target_type="care_group",
        target_id=group_id,
        details={"doctor_id": doctor_id},
    )


def remove_group_doctor(
    cursor: Any,
    *,
    admin_user_id: int,
    group_id: int,
    doctor_id: int,
) -> None:
    load_care_group(
        cursor,
        admin_user_id=admin_user_id,
        group_id=group_id,
        for_update=True,
    )
    cursor.execute(
        """
        UPDATE doctor_care_groups
        SET status = 'inactive', ends_at = UTC_TIMESTAMP(6),
            updated_at = UTC_TIMESTAMP(6)
        WHERE care_group_id = %s AND doctor_id = %s AND status = 'active'
        """,
        (group_id, doctor_id),
    )
    if cursor.rowcount == 0:
        raise not_found()
    record_administrative_event(
        cursor,
        actor_user_id=admin_user_id,
        managing_admin_user_id=admin_user_id,
        action="care_group.doctor_removed",
        target_type="care_group",
        target_id=group_id,
        details={"doctor_id": doctor_id},
    )


def invite_patient(
    cursor: Any,
    *,
    admin_user_id: int,
    group_id: int,
    user_id: int,
) -> dict:
    group = load_care_group(
        cursor,
        admin_user_id=admin_user_id,
        group_id=group_id,
        for_update=True,
    )
    if group["status"] != "active":
        raise conflict("Grupo inativo não recebe convites.")
    patient_id = _active_patient_id(cursor, user_id)
    cursor.execute(
        """
        SELECT 1
        FROM patient_care_groups
        WHERE care_group_id = %s
          AND patient_id = %s
          AND status = 'active'
          AND (ends_at IS NULL OR ends_at > UTC_TIMESTAMP(6))
        """,
        (group_id, patient_id),
    )
    if cursor.fetchone():
        raise conflict("Paciente já possui vínculo ativo com o grupo.")
    cursor.execute(
        """
        UPDATE care_group_patient_invitations
        SET status = 'expired', updated_at = UTC_TIMESTAMP(6)
        WHERE care_group_id = %s
          AND patient_id = %s
          AND status = 'pending'
          AND expires_at <= UTC_TIMESTAMP(6)
        """,
        (group_id, patient_id),
    )
    cursor.execute(
        """
        SELECT 1
        FROM care_group_patient_invitations
        WHERE care_group_id = %s AND patient_id = %s AND status = 'pending'
        """,
        (group_id, patient_id),
    )
    if cursor.fetchone():
        raise conflict("Já existe convite pendente para este paciente.")
    cursor.execute(
        """
        INSERT INTO care_group_patient_invitations (
            care_group_id, patient_id, invited_by_admin_user_id, status,
            expires_at
        ) VALUES (
            %s, %s, %s, 'pending', UTC_TIMESTAMP(6) + INTERVAL %s DAY
        )
        """,
        (group_id, patient_id, admin_user_id, INVITATION_DURATION_DAYS),
    )
    invitation_id = cursor.lastrowid
    record_administrative_event(
        cursor,
        actor_user_id=admin_user_id,
        managing_admin_user_id=admin_user_id,
        action="care_link.invited",
        target_type="care_group",
        target_id=group_id,
        details={"invitation_id": invitation_id, "patient_user_id": user_id},
    )
    cursor.execute(
        """
        SELECT care_invitation_id AS invitation_id, status, expires_at
        FROM care_group_patient_invitations
        WHERE care_invitation_id = %s
        """,
        (invitation_id,),
    )
    return cursor.fetchone()


def cancel_patient_invitation(
    cursor: Any,
    *,
    admin_user_id: int,
    group_id: int,
    invitation_id: int,
) -> None:
    load_care_group(
        cursor,
        admin_user_id=admin_user_id,
        group_id=group_id,
        for_update=True,
    )
    cursor.execute(
        """
        UPDATE care_group_patient_invitations
        SET status = 'cancelled', decided_at = UTC_TIMESTAMP(6),
            updated_at = UTC_TIMESTAMP(6)
        WHERE care_invitation_id = %s
          AND care_group_id = %s
          AND status = 'pending'
          AND expires_at > UTC_TIMESTAMP(6)
        """,
        (invitation_id, group_id),
    )
    if cursor.rowcount == 0:
        raise not_found()
    record_administrative_event(
        cursor,
        actor_user_id=admin_user_id,
        managing_admin_user_id=admin_user_id,
        action="care_link.invitation_cancelled",
        target_type="care_group",
        target_id=group_id,
        details={"invitation_id": invitation_id},
    )


def revoke_patient_link(
    cursor: Any,
    *,
    admin_user_id: int,
    group_id: int,
    user_id: int,
) -> None:
    load_care_group(
        cursor,
        admin_user_id=admin_user_id,
        group_id=group_id,
        for_update=True,
    )
    cursor.execute("SELECT patient_id FROM patients WHERE user_id = %s", (user_id,))
    patient = cursor.fetchone()
    if not patient:
        raise not_found()
    end_patient_link(
        cursor,
        actor_user_id=admin_user_id,
        group_id=group_id,
        patient_id=patient["patient_id"],
    )


def _active_patient_id(cursor: Any, user_id: int) -> int:
    cursor.execute(
        """
        SELECT p.patient_id
        FROM users u
        JOIN user_roles ur ON ur.user_id = u.user_id AND ur.role = 'patient'
        JOIN patients p ON p.user_id = u.user_id
        WHERE u.user_id = %s
          AND u.active = TRUE
          AND u.claimed_at IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM user_roles admin_role
              WHERE admin_role.user_id = u.user_id
                AND admin_role.role = 'admin'
          )
        """,
        (user_id,),
    )
    patient = cursor.fetchone()
    if not patient:
        raise not_found()
    return patient["patient_id"]


def list_audit_events(
    cursor: Any,
    *,
    admin_user_id: int,
    page: int,
    page_size: int,
) -> dict:
    cursor.execute(
        """
        SELECT administrative_audit_event_id AS event_id, actor_user_id, action,
               target_type, target_id, details, occurred_at
        FROM administrative_audit_events
        WHERE managing_admin_user_id = %s
        ORDER BY occurred_at DESC, administrative_audit_event_id DESC
        LIMIT %s OFFSET %s
        """,
        (admin_user_id, page_size + 1, (page - 1) * page_size),
    )
    rows = [
        {**row, "details": json.loads(row["details"]) if row["details"] else None}
        for row in cursor.fetchall()
    ]
    return page_slice(rows, page=page, page_size=page_size)
