from typing import Any

from fastapi import HTTPException, status

from audit.service import record_clinical_event
from security import create_share_token, hash_share_token


def serialize_health_share_snapshot(share: dict, state: str) -> dict:
    return {
        "created_at": share["created_at"].isoformat(),
        "expires_at": share["expires_at"].isoformat(),
        "revoked_at": (
            share["revoked_at"].isoformat() if share.get("revoked_at") else None
        ),
        "state": state,
    }


def create_share(
    cursor: Any,
    *,
    patient_id: int,
    actor_user_id: int,
    public_app_url: str,
) -> dict:
    cursor.execute(
        "SELECT patient_id FROM patients WHERE patient_id = %s FOR UPDATE",
        (patient_id,),
    )
    cursor.fetchone()
    cursor.execute(
        """
        SELECT share_id, patient_id, created_at, expires_at, revoked_at,
               last_accessed_at
        FROM health_shares
        WHERE patient_id = %s AND revoked_at IS NULL
        FOR UPDATE
        """,
        (patient_id,),
    )
    previous = cursor.fetchone()
    if previous:
        cursor.execute(
            """
            UPDATE health_shares
            SET revoked_at = UTC_TIMESTAMP(6)
            WHERE share_id = %s AND patient_id = %s AND revoked_at IS NULL
            """,
            (previous["share_id"], patient_id),
        )
        cursor.execute(
            """
            SELECT share_id, patient_id, created_at, expires_at, revoked_at,
                   last_accessed_at
            FROM health_shares
            WHERE share_id = %s AND patient_id = %s
            """,
            (previous["share_id"], patient_id),
        )
        revoked = cursor.fetchone()
        record_clinical_event(
            cursor,
            actor_user_id=actor_user_id,
            patient_id=patient_id,
            action="health_share.revoked",
            resource_type="health_share",
            resource_id=previous["share_id"],
            before_snapshot=serialize_health_share_snapshot(previous, "active"),
            after_snapshot=serialize_health_share_snapshot(revoked, "revoked"),
        )

    raw_token = create_share_token()
    cursor.execute(
        """
        INSERT INTO health_shares (
            token_hash, patient_id, created_by_user_id, created_at, expires_at
        ) VALUES (
            %s, %s, %s, UTC_TIMESTAMP(6),
            DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 2 HOUR)
        )
        """,
        (hash_share_token(raw_token), patient_id, actor_user_id),
    )
    share_id = cursor.lastrowid
    created = load_share(cursor, share_id=share_id, patient_id=patient_id)
    record_clinical_event(
        cursor,
        actor_user_id=actor_user_id,
        patient_id=patient_id,
        action="health_share.created",
        resource_type="health_share",
        resource_id=share_id,
        after_snapshot=serialize_health_share_snapshot(created, "active"),
    )
    return {
        "share_id": share_id,
        "share_url": f"{public_app_url}/share#{raw_token}",
        "created_at": created["created_at"],
        "expires_at": created["expires_at"],
    }


def load_share(cursor: Any, *, share_id: int, patient_id: int) -> dict | None:
    cursor.execute(
        """
        SELECT share_id, patient_id, created_at, expires_at, revoked_at,
               last_accessed_at
        FROM health_shares
        WHERE share_id = %s AND patient_id = %s
        """,
        (share_id, patient_id),
    )
    return cursor.fetchone()


def load_active_share(cursor: Any, *, patient_id: int) -> dict | None:
    cursor.execute(
        """
        SELECT share_id, created_at, expires_at
        FROM health_shares
        WHERE patient_id = %s
          AND revoked_at IS NULL
          AND expires_at > UTC_TIMESTAMP(6)
        """,
        (patient_id,),
    )
    share = cursor.fetchone()
    if not share:
        return None
    return {
        "share_id": share["share_id"],
        "created_at": share["created_at"],
        "expires_at": share["expires_at"],
    }


def revoke_share(
    cursor: Any,
    *,
    share_id: int,
    patient_id: int,
    actor_user_id: int,
) -> None:
    cursor.execute(
        """
        SELECT share_id, patient_id, created_at, expires_at, revoked_at,
               last_accessed_at
        FROM health_shares
        WHERE share_id = %s AND patient_id = %s AND revoked_at IS NULL
        FOR UPDATE
        """,
        (share_id, patient_id),
    )
    previous = cursor.fetchone()
    if not previous:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Compartilhamento não encontrado.",
        )
    cursor.execute(
        """
        UPDATE health_shares
        SET revoked_at = UTC_TIMESTAMP(6)
        WHERE share_id = %s AND patient_id = %s AND revoked_at IS NULL
        """,
        (share_id, patient_id),
    )
    revoked = load_share(cursor, share_id=share_id, patient_id=patient_id)
    record_clinical_event(
        cursor,
        actor_user_id=actor_user_id,
        patient_id=patient_id,
        action="health_share.revoked",
        resource_type="health_share",
        resource_id=share_id,
        before_snapshot=serialize_health_share_snapshot(previous, "active"),
        after_snapshot=serialize_health_share_snapshot(revoked, "revoked"),
    )


def load_public_summary(cursor: Any, *, raw_token: str) -> dict:
    cursor.execute(
        """
        SELECT hs.share_id, hs.patient_id, hs.created_at, hs.expires_at,
               hs.revoked_at, hs.last_accessed_at,
               p.nome_paciente AS preferred_name,
               p.tipo_sanguineo AS blood_type
        FROM health_shares hs
        JOIN patients p ON p.patient_id = hs.patient_id
        JOIN users u ON u.user_id = p.user_id
        WHERE hs.token_hash = %s
          AND hs.revoked_at IS NULL
          AND hs.expires_at > UTC_TIMESTAMP(6)
          AND u.active = TRUE
        FOR UPDATE
        """,
        (hash_share_token(raw_token),),
    )
    share = cursor.fetchone()
    if not share:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Compartilhamento indisponível.",
        )
    cursor.execute(
        """
        SELECT marker_type AS type, name, description, dosage, frequency
        FROM health_markers
        WHERE patient_id = %s AND status = 'active'
        ORDER BY marker_type, name
        """,
        (share["patient_id"],),
    )
    groups = {
        "allergies": [],
        "medications": [],
        "conditions": [],
        "diagnoses": [],
    }
    group_by_type = {
        "allergy": "allergies",
        "medication": "medications",
        "condition": "conditions",
        "diagnosis": "diagnoses",
    }
    for marker in cursor.fetchall():
        item = {
            "name": marker["name"],
            "description": marker["description"],
        }
        if marker["type"] == "medication":
            item.update(
                dosage=marker["dosage"],
                frequency=marker["frequency"],
            )
        groups[group_by_type[marker["type"]]].append(item)
    cursor.execute(
        """
        UPDATE health_shares
        SET last_accessed_at = UTC_TIMESTAMP(6)
        WHERE share_id = %s AND revoked_at IS NULL
          AND expires_at > UTC_TIMESTAMP(6)
        """,
        (share["share_id"],),
    )
    record_clinical_event(
        cursor,
        actor_type="public_share",
        actor_user_id=None,
        patient_id=share["patient_id"],
        action="health_share.accessed",
        resource_type="health_share",
        resource_id=share["share_id"],
    )
    return {
        "expires_at": share["expires_at"],
        "patient": {
            "preferred_name": share["preferred_name"],
            "blood_type": share["blood_type"],
        },
        "markers": groups,
    }
