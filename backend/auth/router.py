from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response
from fastapi.security import OAuth2PasswordRequestForm

from auth.dependencies import _load_authorized_roles
from config import AppSettings, SESSION_COOKIE, get_settings
from database import connection_scope, cursor_scope, get_connection, transaction
from models import AuthenticationResponse
from patients.service import find_patient_by_user_id
from security import create_session_token, hash_session_token, verify_password


router = APIRouter()


@router.post("/login", response_model=AuthenticationResponse)
def login(
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    settings: AppSettings = Depends(get_settings),
    connection: Any = Depends(get_connection),
):
    with cursor_scope(connection, dictionary=True) as cursor:
        cursor.execute("SELECT * FROM users WHERE email = %s", (form_data.username,))
        user = cursor.fetchone()

    if not user or not verify_password(form_data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="E-mail ou senha incorretos.")
    if not user["active"]:
        raise HTTPException(status_code=403, detail="Conta inativa.")

    roles = _load_authorized_roles(connection, user["user_id"])
    identity = {
        "user_id": user["user_id"],
        "display_name": user["display_name"],
        "email": user["email"],
        "roles": roles,
    }
    patient = None
    if "patient" in roles:
        patient = find_patient_by_user_id(connection, user["user_id"])
        if not patient:
            raise HTTPException(
                status_code=409,
                detail="Perfil de paciente inconsistente.",
            )

    session_token = create_session_token()
    expires_at = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(
        hours=settings.session_duration_hours
    )
    with cursor_scope(connection) as cursor:
        with transaction(connection):
            cursor.execute("DELETE FROM sessions WHERE expires_at <= UTC_TIMESTAMP()")
            cursor.execute(
                "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (%s, %s, %s)",
                (
                    hash_session_token(session_token),
                    user["user_id"],
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
    return {"user": identity}


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
                        "DELETE FROM sessions WHERE token_hash = %s",
                        (hash_session_token(session_token),),
                    )

    response.delete_cookie(settings.session_cookie, path="/")
