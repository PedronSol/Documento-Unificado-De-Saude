from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from auth.dependencies import get_current_user
from database import get_connection
from models import CurrentUserProfileResponse
from patients.service import find_patient_by_user_id, serialize_patient_profile


router = APIRouter()


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
