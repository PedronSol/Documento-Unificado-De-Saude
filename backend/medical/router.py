import logging
import re
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from typing import Literal
import mysql.connector

from audit.service import record_clinical_event
from care.direct_links import (
    end_doctor_link,
    list_doctor_pending_links,
    request_direct_link,
)
from auth.dependencies import get_current_doctor
from auth.dependencies import calculate_age
from database import cursor_scope, get_connection, transaction
from markers.service import create_marker, remove_active_marker, update_active_marker
from models import (
    DoctorPendingLink,
    MarkerCreateUpdate,
    MarkerResponse,
    MedicalPatientSummary,
    MedicalRecordResponse,
    PatientLinkRequest,
    PatientLinkRequested,
)


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/medical")

AUTHORIZED_PATIENT_CLAUSE = """
    (
        EXISTS (
            SELECT 1
            FROM doctor_care_groups dcg
            JOIN care_groups cg
              ON cg.care_group_id = dcg.care_group_id
            JOIN patient_care_groups pcg
              ON pcg.care_group_id = cg.care_group_id
            WHERE dcg.doctor_id = %s
              AND pcg.patient_id = p.patient_id
              AND cg.status = 'active'
              AND dcg.status = 'active'
              AND pcg.status = 'active'
              AND dcg.starts_at <= UTC_TIMESTAMP(6)
              AND (dcg.ends_at IS NULL OR dcg.ends_at > UTC_TIMESTAMP(6))
              AND pcg.starts_at <= UTC_TIMESTAMP(6)
              AND (pcg.ends_at IS NULL OR pcg.ends_at > UTC_TIMESTAMP(6))
        )
        OR EXISTS (
            SELECT 1
            FROM doctor_patient_links dpl
            WHERE dpl.doctor_id = %s
              AND dpl.patient_id = p.patient_id
              AND dpl.status = 'active'
        )
    )
"""


@router.get("/patients", response_model=list[MedicalPatientSummary])
def list_medical_patients(
    query: str | None = Query(default=None, max_length=100),
    doctor: dict = Depends(get_current_doctor),
    connection: Any = Depends(get_connection),
):
    search_clause, search_parameters = _build_search(query)
    try:
        with cursor_scope(connection, dictionary=True) as cursor:
            cursor.execute(
                f"""
                SELECT p.patient_id, p.nome_paciente AS preferred_name,
                       p.nome_completo AS full_name, p.avatar AS avatar_url,
                       p.status_saude AS health_status,
                       p.tipo_sanguineo AS blood_type,
                       p.data_nascimento AS birth_date
                FROM patients p
                JOIN users u ON u.user_id = p.user_id
                WHERE {AUTHORIZED_PATIENT_CLAUSE}
                {search_clause}
                ORDER BY p.nome_completo, p.patient_id
                LIMIT 50
                """,
                (doctor["doctor_id"], doctor["doctor_id"], *search_parameters),
            )
            return [_patient_summary(row) for row in cursor.fetchall()]
    except mysql.connector.Error as error:
        _raise_database_unavailable("Falha ao listar pacientes médicos", error)


def get_authorized_medical_patient(
    patient_id: int,
    doctor: dict,
    connection: Any,
) -> dict:
    try:
        with cursor_scope(connection, dictionary=True) as cursor:
            cursor.execute(
                f"""
                SELECT p.patient_id, p.user_id,
                       p.nome_paciente AS preferred_name,
                       p.nome_completo AS full_name,
                       p.avatar AS avatar_url,
                       p.status_saude AS health_status,
                       p.tipo_sanguineo AS blood_type,
                       p.data_nascimento AS birth_date
                FROM patients p
                WHERE p.patient_id = %s
                  AND {AUTHORIZED_PATIENT_CLAUSE}
                """,
                (patient_id, doctor["doctor_id"], doctor["doctor_id"]),
            )
            patient = cursor.fetchone()
    except mysql.connector.Error as error:
        _raise_database_unavailable("Falha ao autorizar paciente médico", error)

    if not patient:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Paciente não autorizado.",
        )
    return patient


