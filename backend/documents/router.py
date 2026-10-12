from hashlib import sha256
from typing import Annotated, Any, Literal, Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, Response, UploadFile, status
import mysql.connector

from audit.service import record_clinical_event, serialize_document_snapshot
from auth.dependencies import get_current_patient, require_adult
from database import cursor_scope, get_connection, transaction
from documents.operations import (
    list_active_documents,
    load_active_document,
    not_found,
    raise_unavailable,
    remove_document,
    upload_document,
)
from models import DocumentSummary
from pagination import Page, PageRequest, page_request


router = APIRouter(prefix="/me/documents")


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
    return await upload_document(
        request,
        title=title,
        document_type=type,
        file=file,
        patient_id=patient["patient_id"],
        actor_user_id=patient["user_id"],
        uploader_role="patient",
        connection=connection,
        storage=storage,
    )


@router.get("", response_model=Page[DocumentSummary])
def get_documents(
    page: PageRequest = Depends(page_request),
    document_type: Optional[Literal["exam", "prescription", "report", "other"]] = Query(
        default=None,
        alias="type",
    ),
    patient: dict = Depends(get_current_patient),
    connection: Any = Depends(get_connection),
):
    try:
        with cursor_scope(connection, dictionary=True) as cursor:
            return list_active_documents(
                cursor,
                patient_id=patient["patient_id"],
                request=page,
                document_type=document_type,
            )
    except mysql.connector.Error as error:
        raise_unavailable("Falha ao listar documentos", error)


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
                document = load_active_document(
                    cursor,
                    document_id=document_id,
                    patient_id=patient["patient_id"],
                )
                if not document:
                    raise not_found()
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
        raise_unavailable("Falha ao baixar documento", error)


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(
    document_id: int,
    patient: dict = Depends(require_adult),
    connection: Any = Depends(get_connection),
    storage: Any = Depends(get_document_storage),
):
    return remove_document(
        connection,
        storage,
        patient_id=patient["patient_id"],
        document_id=document_id,
        actor_user_id=patient["user_id"],
    )


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
