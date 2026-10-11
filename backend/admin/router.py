import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
import mysql.connector

from admin.service import (
    MAX_PAGE_SIZE,
    add_group_doctor,
    cancel_patient_invitation,
    change_doctor_status,
    correct_doctor,
    create_care_group,
    invite_patient,
    issue_doctor_invitation,
    list_admin_doctors,
    list_audit_events,
    list_care_groups,
    load_admin_doctor,
    load_care_group_detail,
    remove_group_doctor,
    revoke_patient_link,
    search_directory,
    update_care_group,
    list_doctor_invitations,
    revoke_doctor_invitation,
)
from auth.dependencies import require_admin_role
from database import cursor_scope, get_connection, transaction
from models import (
    AdminCareGroup,
    AdminCareGroupDetail,
    AdminCareGroupPage,
    AdminDoctor,
    AdminDoctorPage,
    AdministrativeAuditPage,
    CareGroupCreate,
    CareInvitationCreate,
    CareInvitationCreatedResponse,
    CareGroupUpdate,
    DirectoryPage,
    DoctorCorrection,
    DoctorInvitationCreate,
    DoctorInvitationCreatedResponse,
    DoctorInvitationPage,
    DoctorStatusChange,
)


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/admin")


def pagination(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=MAX_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
) -> dict:
    return {"page": page, "page_size": page_size}


