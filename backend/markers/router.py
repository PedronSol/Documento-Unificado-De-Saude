import logging
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
import mysql.connector

from auth.dependencies import get_current_patient, require_adult
from database import cursor_scope, get_connection, transaction
from markers.service import create_marker, remove_active_marker, update_active_marker
from models import MarkerCreateUpdate, MarkerResponse


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
                created = create_marker(
                    cursor,
                    marker=marker,
                    patient_id=patient["patient_id"],
                    actor_user_id=patient["user_id"],
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
                updated = update_active_marker(
                    cursor,
                    marker_id=marker_id,
                    marker=marker,
                    patient_id=patient["patient_id"],
                    actor_user_id=patient["user_id"],
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
                remove_active_marker(
                    cursor,
                    marker_id=marker_id,
                    patient_id=patient["patient_id"],
                    actor_user_id=patient["user_id"],
                )
        return {"message": "Marcador removido com sucesso!"}
    except mysql.connector.Error as error:
        _raise_database_unavailable("Falha ao remover marcador", error)


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