@router.get("/patients/{patient_id}", response_model=MedicalRecordResponse)
def get_medical_record(
    patient_id: int,
    doctor: dict = Depends(get_current_doctor),
    connection: Any = Depends(get_connection),
):
    try:
        with transaction(connection):
            patient = get_authorized_medical_patient(
                patient_id=patient_id,
                doctor=doctor,
                connection=connection,
            )
            with cursor_scope(connection, dictionary=True) as cursor:
                cursor.execute(
                    """
                    SELECT id_vacina AS vaccine_id, nome_vacina AS name,
                           dose, data_aplicacao AS administered_on,
                           status_vacina AS status
                    FROM vaccines
                    WHERE patient_id = %s
                    ORDER BY data_aplicacao DESC, nome_vacina, id_vacina
                    """,
                    (patient_id,),
                )
                vaccines = cursor.fetchall()
                active_markers = _load_record_markers(
                    cursor,
                    patient_id=patient_id,
                    marker_status="active",
                )
                removed_markers = _load_record_markers(
                    cursor,
                    patient_id=patient_id,
                    marker_status="removed",
                )
                record_clinical_event(
                    cursor,
                    actor_user_id=doctor["user_id"],
                    patient_id=patient_id,
                    action="medical_record.viewed",
                    resource_type="patient",
                    resource_id=patient_id,
                )
        return {
            "patient": {
                **_patient_summary(patient),
                "blood_type": patient["blood_type"],
            },
            "vaccines": vaccines,
            "markers": {
                "active": active_markers,
                "removed": removed_markers,
            },
        }
    except mysql.connector.Error as error:
        _raise_database_unavailable("Falha ao carregar prontuário médico", error)


def _load_record_markers(
    cursor: Any,
    *,
    patient_id: int,
    marker_status: str,
) -> list[dict]:
    order_by = (
        "marker_type, name, marker_id"
        if marker_status == "active"
        else "removed_at DESC, marker_id"
    )
    cursor.execute(
        f"""
        SELECT marker_id, marker_type AS type, name, description,
               dosage, frequency, status, created_at, updated_at,
               removed_at
        FROM health_markers
        WHERE patient_id = %s AND status = %s
        ORDER BY {order_by}
        """,
        (patient_id, marker_status),
    )
    return cursor.fetchall()


@router.post(
    "/patients/{patient_id}/markers",
    response_model=MarkerResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_medical_marker(
    patient_id: int,
    marker: MarkerCreateUpdate,
    doctor: dict = Depends(get_current_doctor),
    connection: Any = Depends(get_connection),
):
    try:
        with transaction(connection):
            patient = get_authorized_medical_patient(
                patient_id=patient_id,
                doctor=doctor,
                connection=connection,
            )
            _require_adult_medical_patient(patient)
            with cursor_scope(connection, dictionary=True) as cursor:
                return create_marker(
                    cursor,
                    marker=marker,
                    patient_id=patient_id,
                    actor_user_id=doctor["user_id"],
                )
    except mysql.connector.IntegrityError as error:
        _raise_marker_integrity_error(error)
    except mysql.connector.Error as error:
        _raise_database_unavailable("Falha ao registrar marcador médico", error)


@router.put(
    "/patients/{patient_id}/markers/{marker_id}",
    response_model=MarkerResponse,
)
def update_medical_marker(
    patient_id: int,
    marker_id: int,
    marker: MarkerCreateUpdate,
    doctor: dict = Depends(get_current_doctor),
    connection: Any = Depends(get_connection),
):
    try:
        with transaction(connection):
            patient = get_authorized_medical_patient(
                patient_id=patient_id,
                doctor=doctor,
                connection=connection,
            )
            _require_adult_medical_patient(patient)
            with cursor_scope(connection, dictionary=True) as cursor:
                return update_active_marker(
                    cursor,
                    marker_id=marker_id,
                    marker=marker,
                    patient_id=patient_id,
                    actor_user_id=doctor["user_id"],
                )
    except mysql.connector.IntegrityError as error:
        _raise_marker_integrity_error(error)
    except mysql.connector.Error as error:
        _raise_database_unavailable("Falha ao atualizar marcador médico", error)


@router.delete("/patients/{patient_id}/markers/{marker_id}")
def delete_medical_marker(
    patient_id: int,
    marker_id: int,
    doctor: dict = Depends(get_current_doctor),
    connection: Any = Depends(get_connection),
):
    try:
        with transaction(connection):
            patient = get_authorized_medical_patient(
                patient_id=patient_id,
                doctor=doctor,
                connection=connection,
            )
            _require_adult_medical_patient(patient)
            with cursor_scope(connection, dictionary=True) as cursor:
                remove_active_marker(
                    cursor,
                    marker_id=marker_id,
                    patient_id=patient_id,
                    actor_user_id=doctor["user_id"],
                )
        return {"message": "Marcador removido com sucesso!"}
    except mysql.connector.Error as error:
        _raise_database_unavailable("Falha ao remover marcador médico", error)


@router.post(
    "/patient-links",
    response_model=PatientLinkRequested,
    status_code=status.HTTP_202_ACCEPTED,
)
def create_patient_link(
    payload: PatientLinkRequest,
    doctor: dict = Depends(get_current_doctor),
    connection: Any = Depends(get_connection),
):
    try:
        with cursor_scope(connection, dictionary=True) as cursor:
            with transaction(connection):
                return request_direct_link(cursor, doctor=doctor, cpf=payload.cpf)
    except mysql.connector.IntegrityError as error:
        if error.errno == 1062:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Já existe solicitação ou vínculo aberto com este paciente.",
            ) from error
        _raise_database_unavailable("Falha de integridade no vínculo direto", error)
    except mysql.connector.Error as error:
        _raise_database_unavailable("Falha ao solicitar vínculo direto", error)


