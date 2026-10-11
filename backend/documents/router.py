from datetime import datetime, timezone
from hashlib import sha256
from secrets import token_hex
from typing import Annotated, Any, Literal
from urllib.parse import quote
import logging

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, Response, UploadFile, status
import mysql.connector

from audit.service import record_clinical_event, serialize_document_snapshot
from auth.dependencies import get_current_patient, require_adult
from database import cursor_scope, get_connection, transaction
from documents.service import normalize_title, stage_valid_document
from models import DocumentSummary


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/me/documents")
STORAGE_KEY_ATTEMPTS = 3


def get_document_storage(request: Request):
    return request.app.state.document_storage


@router.post("", response_model=DocumentSummary, status_code=status.HTTP_201_CREATED)
async def add_document(
    request: Request,
    title: Annotated[str, Form()],
    type: Annotated[Literal["exam", "prescription", "report", "other"], Form()],
    file: Annotated[UploadFile, File()],
    patient: dict = Depends(require_adult),
    connection: Any = Depends(get_connection),
    storage: Any = Depends(get_document_storage),
):
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
                with cursor_scope(connection) as cursor:
                    with transaction(connection):
                        cursor.execute(
                            """
                            INSERT INTO documents (
                                patient_id, titulo_documento, tipo_documento,
                                original_filename, storage_key, media_type, size_bytes,
                                sha256, status_documento, created_at
                            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'uploaded', %s)
                            """,
                            (
                                patient["patient_id"],
                                normalized_title,
                                type,
                                staged.original_filename,
                                storage_key,
                                staged.media_type,
                                staged.size_bytes,
                                staged.checksum,
                                created_at,
                            ),
                        )
                        document_id = cursor.lastrowid
                        snapshot = {
                            "title": normalized_title,
                            "type": type,
                            "media_type": staged.media_type,
                            "size_bytes": staged.size_bytes,
                            "status": "uploaded",
                        }
                        record_clinical_event(
                            cursor,
                            actor_user_id=patient["user_id"],
                            patient_id=patient["patient_id"],
                            action="document.uploaded",
                            resource_type="document",
                            resource_id=document_id,
                            after_snapshot=serialize_document_snapshot(snapshot),
                        )
                        storage.publish(staged.content, storage_key)
                        published = True
                return {
                    "document_id": document_id,
                    **snapshot,
                    "original_filename": staged.original_filename,
                    "created_at": created_at,
                }
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


@router.get("", response_model=list[DocumentSummary])
def get_documents(
    patient: dict = Depends(get_current_patient),
    connection: Any = Depends(get_connection),
):
    try:
        with cursor_scope(connection, dictionary=True) as cursor:
            cursor.execute(
                """
                SELECT id_documento AS document_id, titulo_documento AS title,
                       tipo_documento AS type, original_filename, media_type,
                       size_bytes, status_documento AS status, created_at
                FROM documents
                WHERE patient_id = %s AND status_documento <> 'removed'
                ORDER BY created_at DESC, id_documento DESC
                """,
                (patient["patient_id"],),
            )
            return cursor.fetchall()
    except mysql.connector.Error as error:
        _raise_unavailable("Falha ao listar documentos", error)


@router.get("/{document_id}/file")
def download_document(
    document_id: int,
    patient: dict = Depends(get_current_patient),
    connection: Any = Depends(get_connection),
    storage: Any = Depends(get_document_storage),
):
    try:
        with transaction(connection):
            with cursor_scope(connection, dictionary=True) as cursor:
                document = _load_owned_document(
                    cursor,
                    document_id=document_id,
                    patient_id=patient["patient_id"],
                )
                if not document:
                    raise _not_found()
                content = _read_integral_file(storage, document)
                record_clinical_event(
                    cursor,
                    actor_user_id=patient["user_id"],
                    patient_id=patient["patient_id"],
                    action="document.downloaded",
                    resource_type="document",
                    resource_id=document_id,
                    after_snapshot=_public_snapshot(document),
                )
        return _download_response(document, content)
    except HTTPException:
        raise
    except (mysql.connector.Error, OSError, ValueError, KeyError) as error:
        _raise_unavailable("Falha ao baixar documento", error)


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(
    document_id: int,
    patient: dict = Depends(require_adult),
    connection: Any = Depends(get_connection),
    storage: Any = Depends(get_document_storage),
):
    try:
        with transaction(connection):
            with cursor_scope(connection, dictionary=True) as cursor:
                document = _load_owned_document(
                    cursor,
                    document_id=document_id,
                    patient_id=patient["patient_id"],
                    for_update=True,
                )
                if not document:
                    raise _not_found()
                cursor.execute(
                    """
                    UPDATE documents
                    SET status_documento = 'removed', removed_at = UTC_TIMESTAMP(6)
                    WHERE id_documento = %s AND patient_id = %s
                    """,
                    (document_id, patient["patient_id"]),
                )
                before = _public_snapshot(document)
                record_clinical_event(
                    cursor,
                    actor_user_id=patient["user_id"],
                    patient_id=patient["patient_id"],
                    action="document.removed",
                    resource_type="document",
                    resource_id=document_id,
                    before_snapshot=before,
                    after_snapshot={**before, "status": "removed"},
                )
    except HTTPException:
        raise
    except mysql.connector.Error as error:
        _raise_unavailable("Falha ao remover documento", error)

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
                    (document_id, patient["patient_id"]),
                )
    except mysql.connector.Error:
        logger.error("Falha ao registrar limpeza física de documento")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _load_owned_document(
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
               created_at, removed_at
        FROM documents
        WHERE id_documento = %s AND patient_id = %s
          AND status_documento <> 'removed'{lock}
        """,
        (document_id, patient_id),
    )
    return cursor.fetchone()


def _read_integral_file(storage: Any, document: dict) -> bytes:
    with storage.open(document["storage_key"]) as stored_file:
        content = stored_file.read()
    if (
        len(content) != document["size_bytes"]
        or sha256(content).hexdigest() != document["sha256"]
    ):
        raise OSError("Falha de integridade documental")
    return content


def _public_snapshot(document: dict) -> dict:
    return serialize_document_snapshot(document)


def _download_response(document: dict, content: bytes) -> Response:
    filename = quote(document["original_filename"], safe="")
    return Response(
        content=content,
        media_type=document["media_type"],
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{filename}",
            "Cache-Control": "no-store, max-age=0",
            "Pragma": "no-cache",
            "X-Content-Type-Options": "nosniff",
        },
    )


def _not_found() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Documento não encontrado.",
    )


def _raise_unavailable(message: str, error: Exception):
    logger.error(message)
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Documento temporariamente indisponível.",
    ) from error
