import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
import mysql.connector

from auth.dependencies import get_current_patient, require_adult
from database import cursor_scope, get_connection, transaction
from models import VaccineCreateUpdate, VaccineResponse


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
        return {"message": "Vacina registrada com sucesso!"}
    except mysql.connector.Error as error:
        logger.exception("Falha ao registrar vacina")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Banco de dados indisponível.",
        ) from error


@router.get("", response_model=list[VaccineResponse])
def get_vaccines(
    patient: dict = Depends(get_current_patient),
    connection: Any = Depends(get_connection),
):
    with cursor_scope(connection, dictionary=True) as cursor:
        cursor.execute(
            """
            SELECT id_vacina AS vaccine_id, nome_vacina AS name, dose,
                   data_aplicacao AS administered_on, status_vacina AS status
            FROM vaccines WHERE patient_id = %s
            """,
            (patient["patient_id"],),
        )
        return cursor.fetchall()


@router.put("/{vaccine_id}")
def update_vaccine(
    vaccine_id: int,
    vaccine: VaccineCreateUpdate,
    patient: dict = Depends(require_adult),
    connection: Any = Depends(get_connection),
):
    with cursor_scope(connection) as cursor:
        with transaction(connection):
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
        rowcount = cursor.rowcount

    if rowcount == 0:
        raise HTTPException(status_code=404, detail="Vacina não encontrada.")
    return {"message": "Vacina atualizada com sucesso!"}


@router.delete("/{vaccine_id}")
def delete_vaccine(
    vaccine_id: int,
    patient: dict = Depends(require_adult),
    connection: Any = Depends(get_connection),
):
    with cursor_scope(connection) as cursor:
        with transaction(connection):
            cursor.execute(
                "DELETE FROM vaccines WHERE id_vacina = %s AND patient_id = %s",
                (vaccine_id, patient["patient_id"]),
            )
        rowcount = cursor.rowcount

    if rowcount == 0:
        raise HTTPException(status_code=404, detail="Vacina não encontrada.")
    return {"message": "Vacina removida com sucesso!"}
