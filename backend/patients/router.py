import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
import mysql.connector

from auth.dependencies import get_current_user
from database import cursor_scope, get_connection, transaction
from models import CurrentUserProfileResponse, OwnProfileUpdate
from patients.service import find_patient_by_user_id, serialize_patient_profile


router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/me", response_model=CurrentUserProfileResponse)
def get_me(
    user: dict = Depends(get_current_user),
    connection: Any = Depends(get_connection),
):
    if "patient" not in user["roles"]:
        return {
            "user": user,
            "patient_profile": None,
        }

    patient = find_patient_by_user_id(connection, user["user_id"])
    if not patient:
        raise HTTPException(status_code=409, detail="Perfil de paciente inconsistente.")
    return {
        "user": user,
        "patient_profile": serialize_patient_profile(patient),
    }


@router.patch("/me/profile", response_model=CurrentUserProfileResponse)
def update_me_profile(
    profile: OwnProfileUpdate,
    user: dict = Depends(get_current_user),
    connection: Any = Depends(get_connection),
):
    if (
        "preferred_name" in profile.model_fields_set
        and "patient" not in user["roles"]
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Nome preferido está disponível somente para pacientes.",
        )

    try:
        with cursor_scope(connection, dictionary=True) as cursor:
            with transaction(connection):
                if "preferred_name" in profile.model_fields_set:
                    cursor.execute(
                        "SELECT patient_id FROM patients WHERE user_id = %s FOR UPDATE",
                        (user["user_id"],),
                    )
                    if not cursor.fetchone():
                        raise HTTPException(
                            status_code=status.HTTP_409_CONFLICT,
                            detail="Perfil de paciente inconsistente.",
                        )
                    cursor.execute(
                        "UPDATE patients SET nome_paciente = %s WHERE user_id = %s",
                        (profile.preferred_name, user["user_id"]),
                    )

                if "display_name" in profile.model_fields_set:
                    cursor.execute(
                        "UPDATE users SET display_name = %s WHERE user_id = %s",
                        (profile.display_name, user["user_id"]),
                    )
    except mysql.connector.Error as error:
        logger.exception("Falha ao atualizar o perfil próprio")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Banco de dados indisponível.",
        ) from error

    display_name = (
        profile.display_name
        if "display_name" in profile.model_fields_set
        else user["display_name"]
    )
    updated_user = {**user, "display_name": display_name}
    return get_me(user=updated_user, connection=connection)
