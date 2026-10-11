import json
from datetime import datetime
from hashlib import sha256
from io import BytesIO
from pathlib import Path

from httpx import ASGITransport, AsyncClient
import pytest
from starlette.datastructures import Headers, UploadFile
import mysql.connector

from auth.dependencies import (
    get_current_doctor,
    get_current_patient,
    get_current_user,
    require_adult,
)
from config import AppSettings
from database import get_connection
from main import create_app
from documents.service import stage_valid_document
from documents.storage import LocalDocumentStorage


pytestmark = pytest.mark.anyio

MINIMAL_PDF = b"%PDF-1.4\n%%EOF"


@pytest.fixture
def anyio_backend():
    return "asyncio"


class DocumentCursor:
    def __init__(self, connection):
        self.connection = connection
        self.lastrowid = 42
        self.result = None

    def execute(self, statement, parameters=None):
        if (
            self.connection.fail_audit
            and "INSERT INTO clinical_audit_events" in statement
        ):
            raise mysql.connector.Error("audit unavailable")
        self.connection.executed.append(
            (" ".join(statement.split()), parameters or ())
        )
        sql = self.connection.executed[-1][0]
        if sql.startswith("SELECT u.display_name, doc.crm_number"):
            self.result = self.connection.doctor_profiles.get(parameters[0])
        elif sql.startswith("SELECT d.id_documento AS document_id"):
            patient_id = parameters[0]
            documents = [
                item
                for item in self.connection.documents
                if item["patient_id"] == patient_id and item["status"] != "removed"
            ]
            self.result = []
            for item in documents:
                profile = (
                    self.connection.doctor_profiles.get(item["uploaded_by_user_id"])
                    if item["uploader_role"] == "doctor"
                    else None
                )
                self.result.append({
                    **{
                        key: item[key]
                        for key in (
                            "document_id",
                            "title",
                            "type",
                            "original_filename",
                            "media_type",
                            "size_bytes",
                            "status",
                            "created_at",
                            "uploaded_by_user_id",
                            "uploader_role",
                        )
                    },
                    "uploader_name": profile and profile["display_name"],
                    "uploader_crm_number": profile and profile["crm_number"],
                    "uploader_crm_state": profile and profile["crm_state"],
                })
        elif sql.startswith("SELECT id_documento AS document_id"):
            if "id_documento = %s" in sql:
                document_id, patient_id = parameters
                document = next(
                    (
                        item
                        for item in self.connection.documents
                        if item["document_id"] == document_id
                        and item["patient_id"] == patient_id
                        and item["status"] != "removed"
                    ),
                    None,
                )
                self.result = dict(document) if document else None
            else:
                patient_id = parameters[0]
                documents = [
                    dict(item)
                    for item in self.connection.documents
                    if item["patient_id"] == patient_id
                ]
                if "status_documento <> 'removed'" in sql:
                    documents = [
                        item for item in documents if item["status"] != "removed"
                    ]
                self.result = [
                    {
                        key: item[key]
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
                    for item in documents
                ]
        elif sql.startswith("SELECT p.patient_id, p.user_id"):
            self.result = self.connection.authorized_patient
        elif sql.startswith("UPDATE documents SET status_documento = 'removed'"):
            document_id, patient_id = parameters
            for document in self.connection.documents:
                if (
                    document["document_id"] == document_id
                    and document["patient_id"] == patient_id
                ):
                    document["status"] = "removed"
        elif sql.startswith("UPDATE documents SET storage_deleted_at"):
            pass

    def fetchone(self):
        return self.result

    def fetchall(self):
        return self.result or []

    def close(self):
        pass


class DocumentConnection:
    def __init__(self):
        self.executed = []
        self.documents = []
        self.authorized_patient = {"patient_id": 10, "user_id": 2}
        self.doctor_profiles = {
            8: {"display_name": "Dra. Ana Lima", "crm_number": "123456", "crm_state": "SP"},
            9: {"display_name": "Dr. Rui Costa", "crm_number": "654321", "crm_state": "RJ"},
        }
        self.commits = 0
        self.rollbacks = 0
        self.fail_commit = False
        self.fail_audit = False

    def cursor(self, dictionary=False):
        return DocumentCursor(self)

    def commit(self):
        if self.fail_commit:
            raise mysql.connector.Error("commit unavailable")
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1


class RecordingStorage:
    def __init__(self):
        self.files = {}
        self.fail_publish = False
        self.collisions_remaining = 0
        self.publish_attempts = []
        self.fail_remove = False

    def publish(self, source, key):
        self.publish_attempts.append(key)
        if self.collisions_remaining:
            self.collisions_remaining -= 1
            raise FileExistsError(key)
        if self.fail_publish:
            raise OSError("storage unavailable")
        source.seek(0)
        self.files[key] = source.read()

    def open(self, key):
        return BytesIO(self.files[key])

    def remove(self, key):
        if self.fail_remove:
            raise OSError("cleanup unavailable")
        self.files.pop(key, None)


@pytest.fixture
def document_app():
    connection = DocumentConnection()
    storage = RecordingStorage()
    app = create_app(
        settings=AppSettings.from_mapping({}),
        connection_factory=lambda: connection,
        document_storage=storage,
    )
    app.dependency_overrides[require_adult] = lambda: {
        "patient_id": 10,
        "user_id": 1,
    }
    app.dependency_overrides[get_current_patient] = lambda: {
        "patient_id": 10,
        "user_id": 1,
    }
    app.dependency_overrides[get_current_doctor] = lambda: {
        "doctor_id": 7,
        "user_id": 8,
        "crm_number": "123456",
        "crm_state": "SP",
    }
    app.dependency_overrides[get_connection] = lambda: connection
    return app, connection, storage


async def test_uploads_valid_pdf_with_private_key_metadata_and_audit(document_app):
    app, connection, storage = document_app

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.post(
            "/me/documents",
            data={"title": "  Hemograma   de outubro ", "type": "exam"},
            files={"file": ("hemograma.pdf", MINIMAL_PDF, "application/pdf")},
        )

    assert response.status_code == 201
    assert response.json() == {
        "document_id": 42,
        "title": "Hemograma de outubro",
        "type": "exam",
        "original_filename": "hemograma.pdf",
        "media_type": "application/pdf",
        "size_bytes": len(MINIMAL_PDF),
        "status": "uploaded",
        "created_at": response.json()["created_at"],
        "uploaded_by_doctor": None,
    }
    assert len(storage.files) == 1
    storage_key, stored_content = next(iter(storage.files.items()))
    assert stored_content == MINIMAL_PDF
    assert storage_key.endswith(".pdf")
    assert "hemograma" not in storage_key

    document_insert, audit_insert = connection.executed
    assert document_insert[0].startswith("INSERT INTO documents")
    assert document_insert[1][0:4] == (
        10,
        "Hemograma de outubro",
        "exam",
        "hemograma.pdf",
    )
    assert storage_key in document_insert[1]
    assert "uploaded_by_user_id, uploader_role" in document_insert[0]
    assert document_insert[1][-2:] == (1, "patient")
    assert MINIMAL_PDF not in document_insert[1]
    assert audit_insert[0].startswith("INSERT INTO clinical_audit_events")
    assert audit_insert[1][0:6] == (
        "user",
        1,
        10,
        "document.uploaded",
        "document",
        42,
    )
    audit_snapshot = json.loads(audit_insert[1][7])
    assert audit_snapshot == {
        "media_type": "application/pdf",
        "size_bytes": len(MINIMAL_PDF),
        "status": "uploaded",
        "title": "Hemograma de outubro",
        "type": "exam",
    }
    assert connection.commits == 1
    assert connection.rollbacks == 0


def stored_document(**overrides):
    content = MINIMAL_PDF
    document = {
        "document_id": 42,
        "patient_id": 10,
        "title": "Hemograma",
        "type": "exam",
        "original_filename": "hemograma.pdf",
        "storage_key": "a" * 64 + ".pdf",
        "media_type": "application/pdf",
        "size_bytes": len(content),
        "sha256": sha256(content).hexdigest(),
        "status": "uploaded",
        "created_at": datetime(2026, 10, 11, 12, 0),
        "removed_at": None,
        "uploaded_by_user_id": 1,
        "uploader_role": "patient",
    }
    document.update(overrides)
    return document


async def test_lists_only_active_owned_documents_in_stable_order(document_app):
    app, connection, _storage = document_app
    connection.documents = [
        stored_document(),
        stored_document(document_id=43, status="removed"),
        stored_document(document_id=44, patient_id=20),
    ]

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.get("/me/documents")

    assert response.status_code == 200
    assert response.json() == [
        {
            "document_id": 42,
            "title": "Hemograma",
            "type": "exam",
            "original_filename": "hemograma.pdf",
            "media_type": "application/pdf",
            "size_bytes": len(MINIMAL_PDF),
            "status": "uploaded",
            "created_at": "2026-10-11T12:00:00",
            "uploaded_by_doctor": None,
        }
    ]
    list_query = connection.executed[0]
    assert "status_documento <> 'removed'" in list_query[0]
    assert "ORDER BY d.created_at DESC, d.id_documento DESC" in list_query[0]
    assert list_query[1] == (10,)


async def test_downloads_only_owned_integral_file_and_audits_before_response(
    document_app,
):
    app, connection, storage = document_app
    document = stored_document()
    connection.documents = [document]
    storage.files[document["storage_key"]] = MINIMAL_PDF

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.get("/me/documents/42/file")

    assert response.status_code == 200
    assert response.content == MINIMAL_PDF
    assert response.headers["content-type"] == "application/pdf"
    assert response.headers["cache-control"] == "no-store, max-age=0"
    assert response.headers["pragma"] == "no-cache"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert "attachment" in response.headers["content-disposition"]
    assert connection.executed[0][1] == (42, 10)
    assert connection.executed[-1][1][3:6] == (
        "document.downloaded",
        "document",
        42,
    )
    download_snapshot = json.loads(connection.executed[-1][1][7])
    assert download_snapshot == {
        "media_type": "application/pdf",
        "size_bytes": len(MINIMAL_PDF),
        "status": "uploaded",
        "title": "Hemograma",
        "type": "exam",
    }
    assert connection.commits == 1


async def test_missing_foreign_or_removed_document_has_uniform_404(document_app):
    app, connection, _storage = document_app
    connection.documents = [stored_document(patient_id=20)]

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.get("/me/documents/42/file")

    assert response.status_code == 404
    assert response.json() == {"detail": "Documento não encontrado."}
    assert not any(
        statement.startswith("INSERT INTO clinical_audit_events")
        for statement, _parameters in connection.executed
    )


async def test_integrity_failure_returns_503_without_file_or_success_audit(
    document_app,
    caplog,
):
    app, connection, storage = document_app
    document = stored_document()
    connection.documents = [document]
    storage.files[document["storage_key"]] = b"alterado"

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.get("/me/documents/42/file")

    assert response.status_code == 503
    assert response.json() == {"detail": "Documento temporariamente indisponível."}
    assert not any(
        statement.startswith("INSERT INTO clinical_audit_events")
        for statement, _parameters in connection.executed
    )
    assert document["storage_key"] not in caplog.text
    assert document["original_filename"] not in caplog.text
    assert document["sha256"] not in caplog.text


async def test_audit_failure_returns_503_without_releasing_file(document_app):
    app, connection, storage = document_app
    document = stored_document()
    connection.documents = [document]
    connection.fail_audit = True
    storage.files[document["storage_key"]] = MINIMAL_PDF

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.get("/me/documents/42/file")

    assert response.status_code == 503
    assert response.headers["content-type"] == "application/json"
    assert response.content != MINIMAL_PDF
    assert connection.rollbacks == 1


async def test_removes_owned_document_logically_before_physical_cleanup(document_app):
    app, connection, storage = document_app
    document = stored_document()
    connection.documents = [document]
    storage.files[document["storage_key"]] = MINIMAL_PDF

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.delete("/me/documents/42")

    assert response.status_code == 204
    assert document["status"] == "removed"
    assert storage.files == {}
    assert connection.executed[0][1] == (42, 10)
    assert connection.executed[1][0].startswith(
        "UPDATE documents SET status_documento = 'removed'"
    )
    assert connection.executed[2][1][3:6] == (
        "document.removed",
        "document",
        42,
    )
    assert connection.commits == 2


async def test_cleanup_failure_keeps_document_removed_and_pending(
    document_app,
    caplog,
):
    app, connection, storage = document_app
    document = stored_document()
    connection.documents = [document]
    storage.files[document["storage_key"]] = MINIMAL_PDF
    storage.fail_remove = True

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.delete("/me/documents/42")

    assert response.status_code == 204
    assert document["status"] == "removed"
    assert document["storage_key"] in storage.files
    assert connection.commits == 1
    assert not any(
        statement.startswith("UPDATE documents SET storage_deleted_at")
        for statement, _parameters in connection.executed
    )
    assert document["storage_key"] not in caplog.text
    assert document["original_filename"] not in caplog.text


def upload_file(name, content, media_type):
    return UploadFile(
        file=BytesIO(content),
        filename=name,
        headers=Headers({"content-type": media_type}),
    )


@pytest.mark.parametrize(
    ("name", "content", "media_type", "extension"),
    [
        ("exame.pdf", MINIMAL_PDF, "application/pdf", ".pdf"),
        ("foto.jpeg", b"\xff\xd8\xffconteudo\xff\xd9", "image/jpeg", ".jpg"),
        (
            "foto.png",
            b"\x89PNG\r\n\x1a\n"
            b"\x00\x00\x00\rIHDR"
            b"\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00"
            b"\x90wS\xde"
            b"\x00\x00\x00\x00IEND\xaeB`\x82",
            "image/png",
            ".png",
        ),
    ],
)
async def test_stages_allowed_files_with_real_signature_and_final_marker(
    name,
    content,
    media_type,
    extension,
):
    staged = await stage_valid_document(
        upload_file(name, content, media_type),
        max_bytes=10 * 1024 * 1024,
    )
    try:
        assert staged.extension == extension
        assert staged.size_bytes == len(content)
        assert staged.checksum == sha256(content).hexdigest()
    finally:
        staged.close()


@pytest.mark.parametrize(
    ("name", "content", "media_type"),
    [
        ("arquivo.pdf", b"PK\x03\x04", "application/pdf"),
        ("arquivo.pdf", MINIMAL_PDF, "image/png"),
        ("arquivo.png", b"\x89PNG\r\n\x1a\n\x00\x00\x00\x00IEND\xaeB`\x82", "image/png"),
        ("arquivo.jpg", b"\xff\xd8\xffsem-final", "image/jpeg"),
    ],
)
async def test_rejects_disguised_mismatched_or_truncated_files(
    name,
    content,
    media_type,
):
    with pytest.raises(Exception) as error:
        await stage_valid_document(
            upload_file(name, content, media_type),
            max_bytes=10 * 1024 * 1024,
        )

    assert error.value.status_code == 422
    assert error.value.detail == "Envie um arquivo PDF, JPG ou PNG válido."


async def test_stops_reading_at_first_byte_above_limit():
    with pytest.raises(Exception) as error:
        await stage_valid_document(
            upload_file("arquivo.pdf", MINIMAL_PDF, "application/pdf"),
            max_bytes=len(MINIMAL_PDF) - 1,
        )

    assert error.value.status_code == 413


def test_local_storage_confines_keys_and_never_overwrites(tmp_path, monkeypatch):
    storage = LocalDocumentStorage(tmp_path)
    storage.publish(BytesIO(MINIMAL_PDF), "safe.pdf")

    with storage.open("safe.pdf") as stored:
        assert stored.read() == MINIMAL_PDF
    monkeypatch.setattr(Path, "exists", lambda _path: False)
    with pytest.raises(FileExistsError):
        storage.publish(BytesIO(b"different"), "safe.pdf")
    with pytest.raises(ValueError):
        storage.publish(BytesIO(MINIMAL_PDF), "../outside.pdf")

    assert (tmp_path / "safe.pdf").read_bytes() == MINIMAL_PDF
    assert not (tmp_path.parent / "outside.pdf").exists()
    storage.remove("safe.pdf")
    storage.remove("safe.pdf")
    assert list(tmp_path.iterdir()) == []


async def test_verified_linked_doctor_lists_documents_with_view_audit(document_app):
    app, connection, _storage = document_app
    connection.documents = [stored_document()]

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.get("/medical/patients/10/documents")

    assert response.status_code == 200
    assert response.json()[0]["document_id"] == 42
    assert connection.executed[-1][1][0:6] == (
        "user",
        8,
        10,
        "medical_documents.viewed",
        "patient",
        10,
    )
    assert connection.commits == 1


async def test_doctor_download_rechecks_patient_link_and_document_ownership(
    document_app,
):
    app, connection, storage = document_app
    document = stored_document()
    connection.documents = [document]
    storage.files[document["storage_key"]] = MINIMAL_PDF

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.get("/medical/patients/10/documents/42/file")

    assert response.status_code == 200
    assert response.content == MINIMAL_PDF
    assert connection.executed[-1][1][0:6] == (
        "user",
        8,
        10,
        "document.downloaded",
        "document",
        42,
    )
    assert json.loads(connection.executed[-1][1][7]) == {
        "media_type": "application/pdf",
        "size_bytes": len(MINIMAL_PDF),
        "status": "uploaded",
        "title": "Hemograma",
        "type": "exam",
    }


async def test_invalid_medical_link_returns_403_before_document_query(document_app):
    app, connection, _storage = document_app
    connection.authorized_patient = None
    connection.documents = [stored_document()]

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.get("/medical/patients/10/documents")

    assert response.status_code == 403
    assert response.json() == {"detail": "Paciente não autorizado."}
    assert not any("FROM documents" in statement for statement, _ in connection.executed)


async def test_publish_failure_rolls_back_metadata_and_audit(document_app):
    app, connection, storage = document_app
    storage.fail_publish = True

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.post(
            "/me/documents",
            data={"title": "Hemograma", "type": "exam"},
            files={"file": ("hemograma.pdf", MINIMAL_PDF, "application/pdf")},
        )

    assert response.status_code == 503
    assert connection.commits == 0
    assert connection.rollbacks == 1
    assert storage.files == {}


async def test_storage_key_collision_rolls_back_and_retries_with_new_key(
    document_app,
):
    app, connection, storage = document_app
    storage.collisions_remaining = 1

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.post(
            "/me/documents",
            data={"title": "Hemograma", "type": "exam"},
            files={"file": ("hemograma.pdf", MINIMAL_PDF, "application/pdf")},
        )

    assert response.status_code == 201
    assert connection.rollbacks == 1
    assert connection.commits == 1
    assert len(storage.publish_attempts) == 2
    assert storage.publish_attempts[0] != storage.publish_attempts[1]
    assert list(storage.files) == [storage.publish_attempts[1]]


async def test_commit_failure_compensates_published_file(document_app):
    app, connection, storage = document_app
    connection.fail_commit = True

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.post(
            "/me/documents",
            data={"title": "Hemograma", "type": "exam"},
            files={"file": ("hemograma.pdf", MINIMAL_PDF, "application/pdf")},
        )

    assert response.status_code == 503
    assert connection.rollbacks == 1
    assert storage.files == {}


async def test_upload_rejects_extra_or_multiple_form_fields_without_persistence(
    document_app,
):
    app, connection, storage = document_app

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.post(
            "/me/documents",
            data={
                "title": "Hemograma",
                "type": "exam",
                "patient_id": "20",
            },
            files={"file": ("hemograma.pdf", MINIMAL_PDF, "application/pdf")},
        )

    assert response.status_code == 422
    assert connection.executed == []
    assert storage.files == {}


async def test_minor_cannot_upload_or_remove_documents():
    storage = RecordingStorage()
    connection_requested = False

    def connection_factory():
        nonlocal connection_requested
        connection_requested = True
        raise AssertionError("database must not be reached")

    app = create_app(
        settings=AppSettings.from_mapping({}),
        connection_factory=connection_factory,
        document_storage=storage,
    )
    app.dependency_overrides[get_current_patient] = lambda: {
        "patient_id": 10,
        "user_id": 1,
        "data_nascimento": datetime(2015, 1, 1).date(),
    }

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        upload = await client.post(
            "/me/documents",
            data={"title": "Hemograma", "type": "exam"},
            files={"file": ("hemograma.pdf", MINIMAL_PDF, "application/pdf")},
        )
        removal = await client.delete("/me/documents/42")

    assert upload.status_code == 403
    assert removal.status_code == 403
    assert connection_requested is False
    assert storage.files == {}


async def test_admin_is_denied_on_every_document_route_before_clinical_query():
    storage = RecordingStorage()
    connection_requested = False

    def connection_factory():
        nonlocal connection_requested
        connection_requested = True
        raise AssertionError("clinical database must not be reached")

    app = create_app(
        settings=AppSettings.from_mapping({}),
        connection_factory=connection_factory,
        document_storage=storage,
    )
    app.dependency_overrides[get_current_user] = lambda: {
        "user_id": 99,
        "roles": ["admin"],
    }

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        responses = [
            await client.get("/me/documents"),
            await client.post(
                "/me/documents",
                data={"title": "Hemograma", "type": "exam"},
                files={"file": ("hemograma.pdf", MINIMAL_PDF, "application/pdf")},
            ),
            await client.get("/me/documents/42/file"),
            await client.delete("/me/documents/42"),
            await client.get("/medical/patients/10/documents"),
            await client.get("/medical/patients/10/documents/42/file"),
            await client.post("/medical/patients/10/documents"),
            await client.delete("/medical/patients/10/documents/42"),
        ]

    assert [response.status_code for response in responses] == [403] * 8
    assert connection_requested is False
    assert storage.files == {}


async def test_patient_list_identifies_documents_sent_by_doctor(document_app):
    app, connection, _storage = document_app
    connection.documents = [
        stored_document(uploaded_by_user_id=8, uploader_role="doctor"),
        stored_document(document_id=41, uploaded_by_user_id=8, uploader_role="patient"),
    ]

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.get("/me/documents")

    assert [item["uploaded_by_doctor"] for item in response.json()] == [
        {"display_name": "Dra. Ana Lima", "crm_number": "123456", "crm_state": "SP"},
        None,
    ]
    assert "uploaded_by_user_id" not in response.json()[0]


async def test_authorized_doctor_uploads_document_with_authorship_and_audit(document_app):
    app, connection, storage = document_app

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.post(
            "/medical/patients/10/documents",
            data={"title": "Laudo do ecocardiograma", "type": "report"},
            files={"file": ("laudo.pdf", MINIMAL_PDF, "application/pdf")},
        )

    assert response.status_code == 201
    body = response.json()
    assert body["title"] == "Laudo do ecocardiograma"
    assert body["uploaded_by_doctor"] == {
        "display_name": "Dra. Ana Lima",
        "crm_number": "123456",
        "crm_state": "SP",
    }
    assert body["can_remove"] is True
    document_insert = next(
        item for item in connection.executed if item[0].startswith("INSERT INTO documents")
    )
    assert document_insert[1][0] == 10
    assert document_insert[1][-2:] == (8, "doctor")
    audit = next(
        item for item in connection.executed
        if item[0].startswith("INSERT INTO clinical_audit_events")
    )
    assert audit[1][0:6] == ("user", 8, 10, "document.uploaded", "document", 42)
    assert len(storage.files) == 1
    assert connection.commits >= 1


async def test_doctor_without_access_cannot_upload(document_app):
    app, connection, storage = document_app
    connection.authorized_patient = None

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.post(
            "/medical/patients/10/documents",
            data={"title": "Laudo", "type": "report"},
            files={"file": ("laudo.pdf", MINIMAL_PDF, "application/pdf")},
        )

    assert response.status_code == 403
    assert response.json() == {"detail": "Paciente não autorizado."}
    assert storage.files == {}
    assert not any(statement.startswith("INSERT") for statement, _ in connection.executed)


async def test_doctor_upload_reuses_file_validation(document_app):
    app, connection, storage = document_app

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.post(
            "/medical/patients/10/documents",
            data={"title": "Laudo", "type": "report"},
            files={"file": ("laudo.pdf", b"\x89PNG\r\n\x1a\n", "application/pdf")},
        )

    assert response.status_code == 422
    assert storage.files == {}
    assert not any(statement.startswith("INSERT") for statement, _ in connection.executed)


async def test_doctor_removes_only_documents_sent_by_themselves(document_app):
    app, connection, storage = document_app
    own = stored_document(uploaded_by_user_id=8, uploader_role="doctor")
    connection.documents = [own]
    storage.files[own["storage_key"]] = MINIMAL_PDF

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.delete("/medical/patients/10/documents/42")

    assert response.status_code == 204
    assert own["status"] == "removed"
    assert storage.files == {}
    audit = next(
        item for item in connection.executed
        if item[0].startswith("INSERT INTO clinical_audit_events")
    )
    assert audit[1][0:6] == ("user", 8, 10, "document.removed", "document", 42)


@pytest.mark.parametrize(
    "uploader",
    [
        {"uploaded_by_user_id": 1, "uploader_role": "patient"},
        {"uploaded_by_user_id": 9, "uploader_role": "doctor"},
        {"uploaded_by_user_id": 8, "uploader_role": "patient"},
    ],
)
async def test_doctor_cannot_remove_document_sent_by_someone_else(document_app, uploader):
    app, connection, _storage = document_app
    document = stored_document(**uploader)
    connection.documents = [document]

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.delete("/medical/patients/10/documents/42")

    assert response.status_code == 403
    assert response.json() == {
        "detail": "Você só pode remover documentos enviados por você.",
    }
    assert document["status"] == "uploaded"
    assert not any(
        statement.startswith("UPDATE documents") for statement, _ in connection.executed
    )


async def test_doctor_removal_of_missing_document_returns_404(document_app):
    app, connection, _storage = document_app
    connection.documents = [stored_document(document_id=43, uploaded_by_user_id=8, uploader_role="doctor")]

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.delete("/medical/patients/10/documents/42")

    assert response.status_code == 404
    assert response.json() == {"detail": "Documento não encontrado."}


async def test_doctor_without_access_cannot_remove(document_app):
    app, connection, _storage = document_app
    connection.authorized_patient = None
    connection.documents = [stored_document(uploaded_by_user_id=8, uploader_role="doctor")]

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.delete("/medical/patients/10/documents/42")

    assert response.status_code == 403
    assert connection.documents[0]["status"] == "uploaded"


async def test_medical_list_flags_removable_documents(document_app):
    app, connection, _storage = document_app
    connection.documents = [
        stored_document(uploaded_by_user_id=8, uploader_role="doctor"),
        stored_document(document_id=41, uploaded_by_user_id=9, uploader_role="doctor"),
        stored_document(document_id=40),
    ]

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.get("/medical/patients/10/documents")

    assert [(item["document_id"], item["can_remove"]) for item in response.json()] == [
        (42, True),
        (41, False),
        (40, False),
    ]
    assert response.json()[1]["uploaded_by_doctor"]["display_name"] == "Dr. Rui Costa"


async def test_doctor_upload_rolls_back_when_audit_fails(document_app):
    app, connection, storage = document_app
    connection.fail_audit = True

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.post(
            "/medical/patients/10/documents",
            data={"title": "Laudo", "type": "report"},
            files={"file": ("laudo.pdf", MINIMAL_PDF, "application/pdf")},
        )

    assert response.status_code == 503
    assert storage.files == {}
    assert connection.rollbacks >= 1
