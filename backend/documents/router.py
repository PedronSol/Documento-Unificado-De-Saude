from typing import Any

from fastapi import APIRouter, Depends

from auth.dependencies import get_current_patient
from database import cursor_scope, get_connection
from models import DocumentSummary


router = APIRouter(prefix="/me/documents")


@router.get("", response_model=list[DocumentSummary])
def get_documents(
    patient: dict = Depends(get_current_patient),
    connection: Any = Depends(get_connection),
):
    with cursor_scope(connection, dictionary=True) as cursor:
        cursor.execute(
            """
            SELECT id_documento AS document_id, titulo_documento AS title,
                   tipo_documento AS type,
                   data_criacao_documento AS created_on,
                   status_documento AS status
            FROM documents
            WHERE patient_id = %s
            """,
            (patient["patient_id"],),
        )
        return cursor.fetchall()