@router.get("/patient-links", response_model=list[DoctorPendingLink])
def get_patient_links(
    link_status: Literal["pending"] = Query(default="pending", alias="status"),
    doctor: dict = Depends(get_current_doctor),
    connection: Any = Depends(get_connection),
):
    try:
        with cursor_scope(connection, dictionary=True) as cursor:
            return list_doctor_pending_links(cursor, doctor_id=doctor["doctor_id"])
    except mysql.connector.Error as error:
        _raise_database_unavailable("Falha ao listar vínculos diretos", error)


@router.delete(
    "/patient-links/{link_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_patient_link(
    link_id: int,
    doctor: dict = Depends(get_current_doctor),
    connection: Any = Depends(get_connection),
):
    try:
        with cursor_scope(connection, dictionary=True) as cursor:
            with transaction(connection):
                end_doctor_link(cursor, doctor=doctor, link_id=link_id)
    except mysql.connector.Error as error:
        _raise_database_unavailable("Falha ao encerrar vínculo direto", error)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _require_adult_medical_patient(patient: dict) -> None:
    if calculate_age(patient["birth_date"]) < 18:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Menores de idade não podem ter o prontuário alterado.",
        )


def _raise_marker_integrity_error(error: mysql.connector.IntegrityError) -> None:
    if error.errno == 1062:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Marcador ativo já cadastrado. Edite o registro existente.",
        ) from error
    _raise_database_unavailable("Falha de integridade ao salvar marcador", error)


def _build_search(query: str | None) -> tuple[str, tuple[str, ...]]:
    normalized = (query or "").strip()
    if not normalized:
        return "", ()

    if re.fullmatch(r"[\d.\-\s]+", normalized):
        digits = re.sub(r"\D", "", normalized)
        if len(digits) != 11:
            _raise_invalid_search()
        return "AND u.cpf = %s", (digits,)

    if len(normalized) < 2:
        _raise_invalid_search()
    pattern = f"%{normalized}%"
    return (
        "AND (p.nome_completo LIKE %s OR p.nome_paciente LIKE %s)",
        (pattern, pattern),
    )


def _patient_summary(patient: dict) -> dict:
    return {
        "patient_id": patient["patient_id"],
        "preferred_name": patient["preferred_name"],
        "full_name": patient["full_name"],
        "avatar_url": patient["avatar_url"],
        "health_status": patient["health_status"],
        "age": calculate_age(patient["birth_date"]),
    }


def _raise_invalid_search() -> None:
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail="Informe ao menos dois caracteres ou um CPF completo.",
    )


def _raise_database_unavailable(message: str, error: mysql.connector.Error) -> None:
    logger.exception(message)
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Banco de dados indisponível.",
    ) from error
