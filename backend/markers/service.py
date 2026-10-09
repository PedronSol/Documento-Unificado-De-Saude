from typing import Any, Literal

from fastapi import HTTPException, status

from audit.service import record_clinical_event, serialize_health_marker_snapshot
from models import MarkerCreateUpdate, normalize_marker_name


def create_marker(
    cursor: Any,
    *,
    marker: MarkerCreateUpdate,
    patient_id: int,
    actor_user_id: int,
) -> dict:
    cursor.execute(
        """
        INSERT INTO health_markers (
            patient_id, marker_type, name, normalized_name,
            description, dosage, frequency, status,
            created_by_user_id, updated_by_user_id,
            created_at, updated_at
        ) VALUES (
            %s, %s, %s, %s, %s, %s, %s, 'active', %s, %s,
            UTC_TIMESTAMP(6), UTC_TIMESTAMP(6)
        )
        """,
        (
            patient_id,
            marker.type,
            marker.name,
            normalize_marker_name(marker.name),
            marker.description,
            marker.dosage,
            marker.frequency,
            actor_user_id,
            actor_user_id,
        ),
    )
    marker_id = cursor.lastrowid
    created = load_marker(
        cursor,
        marker_id=marker_id,
        patient_id=patient_id,
        marker_status="active",
    )
    record_clinical_event(
        cursor,
        actor_user_id=actor_user_id,
        patient_id=patient_id,
        action="health_marker.created",
        resource_type="health_marker",
        resource_id=marker_id,
        after_snapshot=serialize_health_marker_snapshot(created),
    )
    return created


def update_active_marker(
    cursor: Any,
    *,
    marker_id: int,
    marker: MarkerCreateUpdate,
    patient_id: int,
    actor_user_id: int,
) -> dict:
    previous = load_marker(
        cursor,
        marker_id=marker_id,
        patient_id=patient_id,
        marker_status="active",
        for_update=True,
    )
    if not previous:
        raise_marker_not_found()
    cursor.execute(
        """
        UPDATE health_markers
        SET marker_type = %s, name = %s, normalized_name = %s,
            description = %s, dosage = %s, frequency = %s,
            updated_by_user_id = %s,
            updated_at = UTC_TIMESTAMP(6)
        WHERE marker_id = %s AND patient_id = %s
          AND status = 'active'
        """,
        (
            marker.type,
            marker.name,
            normalize_marker_name(marker.name),
            marker.description,
            marker.dosage,
            marker.frequency,
            actor_user_id,
            marker_id,
            patient_id,
        ),
    )
    updated = load_marker(
        cursor,
        marker_id=marker_id,
        patient_id=patient_id,
        marker_status="active",
    )
    record_clinical_event(
        cursor,
        actor_user_id=actor_user_id,
        patient_id=patient_id,
        action="health_marker.updated",
        resource_type="health_marker",
        resource_id=marker_id,
        before_snapshot=serialize_health_marker_snapshot(previous),
        after_snapshot=serialize_health_marker_snapshot(updated),
    )
    return updated


def remove_active_marker(
    cursor: Any,
    *,
    marker_id: int,
    patient_id: int,
    actor_user_id: int,
) -> dict:
    previous = load_marker(
        cursor,
        marker_id=marker_id,
        patient_id=patient_id,
        marker_status="active",
        for_update=True,
    )
    if not previous:
        raise_marker_not_found()
    cursor.execute(
        """
        UPDATE health_markers
        SET status = 'removed', updated_by_user_id = %s,
            updated_at = UTC_TIMESTAMP(6),
            removed_at = UTC_TIMESTAMP(6)
        WHERE marker_id = %s AND patient_id = %s
          AND status = 'active'
        """,
        (actor_user_id, marker_id, patient_id),
    )
    removed = load_marker(
        cursor,
        marker_id=marker_id,
        patient_id=patient_id,
        marker_status="removed",
    )
    record_clinical_event(
        cursor,
        actor_user_id=actor_user_id,
        patient_id=patient_id,
        action="health_marker.removed",
        resource_type="health_marker",
        resource_id=marker_id,
        before_snapshot=serialize_health_marker_snapshot(previous),
        after_snapshot=serialize_health_marker_snapshot(removed),
    )
    return removed


def load_marker(
    cursor: Any,
    *,
    marker_id: int,
    patient_id: int,
    marker_status: Literal["active", "removed"],
    for_update: bool = False,
):
    lock_clause = "FOR UPDATE" if for_update else ""
    cursor.execute(
        f"""
        SELECT marker_id, marker_type AS type, name, description, dosage,
               frequency, status, created_at, updated_at, removed_at
        FROM health_markers
        WHERE marker_id = %s AND patient_id = %s AND status = %s
        {lock_clause}
        """,
        (marker_id, patient_id, marker_status),
    )
    return cursor.fetchone()


def raise_marker_not_found() -> None:
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Marcador não encontrado.",
    )
