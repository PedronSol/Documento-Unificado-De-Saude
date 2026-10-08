import logging
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
import mysql.connector

from audit.service import record_clinical_event, serialize_health_marker_snapshot
from auth.dependencies import get_current_patient, require_adult
from database import cursor_scope, get_connection, transaction
from models import MarkerCreateUpdate, MarkerResponse, normalize_marker_name


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/me/markers")


@router.get("", response_model=list[MarkerResponse])
def get_markers(
    marker_status: Literal["active", "removed"] = Query(
        default="active",
        alias="status",
    ),
    patient: dict = Depends(get_current_patient),
    connection: Any = Depends(get_connection),
):
    order_by = (
        "marker_type, name"
        if marker_status == "active"
        else "removed_at DESC"
    )
    try:
        with cursor_scope(connection, dictionary=True) as cursor:
            cursor.execute(
                f"""
                SELECT marker_id, marker_type AS type, name, description,
                       dosage, frequency, status, created_at, updated_at,
                       removed_at
                FROM health_markers
                WHERE patient_id = %s AND status = %s
                ORDER BY {order_by}
                """,
                (patient["patient_id"], marker_status),
            )
            return cursor.fetchall()
    except mysql.connector.Error as error:
        _raise_database_unavailable("Falha ao listar marcadores", error)


@router.post("", response_model=MarkerResponse, status_code=status.HTTP_201_CREATED)
def add_marker(
    marker: MarkerCreateUpdate,
    patient: dict = Depends(require_adult),
    connection: Any = Depends(get_connection),
):
    try:
        with cursor_scope(connection, dictionary=True) as cursor:
            with transaction(connection):
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
                        patient["patient_id"],
                        marker.type,
                        marker.name,
                        normalize_marker_name(marker.name),
                        marker.description,
                        marker.dosage,
                        marker.frequency,
                        patient["user_id"],
                        patient["user_id"],
                    ),
                )
                marker_id = cursor.lastrowid
                created = _load_owned_marker(
                    cursor,
                    marker_id=marker_id,
                    patient_id=patient["patient_id"],
                    marker_status="active",
                )
                record_clinical_event(
                    cursor,
                    actor_user_id=patient["user_id"],
                    patient_id=patient["patient_id"],
                    action="health_marker.created",
                    resource_type="health_marker",
                    resource_id=marker_id,
                    after_snapshot=serialize_health_marker_snapshot(created),
                )
        return created
    except mysql.connector.IntegrityError as error:
        _raise_integrity_error(error)
    except mysql.connector.Error as error:
        _raise_database_unavailable("Falha ao registrar marcador", error)


@router.put("/{marker_id}", response_model=MarkerResponse)
def update_marker(
    marker_id: int,
    marker: MarkerCreateUpdate,
    patient: dict = Depends(require_adult),
    connection: Any = Depends(get_connection),
):
    try:
        with cursor_scope(connection, dictionary=True) as cursor:
            with transaction(connection):
                previous = _load_owned_marker(
                    cursor,
                    marker_id=marker_id,
                    patient_id=patient["patient_id"],
                    marker_status="active",
                    for_update=True,
                )
                if not previous:
                    _raise_marker_not_found()
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
                        patient["user_id"],
                        marker_id,
                        patient["patient_id"],
                    ),
                )
                updated = _load_owned_marker(
                    cursor,
                    marker_id=marker_id,
                    patient_id=patient["patient_id"],
                    marker_status="active",
                )
                record_clinical_event(
                    cursor,
                    actor_user_id=patient["user_id"],
                    patient_id=patient["patient_id"],
                    action="health_marker.updated",
                    resource_type="health_marker",
                    resource_id=marker_id,
                    before_snapshot=serialize_health_marker_snapshot(previous),
                    after_snapshot=serialize_health_marker_snapshot(updated),
                )
        return updated
    except mysql.connector.IntegrityError as error:
        _raise_integrity_error(error)
    except mysql.connector.Error as error:
        _raise_database_unavailable("Falha ao atualizar marcador", error)


@router.delete("/{marker_id}")
def delete_marker(
    marker_id: int,
    patient: dict = Depends(require_adult),
    connection: Any = Depends(get_connection),
):
    try:
        with cursor_scope(connection, dictionary=True) as cursor:
            with transaction(connection):
                previous = _load_owned_marker(
                    cursor,
                    marker_id=marker_id,
                    patient_id=patient["patient_id"],
                    marker_status="active",
                    for_update=True,
                )
                if not previous:
                    _raise_marker_not_found()
                cursor.execute(
                    """
                    UPDATE health_markers
                    SET status = 'removed', updated_by_user_id = %s,
                        updated_at = UTC_TIMESTAMP(6),
                        removed_at = UTC_TIMESTAMP(6)
                    WHERE marker_id = %s AND patient_id = %s
                      AND status = 'active'
                    """,
                    (
                        patient["user_id"],
                        marker_id,
                        patient["patient_id"],
                    ),
                )
                removed = _load_owned_marker(
                    cursor,
                    marker_id=marker_id,
                    patient_id=patient["patient_id"],
                    marker_status="removed",
                )
                record_clinical_event(
                    cursor,
                    actor_user_id=patient["user_id"],
                    patient_id=patient["patient_id"],
                    action="health_marker.removed",
                    resource_type="health_marker",
                    resource_id=marker_id,
                    before_snapshot=serialize_health_marker_snapshot(previous),
                    after_snapshot=serialize_health_marker_snapshot(removed),
                )
        return {"message": "Marcador removido com sucesso!"}
    except mysql.connector.Error as error:
        _raise_database_unavailable("Falha ao remover marcador", error)


def _load_owned_marker(
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


def _raise_marker_not_found() -> None:
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Marcador não encontrado.",
    )


def _raise_integrity_error(error: mysql.connector.IntegrityError) -> None:
    if error.errno == 1062:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Marcador ativo já cadastrado. Edite o registro existente.",
        ) from error
    _raise_database_unavailable("Falha de integridade ao salvar marcador", error)


def _raise_database_unavailable(message: str, error: mysql.connector.Error) -> None:
    logger.exception(message)
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Banco de dados indisponível.",
    ) from error
