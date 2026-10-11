"""Document operations shared by the patient and medical routes.

Routes authorize the actor and the patient; these functions persist, list and
remove documents with authorship and clinical audit in the same transaction.
"""

from datetime import datetime, timezone
from secrets import token_hex
from typing import Any, Callable, Literal
import logging

from fastapi import HTTPException, Request, Response, UploadFile, status
import mysql.connector

from audit.service import record_clinical_event, serialize_document_snapshot
from database import cursor_scope, transaction
from documents.service import normalize_title, stage_valid_document
from pagination import PageRequest, fetch_page, search_clause


logger = logging.getLogger(__name__)
STORAGE_KEY_ATTEMPTS = 3
UploaderRole = Literal["patient", "doctor"]


DOCUMENT_TYPES = ("exam", "prescription", "report", "other")


def list_active_documents(
    cursor: Any,
    *,
    patient_id: int,
    request: PageRequest,
    document_type: str | None = None,
    viewer_doctor_user_id: int | None = None,
) -> dict:
    search, search_params = search_clause(
        request.query,
        ["d.titulo_documento", "d.original_filename"],
    )
    type_filter = " AND d.tipo_documento = %s" if document_type else ""
    return fetch_page(
        cursor,
        columns="""d.id_documento AS document_id, d.titulo_documento AS title,
                   d.tipo_documento AS type, d.original_filename, d.media_type,
                   d.size_bytes, d.status_documento AS status, d.created_at,
                   d.uploaded_by_user_id, d.uploader_role,
                   u.display_name AS uploader_name,
                   doc.crm_number AS uploader_crm_number,
                   doc.crm_state AS uploader_crm_state""",
        source=f"""FROM documents d
        LEFT JOIN doctors doc
          ON d.uploader_role = 'doctor' AND doc.user_id = d.uploaded_by_user_id
        LEFT JOIN users u ON u.user_id = doc.user_id
        WHERE d.patient_id = %s AND d.status_documento <> 'removed'{type_filter}{search}""",
        params=(
            patient_id,
            *((document_type,) if document_type else ()),
            *search_params,
        ),
        order_by="d.created_at DESC, d.id_documento DESC",
        request=request,
        mapper=lambda row: _summary(row, viewer_doctor_user_id=viewer_doctor_user_id),
    )


async def upload_document(
    request: Request,
    *,
    title: str,
    document_type: str,
    file: UploadFile,
    patient_id: int,
    actor_user_id: int,
    uploader_role: UploaderRole,
    connection: Any,
    storage: Any,
) -> dict:
    form = await request.form()
    expected_fields = {"title", "type", "file"}
    if set(form.keys()) != expected_fields or any(
        len(form.getlist(field)) != 1 for field in expected_fields
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Envie título, tipo e exatamente um arquivo.",
        )
    normalized_title = normalize_title(title)
    settings = request.app.state.settings
    staged = await stage_valid_document(file, max_bytes=settings.document_max_bytes)
    created_at = datetime.now(timezone.utc).replace(tzinfo=None)
    try:
        for _attempt in range(STORAGE_KEY_ATTEMPTS):
            storage_key = f"{token_hex(32)}{staged.extension}"
            published = False
            try:
                with cursor_scope(connection, dictionary=True) as cursor:
                    with transaction(connection):
                        cursor.execute(
                            """
                            INSERT INTO documents (
                                patient_id, titulo_documento, tipo_documento,
                                original_filename, storage_key, media_type, size_bytes,
                                sha256, status_documento, created_at,
                                uploaded_by_user_id, uploader_role
                            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'uploaded', %s,
                                      %s, %s)
                            """,
                            (
                                patient_id,
                                normalized_title,
                                document_type,
                                staged.original_filename,
                                storage_key,
                                staged.media_type,
                                staged.size_bytes,
                                staged.checksum,
                                created_at,
                                actor_user_id,
                                uploader_role,
                            ),
                        )
                        document_id = cursor.lastrowid
                        snapshot = {
                            "title": normalized_title,
                            "type": document_type,
                            "media_type": staged.media_type,
                            "size_bytes": staged.size_bytes,
                            "status": "uploaded",
                        }
                        record_clinical_event(
                            cursor,
                            actor_user_id=actor_user_id,
                            patient_id=patient_id,
                            action="document.uploaded",
                            resource_type="document",
                            resource_id=document_id,
                            after_snapshot=serialize_document_snapshot(snapshot),
                        )
                        uploader = (
                            _load_doctor_uploader(cursor, actor_user_id)
                            if uploader_role == "doctor"
                            else None
                        )
                        storage.publish(staged.content, storage_key)
                        published = True
                summary = {
                    "document_id": document_id,
                    **snapshot,
                    "original_filename": staged.original_filename,
                    "created_at": created_at,
                    "uploaded_by_doctor": uploader,
                }
                if uploader_role == "doctor":
                    summary["can_remove"] = True
                return summary
            except FileExistsError:
                continue
            except mysql.connector.IntegrityError as error:
                if getattr(error, "errno", None) == 1062:
                    continue
                raise
            except Exception:
                if published:
                    try:
                        storage.remove(storage_key)
                    except OSError:
                        logger.error("Falha ao compensar arquivo de documento")
                raise
        raise OSError("Não foi possível reservar uma chave de documento")
    except (mysql.connector.Error, OSError, ValueError) as error:
        logger.error("Falha ao armazenar documento")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Documento temporariamente indisponível.",
        ) from error
    finally:
        staged.close()


