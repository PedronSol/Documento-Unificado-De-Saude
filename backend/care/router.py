import logging
from typing import Any

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
import mysql.connector

from auth.dependencies import get_current_patient, get_own_patient, require_adult
from care.guardianship import (
    confirm_guardianship,
    decide_guardianship,
    issue_transfer,
    list_dependents,
    list_my_guardians,
    list_pending_guardianships,
    release_guardian,
    renounce_guardianship,
)
from care.direct_links import (
    decide_care_request,
    list_patient_care_doctors,
    list_patient_care_requests,
    revoke_care_doctor,
)
from care.service import (
    decide_invitation,
    end_patient_link,
    list_patient_care_groups,
    list_patient_invitations,
)
from database import cursor_scope, get_connection, transaction
from pagination import Page, PageRequest, page_request
from models import (
    ClaimLinkIssued,
    DependentProfile,
    MyGuardian,
    GuardianshipAcceptance,
    PendingGuardianship,
    PatientCareDoctor,
    PatientCareGroup,
    PatientCareInvitation,
    PatientCareRequest,
)


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/me")


@router.get("/care-invitations", response_model=Page[PatientCareInvitation])
def get_care_invitations(
    page: PageRequest = Depends(page_request),
    patient: dict = Depends(get_current_patient),
    connection: Any = Depends(get_connection),
):
    try:
        with cursor_scope(connection, dictionary=True) as cursor:
            return list_patient_invitations(
                cursor,
                patient_id=patient["patient_id"],
                request=page,
            )
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


@router.get("/care-groups", response_model=Page[PatientCareGroup])
def get_care_groups(
    page: PageRequest = Depends(page_request),
    patient: dict = Depends(get_current_patient),
    connection: Any = Depends(get_connection),
):
    try:
        with cursor_scope(connection, dictionary=True) as cursor:
            return list_patient_care_groups(
                cursor,
                patient_id=patient["patient_id"],
                request=page,
            )
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


@router.get("/care-requests", response_model=Page[PatientCareRequest])
def get_care_requests(
    page: PageRequest = Depends(page_request),
    patient: dict = Depends(get_current_patient),
    connection: Any = Depends(get_connection),
):
    try:
        with cursor_scope(connection, dictionary=True) as cursor:
            return list_patient_care_requests(
                cursor,
                patient_id=patient["patient_id"],
                request=page,
            )
    except mysql.connector.Error as error:
        _raise_database_unavailable("Falha ao listar solicitações médicas", error)


@router.post(
    "/care-requests/{link_id}/accept",
    status_code=status.HTTP_204_NO_CONTENT,
)
def accept_care_request(
    link_id: int,
    patient: dict = Depends(require_adult),
    connection: Any = Depends(get_connection),
):
    return _decide_request(connection, patient, link_id, accept=True)


@router.post(
    "/care-requests/{link_id}/reject",
    status_code=status.HTTP_204_NO_CONTENT,
)
def reject_care_request(
    link_id: int,
    patient: dict = Depends(require_adult),
    connection: Any = Depends(get_connection),
):
    return _decide_request(connection, patient, link_id, accept=False)


@router.get("/care-doctors", response_model=Page[PatientCareDoctor])
def get_care_doctors(
    page: PageRequest = Depends(page_request),
    patient: dict = Depends(get_current_patient),
    connection: Any = Depends(get_connection),
):
    try:
        with cursor_scope(connection, dictionary=True) as cursor:
            return list_patient_care_doctors(
                cursor,
                patient_id=patient["patient_id"],
                request=page,
            )
    except mysql.connector.Error as error:
        _raise_database_unavailable("Falha ao listar médicos com acesso", error)


@router.delete(
    "/care-doctors/{link_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_care_doctor(
    link_id: int,
    patient: dict = Depends(require_adult),
    connection: Any = Depends(get_connection),
):
    try:
        with cursor_scope(connection, dictionary=True) as cursor:
            with transaction(connection):
                revoke_care_doctor(cursor, patient=patient, link_id=link_id)
    except mysql.connector.Error as error:
        _raise_database_unavailable("Falha ao revogar médico", error)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/dependents", response_model=list[DependentProfile])
def get_dependents(
    patient: dict = Depends(get_own_patient),
    connection: Any = Depends(get_connection),
):
    try:
        with cursor_scope(connection, dictionary=True) as cursor:
            return list_dependents(cursor, guardian_patient_id=patient["patient_id"])
    except mysql.connector.Error as error:
        _raise_database_unavailable("Falha ao listar dependentes", error)