@router.post(
    "/doctor-invitations",
    response_model=DoctorInvitationCreatedResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_doctor_invitation(
    invitation: DoctorInvitationCreate,
    admin: dict = Depends(require_admin_role),
    connection: Any = Depends(get_connection),
):
    try:
        with cursor_scope(connection, dictionary=True) as cursor:
            with transaction(connection):
                return issue_doctor_invitation(
                    cursor,
                    admin_user_id=admin["user_id"],
                    invitation=invitation,
                )
    except mysql.connector.Error as error:
        _raise_database_unavailable("Falha ao emitir convite profissional", error)


@router.get("/doctor-invitations", response_model=DoctorInvitationPage)
def get_doctor_invitations(
    paging: dict = Depends(pagination),
    admin: dict = Depends(require_admin_role),
    connection: Any = Depends(get_connection),
):
    try:
        with cursor_scope(connection, dictionary=True) as cursor:
            return list_doctor_invitations(
                cursor,
                admin_user_id=admin["user_id"],
                **paging,
            )
    except mysql.connector.Error as error:
        _raise_database_unavailable("Falha ao listar convites profissionais", error)


@router.delete(
    "/doctor-invitations/{invitation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_doctor_invitation(
    invitation_id: int,
    admin: dict = Depends(require_admin_role),
    connection: Any = Depends(get_connection),
):
    try:
        with cursor_scope(connection, dictionary=True) as cursor:
            with transaction(connection):
                revoke_doctor_invitation(
                    cursor,
                    admin_user_id=admin["user_id"],
                    invitation_id=invitation_id,
                )
    except mysql.connector.Error as error:
        _raise_database_unavailable("Falha ao revogar convite profissional", error)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/doctors", response_model=AdminDoctorPage)
def get_admin_doctors(
    paging: dict = Depends(pagination),
    admin: dict = Depends(require_admin_role),
    connection: Any = Depends(get_connection),
):
    try:
        with cursor_scope(connection, dictionary=True) as cursor:
            return list_admin_doctors(
                cursor,
                admin_user_id=admin["user_id"],
                **paging,
            )
    except mysql.connector.Error as error:
        _raise_database_unavailable("Falha ao listar médicos administrados", error)


@router.get("/doctors/{doctor_id}", response_model=AdminDoctor)
def get_admin_doctor(
    doctor_id: int,
    admin: dict = Depends(require_admin_role),
    connection: Any = Depends(get_connection),
):
    try:
        with cursor_scope(connection, dictionary=True) as cursor:
            return load_admin_doctor(
                cursor,
                admin_user_id=admin["user_id"],
                doctor_id=doctor_id,
            )
    except mysql.connector.Error as error:
        _raise_database_unavailable("Falha ao consultar médico administrado", error)


@router.patch("/doctors/{doctor_id}", response_model=AdminDoctor)
def patch_admin_doctor(
    doctor_id: int,
    correction: DoctorCorrection,
    admin: dict = Depends(require_admin_role),
    connection: Any = Depends(get_connection),
):
    try:
        with cursor_scope(connection, dictionary=True) as cursor:
            with transaction(connection):
                return correct_doctor(
                    cursor,
                    admin_user_id=admin["user_id"],
                    doctor_id=doctor_id,
                    crm_number=correction.crm_number,
                    crm_state=correction.crm_state,
                )
    except mysql.connector.IntegrityError as error:
        _raise_integrity_conflict("Falha de integridade ao corrigir médico", error)
    except mysql.connector.Error as error:
        _raise_database_unavailable("Falha ao corrigir médico", error)


@router.post("/doctors/{doctor_id}/status", response_model=AdminDoctor)
def post_admin_doctor_status(
    doctor_id: int,
    change: DoctorStatusChange,
    admin: dict = Depends(require_admin_role),
    connection: Any = Depends(get_connection),
):
    try:
        with cursor_scope(connection, dictionary=True) as cursor:
            with transaction(connection):
                return change_doctor_status(
                    cursor,
                    admin_user_id=admin["user_id"],
                    doctor_id=doctor_id,
                    action=change.action,
                )
    except mysql.connector.Error as error:
        _raise_database_unavailable("Falha ao alterar status do médico", error)


@router.get("/users", response_model=DirectoryPage)
def get_directory(
    query: str = Query(min_length=3, max_length=100),
    paging: dict = Depends(pagination),
    _admin: dict = Depends(require_admin_role),
    connection: Any = Depends(get_connection),
):
    try:
        with cursor_scope(connection, dictionary=True) as cursor:
            return search_directory(
                cursor,
                query=query,
                **paging,
            )
    except mysql.connector.Error as error:
        _raise_database_unavailable("Falha ao consultar diretório", error)


@router.post(
    "/care-groups",
    response_model=AdminCareGroup,
    status_code=status.HTTP_201_CREATED,
)
def post_care_group(
    group: CareGroupCreate,
    admin: dict = Depends(require_admin_role),
    connection: Any = Depends(get_connection),
):
    try:
        with cursor_scope(connection, dictionary=True) as cursor:
            with transaction(connection):
                return create_care_group(
                    cursor,
                    admin_user_id=admin["user_id"],
                    name=group.name,
                )
    except mysql.connector.IntegrityError as error:
        _raise_integrity_conflict("Falha de integridade ao criar grupo", error)
    except mysql.connector.Error as error:
        _raise_database_unavailable("Falha ao criar grupo", error)


@router.get("/care-groups", response_model=AdminCareGroupPage)
def get_care_groups(
    paging: dict = Depends(pagination),
    admin: dict = Depends(require_admin_role),
    connection: Any = Depends(get_connection),
):
    try:
        with cursor_scope(connection, dictionary=True) as cursor:
            return list_care_groups(
                cursor,
                admin_user_id=admin["user_id"],
                **paging,
            )
    except mysql.connector.Error as error:
        _raise_database_unavailable("Falha ao listar grupos", error)


@router.get("/care-groups/{group_id}", response_model=AdminCareGroupDetail)
def get_care_group(
    group_id: int,
    admin: dict = Depends(require_admin_role),
    connection: Any = Depends(get_connection),
):
    try:
        with cursor_scope(connection, dictionary=True) as cursor:
            return load_care_group_detail(
                cursor,
                admin_user_id=admin["user_id"],
                group_id=group_id,
            )
    except mysql.connector.Error as error:
        _raise_database_unavailable("Falha ao consultar grupo", error)


@router.patch("/care-groups/{group_id}", response_model=AdminCareGroup)
def patch_care_group(
    group_id: int,
    change: CareGroupUpdate,
    admin: dict = Depends(require_admin_role),
    connection: Any = Depends(get_connection),
):
    try:
        with cursor_scope(connection, dictionary=True) as cursor:
            with transaction(connection):
                return update_care_group(
                    cursor,
                    admin_user_id=admin["user_id"],
                    group_id=group_id,
                    name=change.name,
                    group_status=change.status,
                )
    except mysql.connector.IntegrityError as error:
        _raise_integrity_conflict("Falha de integridade ao alterar grupo", error)
    except mysql.connector.Error as error:
        _raise_database_unavailable("Falha ao alterar grupo", error)


@router.put(
    "/care-groups/{group_id}/doctors/{doctor_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def put_group_doctor(
    group_id: int,
    doctor_id: int,
    admin: dict = Depends(require_admin_role),
    connection: Any = Depends(get_connection),
):
    try:
        with cursor_scope(connection, dictionary=True) as cursor:
            with transaction(connection):
                add_group_doctor(
                    cursor,
                    admin_user_id=admin["user_id"],
                    group_id=group_id,
                    doctor_id=doctor_id,
                )
    except mysql.connector.Error as error:
        _raise_database_unavailable("Falha ao adicionar médico ao grupo", error)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete(
    "/care-groups/{group_id}/doctors/{doctor_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_group_doctor(
    group_id: int,
    doctor_id: int,
    admin: dict = Depends(require_admin_role),
    connection: Any = Depends(get_connection),
):
    try:
        with cursor_scope(connection, dictionary=True) as cursor:
            with transaction(connection):
                remove_group_doctor(
                    cursor,
                    admin_user_id=admin["user_id"],
                    group_id=group_id,
                    doctor_id=doctor_id,
                )
    except mysql.connector.Error as error:
        _raise_database_unavailable("Falha ao remover médico do grupo", error)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/care-groups/{group_id}/patient-invitations",
    response_model=CareInvitationCreatedResponse,
    status_code=status.HTTP_201_CREATED,
)
def post_patient_invitation(
    group_id: int,
    invitation: CareInvitationCreate,
    admin: dict = Depends(require_admin_role),
    connection: Any = Depends(get_connection),
):
    try:
        with cursor_scope(connection, dictionary=True) as cursor:
            with transaction(connection):
                return invite_patient(
                    cursor,
                    admin_user_id=admin["user_id"],
                    group_id=group_id,
                    user_id=invitation.user_id,
                )
    except mysql.connector.IntegrityError as error:
        _raise_integrity_conflict("Falha de integridade ao convidar paciente", error)
    except mysql.connector.Error as error:
        _raise_database_unavailable("Falha ao convidar paciente", error)


