import logging
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
import mysql.connector

from audit.service import record_clinical_event, serialize_vaccine_snapshot
from auth.dependencies import get_current_patient, require_adult
from database import cursor_scope, get_connection, transaction
from models import VaccineCreateUpdate, VaccineResponse
from pagination import Page, PageRequest, fetch_page, page_request, search_clause


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/me/vaccines")


@router.post("", status_code=status.HTTP_201_CREATED)
def add_vaccine(
    vaccine: VaccineCreateUpdate,
    patient: dict = Depends(require_adult),
    connection: Any = Depends(get_connection),
):
    try:
        with cursor_scope(connection) as cursor:
            with transaction(connection):
                cursor.execute(
                    """
                    INSERT INTO vaccines
                        (patient_id, nome_vacina, dose, data_aplicacao, status_vacina)
                    VALUES (%s, %s, %s, %s, %s)
                    """,
                    (
                        patient["patient_id"],
                        vaccine.name,
                        vaccine.dose,
                        vaccine.administered_on,
                        vaccine.status,
                    ),
                )
                record_clinical_event(
                    cursor,
                    actor_user_id=patient["user_id"],
                    patient_id=patient["patient_id"],
                    action="vaccine.created",
                    resource_type="vaccine",
                    resource_id=cursor.lastrowid,
                    after_snapshot=serialize_vaccine_snapshot(vaccine),
                )
        return {"message": "Vacina registrada com sucesso!"}
    except mysql.connector.Error as error:
        _raise_database_unavailable("Falha ao registrar vacina", error)


@router.get("", response_model=Page[VaccineResponse])
def get_vaccines(
    page: PageRequest = Depends(page_request),
    vaccine_status: Optional[Literal["applied", "pending", "overdue"]] = Query(
        default=None,
        alias="status",
    ),
    patient: dict = Depends(get_current_patient),
    connection: Any = Depends(get_connection),
):
    search, search_params = search_clause(page.query, ["nome_vacina", "dose"])
    status_filter = " AND status_vacina = %s" if vaccine_status else ""
    with cursor_scope(connection, dictionary=True) as cursor:
        return fetch_page(
            cursor,
            columns="""id_vacina AS vaccine_id, nome_vacina AS name, dose,
                       data_aplicacao AS administered_on, status_vacina AS status""",
            source=f"FROM vaccines WHERE patient_id = %s{status_filter}{search}",
            params=(
                patient["patient_id"],
                *((vaccine_status,) if vaccine_status else ()),
                *search_params,
            ),
            order_by="id_vacina",
            request=page,
        )


@router.put("/{vaccine_id}")
def update_vaccine(
    vaccine_id: int,
    vaccine: VaccineCreateUpdate,
    patient: dict = Depends(require_adult),
    connection: Any = Depends(get_connection),
):
    try:
        with cursor_scope(connection, dictionary=True) as cursor:
            with transaction(connection):
                previous = _lock_owned_vaccine(
                    cursor,
                    vaccine_id=vaccine_id,
                    patient_id=patient["patient_id"],
                )
                if not previous:
                    raise HTTPException(
                        status_code=404,
                        detail="Vacina não encontrada.",
                    )
                cursor.execute(
                    """
                    UPDATE vaccines
                    SET nome_vacina = %s, dose = %s, data_aplicacao = %s,
                        status_vacina = %s
                    WHERE id_vacina = %s AND patient_id = %s
                    """,
                    (
                        vaccine.name,
                        vaccine.dose,
                        vaccine.administered_on,
                        vaccine.status,
                        vaccine_id,
                        patient["patient_id"],
                    ),
                )
                record_clinical_event(
                    cursor,
                    actor_user_id=patient["user_id"],
                    patient_id=patient["patient_id"],
                    action="vaccine.updated",
                    resource_type="vaccine",
                    resource_id=vaccine_id,
                    before_snapshot=serialize_vaccine_snapshot(previous),
                    after_snapshot=serialize_vaccine_snapshot(vaccine),
                )
        return {"message": "Vacina atualizada com sucesso!"}
    except mysql.connector.Error as error:
        _raise_database_unavailable("Falha ao atualizar vacina", error)


@router.delete("/{vaccine_id}")
def delete_vaccine(
    vaccine_id: int,
    patient: dict = Depends(require_adult),
    connection: Any = Depends(get_connection),
):
    try:
        with cursor_scope(connection, dictionary=True) as cursor:
            with transaction(connection):
                previous = _lock_owned_vaccine(
                    cursor,
                    vaccine_id=vaccine_id,
                    patient_id=patient["patient_id"],
                )
                if not previous:
                    raise HTTPException(
                        status_code=404,
                        detail="Vacina não encontrada.",
                    )
                cursor.execute(
                    "DELETE FROM vaccines "
                    "WHERE id_vacina = %s AND patient_id = %s",
                    (vaccine_id, patient["patient_id"]),
                )
                record_clinical_event(
                    cursor,
                    actor_user_id=patient["user_id"],
                    patient_id=patient["patient_id"],
                    action="vaccine.deleted",
                    resource_type="vaccine",
                    resource_id=vaccine_id,
                    before_snapshot=serialize_vaccine_snapshot(previous),
                )
        return {"message": "Vacina removida com sucesso!"}
    except mysql.connector.Error as error:
        _raise_database_unavailable("Falha ao remover vacina", error)


def _lock_owned_vaccine(cursor: Any, *, vaccine_id: int, patient_id: int):
    cursor.execute(
        """
        SELECT id_vacina AS vaccine_id, nome_vacina AS name, dose,
               data_aplicacao AS administered_on, status_vacina AS status
        FROM vaccines
        WHERE id_vacina = %s AND patient_id = %s
        FOR UPDATE
        """,
        (vaccine_id, patient_id),
    )
    return cursor.fetchone()


def _raise_database_unavailable(message: str, error: mysql.connector.Error):
    logger.exception(message)
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Banco de dados indisponível.",
    ) from error
