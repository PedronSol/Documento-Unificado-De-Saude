from typing import Any

from fastapi import APIRouter, Depends

from auth.dependencies import get_current_patient
from database import get_connection
from models import LoginResponse
from patients.service import fetch_dashboard


router = APIRouter()


@router.get("/me", response_model=LoginResponse)
def get_me(
    patient: dict = Depends(get_current_patient),
    connection: Any = Depends(get_connection),
):
    return fetch_dashboard(connection, patient["cpf_paciente"], "Sessão válida.")
