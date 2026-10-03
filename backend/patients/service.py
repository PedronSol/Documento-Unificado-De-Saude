from typing import Any

from fastapi import HTTPException

from auth.dependencies import calculate_age
from database import cursor_scope


def serialize_patient(patient: dict) -> dict:
    patient = dict(patient)
    age = calculate_age(patient.pop("data_nascimento"))
    patient.pop("patient_id", None)
    patient.pop("user_id", None)
    patient.pop("criado_em", None)
    patient["idade"] = age
    patient["maior_de_idade"] = age >= 18
    return patient


def find_patient_by_user_id(connection: Any, user_id: int) -> dict | None:
    with cursor_scope(connection, dictionary=True) as cursor:
        cursor.execute(
            "SELECT * FROM patients WHERE user_id = %s",
            (user_id,),
        )
        return cursor.fetchone()


def fetch_dashboard(
    connection: Any,
    patient_id: int,
    user: dict,
    message: str,
    *,
    patient: dict | None = None,
) -> dict:
    with cursor_scope(connection, dictionary=True) as cursor:
        if patient is None:
            cursor.execute(
                "SELECT * FROM patients WHERE patient_id = %s",
                (patient_id,),
            )
            patient = cursor.fetchone()
            if not patient:
                raise HTTPException(status_code=404, detail="Paciente não encontrado.")

        cursor.execute(
            """
            SELECT id_vacina, nome_vacina, dose, data_aplicacao, status_vacina
            FROM vaccines WHERE patient_id = %s
            """,
            (patient_id,),
        )
        vaccines = cursor.fetchall()

        cursor.execute(
            """
            SELECT id_alerta, tipo_alerta, titulo_alerta, descricao_alerta,
                   severidade_alerta
            FROM alerts WHERE patient_id = %s
            """,
            (patient_id,),
        )
        alerts = cursor.fetchall()

        cursor.execute(
            """
            SELECT id_documento, titulo_documento, tipo_documento,
                   data_criacao_documento, status_documento
            FROM documents WHERE patient_id = %s
            """,
            (patient_id,),
        )
        documents = cursor.fetchall()

    return {
        "message": message,
        "user": user,
        "patient_data": serialize_patient(patient),
        "vaccines": vaccines,
        "alerts": alerts,
        "documents": documents,
    }
