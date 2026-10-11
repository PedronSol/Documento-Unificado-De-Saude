from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import Response

from audit.service import record_clinical_event
from config import AppSettings
from models import GooglePatientRegistration, PatientRegistration
from security import create_session_token, hash_password, hash_session_token


def create_local_patient(cursor: Any, registration: PatientRegistration) -> dict:
    cursor.execute(
        """
        INSERT INTO users (cpf, display_name, email, password_hash, active)
        VALUES (%s, %s, %s, %s, TRUE)
        """,
        (
            registration.cpf,
            registration.display_name,
            registration.email,
            hash_password(registration.password),
        ),
    )
    user_id = cursor.lastrowid

    cursor.execute(
        "INSERT INTO user_roles (user_id, role) VALUES (%s, %s)",
        (user_id, "patient"),
    )
    cursor.execute(
        """
        INSERT INTO patients (
            user_id, nome_paciente, nome_completo, status_saude,
            data_nascimento
        ) VALUES (%s, %s, %s, %s, %s)
        """,
        (
            user_id,
            registration.preferred_name,
            registration.display_name,
            "pending",
            registration.birth_date,
        ),
    )
    patient_id = cursor.lastrowid
    record_clinical_event(
        cursor,
        actor_user_id=user_id,
        patient_id=patient_id,
        action="patient.registered",
        resource_type="patient",
        resource_id=patient_id,
        after_snapshot={"authentication_method": "local"},
    )
    return {
        "user_id": user_id,
        "display_name": registration.display_name,
        "email": registration.email,
        "roles": ["patient"],
    }


def create_google_patient(
    cursor: Any,
    registration: GooglePatientRegistration,
    external_identity: dict[str, str],
) -> dict:
    cursor.execute(
        """
        INSERT INTO users (cpf, display_name, email, password_hash, active)
        VALUES (%s, %s, %s, NULL, TRUE)
        """,
        (
            registration.cpf,
            external_identity["display_name"],
            external_identity["email"],
        ),
    )
    user_id = cursor.lastrowid
    cursor.execute(
        """
        INSERT INTO external_identities (user_id, provider, issuer, subject)
        VALUES (%s, %s, %s, %s)
        """,
        (
            user_id,
            "google",
            external_identity["issuer"],
            external_identity["subject"],
        ),
    )
    cursor.execute(
        "INSERT INTO user_roles (user_id, role) VALUES (%s, %s)",
        (user_id, "patient"),
    )
    cursor.execute(
        """
        INSERT INTO patients (
            user_id, nome_paciente, nome_completo, status_saude,
            data_nascimento
        ) VALUES (%s, %s, %s, %s, %s)
        """,
        (
            user_id,
            registration.preferred_name,
            external_identity["display_name"],
            "pending",
            registration.birth_date,
        ),
    )
    patient_id = cursor.lastrowid
    record_clinical_event(
        cursor,
        actor_user_id=user_id,
        patient_id=patient_id,
        action="patient.registered",
        resource_type="patient",
        resource_id=patient_id,
        after_snapshot={"authentication_method": "google"},
    )
    return {
        "user_id": user_id,
        "display_name": external_identity["display_name"],
        "email": external_identity["email"],
        "roles": ["patient"],
    }


def link_google_identity(
    cursor: Any,
    *,
    patient: dict,
    external_identity: dict[str, str],
) -> None:
    cursor.execute(
        """
        INSERT INTO external_identities (user_id, provider, issuer, subject)
        VALUES (%s, %s, %s, %s)
        """,
        (
            patient["user_id"],
            "google",
            external_identity["issuer"],
            external_identity["subject"],
        ),
    )
    record_clinical_event(
        cursor,
        actor_user_id=patient["user_id"],
        patient_id=patient["patient_id"],
        action="external_identity.linked",
        resource_type="patient",
        resource_id=patient["patient_id"],
        after_snapshot={"provider": "google"},
    )


def create_session(cursor: Any, *, user_id: int, settings: AppSettings) -> str:
    raw_token = create_session_token()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    absolute_expires_at = now + timedelta(hours=settings.session_max_hours)
    expires_at = min(
        now + timedelta(hours=settings.session_idle_hours),
        absolute_expires_at,
    )
    cursor.execute(
        "DELETE FROM sessions WHERE expires_at <= UTC_TIMESTAMP() "
        "OR absolute_expires_at <= UTC_TIMESTAMP()"
    )
    cursor.execute(
        "INSERT INTO sessions (token_hash, user_id, expires_at, absolute_expires_at) "
        "VALUES (%s, %s, %s, %s)",
        (hash_session_token(raw_token), user_id, expires_at, absolute_expires_at),
    )
    return raw_token


def set_session_cookie(
    response: Response,
    *,
    raw_token: str,
    settings: AppSettings,
) -> None:
    response.set_cookie(
        key=settings.session_cookie,
        value=raw_token,
        max_age=settings.session_max_hours * 60 * 60,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )
