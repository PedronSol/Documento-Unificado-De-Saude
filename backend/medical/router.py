import logging
import re
from typing import Annotated, Any, Optional

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    Response,
    UploadFile,
    status,
)
from typing import Literal
import mysql.connector

from audit.service import record_clinical_event
from care.direct_links import (
    end_doctor_link,
    list_doctor_pending_links,
    request_direct_link,
)
from care.provisional import correct_provisional_profile, reissue_claim
from auth.dependencies import get_current_doctor
from auth.dependencies import calculate_age
from database import cursor_scope, get_connection, transaction
from documents.operations import (
    list_active_documents,
    load_active_document,
    remove_document,
    sent_by_doctor,
    upload_document,
)
from documents.router import (
    _download_response,
    _public_snapshot,
    _read_integral_file,
    get_document_storage,
)
from markers.service import create_marker, remove_active_marker, update_active_marker
from patients.blood_type import update_blood_type
from pagination import Page, PageRequest, fetch_page, like_pattern, page_request
from models import (
    BloodTypeResponse,
    BloodTypeUpdate,
    ClaimLinkIssued,
    DoctorPendingLink,
    MarkerCreateUpdate,
    MarkerResponse,
    MedicalPatientSummary,
    MedicalPatientProfile,
    MedicalRecordResponse,
    MedicalDocumentSummary,
    PatientLinkRequest,
    PatientLinkRequested,
    ProvisionalPatientCreated,
    ProvisionalProfileUpdate,
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


@router.post(
    "/patients/{patient_id}/documents",
    response_model=MedicalDocumentSummary,
    status_code=status.HTTP_201_CREATED,
)
async def add_medical_document(
    patient_id: int,
    request: Request,
    title: Annotated[str, Form()],
    type: Annotated[Literal["exam", "prescription", "report", "other"], Form()],
    file: Annotated[UploadFile, File()],
    doctor: dict = Depends(get_current_doctor),
    connection: Any = Depends(get_connection),
    storage: Any = Depends(get_document_storage),
):
    # Authorize before reading the file so no upload is staged for a stranger.
    get_authorized_medical_patient(
        patient_id=patient_id,
        doctor=doctor,
        connection=connection,
    )
    return await upload_document(
        request,
        title=title,
        document_type=type,
        file=file,
        patient_id=patient_id,
        actor_user_id=doctor["user_id"],
        uploader_role="doctor",
        connection=connection,
        storage=storage,
    )


@router.delete(
    "/patients/{patient_id}/documents/{document_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_medical_document(
    patient_id: int,
    document_id: int,
    doctor: dict = Depends(get_current_doctor),
    connection: Any = Depends(get_connection),
    storage: Any = Depends(get_document_storage),
):
    get_authorized_medical_patient(
        patient_id=patient_id,
        doctor=doctor,
        connection=connection,
    )

    def only_own_uploads(document: dict) -> None:
        if not sent_by_doctor(document, doctor["user_id"]):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Você só pode remover documentos enviados por você.",
            )

    return remove_document(
        connection,
        storage,
        patient_id=patient_id,
        document_id=document_id,
        actor_user_id=doctor["user_id"],
        authorize=only_own_uploads,
    )


@router.get(
    "/patients/{patient_id}/documents",
    response_model=Page[MedicalDocumentSummary],
)
def list_medical_documents(
    patient_id: int,
    page: PageRequest = Depends(page_request),
    document_type: Optional[Literal["exam", "prescription", "report", "other"]] = Query(
        default=None,
        alias="type",
    ),
    doctor: dict = Depends(get_current_doctor),
    connection: Any = Depends(get_connection),
):
    try:
        with transaction(connection):
            get_authorized_medical_patient(
                patient_id=patient_id,
                doctor=doctor,
                connection=connection,
            )
            with cursor_scope(connection, dictionary=True) as cursor:
                documents = list_active_documents(
                    cursor,
                    patient_id=patient_id,
                    request=page,
                    document_type=document_type,
                    viewer_doctor_user_id=doctor["user_id"],
                )
                record_clinical_event(
                    cursor,
                    actor_user_id=doctor["user_id"],
                    patient_id=patient_id,
                    action="medical_documents.viewed",
                    resource_type="patient",
                    resource_id=patient_id,
                )
        return documents
    except HTTPException:
        raise
    except mysql.connector.Error as error:
        _raise_database_unavailable("Falha ao listar documentos médicos", error)


@router.get("/patients/{patient_id}/documents/{document_id}/file")
def download_medical_document(
    patient_id: int,
    document_id: int,
    doctor: dict = Depends(get_current_doctor),
    connection: Any = Depends(get_connection),
    storage: Any = Depends(get_document_storage),
):
    try:
        with transaction(connection):
            get_authorized_medical_patient(
                patient_id=patient_id,
                doctor=doctor,
                connection=connection,
            )
            with cursor_scope(connection, dictionary=True) as cursor:
                document = load_active_document(
                    cursor,
                    document_id=document_id,
                    patient_id=patient_id,
                )
                if not document:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="Documento não encontrado.",
                    )
                content = _read_integral_file(storage, document)
                record_clinical_event(
                    cursor,
                    actor_user_id=doctor["user_id"],
                    patient_id=patient_id,
                    action="document.downloaded",
                    resource_type="document",
                    resource_id=document_id,
                    after_snapshot=_public_snapshot(document),
                )
        return _download_response(document, content)
    except HTTPException:
        raise
    except (mysql.connector.Error, OSError, ValueError, KeyError) as error:
        logger.error("Falha ao baixar documento médico")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Documento temporariamente indisponível.",
        ) from error


@router.get("/patients", response_model=Page[MedicalPatientSummary])
def list_medical_patients(
    page: PageRequest = Depends(page_request),
    doctor: dict = Depends(get_current_doctor),
    connection: Any = Depends(get_connection),
):
    search_clause, search_parameters = _build_search(page.query)
    try:
        with cursor_scope(connection, dictionary=True) as cursor:
            return fetch_page(
                cursor,
                columns="""p.patient_id, p.nome_paciente AS preferred_name,
                           p.nome_completo AS full_name, p.avatar AS avatar_url,
                           p.status_saude AS health_status,
                           p.tipo_sanguineo AS blood_type,
                           p.data_nascimento AS birth_date""",
                source=f"""FROM patients p
                JOIN users u ON u.user_id = p.user_id
                WHERE {AUTHORIZED_PATIENT_CLAUSE}
                {search_clause}""",
                params=(doctor["doctor_id"], doctor["doctor_id"], *search_parameters),
                order_by="p.nome_completo, p.patient_id",
                request=page,
                mapper=_patient_summary,
            )
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
                       p.tipo_sanguineo_origem AS blood_type_source,
                       p.data_nascimento AS birth_date,
                       u.claimed_at AS account_claimed_at,
                       u.provisioned_by_doctor_id
                FROM patients p
                JOIN users u ON u.user_id = p.user_id
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
            "patient": _medical_profile(patient, doctor),
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
    "/patients/{patient_id}/blood-type",
    response_model=BloodTypeResponse,
)
def update_medical_blood_type(
    patient_id: int,
    update: BloodTypeUpdate,
    doctor: dict = Depends(get_current_doctor),
    connection: Any = Depends(get_connection),
):
    try:
        with transaction(connection):
            get_authorized_medical_patient(
                patient_id=patient_id,
                doctor=doctor,
                connection=connection,
            )
            with cursor_scope(connection, dictionary=True) as cursor:
                return update_blood_type(
                    cursor,
                    patient_id=patient_id,
                    blood_type=update.blood_type,
                    source="doctor",
                    actor_user_id=doctor["user_id"],
                )
    except mysql.connector.Error as error:
        _raise_database_unavailable("Falha ao registrar tipo sanguíneo", error)


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
    response_model=PatientLinkRequested | ProvisionalPatientCreated,
    status_code=status.HTTP_202_ACCEPTED,
)
def create_patient_link(
    payload: PatientLinkRequest,
    response: Response,
    doctor: dict = Depends(get_current_doctor),
    connection: Any = Depends(get_connection),
):
    try:
        with cursor_scope(connection, dictionary=True) as cursor:
            with transaction(connection):
                result = request_direct_link(
                    cursor,
                    doctor=doctor,
                    cpf=payload.cpf,
                    provisional=payload.patient,
                    guardian=payload.guardian,
                )
        if result["result"] == "provisional_created":
            response.status_code = status.HTTP_201_CREATED
        return result
    except mysql.connector.IntegrityError as error:
        if error.errno == 1062:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Já existe solicitação ou vínculo aberto com este paciente.",
            ) from error
        _raise_database_unavailable("Falha de integridade no vínculo direto", error)
    except mysql.connector.Error as error:
        _raise_database_unavailable("Falha ao solicitar vínculo direto", error)


@router.get("/patient-links", response_model=Page[DoctorPendingLink])
def get_patient_links(
    page: PageRequest = Depends(page_request),
    link_status: Literal["pending"] = Query(default="pending", alias="status"),
    doctor: dict = Depends(get_current_doctor),
    connection: Any = Depends(get_connection),
):
    try:
        with cursor_scope(connection, dictionary=True) as cursor:
            return list_doctor_pending_links(
                cursor,
                doctor_id=doctor["doctor_id"],
                request=page,
            )
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


@router.patch(
    "/patients/{patient_id}/provisional-profile",
    response_model=MedicalPatientProfile,
)
def patch_provisional_profile(
    patient_id: int,
    correction: ProvisionalProfileUpdate,
    doctor: dict = Depends(get_current_doctor),
    connection: Any = Depends(get_connection),
):
    try:
        with cursor_scope(connection, dictionary=True) as cursor:
            with transaction(connection):
                correct_provisional_profile(
                    cursor,
                    doctor=doctor,
                    patient_id=patient_id,
                    correction=correction,
                )
        patient = get_authorized_medical_patient(
            patient_id=patient_id,
            doctor=doctor,
            connection=connection,
        )
        return _medical_profile(patient, doctor)
    except mysql.connector.Error as error:
        _raise_database_unavailable("Falha ao corrigir paciente provisório", error)


@router.post(
    "/patients/{patient_id}/claim-link",
    response_model=ClaimLinkIssued,
    status_code=status.HTTP_201_CREATED,
)
def post_claim_link(
    patient_id: int,
    doctor: dict = Depends(get_current_doctor),
    connection: Any = Depends(get_connection),
):
    try:
        with cursor_scope(connection, dictionary=True) as cursor:
            with transaction(connection):
                return reissue_claim(cursor, doctor=doctor, patient_id=patient_id)
    except mysql.connector.Error as error:
        _raise_database_unavailable("Falha ao emitir link de reivindicação", error)


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
    pattern = like_pattern(normalized)
    return (
        "AND (p.nome_completo LIKE %s OR p.nome_paciente LIKE %s)",
        (pattern, pattern),
    )


def _medical_profile(patient: dict, doctor: dict) -> dict:
    provisional = patient["account_claimed_at"] is None
    return {
        **_patient_summary(patient),
        "blood_type": patient["blood_type"],
        "blood_type_source": patient["blood_type_source"],
        "account_status": "provisional" if provisional else "active",
        "manages_provisional": (
            provisional
            and patient["provisioned_by_doctor_id"] == doctor["doctor_id"]
        ),
    }


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
