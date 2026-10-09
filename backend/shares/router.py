import logging
import re
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
import mysql.connector

from auth.dependencies import get_current_patient, require_adult
from config import AppSettings, get_settings
from database import cursor_scope, get_connection, transaction
from models import (
    HealthShareCreatedResponse,
    HealthShareMetadataResponse,
    PublicHealthSummaryResponse,
)
from shares.service import (
    create_share,
    load_active_share,
    load_public_summary,
    revoke_share,
)


logger = logging.getLogger(__name__)
router = APIRouter()
SHARE_TOKEN_PATTERN = re.compile(r"^[A-Za-z0-9_-]{43,64}$")
PRIVATE_RESPONSE_HEADERS = {
    "Cache-Control": "no-store, max-age=0",
    "Pragma": "no-cache",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow",
}


@router.post(
    "/me/shares",
    response_model=HealthShareCreatedResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_health_share(
    patient: dict = Depends(require_adult),
    settings: AppSettings = Depends(get_settings),
    connection: Any = Depends(get_connection),
):
    try:
        with cursor_scope(connection, dictionary=True) as cursor:
            with transaction(connection):
                return create_share(
                    cursor,
                    patient_id=patient["patient_id"],
                    actor_user_id=patient["user_id"],
                    public_app_url=settings.public_app_url,
                )
    except mysql.connector.Error as error:
        _raise_database_unavailable("Falha ao criar compartilhamento", error)


@router.get(
    "/me/shares/active",
    response_model=HealthShareMetadataResponse | None,
)
def get_active_health_share(
    patient: dict = Depends(get_current_patient),
    connection: Any = Depends(get_connection),
):
    try:
        with cursor_scope(connection, dictionary=True) as cursor:
            return load_active_share(cursor, patient_id=patient["patient_id"])
    except mysql.connector.Error as error:
        _raise_database_unavailable("Falha ao consultar compartilhamento", error)


@router.delete("/me/shares/{share_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_health_share(
    share_id: int,
    patient: dict = Depends(require_adult),
    connection: Any = Depends(get_connection),
):
    try:
        with cursor_scope(connection, dictionary=True) as cursor:
            with transaction(connection):
                revoke_share(
                    cursor,
                    share_id=share_id,
                    patient_id=patient["patient_id"],
                    actor_user_id=patient["user_id"],
                )
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    except mysql.connector.Error as error:
        _raise_database_unavailable("Falha ao revogar compartilhamento", error)


@router.get(
    "/public/shares/summary",
    response_model=PublicHealthSummaryResponse,
)
def get_public_health_summary(
    response: Response,
    share_token: str | None = Header(default=None, alias="X-Share-Token"),
    connection: Any = Depends(get_connection),
):
    _set_private_response_headers(response)
    if not share_token or not SHARE_TOKEN_PATTERN.fullmatch(share_token):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Compartilhamento indisponível.",
            headers=PRIVATE_RESPONSE_HEADERS,
        )
    try:
        with cursor_scope(connection, dictionary=True) as cursor:
            with transaction(connection):
                return load_public_summary(cursor, raw_token=share_token)
    except HTTPException as error:
        raise HTTPException(
            status_code=error.status_code,
            detail=error.detail,
            headers=PRIVATE_RESPONSE_HEADERS,
        ) from error
    except mysql.connector.Error as error:
        _raise_database_unavailable(
            "Falha ao consultar compartilhamento",
            error,
            headers=PRIVATE_RESPONSE_HEADERS,
        )


def _set_private_response_headers(response: Response) -> None:
    for name, value in PRIVATE_RESPONSE_HEADERS.items():
        response.headers[name] = value


def _raise_database_unavailable(
    message: str,
    error: mysql.connector.Error,
    *,
    headers: dict[str, str] | None = None,
) -> None:
    logger.exception(message)
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Banco de dados indisponível.",
        headers=headers,
    ) from error
