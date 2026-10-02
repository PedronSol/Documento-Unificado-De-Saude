from typing import Any

from fastapi import HTTPException

from auth.dependencies import calculate_age
from database import cursor_scope


def serialize_patient(patient: dict) -> dict:
    patient = dict(patient)
    age = calculate_age(patient.pop("data_nascimento"))
    patient.pop("senha_hash", None)
    patient.pop("criado_em", None)
    patient["idade"] = age
    patient["maior_de_idade"] = age >= 18
    return patient


def fetch_dashboard(connection: Any, cpf_paciente: str, message: str) -> dict:
    with cursor_scope(connection, dictionary=True) as cursor:
        cursor.execute(
            "SELECT * FROM pacientes WHERE cpf_paciente = %s", (cpf_paciente,)
        )
        patient = cursor.fetchone()
        if not patient:
            raise HTTPException(status_code=404, detail="Paciente não encontrado.")

        cursor.execute(
            """
            SELECT id_vacina, nome_vacina, dose, data_aplicacao, status_vacina
            FROM vacinas WHERE paciente_id = %s
            """,
            (cpf_paciente,),
        )
        vaccines = cursor.fetchall()

        cursor.execute(
            """
            SELECT id_alerta, tipo_alerta, titulo_alerta, descricao_alerta,
                   severidade_alerta
            FROM alertas WHERE paciente_id = %s
            """,
            (cpf_paciente,),
        )
        alerts = cursor.fetchall()

        cursor.execute(
            """
            SELECT id_documento, titulo_documento, tipo_documento,
                   data_criacao_documento, status_documento
            FROM documentos WHERE paciente_id = %s
            """,
            (cpf_paciente,),
        )
        documents = cursor.fetchall()

    return {
        "message": message,
        "patient_data": serialize_patient(patient),
        "vaccines": vaccines,
        "alerts": alerts,
        "documents": documents,
    }