@router.delete(
    "/care-groups/{group_id}/patient-invitations/{invitation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_patient_invitation(
    group_id: int,
    invitation_id: int,
    admin: dict = Depends(require_admin_role),
    connection: Any = Depends(get_connection),
):
    try:
        with cursor_scope(connection, dictionary=True) as cursor:
            with transaction(connection):
                cancel_patient_invitation(
                    cursor,
                    admin_user_id=admin["user_id"],
                    group_id=group_id,
                    invitation_id=invitation_id,
                )
    except mysql.connector.Error as error:
        _raise_database_unavailable("Falha ao cancelar convite de cuidado", error)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete(
    "/care-groups/{group_id}/patients/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_patient_link(
    group_id: int,
    user_id: int,
    admin: dict = Depends(require_admin_role),
    connection: Any = Depends(get_connection),
):
    try:
        with cursor_scope(connection, dictionary=True) as cursor:
            with transaction(connection):
                revoke_patient_link(
                    cursor,
                    admin_user_id=admin["user_id"],
                    group_id=group_id,
                    user_id=user_id,
                )
    except mysql.connector.Error as error:
        _raise_database_unavailable("Falha ao revogar vínculo de cuidado", error)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/audit-events", response_model=AdministrativeAuditPage)
def get_audit_events(
    paging: dict = Depends(pagination),
    admin: dict = Depends(require_admin_role),
    connection: Any = Depends(get_connection),
):
    try:
        with cursor_scope(connection, dictionary=True) as cursor:
            return list_audit_events(
                cursor,
                admin_user_id=admin["user_id"],
                **paging,
            )
    except mysql.connector.Error as error:
        _raise_database_unavailable("Falha ao listar auditoria administrativa", error)


def _raise_integrity_conflict(
    message: str,
    error: mysql.connector.IntegrityError,
) -> None:
    if error.errno == 1062:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Dados já utilizados.",
        ) from error
    _raise_database_unavailable(message, error)


def _raise_database_unavailable(message: str, error: mysql.connector.Error) -> None:
    logger.exception(message)
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Banco de dados indisponível.",
    ) from error
