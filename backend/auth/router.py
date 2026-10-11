import logging
from typing import Any, Optional

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordRequestForm
import mysql.connector

from auth.dependencies import _load_authorized_roles, get_current_patient
from auth.google import (
    GoogleIdentityVerifier,
    get_google_identity_verifier,
    verified_google_identity,
)
from auth.service import (
    create_google_patient,
    create_local_patient,
    create_session,
    link_google_identity,
    set_session_cookie,
)
from config import AppSettings, SESSION_COOKIE, get_settings
from database import connection_scope, cursor_scope, get_connection, transaction
from models import (
    AuthenticationResponse,
    GoogleCredential,
    GoogleOnboardingResponse,
    GooglePatientRegistration,
    PatientRegistration,
)
from patients.service import find_patient_by_user_id
from security import hash_session_token, verify_password


logger = logging.getLogger(__name__)
router = APIRouter()


@router.post(
    "/auth/google",
    response_model=AuthenticationResponse | GoogleOnboardingResponse,
)
def authenticate_with_google(
    payload: GoogleCredential,
    response: Response,
    settings: AppSettings = Depends(get_settings),
    verifier: GoogleIdentityVerifier | None = Depends(get_google_identity_verifier),
    connection: Any = Depends(get_connection),
):
    if not settings.google_auth_enabled or verifier is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    try:
        external_identity = verified_google_identity(payload.credential, verifier)
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credencial Google inválida.",
        ) from error

    try:
        with cursor_scope(connection, dictionary=True) as cursor:
            cursor.execute(
                """
                SELECT u.user_id, u.display_name, u.email, u.active
                FROM external_identities ei
                JOIN users u ON u.user_id = ei.user_id
                WHERE ei.issuer = %s AND ei.subject = %s
                """,
                (
                    external_identity["issuer"],
                    external_identity["subject"],
                ),
            )
            user = cursor.fetchone()
    except mysql.connector.Error as error:
        _raise_database_unavailable("Falha ao autenticar com Google", error)

    if not user:
        return {"status": "onboarding_required"}
    if not user["active"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Conta inativa.",
        )

    try:
        user["roles"] = _load_authorized_roles(connection, user["user_id"])
        with cursor_scope(connection) as cursor:
            with transaction(connection):
                raw_token = create_session(
                    cursor,
                    user_id=user["user_id"],
                    settings=settings,
                )
    except mysql.connector.Error as error:
        _raise_database_unavailable("Falha ao criar sessão Google", error)
    set_session_cookie(response, raw_token=raw_token, settings=settings)
    user.pop("active", None)
    return {"user": user}


@router.post(
    "/auth/google/patient-registration",
    response_model=AuthenticationResponse,
    status_code=status.HTTP_201_CREATED,
)
def register_patient_with_google(
    registration: GooglePatientRegistration,
    response: Response,
    settings: AppSettings = Depends(get_settings),
    verifier: GoogleIdentityVerifier | None = Depends(get_google_identity_verifier),
    connection: Any = Depends(get_connection),
):
    if not settings.google_auth_enabled or verifier is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    try:
        external_identity = verified_google_identity(
            registration.credential,
            verifier,
        )
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credencial Google inválida.",
        ) from error

    try:
        with cursor_scope(connection, dictionary=True) as cursor:
            with transaction(connection):
                identity = create_google_patient(
                    cursor,
                    registration,
                    external_identity,
                )
                raw_token = create_session(
                    cursor,
                    user_id=identity["user_id"],
                    settings=settings,
                )
    except mysql.connector.IntegrityError as error:
        if error.errno == 1062:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Dados cadastrais já utilizados.",
            ) from error
        _raise_database_unavailable("Falha de integridade no cadastro Google", error)
    except mysql.connector.Error as error:
        _raise_database_unavailable("Falha ao cadastrar paciente com Google", error)

    set_session_cookie(response, raw_token=raw_token, settings=settings)
    return {"user": identity}


@router.post(
    "/me/external-identities/google",
    status_code=status.HTTP_204_NO_CONTENT,
)
def link_google_to_current_patient(
    payload: GoogleCredential,
    settings: AppSettings = Depends(get_settings),
    verifier: GoogleIdentityVerifier | None = Depends(get_google_identity_verifier),
    patient: dict = Depends(get_current_patient),
    connection: Any = Depends(get_connection),
):
    if not settings.google_auth_enabled or verifier is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    try:
        external_identity = verified_google_identity(payload.credential, verifier)
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credencial Google inválida.",
        ) from error

    try:
        with cursor_scope(connection, dictionary=True) as cursor:
            with transaction(connection):
                link_google_identity(
                    cursor,
                    patient=patient,
                    external_identity=external_identity,
                )
    except mysql.connector.IntegrityError as error:
        if error.errno == 1062:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Identidade Google já vinculada.",
            ) from error
        _raise_database_unavailable("Falha de integridade na vinculação", error)
    except mysql.connector.Error as error:
        _raise_database_unavailable("Falha ao vincular identidade Google", error)


@router.post(
    "/auth/patient-registration",
    response_model=AuthenticationResponse,
    status_code=status.HTTP_201_CREATED,
)
def register_patient(
    registration: PatientRegistration,
    response: Response,
    settings: AppSettings = Depends(get_settings),
    connection: Any = Depends(get_connection),
):
    try:
        with cursor_scope(connection, dictionary=True) as cursor:
            with transaction(connection):
                identity = create_local_patient(cursor, registration)
                raw_token = create_session(
                    cursor,
                    user_id=identity["user_id"],
                    settings=settings,
                )
    except mysql.connector.IntegrityError as error:
        if error.errno == 1062:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Dados cadastrais já utilizados.",
            ) from error
        _raise_database_unavailable("Falha de integridade no cadastro", error)
    except mysql.connector.Error as error:
        _raise_database_unavailable("Falha ao cadastrar paciente", error)

    set_session_cookie(response, raw_token=raw_token, settings=settings)
    return {"user": identity}


@router.post("/login", response_model=AuthenticationResponse)
def login(
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    settings: AppSettings = Depends(get_settings),
    connection: Any = Depends(get_connection),
):
    normalized_email = form_data.username.strip().casefold()
    with cursor_scope(connection, dictionary=True) as cursor:
        cursor.execute("SELECT * FROM users WHERE email = %s", (normalized_email,))
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

    with cursor_scope(connection) as cursor:
        with transaction(connection):
            session_token = create_session(
                cursor,
                user_id=user["user_id"],
                settings=settings,
            )

    set_session_cookie(
        response,
        raw_token=session_token,
        settings=settings,
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


def _raise_database_unavailable(message: str, error: mysql.connector.Error) -> None:
    logger.exception(message)
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Banco de dados indisponível.",
    ) from error