def remove_document(
    connection: Any,
    storage: Any,
    *,
    patient_id: int,
    document_id: int,
    actor_user_id: int,
    authorize: Callable[[dict], None] = lambda document: None,
) -> Response:
    try:
        with transaction(connection):
            with cursor_scope(connection, dictionary=True) as cursor:
                document = load_active_document(
                    cursor,
                    document_id=document_id,
                    patient_id=patient_id,
                    for_update=True,
                )
                if not document:
                    raise not_found()
                authorize(document)
                cursor.execute(
                    """
                    UPDATE documents
                    SET status_documento = 'removed', removed_at = UTC_TIMESTAMP(6)
                    WHERE id_documento = %s AND patient_id = %s
                    """,
                    (document_id, patient_id),
                )
                before = serialize_document_snapshot(document)
                record_clinical_event(
                    cursor,
                    actor_user_id=actor_user_id,
                    patient_id=patient_id,
                    action="document.removed",
                    resource_type="document",
                    resource_id=document_id,
                    before_snapshot=before,
                    after_snapshot={**before, "status": "removed"},
                )
    except HTTPException:
        raise
    except mysql.connector.Error as error:
        raise_unavailable("Falha ao remover documento", error)

    try:
        storage.remove(document["storage_key"])
    except (OSError, ValueError):
        logger.error("Limpeza física de documento ficará pendente")
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    try:
        with cursor_scope(connection) as cursor:
            with transaction(connection):
                cursor.execute(
                    """
                    UPDATE documents
                    SET storage_deleted_at = UTC_TIMESTAMP(6)
                    WHERE id_documento = %s AND patient_id = %s
                      AND status_documento = 'removed'
                    """,
                    (document_id, patient_id),
                )
    except mysql.connector.Error:
        logger.error("Falha ao registrar limpeza física de documento")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def sent_by_doctor(document: dict, doctor_user_id: int) -> bool:
    return (
        document.get("uploader_role") == "doctor"
        and document.get("uploaded_by_user_id") == doctor_user_id
    )


def load_active_document(
    cursor: Any,
    *,
    document_id: int,
    patient_id: int,
    for_update: bool = False,
):
    lock = " FOR UPDATE" if for_update else ""
    cursor.execute(
        f"""
        SELECT id_documento AS document_id, titulo_documento AS title,
               tipo_documento AS type, original_filename, storage_key,
               media_type, size_bytes, sha256, status_documento AS status,
               created_at, removed_at, uploaded_by_user_id, uploader_role
        FROM documents
        WHERE id_documento = %s AND patient_id = %s
          AND status_documento <> 'removed'{lock}
        """,
        (document_id, patient_id),
    )
    return cursor.fetchone()


def not_found() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Documento não encontrado.",
    )


def raise_unavailable(message: str, error: Exception):
    logger.error(message)
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Documento temporariamente indisponível.",
    ) from error


def _load_doctor_uploader(cursor: Any, user_id: int) -> dict | None:
    cursor.execute(
        """
        SELECT u.display_name, doc.crm_number, doc.crm_state
        FROM doctors doc
        JOIN users u ON u.user_id = doc.user_id
        WHERE doc.user_id = %s
        """,
        (user_id,),
    )
    row = cursor.fetchone()
    return dict(row) if row else None


def _summary(row: dict, *, viewer_doctor_user_id: int | None) -> dict:
    summary = {
        key: row[key]
        for key in (
            "document_id",
            "title",
            "type",
            "original_filename",
            "media_type",
            "size_bytes",
            "status",
            "created_at",
        )
    }
    summary["uploaded_by_doctor"] = (
        {
            "display_name": row["uploader_name"],
            "crm_number": row["uploader_crm_number"],
            "crm_state": row["uploader_crm_state"],
        }
        if row["uploader_role"] == "doctor" and row["uploader_name"]
        else None
    )
    if viewer_doctor_user_id is not None:
        summary["can_remove"] = sent_by_doctor(row, viewer_doctor_user_id)
    return summary
