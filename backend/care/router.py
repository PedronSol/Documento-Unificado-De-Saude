import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Response, status
import mysql.connector

from auth.dependencies import get_current_patient, require_adult
from care.service import (
    decide_invitation,
    end_patient_link,
    list_patient_care_groups,
    list_patient_invitations,
)
from database import cursor_scope, get_connection, transaction
from models import PatientCareGroup, PatientCareInvitation


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/me")


@router.get("/care-invitations", response_model=list[PatientCareInvitation])
def get_care_invitations(
    patient: dict = Depends(get_current_patient),
    connection: Any = Depends(get_connection),
):
    try:
        with cursor_scope(connection, dictionary=True) as cursor:
            return list_patient_invitations(cursor, patient_id=patient["patient_id"])
    except mysql.connector.Error as error:
        _raise_database_unavailable("Falha ao listar convites de cuidado", error)


@router.post(
    "/care-invitations/{invitation_id}/accept",
    status_code=status.HTTP_204_NO_CONTENT,
)
def accept_care_invitation(
    invitation_id: int,
    patient: dict = Depends(require_adult),
    connection: Any = Depends(get_connection),
):
    return _decide(connection, patient, invitation_id, accept=True)


@router.post(
    "/care-invitations/{invitation_id}/reject",
    status_code=status.HTTP_204_NO_CONTENT,
)
def reject_care_invitation(
    invitation_id: int,
    patient: dict = Depends(require_adult),
    connection: Any = Depends(get_connection),
):
    return _decide(connection, patient, invitation_id, accept=False)


@router.get("/care-groups", response_model=list[PatientCareGroup])
def get_care_groups(
    patient: dict = Depends(get_current_patient),
    connection: Any = Depends(get_connection),
):
    try:
        with cursor_scope(connection, dictionary=True) as cursor:
            return list_patient_care_groups(cursor, patient_id=patient["patient_id"])
    except mysql.connector.Error as error:
        _raise_database_unavailable("Falha ao listar grupos de cuidado", error)


@router.delete(
    "/care-groups/{group_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def revoke_care_group(
    group_id: int,
    patient: dict = Depends(require_adult),
    connection: Any = Depends(get_connection),
):
    try:
        with cursor_scope(connection, dictionary=True) as cursor:
            with transaction(connection):
                end_patient_link(
                    cursor,
                    actor_user_id=patient["user_id"],
                    group_id=group_id,
                    patient_id=patient["patient_id"],
                )
    except mysql.connector.Error as error:
        _raise_database_unavailable("Falha ao revogar vínculo de cuidado", error)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _decide(connection: Any, patient: dict, invitation_id: int, *, accept: bool):
    try:
        with cursor_scope(connection, dictionary=True) as cursor:
            with transaction(connection):
                decide_invitation(
                    cursor,
                    patient=patient,
                    invitation_id=invitation_id,
                    accept=accept,
                )
    except mysql.connector.Error as error:
        _raise_database_unavailable("Falha ao decidir convite de cuidado", error)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _raise_database_unavailable(message: str, error: mysql.connector.Error) -> None:
    logger.exception(message)
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Banco de dados indisponível.",
    ) from error
