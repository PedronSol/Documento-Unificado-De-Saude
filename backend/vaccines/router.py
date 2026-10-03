import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
import mysql.connector

from auth.dependencies import get_current_patient, require_adult
from database import cursor_scope, get_connection, transaction
from models import Vaccine, VaccineCreateUpdate


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
                        vaccine.nome_vacina,
                        vaccine.dose,
                        vaccine.data_aplicacao,
                        vaccine.status_vacina,
                    ),
                )
        return {"message": "Vacina registrada com sucesso!"}
    except mysql.connector.Error as error:
        logger.exception("Falha ao registrar vacina")
        raise HTTPException(
            status_code=400, detail="Não foi possível registrar a vacina."
        ) from error


@router.get("", response_model=list[Vaccine])
def get_vaccines(
    patient: dict = Depends(get_current_patient),
    connection: Any = Depends(get_connection),
):
    with cursor_scope(connection, dictionary=True) as cursor:
        cursor.execute(
            """
            SELECT id_vacina, nome_vacina, dose, data_aplicacao, status_vacina
            FROM vaccines WHERE patient_id = %s
            """,
            (patient["patient_id"],),
        )
        return cursor.fetchall()


@router.put("/{id_vacina}")
def update_vaccine(
    id_vacina: int,
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
                    vaccine.nome_vacina,
                    vaccine.dose,
                    vaccine.data_aplicacao,
                    vaccine.status_vacina,
                    id_vacina,
                    patient["patient_id"],
                ),
            )
        rowcount = cursor.rowcount

    if rowcount == 0:
        raise HTTPException(status_code=404, detail="Vacina não encontrada.")
    return {"message": "Vacina atualizada com sucesso!"}


@router.delete("/{id_vacina}")
def delete_vaccine(
    id_vacina: int,
    patient: dict = Depends(require_adult),
    connection: Any = Depends(get_connection),
):
    with cursor_scope(connection) as cursor:
        with transaction(connection):
            cursor.execute(
                "DELETE FROM vaccines WHERE id_vacina = %s AND patient_id = %s",
                (id_vacina, patient["patient_id"]),
            )
        rowcount = cursor.rowcount

    if rowcount == 0:
        raise HTTPException(status_code=404, detail="Vacina não encontrada.")
    return {"message": "Vacina removida com sucesso!"}
