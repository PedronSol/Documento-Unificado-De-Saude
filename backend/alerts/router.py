from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, Query

from auth.dependencies import get_current_patient
from database import cursor_scope, get_connection
from models import AlertResponse
from pagination import Page, PageRequest, fetch_page, page_request, search_clause


router = APIRouter(prefix="/me/alerts")


@router.get("", response_model=Page[AlertResponse])
def get_alerts(
    page: PageRequest = Depends(page_request),
    severity: Optional[Literal["low", "medium", "high"]] = Query(default=None),
    patient: dict = Depends(get_current_patient),
    connection: Any = Depends(get_connection),
):
    search, search_params = search_clause(
        page.query,
        ["titulo_alerta", "descricao_alerta"],
    )
    severity_filter = " AND severidade_alerta = %s" if severity else ""
    with cursor_scope(connection, dictionary=True) as cursor:
        return fetch_page(
            cursor,
            columns="""id_alerta AS alert_id, tipo_alerta AS type,
                       titulo_alerta AS title, descricao_alerta AS description,
                       severidade_alerta AS severity""",
            source=f"FROM alerts WHERE patient_id = %s{severity_filter}{search}",
            params=(
                patient["patient_id"],
                *((severity,) if severity else ()),
                *search_params,
            ),
            order_by="id_alerta",
            request=page,
        )
