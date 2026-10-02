from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response
from fastapi.security import OAuth2PasswordRequestForm

from config import AppSettings, SESSION_COOKIE, get_settings
from database import connection_scope, cursor_scope, get_connection, transaction
from models import LoginResponse
from patients.service import fetch_dashboard
from security import create_session_token, hash_session_token, verify_password


router = APIRouter()


@router.post("/login", response_model=LoginResponse)
def login(
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    settings: AppSettings = Depends(get_settings),
    connection: Any = Depends(get_connection),
):
    with cursor_scope(connection, dictionary=True) as cursor:
        cursor.execute("SELECT * FROM pacientes WHERE email = %s", (form_data.username,))
        patient = cursor.fetchone()

        if not patient or not verify_password(form_data.password, patient["senha_hash"]):
            raise HTTPException(status_code=401, detail="E-mail ou senha incorretos.")

        session_token = create_session_token()
        expires_at = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(
            hours=settings.session_duration_hours
        )
        with transaction(connection):
            cursor.execute("DELETE FROM sessoes WHERE expira_em <= UTC_TIMESTAMP()")
            cursor.execute(
                "INSERT INTO sessoes (token_hash, paciente_id, expira_em) VALUES (%s, %s, %s)",
                (
                    hash_session_token(session_token),
                    patient["cpf_paciente"],
                    expires_at,
                ),
            )

    response.set_cookie(
        key=settings.session_cookie,
        value=session_token,
        max_age=settings.session_duration_hours * 60 * 60,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )
    return fetch_dashboard(
        connection,
        patient["cpf_paciente"],
        "Login efetuado com sucesso!",
    )


@router.post("/logout", status_code=204)
def logout(
    response: Response,
    request: Request,
    session_token: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE),
    settings: AppSettings = Depends(get_settings),
):
    if session_token:
        with connection_scope(request.app.state.connection_factory) as connection:
            with cursor_scope(connection) as cursor:
                with transaction(connection):
                    cursor.execute(
                        "DELETE FROM sessoes WHERE token_hash = %s",
                        (hash_session_token(session_token),),
                    )

    response.delete_cookie(settings.session_cookie, path="/")
