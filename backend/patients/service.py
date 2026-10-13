from typing import Any

from auth.dependencies import calculate_age
from database import cursor_scope


def serialize_patient_profile(patient: dict) -> dict:
    age = calculate_age(patient["data_nascimento"])
    return {
        "preferred_name": patient["nome_paciente"],
        "full_name": patient["nome_completo"],
        "avatar_url": patient.get("avatar"),
        "health_status": patient["status_saude"],
        "blood_type": patient["tipo_sanguineo"],
        "blood_type_source": patient["tipo_sanguineo_origem"],
        "is_adult": age >= 18,
        "age": age,
    }


def find_patient_by_user_id(connection: Any, user_id: int) -> dict | None:
    with cursor_scope(connection, dictionary=True) as cursor:
        cursor.execute(
            "SELECT * FROM patients WHERE user_id = %s",
            (user_id,),
        )
        return cursor.fetchone()
