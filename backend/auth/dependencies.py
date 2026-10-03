from datetime import date
from typing import Any, Optional

from fastapi import Cookie, Depends, HTTPException, status

from config import SESSION_COOKIE
from database import cursor_scope, get_connection
from security import hash_session_token


def calculate_age(birth_date: date) -> int:
    today = date.today()
    return today.year - birth_date.year - (
        (today.month, today.day) < (birth_date.month, birth_date.day)
    )


def _load_authorized_roles(connection: Any, user_id: int) -> list[str]:
    with cursor_scope(connection, dictionary=True) as cursor:
        cursor.execute(
            """
            SELECT role
            FROM user_roles
            WHERE user_id = %s
            ORDER BY FIELD(role, 'patient', 'doctor', 'admin')
            """,
            (user_id,),
        )
        roles = [row["role"] for row in cursor.fetchall()]

        if "doctor" in roles:
            cursor.execute(
                """
                SELECT verification_status
                FROM doctors
                WHERE user_id = %s
                """,
                (user_id,),
            )
            doctor = cursor.fetchone()
            if not doctor:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Perfil profissional inconsistente.",
                )
            if doctor["verification_status"] != "verified":
                roles.remove("doctor")

    return roles


def get_current_user(
    session_token: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE),
    connection: Any = Depends(get_connection),
) -> dict:
    if not session_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Autenticação necessária.",
        )

    with cursor_scope(connection, dictionary=True) as cursor:
        cursor.execute(
            """
            SELECT u.user_id, u.display_name, u.email
            FROM sessions s
            JOIN users u ON u.user_id = s.user_id
            WHERE s.token_hash = %s
              AND s.expires_at > UTC_TIMESTAMP()
              AND u.active = TRUE
            """,
            (hash_session_token(session_token),),
        )
        user = cursor.fetchone()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sessão inválida ou expirada.",
        )
    user["roles"] = _load_authorized_roles(connection, user["user_id"])
    return user


def require_roles(*allowed_roles: str):
    def dependency(user: dict = Depends(get_current_user)) -> dict:
        if not set(user["roles"]).intersection(allowed_roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Acesso não permitido para este perfil.",
            )
        return user

    return dependency


require_patient_role = require_roles("patient")


def get_current_patient(
    user: dict = Depends(require_patient_role),
    connection: Any = Depends(get_connection),
) -> dict:
    with cursor_scope(connection, dictionary=True) as cursor:
        cursor.execute(
            "SELECT * FROM patients WHERE user_id = %s",
            (user["user_id"],),
        )
        patient = cursor.fetchone()

    if not patient:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Perfil de paciente inconsistente.",
        )
    return patient


def require_adult(patient: dict = Depends(get_current_patient)) -> dict:
    if calculate_age(patient["data_nascimento"]) < 18:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Menores de idade não podem alterar o prontuário.",
        )
    return patient
