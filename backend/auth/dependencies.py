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


def get_current_patient(
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
            SELECT p.*
            FROM sessoes s
            JOIN pacientes p ON p.cpf_paciente = s.paciente_id
            WHERE s.token_hash = %s AND s.expira_em > UTC_TIMESTAMP()
            """,
            (hash_session_token(session_token),),
        )
        patient = cursor.fetchone()

    if not patient:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sessão inválida ou expirada.",
        )
    return patient


def require_adult(patient: dict = Depends(get_current_patient)) -> dict:
    if calculate_age(patient["data_nascimento"]) < 18:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Menores de idade não podem alterar o prontuário.",
        )
    return patient