@router.get("/guardianships", response_model=Page[PendingGuardianship])
def get_guardianships(
    page: PageRequest = Depends(page_request),
    guardianship_status: Literal["pending"] = Query(default="pending", alias="status"),
    patient: dict = Depends(get_own_patient),
    connection: Any = Depends(get_connection),
):
    try:
        with cursor_scope(connection, dictionary=True) as cursor:
            return list_pending_guardianships(
                cursor,
                guardian_patient_id=patient["patient_id"],
                request=page,
            )
    except mysql.connector.Error as error:
        _raise_database_unavailable("Falha ao listar guardas", error)


@router.post(
    "/guardianships/{guardianship_id}/accept",
    status_code=status.HTTP_204_NO_CONTENT,
)
def accept_guardianship(
    guardianship_id: int,
    payload: GuardianshipAcceptance,
    patient: dict = Depends(get_own_patient),
    connection: Any = Depends(get_connection),
):
    return _guardianship_mutation(
        connection,
        lambda cursor: decide_guardianship(
            cursor,
            guardian=patient,
            guardianship_id=guardianship_id,
            accept=True,
            dependent_birth_date=payload.dependent_birth_date,
        ),
    )


@router.post(
    "/guardianships/{guardianship_id}/reject",
    status_code=status.HTTP_204_NO_CONTENT,
)
def reject_guardianship(
    guardianship_id: int,
    patient: dict = Depends(get_own_patient),
    connection: Any = Depends(get_connection),
):
    return _guardianship_mutation(
        connection,
        lambda cursor: decide_guardianship(
            cursor,
            guardian=patient,
            guardianship_id=guardianship_id,
            accept=False,
        ),
    )


@router.delete(
    "/guardianships/{guardianship_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_guardianship(
    guardianship_id: int,
    patient: dict = Depends(get_own_patient),
    connection: Any = Depends(get_connection),
):
    return _guardianship_mutation(
        connection,
        lambda cursor: renounce_guardianship(
            cursor,
            guardian=patient,
            guardianship_id=guardianship_id,
        ),
    )


@router.post(
    "/guardianships/{guardianship_id}/confirm",
    status_code=status.HTTP_204_NO_CONTENT,
)
def confirm_own_guardianship(
    guardianship_id: int,
    patient: dict = Depends(get_own_patient),
    connection: Any = Depends(get_connection),
):
    return _guardianship_mutation(
        connection,
        lambda cursor: confirm_guardianship(
            cursor,
            dependent=patient,
            guardianship_id=guardianship_id,
        ),
    )


@router.get("/guardians", response_model=Page[MyGuardian])
def get_my_guardians(
    page: PageRequest = Depends(page_request),
    patient: dict = Depends(get_own_patient),
    connection: Any = Depends(get_connection),
):
    try:
        with cursor_scope(connection, dictionary=True) as cursor:
            return list_my_guardians(
                cursor,
                patient_id=patient["patient_id"],
                request=page,
            )
    except mysql.connector.Error as error:
        _raise_database_unavailable("Falha ao listar responsáveis", error)


@router.delete(
    "/guardians/{guardianship_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_my_guardian(
    guardianship_id: int,
    patient: dict = Depends(get_own_patient),
    connection: Any = Depends(get_connection),
):
    return _guardianship_mutation(
        connection,
        lambda cursor: release_guardian(
            cursor,
            dependent=patient,
            guardianship_id=guardianship_id,
        ),
    )


@router.post(
    "/dependents/{patient_id}/claim-link",
    response_model=ClaimLinkIssued,
    status_code=status.HTTP_201_CREATED,
)
def post_dependent_claim_link(
    patient_id: int,
    patient: dict = Depends(get_own_patient),
    connection: Any = Depends(get_connection),
):
    try:
        with cursor_scope(connection, dictionary=True) as cursor:
            with transaction(connection):
                return issue_transfer(
                    cursor,
                    guardian=patient,
                    dependent_patient_id=patient_id,
                )
    except mysql.connector.Error as error:
        _raise_database_unavailable("Falha ao emitir transferência", error)


def _guardianship_mutation(connection: Any, mutate):
    try:
        with cursor_scope(connection, dictionary=True) as cursor:
            with transaction(connection):
                mutate(cursor)
    except mysql.connector.Error as error:
        _raise_database_unavailable("Falha ao alterar guarda", error)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _decide_request(connection: Any, patient: dict, link_id: int, *, accept: bool):
    try:
        with cursor_scope(connection, dictionary=True) as cursor:
            with transaction(connection):
                decide_care_request(
                    cursor,
                    patient=patient,
                    link_id=link_id,
                    accept=accept,
                )
    except mysql.connector.Error as error:
        _raise_database_unavailable("Falha ao decidir solicitação médica", error)
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
