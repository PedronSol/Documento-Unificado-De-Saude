from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from auth.dependencies import get_current_user
from database import get_connection
from models import LoginResponse
from patients.service import fetch_dashboard, find_patient_by_user_id


router = APIRouter()


@router.get("/me", response_model=LoginResponse)
def get_me(
    user: dict = Depends(get_current_user),
    connection: Any = Depends(get_connection),
):
    if "patient" not in user["roles"]:
        return {
            "message": "Sessão válida.",
            "user": user,
            "patient_data": None,
            "vaccines": [],
            "alerts": [],
            "documents": [],
        }

    patient = find_patient_by_user_id(connection, user["user_id"])
    if not patient:
        raise HTTPException(status_code=409, detail="Perfil de paciente inconsistente.")
    return fetch_dashboard(
        connection,
        patient["patient_id"],
        user,
        "Sessão válida.",
        patient=patient,
    )
