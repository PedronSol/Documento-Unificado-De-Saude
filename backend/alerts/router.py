from typing import Any

from fastapi import APIRouter, Depends

from auth.dependencies import get_current_patient
from database import cursor_scope, get_connection
from models import AlertResponse


router = APIRouter(prefix="/me/alerts")


@router.get("", response_model=list[AlertResponse])
def get_alerts(
    patient: dict = Depends(get_current_patient),
    connection: Any = Depends(get_connection),
):
    with cursor_scope(connection, dictionary=True) as cursor:
        cursor.execute(
            """
            SELECT id_alerta AS alert_id, tipo_alerta AS type,
                   titulo_alerta AS title, descricao_alerta AS description,
                   severidade_alerta AS severity
            FROM alerts
            WHERE patient_id = %s
            """,
            (patient["patient_id"],),
        )
        return cursor.fetchall()
